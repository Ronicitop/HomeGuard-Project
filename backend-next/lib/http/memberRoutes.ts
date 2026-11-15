import { z } from "zod";
import pool from "../db";
import { withTransaction } from "../db/transaction";
import { type AuthContext, assertPermission } from "../auth/permissions";
import { hashPassword } from "../auth/passwordService";
import { body, json, revision } from "./response";
import { fail } from "./errors";
import { audit } from "../audit/auditService";
export async function memberRoutes(
  request: Request,
  p: string[],
  ctx: AuthContext,
): Promise<Response | null> {
  if (p[0] !== "members") return null;
  assertPermission(ctx, "members.manage");
  if (p.length === 1 && request.method === "GET")
    return json({
      items: (
        await pool.query(
          "SELECT u.id,u.nombre,u.apellido,u.email,m.role,m.enabled,m.revision,u.ultima_conexion FROM hg_memberships m JOIN Usuario u ON u.id=m.user_id WHERE m.household_id=$1 ORDER BY u.id",
          [ctx.household_id],
        )
      ).rows,
      next_cursor: null,
    });
  if (p.length === 1 && request.method === "POST") {
    const input = await body(
      request,
      z
        .object({
          nombre: z.string().trim().min(2).max(100),
          apellido: z.string().trim().min(2).max(100),
          email: z.string().email().max(150),
          password: z.string().min(10).max(1024),
          role: z.enum(["ADMINISTRADOR", "RESIDENTE", "INVITADO"]),
        })
        .strict(),
    );
    const hash = await hashPassword(input.password);
    const result = await withTransaction(async (tx) => {
      const user = (
        await tx.query(
          "INSERT INTO Usuario(nombre,apellido,email,password_hash) VALUES($1,$2,$3,$4) RETURNING id,nombre,apellido,email",
          [input.nombre, input.apellido, input.email.toLowerCase(), hash],
        )
      ).rows[0];
      await tx.query(
        "INSERT INTO hg_memberships(household_id,user_id,role) VALUES($1,$2,$3)",
        [ctx.household_id, user.id, input.role],
      );
      await audit(tx, ctx, "member.created", String(user.id), null, {
        role: input.role,
      });
      return { ...user, role: input.role, enabled: true, revision: 1 };
    });
    return json(result, 201);
  }
  if (p.length === 2 && request.method === "PATCH") {
    const userId = z.coerce.number().int().positive().parse(p[1]);
    const input = await body(
      request,
      z
        .object({
          role: z.enum(["ADMINISTRADOR", "RESIDENTE", "INVITADO"]),
          enabled: z.boolean(),
          expected_revision: revision,
        })
        .strict(),
    );
    const result = await withTransaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${ctx.household_id}:members`,
      ]);
      const before = (
        await tx.query(
          "SELECT * FROM hg_memberships WHERE household_id=$1 AND user_id=$2 FOR UPDATE",
          [ctx.household_id, userId],
        )
      ).rows[0];
      if (!before) fail(404, "NOT_FOUND", "No se encontró el miembro.");
      if (before.revision !== input.expected_revision)
        fail(
          409,
          "REVISION_CONFLICT",
          "El miembro cambió. Actualizá la lista.",
        );
      if (
        before.role === "ADMINISTRADOR" &&
        before.enabled &&
        (!input.enabled || input.role !== "ADMINISTRADOR")
      ) {
        const count = (
          await tx.query(
            "SELECT count(*)::int n FROM hg_memberships WHERE household_id=$1 AND enabled AND role='ADMINISTRADOR'",
            [ctx.household_id],
          )
        ).rows[0].n;
        if (count <= 1)
          fail(
            409,
            "LAST_ADMIN",
            "El hogar debe conservar al menos un administrador activo.",
          );
      }
      const row = (
        await tx.query(
          "UPDATE hg_memberships SET role=$3,enabled=$4,revision=revision+1 WHERE household_id=$1 AND user_id=$2 RETURNING user_id,role,enabled,revision",
          [ctx.household_id, userId, input.role, input.enabled],
        )
      ).rows[0];
      await tx.query(
        "UPDATE hg_sessions SET revoked_at=now() WHERE household_id=$1 AND user_id=$2",
        [ctx.household_id, userId],
      );
      await tx.query(
        "UPDATE hg_push_devices SET enabled=false WHERE household_id=$1 AND user_id=$2",
        [ctx.household_id, userId],
      );
      await audit(
        tx,
        ctx,
        "member.updated",
        String(userId),
        { role: before.role, enabled: before.enabled },
        row,
      );
      return row;
    });
    return json(result);
  }
  return null;
}
