import pool from "../db";
import { mqttIdentity } from "./credentials";
import { ingestTelemetry } from "./telemetry";
import { acknowledgeCommand } from "./commands";
// One processor owns the existing database advisory lock. If it crashes between
// application commit and inbox completion, message_id deduplication makes retry safe.
export async function drainDeviceInbox() {
  const rows = (
    await pool.query(
      "SELECT * FROM hg_device_inbox WHERE processed_at IS NULL AND next_attempt_at<=now() ORDER BY id LIMIT 64",
    )
  ).rows;
  for (const row of rows) {
    try {
      const identity = await mqttIdentity(
        row.connection_id,
        row.household_id,
        row.credential_generation,
      );
      if (row.kind === "telemetry")
        await ingestTelemetry(identity, row.body, new Date(row.received_at));
      else
        await acknowledgeCommand(identity, row.body, new Date(row.received_at));
      await pool.query(
        "UPDATE hg_device_inbox SET processed_at=now(),error_code=NULL WHERE id=$1",
        [row.id],
      );
    } catch (error) {
      const status = (error as any)?.status;
      if (status >= 400 && status < 500 && status !== 429)
        await pool.query(
          "UPDATE hg_device_inbox SET processed_at=now(),error_code=$2 WHERE id=$1",
          [row.id, String((error as any).code || "REJECTED").slice(0, 80)],
        );
      else {
        await pool.query(
          "UPDATE hg_device_inbox SET next_attempt_at=now()+interval '2 seconds',error_code='RETRY_PENDING' WHERE id=$1",
          [row.id],
        );
      }
    }
  }
  // The long-term measurement journal is separate; keep delivery diagnostics for 24 h.
  await pool.query(
    "DELETE FROM hg_device_inbox WHERE id IN (SELECT id FROM hg_device_inbox WHERE processed_at<now()-interval '24 hours' LIMIT 500)",
  );
}
