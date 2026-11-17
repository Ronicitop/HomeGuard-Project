import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import pool from "../db";
import { withTransaction } from "../db/transaction";
import { assertPermission, type AuthContext } from "../auth/permissions";
import { audit, emit } from "../audit/auditService";
import { fail } from "../http/errors";
import { parseDefinition, type ConnectionInput } from "./catalog";
import { newDeviceCredential } from "./credentials";
const publicColumns = `c.id,c.name,c.kind,c.transport,c.location,c.model,c.enabled,c.heartbeat_seconds,c.camera_id,c.webcam_device_id,c.revision,c.credential_generation,(c.credential_hash IS NOT NULL) credential_ready,c.last_seen,c.last_sample_at,c.created_at,c.updated_at`;
export function connectionStatus(row: any, now = Date.now()) {
  if (!row.enabled) return "DISABLED";
  if (row.kind === "CAMERA")
    return row.camera_online ? "ONLINE" : row.last_seen ? "OFFLINE" : "WAITING";
  if (!row.last_seen) return "WAITING";
  return now - new Date(row.last_seen).getTime() <=
    Math.max(30, row.heartbeat_seconds * 3) * 1000
    ? "ONLINE"
    : "OFFLINE";
}
export async function listConnections(ctx: AuthContext) {
  assertPermission(ctx, "connections.read");
  const rows = (
    await pool.query(
      `SELECT ${publicColumns},EXISTS(SELECT 1 FROM SesionCamara s JOIN hg_sessions a ON a.id=s.auth_session_id JOIN hg_memberships m ON m.user_id=s.usuario_id AND m.household_id=s.household_id JOIN Usuario u ON u.id=s.usuario_id WHERE s.camara_id=c.camera_id AND s.household_id=c.household_id AND s.tipo='publish' AND s.media_id IS NOT NULL AND s.expira_en>now() AND a.revoked_at IS NULL AND a.expires_at>now() AND m.enabled AND m.role IN ('ADMINISTRADOR','RESIDENTE') AND u.activo) camera_online FROM hg_connections c WHERE c.household_id=$1 AND c.deleted_at IS NULL ORDER BY c.created_at DESC LIMIT 100`,
      [ctx.household_id],
    )
  ).rows;
  const channels = (
    await pool.query(
      "SELECT ch.id,ch.connection_id,ch.key,ch.name,ch.kind,ch.type,ch.unit,ch.last_value,ch.last_observed_at,ch.last_received_at,to_jsonb(cmd) last_command FROM hg_connection_channels ch JOIN hg_connections c ON c.id=ch.connection_id LEFT JOIN LATERAL(SELECT id,status,requested_state,reported_state,created_at,expires_at,error_code FROM hg_device_commands WHERE channel_id=ch.id ORDER BY created_at DESC,id DESC LIMIT 1) cmd ON true WHERE c.household_id=$1 AND c.deleted_at IS NULL AND ch.deleted_at IS NULL ORDER BY ch.key",
      [ctx.household_id],
    )
  ).rows;
  return {
    items: rows.map((row) => ({
      ...row,
      status: connectionStatus(row),
      can_command: Boolean(
        row.enabled &&
        row.last_seen &&
        Date.now() - new Date(row.last_seen).getTime() <=
          Math.min(60, Math.max(30, row.heartbeat_seconds * 3)) * 1000,
      ),
      channels: channels.filter((ch) => ch.connection_id === row.id),
    })),
    next_cursor: null,
  };
}
export async function getConnection(ctx: AuthContext, id: string) {
  const row = (await listConnections(ctx)).items.find((c) => c.id === id);
  if (!row) fail(404, "NOT_FOUND", "No se encontró la conexión en este hogar.");
  return row;
}
async function own(
  tx: PoolClient,
  ctx: AuthContext,
  id: string,
  revision: number,
) {
  const row = (
    await tx.query(
      "SELECT * FROM hg_connections WHERE id=$1 AND household_id=$2 AND deleted_at IS NULL FOR UPDATE",
      [id, ctx.household_id],
    )
  ).rows[0];
  if (!row) fail(404, "NOT_FOUND", "No se encontró la conexión.");
  if (!Number.isInteger(revision) || row.revision !== revision)
    fail(
      409,
      "REVISION_CONFLICT",
      "El equipo cambió. Volvé a cargar su configuración.",
    );
  return row;
}
async function notifyChanged(tx: PoolClient, ctx: AuthContext, id: string) {
  await tx.query("SELECT pg_notify('hg_connection_changed',$1)", [id]);
  await emit(tx, ctx.household_id, "connection.updated", id);
}
async function cancelPending(tx: PoolClient, id: string) {
  await tx.query(
    "UPDATE hg_device_commands SET status='CANCELLED',error_code='CONFIGURATION_CHANGED' WHERE connection_id=$1 AND status IN ('QUEUED','SENT')",
    [id],
  );
  await tx.query(
    "UPDATE hg_outbox SET status='CANCELLED',error_code='CONNECTION_CHANGED' WHERE kind='DEVICE_COMMAND' AND payload->>'connection_id'=$1 AND status='QUEUED'",
    [id],
  );
}
async function saveChannels(
  tx: PoolClient,
  ctx: AuthContext,
  id: string,
  d: ConnectionInput,
) {
  const keys = d.channels.map((c) => c.key);
  await tx.query(
    "UPDATE hg_connection_channels SET deleted_at=now() WHERE connection_id=$1 AND NOT(key=ANY($2::text[]))",
    [id, keys],
  );
  for (const c of d.channels)
    await tx.query(
      "INSERT INTO hg_connection_channels(id,household_id,connection_id,key,name,kind,type,unit) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(connection_id,key) DO UPDATE SET name=excluded.name,kind=excluded.kind,type=excluded.type,unit=excluded.unit,deleted_at=NULL,last_value=CASE WHEN hg_connection_channels.type=excluded.type AND hg_connection_channels.kind=excluded.kind AND hg_connection_channels.deleted_at IS NULL THEN hg_connection_channels.last_value ELSE NULL END,last_observed_at=CASE WHEN hg_connection_channels.type=excluded.type AND hg_connection_channels.kind=excluded.kind AND hg_connection_channels.deleted_at IS NULL THEN hg_connection_channels.last_observed_at ELSE NULL END,last_received_at=CASE WHEN hg_connection_channels.type=excluded.type AND hg_connection_channels.kind=excluded.kind AND hg_connection_channels.deleted_at IS NULL THEN hg_connection_channels.last_received_at ELSE NULL END",
      [
        randomUUID(),
        ctx.household_id,
        id,
        c.key,
        c.name,
        c.kind,
        c.type,
        c.unit,
      ],
    );
}
export async function createConnection(ctx: AuthContext, raw: unknown) {
  assertPermission(ctx, "connections.manage");
  const d = parseDefinition(raw),
    id = randomUUID();
  const credential =
    d.kind === "CAMERA" ? null : newDeviceCredential(id, ctx.household_id, 1);
  await withTransaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${ctx.household_id}:connections`,
    ]);
    if (
      (
        await tx.query(
          "SELECT count(*)::int n FROM hg_connections WHERE household_id=$1 AND deleted_at IS NULL",
          [ctx.household_id],
        )
      ).rows[0].n >= 100
    )
      fail(
        409,
        "CONNECTION_LIMIT",
        "Se alcanzó el límite de equipos registrados.",
      );
    let cameraId = null;
    if (d.kind === "CAMERA") {
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${ctx.household_id}:cameras`,
      ]);
      if (
        (
          await tx.query(
            "SELECT count(*)::int n FROM Camara WHERE household_id=$1 AND enabled",
            [ctx.household_id],
          )
        ).rows[0].n >= 10
      )
        fail(
          409,
          "CAMERA_LIMIT",
          "Este prototipo admite hasta diez cámaras registradas.",
        );
      cameraId = (
        await tx.query(
          "INSERT INTO Camara(nombre,household_id,enabled,webcam_device_id) VALUES($1,$2,$3,$4) RETURNING id",
          [d.name, ctx.household_id, d.enabled, d.webcam_device_id],
        )
      ).rows[0].id;
    }
    await tx.query(
      "INSERT INTO hg_connections(id,household_id,name,kind,transport,location,model,enabled,heartbeat_seconds,camera_id,webcam_device_id,credential_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
      [
        id,
        ctx.household_id,
        d.name,
        d.kind,
        d.transport,
        d.location,
        d.model,
        d.enabled,
        d.heartbeat_seconds,
        cameraId,
        d.webcam_device_id,
        credential?.hash || null,
      ],
    );
    await saveChannels(tx, ctx, id, d);
    await audit(tx, ctx, "connection.created", id, null, {
      name: d.name,
      kind: d.kind,
      transport: d.transport,
    });
    await notifyChanged(tx, ctx, id);
  });
  return {
    connection: await getConnection(ctx, id),
    credentials: credential?.credentials || null,
  };
}
export async function updateConnection(ctx: AuthContext, id: string, raw: any) {
  assertPermission(ctx, "connections.manage");
  const { expected_revision, ...definition } = raw;
  const d = parseDefinition(definition);
  await withTransaction(async (tx) => {
    const previous = await own(tx, ctx, id, expected_revision);
    if (previous.kind !== d.kind || previous.transport !== d.transport)
      fail(
        409,
        "IMMUTABLE_CONNECTION_TYPE",
        "Creá otro vínculo para cambiar el tipo de equipo o protocolo.",
      );
    await tx.query(
      "UPDATE hg_connections SET name=$2,location=$3,model=$4,enabled=$5,heartbeat_seconds=$6,webcam_device_id=$7,revision=revision+1,credential_generation=credential_generation+CASE WHEN enabled<>$5 THEN 1 ELSE 0 END,last_seen=CASE WHEN enabled<>$5 THEN NULL ELSE last_seen END,updated_at=now() WHERE id=$1",
      [
        id,
        d.name,
        d.location,
        d.model,
        d.enabled,
        d.heartbeat_seconds,
        d.webcam_device_id,
      ],
    );
    await saveChannels(tx, ctx, id, d);
    await cancelPending(tx, id);
    if (previous.camera_id && d.enabled && !previous.enabled) {
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${ctx.household_id}:cameras`,
      ]);
      if (
        (
          await tx.query(
            "SELECT count(*)::int n FROM Camara WHERE household_id=$1 AND enabled",
            [ctx.household_id],
          )
        ).rows[0].n >= 10
      )
        fail(
          409,
          "CAMERA_LIMIT",
          "Este prototipo admite diez cámaras activas.",
        );
    }
    if (previous.camera_id) {
      await tx.query(
        "UPDATE Camara SET nombre=$2,enabled=$3,webcam_device_id=$4 WHERE id=$1",
        [previous.camera_id, d.name, d.enabled, d.webcam_device_id],
      );
      if (!d.enabled)
        await tx.query(
          "UPDATE SesionCamara SET expira_en=now() WHERE camara_id=$1",
          [previous.camera_id],
        );
    }
    await audit(
      tx,
      ctx,
      "connection.updated",
      id,
      { revision: previous.revision },
      { revision: previous.revision + 1, enabled: d.enabled },
    );
    await notifyChanged(tx, ctx, id);
  });
  return getConnection(ctx, id);
}
export async function deleteConnection(
  ctx: AuthContext,
  id: string,
  revision: number,
) {
  assertPermission(ctx, "connections.manage");
  await withTransaction(async (tx) => {
    const row = await own(tx, ctx, id, revision);
    await tx.query(
      "UPDATE hg_connections SET enabled=false,deleted_at=now(),credential_hash=NULL,credential_generation=credential_generation+1,revision=revision+1 WHERE id=$1",
      [id],
    );
    await cancelPending(tx, id);
    if (row.camera_id) {
      await tx.query("UPDATE Camara SET enabled=false WHERE id=$1", [
        row.camera_id,
      ]);
      await tx.query(
        "UPDATE SesionCamara SET expira_en=now() WHERE camara_id=$1",
        [row.camera_id],
      );
    }
    await audit(tx, ctx, "connection.deleted", id, null, { revoked: true });
    await notifyChanged(tx, ctx, id);
  });
  return { success: true };
}
export async function rotateCredential(
  ctx: AuthContext,
  id: string,
  revision: number,
) {
  assertPermission(ctx, "connections.manage");
  let credentials: any;
  await withTransaction(async (tx) => {
    const row = await own(tx, ctx, id, revision);
    if (row.kind === "CAMERA")
      fail(
        400,
        "CAMERA_USES_SESSION",
        "La cámara usa la sesión del navegador.",
      );
    const next = newDeviceCredential(
      id,
      ctx.household_id,
      row.credential_generation + 1,
    );
    credentials = next.credentials;
    await tx.query(
      "UPDATE hg_connections SET credential_hash=$2,credential_generation=credential_generation+1,last_seen=NULL,revision=revision+1,updated_at=now() WHERE id=$1",
      [id, next.hash],
    );
    await cancelPending(tx, id);
    await audit(tx, ctx, "connection.credential_rotated", id, null, {
      generation: row.credential_generation + 1,
    });
    await notifyChanged(tx, ctx, id);
  });
  return { connection: await getConnection(ctx, id), credentials };
}
