import { randomUUID } from "node:crypto";
import { z } from "zod";
import pool from "../db";
import { withTransaction } from "../db/transaction";
import { idempotent } from "../http/idempotency";
import { assertPermission, type AuthContext } from "../auth/permissions";
import { fail } from "../http/errors";
import { audit, emit } from "../audit/auditService";
import { enqueueJob } from "../jobs/outboxService";
import { lockIdentity, type DeviceIdentity } from "./credentials";
import { recordMessage, touchDevice } from "./telemetry";
export async function requestDeviceCommand(
  ctx: AuthContext,
  id: string,
  key: string,
  state: string,
  idempotencyKey: string,
) {
  assertPermission(ctx, "actuators.command");
  if (!["ON", "OFF"].includes(state))
    fail(400, "INVALID_COMMAND", "Elegí ON u OFF.");
  return withTransaction(async (tx) =>
    idempotent(
      tx,
      ctx,
      `device.command:${id}:${key}`,
      idempotencyKey,
      { state },
      async () => {
        const connection = (
          await tx.query(
            "SELECT * FROM hg_connections WHERE id=$1 AND household_id=$2 AND deleted_at IS NULL FOR UPDATE",
            [id, ctx.household_id],
          )
        ).rows[0];
        if (!connection) fail(404, "NOT_FOUND", "No se encontró el equipo.");
        if (
          !connection.enabled ||
          !connection.last_seen ||
          Date.now() - new Date(connection.last_seen).getTime() >
            Math.min(60, Math.max(30, connection.heartbeat_seconds * 3)) * 1000
        )
          fail(
            409,
            "DEVICE_OFFLINE",
            "El equipo no tiene comunicación reciente. Esperá una conexión real para enviar comandos.",
          );
        const channel = (
          await tx.query(
            "SELECT * FROM hg_connection_channels WHERE connection_id=$1 AND key=$2 AND kind='ACTUATOR' AND deleted_at IS NULL FOR UPDATE",
            [id, key],
          )
        ).rows[0];
        if (!channel)
          fail(404, "NOT_FOUND", "No se encontró la salida del equipo.");
        await tx.query(
          "UPDATE hg_device_commands SET status='EXPIRED',error_code='ACK_TIMEOUT' WHERE connection_id=$1 AND expires_at<=now() AND status IN ('QUEUED','SENT')",
          [id],
        );
        if (
          (
            await tx.query(
              "SELECT 1 FROM hg_device_commands WHERE channel_id=$1 AND status IN ('QUEUED','SENT')",
              [channel.id],
            )
          ).rowCount
        )
          fail(
            409,
            "COMMAND_PENDING",
            "Esperá la confirmación o el vencimiento del comando pendiente.",
          );
        const command = (
          await tx.query(
            "INSERT INTO hg_device_commands(id,household_id,connection_id,channel_id,requested_state,credential_generation,requested_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
            [
              randomUUID(),
              ctx.household_id,
              id,
              channel.id,
              state,
              connection.credential_generation,
              ctx.user_id,
            ],
          )
        ).rows[0];
        if (connection.transport === "MQTT")
          await enqueueJob(tx, {
            household_id: ctx.household_id,
            kind: "DEVICE_COMMAND",
            payload: { connection_id: id, command_id: command.id },
            idempotency_key: `${command.id}:physical`,
          });
        await audit(tx, ctx, "device.command_requested", command.id, null, {
          connection_id: id,
          channel: key,
          state,
        });
        await emit(tx, ctx.household_id, "connection.updated", id);
        return command;
      },
    ),
  );
}
export async function expireDeviceCommands() {
  return (
    await pool.query(
      "UPDATE hg_device_commands SET status='EXPIRED',error_code='ACK_TIMEOUT' WHERE status IN ('QUEUED','SENT') AND expires_at<=now() RETURNING id,connection_id",
    )
  ).rows;
}
export async function pollCommands(identity: DeviceIdentity) {
  return withTransaction(async (tx) => {
    const connection = await lockIdentity(tx, identity);
    await touchDevice(tx, connection);
    await tx.query(
      "UPDATE hg_device_commands SET status='EXPIRED',error_code='ACK_TIMEOUT' WHERE connection_id=$1 AND status IN ('QUEUED','SENT') AND expires_at<=now()",
      [connection.id],
    );
    const items = (
      await tx.query(
        "UPDATE hg_device_commands c SET status='SENT',sent_at=now() FROM hg_connection_channels ch WHERE c.connection_id=$1 AND ch.id=c.channel_id AND ch.deleted_at IS NULL AND c.credential_generation=$2 AND c.status IN ('QUEUED','SENT') AND c.expires_at>now() RETURNING c.id,ch.key AS channel,c.requested_state AS state,c.expires_at",
        [connection.id, connection.credential_generation],
      )
    ).rows;
    return { schema_version: "1.0", items };
  });
}
const ackSchema = z
  .object({
    schema_version: z.literal("1.0").default("1.0"),
    message_id: z.uuid(),
    command_id: z.uuid(),
    state: z.enum(["ON", "OFF"]),
    ok: z.boolean().default(true),
  })
  .strict();
export async function acknowledgeCommand(
  identity: DeviceIdentity,
  raw: unknown,
  receivedAt = new Date(),
) {
  const result = ackSchema.safeParse(raw);
  if (!result.success)
    fail(400, "INVALID_DEVICE_ACK", "La confirmación no cumple el protocolo.");
  const ack = result.data;
  return withTransaction(async (tx) => {
    const connection = await lockIdentity(tx, identity);
    const command = (
      await tx.query(
        "SELECT * FROM hg_device_commands WHERE id=$1 AND connection_id=$2 AND household_id=$3 FOR UPDATE",
        [ack.command_id, connection.id, identity.household_id],
      )
    ).rows[0];
    if (!command)
      fail(404, "NOT_FOUND", "El comando no corresponde a este equipo.");
    if (command.requested_state !== ack.state)
      fail(
        409,
        "ACK_STATE_MISMATCH",
        "La respuesta no coincide con el estado solicitado.",
      );
    if (command.status === "ACKNOWLEDGED")
      return { status: "ACKNOWLEDGED", duplicate: true };
    if (
      !["QUEUED", "SENT", "EXPIRED"].includes(command.status) ||
      command.credential_generation !== identity.generation ||
      new Date(command.expires_at).getTime() <= receivedAt.getTime()
    )
      fail(409, "COMMAND_CLOSED", "El comando venció, cambió o ya terminó.");
    if (!(await recordMessage(tx, connection.id, ack.message_id, ack)))
      return { status: command.status, duplicate: true };
    await touchDevice(tx, connection, receivedAt);
    const status = ack.ok ? "ACKNOWLEDGED" : "FAILED";
    await tx.query(
      "UPDATE hg_device_commands SET status=$2,reported_state=$3,ack_at=now(),error_code=$4 WHERE id=$1",
      [
        command.id,
        status,
        ack.ok ? ack.state : null,
        ack.ok ? null : "DEVICE_REJECTED",
      ],
    );
    if (ack.ok) {
      await tx.query(
        "UPDATE hg_connection_channels SET last_value=$2,last_observed_at=$3,last_received_at=$3 WHERE id=$1 AND deleted_at IS NULL AND (last_observed_at IS NULL OR last_observed_at<=$3)",
        [command.channel_id, JSON.stringify(ack.state), receivedAt],
      );
      await tx.query(
        "INSERT INTO hg_connection_samples(household_id,connection_id,channel_id,message_id,value,observed_at,received_at,source) VALUES($1,$2,$3,$4,$5,$6,$6,'LIVE')",
        [
          identity.household_id,
          connection.id,
          command.channel_id,
          ack.message_id,
          JSON.stringify(ack.state),
          receivedAt,
        ],
      );
    }
    await emit(tx, identity.household_id, "connection.updated", connection.id);
    return { status, duplicate: false };
  });
}
export async function dispatchDeviceCommand(
  job: any,
  publish: (topic: string, data: unknown) => Promise<void>,
) {
  return withTransaction(async (tx) => {
    // Same lock order as configuration and ACK: connection, then command.
    const target = (
      await tx.query(
        "SELECT connection_id FROM hg_device_commands WHERE id=$1 AND household_id=$2",
        [job.payload.command_id, job.household_id],
      )
    ).rows[0];
    if (!target) return;
    await tx.query("SELECT id FROM hg_connections WHERE id=$1 FOR UPDATE", [
      target.connection_id,
    ]);
    const row = (
      await tx.query(
        "SELECT d.*,c.enabled,c.deleted_at,c.transport,c.credential_generation current_generation,c.last_seen,c.heartbeat_seconds,ch.deleted_at channel_deleted,ch.key FROM hg_device_commands d JOIN hg_connections c ON c.id=d.connection_id JOIN hg_connection_channels ch ON ch.id=d.channel_id WHERE d.id=$1 AND d.household_id=$2 FOR UPDATE OF d",
        [job.payload.command_id, job.household_id],
      )
    ).rows[0];
    if (!row || !["QUEUED", "SENT"].includes(row.status)) return;
    if (
      !row.enabled ||
      row.deleted_at ||
      row.channel_deleted ||
      !row.last_seen ||
      Date.now() - new Date(row.last_seen).getTime() >
        Math.min(60, Math.max(30, row.heartbeat_seconds * 3)) * 1000 ||
      row.current_generation !== row.credential_generation
    ) {
      await tx.query(
        "UPDATE hg_device_commands SET status='CANCELLED',error_code='CONNECTION_CHANGED' WHERE id=$1 AND status IN ('QUEUED','SENT')",
        [row.id],
      );
      return;
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await tx.query(
        "UPDATE hg_device_commands SET status='EXPIRED',error_code='ACK_TIMEOUT' WHERE id=$1",
        [row.id],
      );
      return;
    }
    if (row.transport !== "MQTT") return;
    await publish(
      `homeguard/v1/${job.household_id}/devices/${row.connection_id}/commands`,
      {
        schema_version: "1.0",
        command_id: row.id,
        channel: row.key,
        state: row.requested_state,
        expires_at: row.expires_at,
        credential_generation: row.credential_generation,
      },
    );
    await tx.query(
      "UPDATE hg_device_commands SET status='SENT',sent_at=now() WHERE id=$1 AND status='QUEUED'",
      [row.id],
    );
  });
}
