import type { AuthContext } from "./permissions";
import {
  randomBytes,
  randomUUID,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import pool from "../db";
import { withTransaction } from "../db/transaction";
import { verifyPassword } from "./passwordService";
import { fail } from "../http/errors";
import { config } from "../config";
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export type SessionIssue = {
  token: string;
  csrf_token: string;
  expires_at: string;
  user: {
    id: number;
    nombre: string;
    apellido: string;
    email: string;
    rol: string;
    household_id: string;
  };
};
export async function createSession(
  userId: number,
  householdId: string,
): Promise<SessionIssue> {
  const found = await pool.query(
    "SELECT u.id,u.nombre,u.apellido,u.email,m.role AS rol,m.household_id FROM Usuario u JOIN hg_memberships m ON m.user_id=u.id WHERE u.id=$1 AND m.household_id=$2 AND u.activo AND m.enabled",
    [userId, householdId],
  );
  if (!found.rowCount)
    fail(401, "INVALID_CREDENTIALS", "No se pudo iniciar sesión.");
  const token = randomBytes(32).toString("base64url"),
    csrf = randomBytes(32).toString("base64url"),
    expires = new Date(Date.now() + 8 * 3600_000).toISOString();
  await pool.query(
    "INSERT INTO hg_sessions(id,user_id,household_id,token_hash,csrf_token,expires_at) VALUES($1,$2,$3,$4,$5,$6)",
    [randomUUID(), userId, householdId, tokenHash(token), csrf, expires],
  );
  return { token, csrf_token: csrf, expires_at: expires, user: found.rows[0] };
}
export async function login(
  email: string,
  password: string,
  ip: string,
): Promise<SessionIssue> {
  email = email.trim().toLowerCase();
  if (
    !email ||
    email.length > 150 ||
    typeof password !== "string" ||
    password.length > 1024
  )
    fail(401, "INVALID_CREDENTIALS", "Correo o contraseña incorrectos.");
  const accountKey = tokenHash(`login:${email}`),
    ipKey = tokenHash(`ip:${ip}`);
  const outcome = await withTransaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [accountKey]);
    const attempts = await tx.query(
      "SELECT key,count(*)::int n FROM hg_login_attempts WHERE key=ANY($1) AND attempted_at>now()-interval '15 minutes' GROUP BY key",
      [[accountKey, ipKey]],
    );
    if (attempts.rows.some((x) => x.n >= (x.key === accountKey ? 5 : 30)))
      return { locked: true };
    const user = (
      await tx.query(
        "SELECT u.*,m.household_id FROM Usuario u LEFT JOIN hg_memberships m ON m.user_id=u.id AND m.enabled WHERE lower(u.email)=$1 ORDER BY m.household_id LIMIT 1",
        [email],
      )
    ).rows[0];
    const hash =
      user?.password_hash ||
      `$scrypt$16384$${"0".repeat(32)}$${"0".repeat(128)}`;
    const valid = await verifyPassword(password, hash);
    if (!valid || !user?.activo || !user.household_id) {
      await tx.query("INSERT INTO hg_login_attempts(key) VALUES($1),($2)", [
        accountKey,
        ipKey,
      ]);
      return { invalid: true };
    }
    await tx.query("DELETE FROM hg_login_attempts WHERE key=$1", [accountKey]);
    await tx.query("UPDATE Usuario SET ultima_conexion=now() WHERE id=$1", [
      user.id,
    ]);
    return { user };
  });
  if (outcome.locked)
    fail(
      429,
      "LOGIN_RATE_LIMIT",
      "Demasiados intentos. Esperá 15 minutos antes de volver a intentar.",
    );
  if (outcome.invalid || !outcome.user)
    fail(401, "INVALID_CREDENTIALS", "Correo o contraseña incorrectos.");
  return createSession(outcome.user.id, outcome.user.household_id);
}
export function assertOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && !config.origins.includes(origin))
    fail(403, "ORIGIN_DENIED", "Origen no autorizado.");
}
export async function requireSession(request: Request): Promise<AuthContext> {
  assertOrigin(request);
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : null;
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("hg_session="))
    ?.slice(11);
  const token = authorization ? bearer : cookie;
  if (!token || token.length > 256)
    fail(401, "SESSION_REQUIRED", "Iniciá sesión para continuar.");
  const res = await pool.query(
    "SELECT s.id session_id,s.user_id,s.household_id,s.csrf_token,m.role FROM hg_sessions s JOIN Usuario u ON u.id=s.user_id JOIN hg_memberships m ON m.user_id=s.user_id AND m.household_id=s.household_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.activo AND m.enabled",
    [tokenHash(token)],
  );
  if (!res.rowCount)
    fail(401, "SESSION_EXPIRED", "Tu sesión venció. Iniciá sesión nuevamente.");
  const row = res.rows[0];
  if (!bearer && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const given = request.headers.get("x-csrf-token") || "";
    const expected = row.csrf_token;
    if (
      Buffer.byteLength(given) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(given), Buffer.from(expected))
    )
      fail(403, "CSRF_REQUIRED", "Volvé a cargar la página antes de guardar.");
  }
  return {
    user_id: row.user_id,
    household_id: row.household_id,
    role: row.role,
    session_id: row.session_id,
  };
}
export async function revokeSession(
  ctx: AuthContext,
  installationId?: string,
): Promise<void> {
  await withTransaction(async (tx) => {
    await tx.query(
      "UPDATE hg_sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND household_id=$3",
      [ctx.session_id, ctx.user_id, ctx.household_id],
    );
    if (installationId)
      await tx.query(
        "UPDATE hg_push_devices SET enabled=false WHERE household_id=$1 AND user_id=$2 AND installation_id=$3",
        [ctx.household_id, ctx.user_id, installationId],
      );
  });
}
export async function currentUser(ctx: AuthContext) {
  const user = (
    await pool.query(
      "SELECT id,nombre,apellido,email FROM Usuario WHERE id=$1",
      [ctx.user_id],
    )
  ).rows[0];
  const session = (
    await pool.query(
      "SELECT csrf_token,expires_at FROM hg_sessions WHERE id=$1",
      [ctx.session_id],
    )
  ).rows[0];
  return {
    ...user,
    rol: ctx.role,
    household_id: ctx.household_id,
    csrf_token: session.csrf_token,
    expires_at: session.expires_at,
  };
}
