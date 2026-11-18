import { randomUUID, createHash, timingSafeEqual } from "node:crypto";
import pool from "../db";
import { withTransaction } from "../db/transaction";
import { type AuthContext, assertPermission } from "../auth/permissions";
import { fail } from "../http/errors";
import { encryptToken, decryptToken } from "./tokenCrypto";
import { planNotifications, buildPushPayload } from "./notificationService";
import { enqueueJob } from "../jobs/outboxService";
import { emit } from "../audit/auditService";
import { loadRuleContext } from "../integrations/vision";
import { deliverFcm } from "./fcmDelivery";
async function ruleAllowsDispatch(event: any, challenge: boolean) {
  if (
    challenge &&
    !(
      await pool.query(
        "SELECT 1 FROM hg_emergency_policies p JOIN hg_emergency_incidents i ON i.household_id=p.household_id WHERE p.household_id=$1 AND p.enabled AND i.event_id=$2 AND i.state='PENDING_RESPONSE'",
        [event.household_id, event.id],
      )
    ).rowCount
  )
    return false;
  if (!event.rule_version_id) return true;
  const tx = await pool.connect();
  try {
    const c = await loadRuleContext(
      tx,
      event.household_id,
      event.camera_id,
      event.rule_version_id,
    );
    return Boolean(
      c.rule.enabled &&
      c.camera.enabled &&
      c.rule.active_version_id === event.rule_version_id &&
      c.version.status === "VALIDATED" &&
      c.version.definition.actions?.[
        challenge ? "emergency_enabled" : "notify_enabled"
      ],
    );
  } catch {
    return false;
  } finally {
    tx.release();
  }
}
export async function registerPushDevice(
  ctx: AuthContext,
  input: {
    installation_id: string;
    token: string;
    platform: string;
    provider?: "EXPO" | "FCM";
  },
) {
  assertPermission(ctx, "notifications.manage");
  const provider = input.provider || "EXPO";
  if (
    typeof input.token !== "string" ||
    !(provider === "FCM"
      ? /^[a-zA-Z0-9:_-]{20,4096}$/.test(input.token)
      : provider === "EXPO" &&
        input.token.length <= 500 &&
        /^(ExponentPushToken|ExpoPushToken)\[[a-zA-Z0-9_-]+\]$/.test(
          input.token,
        ))
  )
    fail(400, "INVALID_PUSH_TOKEN", "El token del dispositivo no es válido.");
  const encrypted = encryptToken(input.token);
  return withTransaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `push-installation:${input.installation_id}`,
    ]);
    const previous = (
      await tx.query(
        "SELECT id,token_encrypted,provider FROM hg_push_devices WHERE installation_id=$1 AND (user_id<>$2 OR household_id<>$3) FOR UPDATE",
        [input.installation_id, ctx.user_id, ctx.household_id],
      )
    ).rows;
    const incomingHash = createHash("sha256").update(input.token).digest();
    for (const device of previous) {
      // An opaque installation ID alone is not authority to revoke another user's device.
      // Rebinding requires possession of the same private provider token from that installation.
      let sameToken = false;
      try {
        sameToken = timingSafeEqual(
          createHash("sha256")
            .update(decryptToken(device.token_encrypted))
            .digest(),
          incomingHash,
        );
      } catch {}
      if (sameToken && device.provider === provider)
        await tx.query("UPDATE hg_push_devices SET enabled=false WHERE id=$1", [
          device.id,
        ]);
    }
    return (
      await tx.query(
        "INSERT INTO hg_push_devices(id,household_id,user_id,installation_id,token_encrypted,platform,provider) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(household_id,user_id,installation_id) DO UPDATE SET token_encrypted=excluded.token_encrypted,platform=excluded.platform,provider=excluded.provider,enabled=true,last_seen=now() RETURNING id,installation_id,platform,provider,enabled,last_seen",
        [
          randomUUID(),
          ctx.household_id,
          ctx.user_id,
          input.installation_id,
          encrypted,
          input.platform,
          provider,
        ],
      )
    ).rows[0];
  });
}
export async function queueNotifications(
  event: any,
  emergencyOverride = false,
) {
  return withTransaction(async (tx) => {
    const devices = (
      await tx.query(
        "SELECT d.*,m.role,COALESCE(p.categories,ARRAY['SECURITY','MOVEMENT','EMERGENCY','SYSTEM']) categories,p.quiet_start,p.quiet_end,COALESCE(p.critical_demo_override,false) critical_demo_override FROM hg_push_devices d JOIN hg_memberships m ON m.household_id=d.household_id AND m.user_id=d.user_id JOIN Usuario u ON u.id=d.user_id LEFT JOIN hg_notification_preferences p ON p.household_id=d.household_id AND p.user_id=d.user_id WHERE d.household_id=$1 AND d.enabled AND m.enabled AND u.activo",
        [event.household_id],
      )
    ).rows;
    const plans = planNotifications(
      event,
      devices,
      new Date(),
      emergencyOverride,
    );
    let queued = 0;
    for (const device of plans) {
      const channel = emergencyOverride ? "EMERGENCY_CHALLENGE" : "EVENT";
      const row = (
        await tx.query(
          "INSERT INTO hg_notifications(id,household_id,event_id,user_id,installation_id,status,channel) VALUES($1,$2,$3,$4,$5,'QUEUED',$6) ON CONFLICT(event_id,installation_id,channel) DO NOTHING RETURNING id",
          [
            randomUUID(),
            event.household_id,
            event.id,
            device.user_id,
            device.installation_id,
            channel,
          ],
        )
      ).rows[0];
      if (row) {
        await enqueueJob(tx, {
          household_id: event.household_id,
          event_id: event.id,
          kind: "PUSH_DELIVERY",
          payload: { notification_id: row.id },
          idempotency_key: `${row.id}:delivery`,
        });
        queued++;
      }
    }
    return { queued };
  });
}
export async function deliverNotification(
  id: string,
  fetcher: (url: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<{ status: string; error_code?: string; retry?: boolean }> {
  const claimed = (
    await pool.query(
      "UPDATE hg_notifications SET status='SENDING' WHERE id=$1 AND status='QUEUED' RETURNING *",
      [id],
    )
  ).rows[0];
  if (!claimed) return { status: "SKIPPED" };
  const data = (
    await pool.query(
      `SELECT e.*,i.id incident_id,d.id device_id,d.token_encrypted,d.provider,d.enabled,m.role,m.enabled member_enabled,u.activo,COALESCE(p.categories,ARRAY['SECURITY','MOVEMENT','EMERGENCY','SYSTEM']) categories,p.quiet_start,p.quiet_end,COALESCE(p.critical_demo_override,false) critical_demo_override FROM hg_notifications n JOIN hg_events e ON e.id=n.event_id AND e.household_id=n.household_id LEFT JOIN hg_emergency_incidents i ON i.event_id=e.id AND i.household_id=e.household_id JOIN hg_push_devices d ON d.household_id=n.household_id AND d.user_id=n.user_id AND d.installation_id=n.installation_id JOIN hg_memberships m ON m.household_id=n.household_id AND m.user_id=n.user_id JOIN Usuario u ON u.id=n.user_id LEFT JOIN hg_notification_preferences p ON p.household_id=n.household_id AND p.user_id=n.user_id WHERE n.id=$1`,
      [id],
    )
  ).rows[0];
  let status = "FAILED",
    errorCode: string | undefined,
    ticket: string | undefined,
    retry = false;
  if (
    !data ||
    !data.enabled ||
    !data.member_enabled ||
    !data.activo ||
    !["ADMINISTRADOR", "RESIDENTE"].includes(data.role)
  ) {
    status = "SKIPPED";
    errorCode = "ACCESS_REVOKED";
  } else if (
    !planNotifications(
      data,
      [data],
      new Date(),
      claimed.channel === "EMERGENCY_CHALLENGE",
    ).length
  ) {
    status = "SKIPPED";
    errorCode = "PREFERENCE_CHANGED";
  } else if (Date.now() - new Date(data.received_at).getTime() > 300000) {
    status = "SKIPPED";
    errorCode = "EXPIRED";
  } else if (
    !(await ruleAllowsDispatch(data, claimed.channel === "EMERGENCY_CHALLENGE"))
  ) {
    status = "SKIPPED";
    errorCode = "RULE_OR_POLICY_CHANGED";
  } else if (process.env.HG_PUSH_ENABLED !== "true") {
    errorCode = "PUSH_NOT_CONFIGURED";
  } else
    try {
      const token = decryptToken(data.token_encrypted);
      if (data.provider === "FCM") {
        const result = await deliverFcm(
          token,
          { ...data, notification_channel: claimed.channel },
          fetcher,
        );
        status = result.status;
        errorCode = result.error_code;
        ticket = result.ticket;
        retry = result.retry === true;
        if (result.invalid_token)
          await pool.query(
            "UPDATE hg_push_devices SET enabled=false WHERE id=$1 AND provider='FCM' AND token_encrypted=$2",
            [data.device_id, data.token_encrypted],
          );
      } else {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (process.env.HG_EXPO_ACCESS_TOKEN)
          headers.Authorization = `Bearer ${process.env.HG_EXPO_ACCESS_TOKEN}`;
        const response = await fetcher("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers,
          body: JSON.stringify(buildPushPayload(token, data)),
          signal: AbortSignal.timeout(15000),
        });
        if (response.status === 429 || response.status >= 500) {
          status = "QUEUED";
          errorCode = "PROVIDER_RETRY";
          retry = true;
        } else {
          const payload = await response.json();
          const result = Array.isArray(payload.data)
            ? payload.data[0]
            : payload.data;
          if (response.ok && result?.status === "ok" && result.id) {
            status = "SENT";
            ticket = result.id;
          } else {
            errorCode = result?.details?.error || "PROVIDER_REJECTED";
            if (errorCode === "DeviceNotRegistered")
              await pool.query(
                "UPDATE hg_push_devices SET enabled=false WHERE id=$1 AND provider='EXPO' AND token_encrypted=$2",
                [data.device_id, data.token_encrypted],
              );
          }
        }
      }
    } catch {
      status = "UNKNOWN";
      errorCode = "DELIVERY_OUTCOME_UNKNOWN";
    }
  await withTransaction(async (tx) => {
    await tx.query(
      "UPDATE hg_notifications SET status=$2,error_code=$3,provider_ticket=$4,provider=$5 WHERE id=$1",
      [
        id,
        status,
        errorCode || null,
        ticket || null,
        data?.provider || claimed.provider,
      ],
    );
    await emit(
      tx,
      claimed.household_id,
      "notification.updated",
      claimed.event_id,
    );
  });
  return { status, error_code: errorCode, retry };
}
export async function recoverNotificationAttempts() {
  // A process may die after provider acceptance: do not send an uncertain attempt again.
  await pool.query(
    "UPDATE hg_notifications SET status='UNKNOWN',error_code='PROCESS_RESTART_DURING_SEND' WHERE status='SENDING'",
  );
}
