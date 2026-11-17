import { randomBytes, randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import pool from "../db";
import { withTransaction } from "../db/transaction";
import { requireSession } from "../auth/sessionService";
import { assertPermission, type AuthContext } from "../auth/permissions";
import { body, json, cors, errorResponse } from "../http/response";
import { AppError, fail } from "../http/errors";
import { expireStreams } from "../streams";
import { audit } from "../audit/auditService";
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const cameraId = z.number().int().positive();
async function cameraOwned(ctx: AuthContext, id: number) {
  const camera = (
    await pool.query("SELECT * FROM Camara WHERE id=$1 AND household_id=$2", [
      id,
      ctx.household_id,
    ])
  ).rows[0];
  if (!camera) fail(404, "NOT_FOUND", "La cámara no corresponde a este hogar.");
  return camera;
}
export async function handleCameraApi(request: Request): Promise<Response> {
  try {
    const ctx = await requireSession(request);
    assertPermission(ctx, "cameras.read");
    const path = new URL(request.url).pathname.replace(/^\/api\//, "");
    let response: Response;
    if (path === "vision") response = await vision(request, ctx);
    else if (path === "streams") response = await streams(request, ctx);
    else if (path === "analysis") response = await analysis(request, ctx);
    else if (path === "auth/logout") {
      const { authRoute } = await import("../http/authRoutes");
      response = (await authRoute(request, "auth/logout"))!;
    } else fail(404, "NOT_FOUND", "Ruta de cámaras desconocida.");
    return cors(response, request);
  } catch (error) {
    return cors(errorResponse(error), request);
  }
}
async function vision(request: Request, ctx: AuthContext) {
  if (request.method === "GET") {
    const page = Math.max(
      1,
      Math.min(
        10000,
        Number(new URL(request.url).searchParams.get("page")) || 1,
      ),
    );
    const [c, p, e] = await Promise.all([
      pool.query(
        "SELECT id,nombre,creado_en FROM Camara WHERE household_id=$1 ORDER BY id",
        [ctx.household_id],
      ),
      pool.query(
        "SELECT id,nombre,modelo FROM PerfilFacial WHERE household_id=$1 ORDER BY id",
        [ctx.household_id],
      ),
      pool.query(
        "SELECT e.*,p.nombre FROM EventoCamara e JOIN Camara c ON c.id=e.camara_id LEFT JOIN PerfilFacial p ON p.id=e.perfil_id AND p.household_id=c.household_id WHERE c.household_id=$1 AND e.fecha>now()-interval '30 days' ORDER BY e.fecha DESC,e.id DESC LIMIT 25 OFFSET $2",
        [ctx.household_id, (Math.floor(page) - 1) * 25],
      ),
    ]);
    return json({ cameras: c.rows, profiles: p.rows, events: e.rows, page });
  }
  assertPermission(ctx, "cameras.manage");
  if (request.method === "POST") {
    const input = await body(
      request,
      z
        .object({
          action: z.literal("camera"),
          name: z.string().trim().min(1).max(100),
        })
        .strict(),
    );
    return json(
      await withTransaction(async (tx) => {
        await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `${ctx.household_id}:cameras`,
        ]);
        if (
          (
            await tx.query(
              "SELECT count(*)::int n FROM Camara WHERE household_id=$1",
              [ctx.household_id],
            )
          ).rows[0].n >= 10
        )
          fail(
            409,
            "CAMERA_LIMIT",
            "Este prototipo admite hasta diez cámaras registradas.",
          );
        const camera = (
          await tx.query(
            "INSERT INTO Camara(nombre,household_id) VALUES($1,$2) RETURNING id,nombre,creado_en",
            [input.name, ctx.household_id],
          )
        ).rows[0];
        await audit(tx, ctx, "camera.created", String(camera.id), null, {
          name: input.name,
        });
        return camera;
      }),
      201,
    );
  }
  if (request.method === "DELETE") {
    const input = await body(
      request,
      z
        .object({
          id: cameraId,
          type: z.enum(["camera", "profile"]).optional(),
        })
        .strict(),
    );
    if (input.type === "camera") {
      await cameraOwned(ctx, input.id);
      await pool.query(
        "UPDATE SesionCamara SET expira_en=now() WHERE camara_id=$1 AND household_id=$2",
        [input.id, ctx.household_id],
      );
      await expireStreams();
      if (
        (
          await pool.query("SELECT 1 FROM SesionCamara WHERE camara_id=$1", [
            input.id,
          ])
        ).rowCount
      )
        fail(
          503,
          "MEDIA_DISCONNECT_PENDING",
          "La cámara todavía se está desconectando. Intentá de nuevo.",
        );
      await pool.query("DELETE FROM Camara WHERE id=$1 AND household_id=$2", [
        input.id,
        ctx.household_id,
      ]);
    } else
      await pool.query(
        "DELETE FROM PerfilFacial WHERE id=$1 AND household_id=$2",
        [input.id, ctx.household_id],
      );
    return json({ ok: true });
  }
  fail(405, "METHOD_NOT_ALLOWED", "Método no disponible.");
}
async function streams(request: Request, ctx: AuthContext) {
  if (request.method === "GET")
    return json(
      (
        await pool.query(
          "SELECT c.id,c.nombre,EXISTS(SELECT 1 FROM SesionCamara s JOIN hg_sessions a ON a.id=s.auth_session_id WHERE s.camara_id=c.id AND s.tipo='publish' AND s.expira_en>now() AND a.revoked_at IS NULL AND a.expires_at>now()) conectada FROM Camara c WHERE c.household_id=$1 ORDER BY c.id",
          [ctx.household_id],
        )
      ).rows,
    );
  if (request.method !== "POST")
    fail(405, "METHOD_NOT_ALLOWED", "Método no disponible.");
  const input = await body(
    request,
    z.union([
      z
        .object({
          action: z.enum(["renew", "close"]),
          token: z.string().min(32).max(128),
        })
        .strict(),
      z
        .object({
          type: z.enum(["publish", "view"]),
          cameraId,
          remote: z.boolean().default(true),
        })
        .strict(),
    ]),
  );
  if ("action" in input) {
    const result = await pool.query(
      "UPDATE SesionCamara SET expira_en=CASE WHEN $4 THEN now() ELSE now()+interval '45 seconds' END WHERE token_hash=$1 AND usuario_id=$2 AND household_id=$3 AND auth_session_id=$5 AND expira_en>now() RETURNING id",
      [
        digest(input.token),
        ctx.user_id,
        ctx.household_id,
        input.action === "close",
        ctx.session_id,
      ],
    );
    if (!result.rowCount)
      fail(409, "STREAM_SESSION_EXPIRED", "La sesión de cámara venció.");
    if (input.action === "close") await expireStreams();
    return json({ ok: true });
  }
  await cameraOwned(ctx, input.cameraId);
  await expireStreams();
  return json(
    await withTransaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(817242)");
      if (
        (
          await tx.query("SELECT 1 FROM SesionCamara WHERE tipo=$1", [
            input.type,
          ])
        ).rowCount
      )
        fail(409, "STREAM_BUSY", "Ya existe una transmisión de este tipo.");
      const pub = (
        await tx.query(
          "SELECT id,ruta FROM SesionCamara WHERE camara_id=$1 AND household_id=$2 AND tipo='publish' AND expira_en>now()",
          [input.cameraId, ctx.household_id],
        )
      ).rows[0];
      if (input.type === "view" && input.remote && !pub)
        fail(409, "CAMERA_OFFLINE", "La cámara está desconectada.");
      const token = randomBytes(32).toString("hex"),
        id = randomUUID(),
        route =
          input.type === "publish"
            ? `camera-${input.cameraId}-${id}`
            : input.remote
              ? pub.ruta
              : "local";
      await tx.query(
        "INSERT INTO SesionCamara(id,token_hash,camara_id,usuario_id,tipo,ruta,expira_en,household_id,auth_session_id) VALUES($1,$2,$3,$4,$5,$6,now()+interval '45 seconds',$7,$8)",
        [
          id,
          digest(token),
          input.cameraId,
          ctx.user_id,
          input.type,
          route,
          ctx.household_id,
          ctx.session_id,
        ],
      );
      return {
        token,
        path: route,
        generation: input.type === "publish" ? id : pub?.id,
      };
    }),
    201,
  );
}
async function internal(path: string, data?: object) {
  if (!process.env.INFERENCE_SECRET || process.env.INFERENCE_SECRET.length < 32)
    fail(
      503,
      "INFERENCE_NOT_CONFIGURED",
      "El análisis de video todavía no está configurado.",
    );
  return fetch((process.env.INFERENCE_URL || "http://127.0.0.1:8090") + path, {
    method: data ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${process.env.INFERENCE_SECRET}`,
      "Content-Type": "application/json",
    },
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(4000),
    cache: "no-store",
  });
}
async function analysis(request: Request, ctx: AuthContext) {
  if (request.method === "POST") {
    assertPermission(ctx, "cameras.manage");
    const input = await body(
      request,
      z
        .object({
          action: z.enum(["enroll", "cancel"]),
          cameraId,
          name: z.string().trim().min(1).max(100).optional(),
          consent: z.boolean().optional(),
        })
        .strict(),
    );
    await cameraOwned(ctx, input.cameraId);
    if (input.action === "enroll" && (!input.name || input.consent !== true))
      fail(
        400,
        "CONSENT_REQUIRED",
        "Se necesitan nombre y consentimiento explícito.",
      );
    try {
      const response = await internal("/enroll", {
        ...input,
        userId: ctx.user_id,
        householdId: ctx.household_id,
        authSessionId: ctx.session_id,
      });
      return json(await response.json(), response.status);
    } catch (error) {
      if (error instanceof AppError) throw error;
      fail(
        503,
        "INFERENCE_UNAVAILABLE",
        "El servicio de análisis no está disponible.",
      );
    }
  }
  if (request.method !== "GET")
    fail(405, "METHOD_NOT_ALLOWED", "Método no disponible.");
  const id = Number(new URL(request.url).searchParams.get("cameraId"));
  if (!Number.isSafeInteger(id) || id < 1)
    fail(400, "INVALID_CAMERA", "Identificador de cámara inválido.");
  await cameraOwned(ctx, id);
  let closed = false,
    timer: ReturnType<typeof setTimeout>;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const close = () => {
        closed = true;
        clearTimeout(timer);
        try {
          controller.close();
        } catch {}
      };
      const send = async () => {
        if (closed) return;
        try {
          const current = await requireSession(request);
          assertPermission(current, "cameras.read");
          await cameraOwned(current, id);
        } catch {
          close();
          return;
        }
        let snapshot: unknown = { status: "unavailable", detections: [] };
        try {
          const response = await internal(`/snapshot?cameraId=${id}`);
          if (response.ok) snapshot = await response.json();
        } catch {}
        if (!closed) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(snapshot)}\n\n`),
          );
          timer = setTimeout(send, 500);
        }
      };
      request.signal.addEventListener("abort", close, { once: true });
      void send();
    },
    cancel() {
      closed = true;
      clearTimeout(timer);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
export async function handleStreamAuth(request: Request) {
  try {
    const input = await body(
      request,
      z
        .object({
          id: z.string().min(1).max(200),
          action: z.enum(["publish", "read"]),
          protocol: z.enum(["webrtc", "rtsp"]),
          path: z.string().min(1).max(200),
          token: z.string().max(128).optional(),
          password: z.string().max(128).optional(),
        })
        .passthrough(),
    );
    const token = input.token || input.password;
    if (!token) return new Response(null, { status: 403 });
    const type =
      input.action === "publish"
        ? "publish"
        : input.protocol === "rtsp"
          ? "process"
          : "view";
    if (type !== "process" && input.protocol !== "webrtc")
      return new Response(null, { status: 403 });
    const result = await pool.query(
      "UPDATE SesionCamara s SET media_id=$4 FROM Usuario u,hg_sessions a,hg_memberships m WHERE s.usuario_id=u.id AND u.activo AND a.id=s.auth_session_id AND a.user_id=s.usuario_id AND a.household_id=s.household_id AND a.revoked_at IS NULL AND a.expires_at>now() AND m.household_id=s.household_id AND m.user_id=s.usuario_id AND m.enabled AND m.role IN ('ADMINISTRADOR','RESIDENTE') AND s.token_hash=$1 AND s.ruta=$2 AND s.tipo=$3 AND s.expira_en>now() AND (s.media_id IS NULL OR s.media_id=$4) RETURNING s.id",
      [digest(token), input.path, type, input.id],
    );
    return new Response(null, { status: result.rowCount ? 204 : 403 });
  } catch {
    return new Response(null, { status: 403 });
  }
}
