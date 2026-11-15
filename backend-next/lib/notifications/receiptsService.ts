import pool from "../db";
import { withTransaction } from "../db/transaction";
import { emit } from "../audit/auditService";
export async function reconcileReceipts(fetcher: typeof fetch = fetch) {
  if (process.env.HG_PUSH_ENABLED !== "true") return;
  const notifications = (
    await pool.query(
      "SELECT * FROM hg_notifications WHERE status='SENT' AND provider_ticket IS NOT NULL AND provider_receipt IS NULL AND created_at<now()-interval '15 minutes' ORDER BY created_at LIMIT 100",
    )
  ).rows;
  if (!notifications.length) return;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (process.env.HG_EXPO_ACCESS_TOKEN)
    headers.Authorization = `Bearer ${process.env.HG_EXPO_ACCESS_TOKEN}`;
  try {
    const response = await fetcher(
      "https://exp.host/--/api/v2/push/getReceipts",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          ids: notifications.map((n) => n.provider_ticket),
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) return;
    const result = await response.json();
    for (const notification of notifications) {
      const raw = result.data?.[notification.provider_ticket];
      if (!raw) continue;
      if (!["ok", "error"].includes(raw.status)) continue;
      const code = raw.details?.error;
      const receipt = {
        status: raw.status,
        ...(typeof code === "string" ? { error: code.slice(0, 80) } : {}),
        checked_at: new Date().toISOString(),
        meaning: "PROVIDER_HANDOFF_NOT_USER_READ",
      };
      await withTransaction(async (tx) => {
        await tx.query(
          "UPDATE hg_notifications SET provider_receipt=$2,status=CASE WHEN $3 THEN 'FAILED' ELSE status END,error_code=COALESCE($4,error_code) WHERE id=$1 AND provider_receipt IS NULL",
          [
            notification.id,
            JSON.stringify(receipt),
            raw.status === "error",
            typeof code === "string" ? code.slice(0, 80) : null,
          ],
        );
        if (code === "DeviceNotRegistered")
          await tx.query(
            "UPDATE hg_push_devices SET enabled=false WHERE household_id=$1 AND user_id=$2 AND installation_id=$3",
            [
              notification.household_id,
              notification.user_id,
              notification.installation_id,
            ],
          );
        await emit(
          tx,
          notification.household_id,
          "notification.updated",
          notification.event_id,
        );
      });
    }
  } catch {
    /* Receipt lookup is read-only: retry on the next polling cycle, never resend the push. */
  }
}
