import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import pool from "../db";
import { fail } from "../http/errors";
export type DeviceIdentity = {
  connection_id: string;
  household_id: string;
  generation: number;
  transport: "MQTT" | "HTTP";
};
export const hashDeviceToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function newDeviceCredential(
  id: string,
  home: string,
  generation: number,
) {
  const token = "hgd_" + randomBytes(32).toString("base64url");
  return {
    hash: hashDeviceToken(token),
    credentials: {
      token,
      username: `hg-device-${id}`,
      generation,
      topics: {
        telemetry: `homeguard/v1/${home}/devices/${id}/telemetry`,
        commands: `homeguard/v1/${home}/devices/${id}/commands`,
        ack: `homeguard/v1/${home}/devices/${id}/ack`,
      },
      http_path: `/api/v1/device-ingest/${id}`,
    },
  };
}
export async function authenticateDevice(
  id: string,
  token: string,
  transport?: "MQTT" | "HTTP",
): Promise<DeviceIdentity> {
  if (
    !/^[a-f0-9-]{36}$/i.test(id) ||
    typeof token !== "string" ||
    token.length < 20 ||
    token.length > 150
  )
    fail(401, "INVALID_DEVICE_CREDENTIAL", "Credencial de equipo no válida.");
  const row = (
    await pool.query(
      "SELECT id,household_id,transport,enabled,deleted_at,credential_hash,credential_generation FROM hg_connections WHERE id=$1",
      [id],
    )
  ).rows[0];
  if (
    !row ||
    !row.enabled ||
    row.deleted_at ||
    !row.credential_hash ||
    row.transport === "WEBCAM" ||
    (transport && row.transport !== transport)
  )
    fail(401, "INVALID_DEVICE_CREDENTIAL", "Credencial de equipo no válida.");
  if (
    !timingSafeEqual(
      Buffer.from(hashDeviceToken(token), "hex"),
      Buffer.from(row.credential_hash, "hex"),
    )
  )
    fail(401, "INVALID_DEVICE_CREDENTIAL", "Credencial de equipo no válida.");
  return {
    connection_id: row.id,
    household_id: row.household_id,
    generation: row.credential_generation,
    transport: row.transport,
  };
}
export async function lockIdentity(tx: PoolClient, identity: DeviceIdentity) {
  const row = (
    await tx.query(
      "SELECT * FROM hg_connections WHERE id=$1 AND household_id=$2 FOR UPDATE",
      [identity.connection_id, identity.household_id],
    )
  ).rows[0];
  if (
    !row ||
    !row.enabled ||
    row.deleted_at ||
    row.credential_generation !== identity.generation ||
    row.transport !== identity.transport
  )
    fail(401, "DEVICE_REVOKED", "El vínculo del equipo fue revocado.");
  return row;
}
export async function mqttIdentity(
  id: string,
  home: string,
  generation: number,
): Promise<DeviceIdentity> {
  const row = (
    await pool.query(
      "SELECT 1 FROM hg_connections WHERE id=$1 AND household_id=$2 AND transport='MQTT' AND enabled AND deleted_at IS NULL AND credential_generation=$3",
      [id, home, generation],
    )
  ).rowCount;
  if (!row) fail(401, "DEVICE_REVOKED", "El vínculo del equipo fue revocado.");
  return {
    connection_id: id,
    household_id: home,
    generation,
    transport: "MQTT",
  };
}
