import { createHash } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { withTransaction } from "../db/transaction";
import { fail } from "../http/errors";
import { emit } from "../audit/auditService";
import { lockIdentity, type DeviceIdentity } from "./credentials";
import { normalizeReading } from "./catalog";
export { authenticateDevice, mqttIdentity } from "./credentials";
const telemetrySchema = z
  .object({
    schema_version: z.literal("1.0").default("1.0"),
    message_id: z.uuid(),
    observed_at: z.string().datetime({ offset: true }).optional(),
    heartbeat: z.boolean().default(false),
    readings: z
      .array(
        z
          .object({
            channel: z.string().min(1).max(32),
            value: z.union([
              z.number().finite(),
              z.string().max(40),
              z.boolean(),
            ]),
          })
          .strict(),
      )
      .max(16)
      .default([]),
  })
  .strict();
export async function recordMessage(
  tx: PoolClient,
  connectionId: string,
  messageId: string,
  value: unknown,
) {
  const hash = createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const inserted = await tx.query(
    "INSERT INTO hg_connection_messages(connection_id,message_id,body_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING message_id",
    [connectionId, messageId, hash],
  );
  if (inserted.rowCount) return true;
  const previous = (
    await tx.query(
      "SELECT body_hash FROM hg_connection_messages WHERE connection_id=$1 AND message_id=$2",
      [connectionId, messageId],
    )
  ).rows[0];
  if (previous.body_hash !== hash)
    fail(
      409,
      "MESSAGE_ID_REUSED",
      "Este identificador ya se usó con otro mensaje.",
    );
  return false;
}
export async function touchDevice(
  tx: PoolClient,
  row: any,
  contactAt = new Date(),
) {
  const now = new Date();
  const start = row.window_started_at
    ? new Date(row.window_started_at)
    : new Date(0);
  const recent = now.getTime() - start.getTime() < 60000;
  const count = recent ? row.packet_count + 1 : 1;
  if (count > 600)
    fail(
      429,
      "DEVICE_RATE_LIMIT",
      "El equipo está enviando demasiados mensajes.",
    );
  await tx.query(
    "UPDATE hg_connections SET last_seen=GREATEST(last_seen,$2),window_started_at=$3,packet_count=$4 WHERE id=$1",
    [row.id, contactAt, recent ? start : now, count],
  );
  if (
    !row.last_seen ||
    now.getTime() - new Date(row.last_seen).getTime() > 30000
  )
    await emit(tx, row.household_id, "connection.updated", row.id);
}
export async function ingestTelemetry(
  identity: DeviceIdentity,
  raw: unknown,
  receivedAt = new Date(),
) {
  const result = telemetrySchema.safeParse(raw);
  if (!result.success)
    fail(
      400,
      "INVALID_DEVICE_PACKET",
      "El mensaje no cumple el protocolo de telemetría.",
    );
  const packet = result.data;
  if (!packet.heartbeat && !packet.readings.length)
    fail(
      400,
      "EMPTY_DEVICE_PACKET",
      "Enviá una lectura o un heartbeat explícito.",
    );
  if (
    new Set(packet.readings.map((r) => r.channel)).size !==
    packet.readings.length
  )
    fail(400, "DUPLICATE_CHANNEL", "Un mensaje no puede repetir el canal.");
  const observed = packet.observed_at
    ? new Date(packet.observed_at)
    : receivedAt;
  if (observed.getTime() > Date.now() + 5000)
    fail(422, "DEVICE_CLOCK_INVALID", "El reloj del equipo está adelantado.");
  return withTransaction(async (tx) => {
    const connection = await lockIdentity(tx, identity);
    const channels = (
      await tx.query(
        "SELECT * FROM hg_connection_channels WHERE connection_id=$1 AND deleted_at IS NULL",
        [connection.id],
      )
    ).rows;
    const readings = packet.readings.map((reading) => {
      const channel = channels.find((c) => c.key === reading.channel);
      if (!channel)
        fail(
          422,
          "UNKNOWN_CHANNEL",
          "El canal no está registrado para este equipo.",
        );
      return { channel, value: normalizeReading(channel, reading.value) };
    });
    if (!(await recordMessage(tx, connection.id, packet.message_id, packet)))
      return { accepted: true, duplicate: true };
    await touchDevice(tx, connection, receivedAt);
    const late = Date.now() - observed.getTime() > 300000;
    for (const { channel, value } of readings) {
      await tx.query(
        "INSERT INTO hg_connection_samples(household_id,connection_id,channel_id,message_id,value,observed_at,late,received_at,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'LIVE')",
        [
          identity.household_id,
          connection.id,
          channel.id,
          packet.message_id,
          JSON.stringify(value),
          observed,
          late,
          receivedAt,
        ],
      );
      if (!late)
        await tx.query(
          "UPDATE hg_connection_channels SET last_value=$2,last_observed_at=$3,last_received_at=$4 WHERE id=$1 AND (last_observed_at IS NULL OR last_observed_at<=$3)",
          [channel.id, JSON.stringify(value), observed, receivedAt],
        );
    }
    if (readings.length && !late)
      await tx.query(
        "UPDATE hg_connections SET last_sample_at=GREATEST(last_sample_at,$2) WHERE id=$1",
        [connection.id, receivedAt],
      );
    return { accepted: true, duplicate: false, stored: readings.length, late };
  });
}
