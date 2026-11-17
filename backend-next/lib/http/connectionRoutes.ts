import { z } from "zod";
import type { AuthContext } from "../auth/permissions";
import {
  connectionSchema,
  sensorTypes,
  actuatorTypes,
} from "../connections/catalog";
import {
  listConnections,
  getConnection,
  createConnection,
  updateConnection,
  deleteConnection,
  rotateCredential,
} from "../connections/registry";
import {
  requestDeviceCommand,
  pollCommands,
  acknowledgeCommand,
} from "../connections/commands";
import {
  authenticateDevice,
  ingestTelemetry,
  touchDevice,
} from "../connections/telemetry";
import { lockIdentity } from "../connections/credentials";
import { withTransaction } from "../db/transaction";
import { body, json, revision, uuid } from "./response";
import { fail } from "./errors";
export async function connectionRoutes(
  request: Request,
  p: string[],
  ctx: AuthContext,
): Promise<Response | null> {
  if (p[0] !== "connections") return null;
  if (p.length === 2 && p[1] === "catalog" && request.method === "GET")
    return json({ sensor_types: sensorTypes, actuator_types: actuatorTypes });
  if (p.length === 1) {
    if (request.method === "GET") return json(await listConnections(ctx));
    if (request.method === "POST")
      return json(
        await createConnection(ctx, await body(request, connectionSchema)),
        201,
      );
  }
  if (p.length < 2) return null;
  const id = uuid.parse(p[1]);
  if (p.length === 2) {
    if (request.method === "GET") return json(await getConnection(ctx, id));
    if (request.method === "PATCH")
      return json(
        await updateConnection(
          ctx,
          id,
          await body(
            request,
            connectionSchema.extend({ expected_revision: revision }),
          ),
        ),
      );
    if (request.method === "DELETE") {
      const d = await body(
        request,
        z.object({ expected_revision: revision }).strict(),
      );
      return json(await deleteConnection(ctx, id, d.expected_revision));
    }
  }
  if (p.length === 3 && p[2] === "credentials" && request.method === "POST") {
    const d = await body(
      request,
      z.object({ expected_revision: revision }).strict(),
    );
    return json(await rotateCredential(ctx, id, d.expected_revision));
  }
  if (p.length === 3 && p[2] === "commands" && request.method === "POST") {
    const d = await body(
      request,
      z
        .object({ channel: z.string().max(32), state: z.enum(["ON", "OFF"]) })
        .strict(),
    );
    return json(
      await requestDeviceCommand(
        ctx,
        id,
        d.channel,
        d.state,
        request.headers.get("idempotency-key") || "",
      ),
      202,
    );
  }
  return null;
}
// Devices authenticate independently of human cookies and can address only their own connection.
export async function deviceRoutes(
  request: Request,
  p: string[],
): Promise<Response | null> {
  if (p[0] !== "device-ingest") return null;
  if (p.length !== 3) fail(404, "NOT_FOUND", "Ruta de equipo no disponible.");
  const id = uuid.parse(p[1]),
    authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer "))
    fail(401, "DEVICE_TOKEN_REQUIRED", "Se necesita el token del equipo.");
  const identity = await authenticateDevice(id, authorization.slice(7), "HTTP");
  if (p[2] === "telemetry" && request.method === "POST")
    return json(
      await ingestTelemetry(identity, await body(request, z.unknown())),
    );
  if (p[2] === "ack" && request.method === "POST")
    return json(
      await acknowledgeCommand(identity, await body(request, z.unknown())),
    );
  if (p[2] === "commands" && request.method === "GET")
    return json(await pollCommands(identity));
  if (p[2] === "config" && request.method === "GET")
    return json(
      await withTransaction(async (tx) => {
        const c = await lockIdentity(tx, identity);
        await touchDevice(tx, c);
        const channels = (
          await tx.query(
            "SELECT key,name,kind,type,unit FROM hg_connection_channels WHERE connection_id=$1 AND deleted_at IS NULL ORDER BY key",
            [id],
          )
        ).rows;
        return {
          schema_version: "1.0",
          id,
          name: c.name,
          heartbeat_seconds: c.heartbeat_seconds,
          credential_generation: c.credential_generation,
          channels,
        };
      }),
    );
  fail(404, "NOT_FOUND", "Ruta de equipo no disponible.");
}
