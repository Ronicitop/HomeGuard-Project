import type { DetectionProposed } from "../../../contracts/types";
import { validateContract } from "../contracts";
import { withTransaction } from "../db/transaction";
import { loadRuleContext, tableAvailable } from "../integrations/vision";
import { enqueueJob } from "../jobs/outboxService";
import { emit } from "../audit/auditService";
import { fail } from "../http/errors";
export function withinSchedule(schedule: any, date: Date): boolean {
  if (!schedule) return true;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: schedule.timezone || "America/La_Paz",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) =>
    parts.find((x) => x.type === type)?.value || "";
  const day =
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(part("weekday")) +
    1;
  const minute = Number(part("hour")) * 60 + Number(part("minute"));
  const value = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const start = value(schedule.start),
    end = value(schedule.end);
  if (start < end)
    return schedule.days.includes(day) && minute >= start && minute < end;
  return (
    (minute >= start && schedule.days.includes(day)) ||
    (minute < end && schedule.days.includes(day === 1 ? 7 : day - 1))
  );
}
export async function ingestDetection(
  message: DetectionProposed,
  topicHousehold: string,
): Promise<{ status: string; event_id: string; reason_code?: string }> {
  const validation = validateContract("detection-proposed", message);
  if (!validation.valid)
    fail(
      422,
      "INVALID_CONTRACT",
      "El mensaje no cumple el contrato.",
      validation.errors,
    );
  if (message.household_id !== topicHousehold)
    fail(403, "TOPIC_SCOPE_MISMATCH", "El mensaje no corresponde al canal.");
  return withTransaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      message.event_id,
    ]);
    const receipt = (
      await tx.query("SELECT * FROM hg_event_receipts WHERE message_id=$1", [
        message.message_id,
      ])
    ).rows[0];
    if (receipt) {
      if (
        receipt.event_id !== message.event_id ||
        receipt.household_id !== topicHousehold
      )
        fail(409, "MESSAGE_ID_REUSED", "El ID del mensaje ya se utilizó.");
      return {
        status: receipt.status,
        event_id: receipt.event_id,
        reason_code: receipt.reason_code,
      };
    }
    const duplicate = (
      await tx.query(
        "SELECT id FROM hg_events WHERE id=$1 AND household_id=$2",
        [message.event_id, topicHousehold],
      )
    ).rows[0];
    if (duplicate) return { status: "ACCEPTED", event_id: message.event_id };
    const ctx = await loadRuleContext(
      tx,
      topicHousehold,
      message.camera_id,
      message.rule_version_id,
    );
    const d = ctx.version.definition;
    const active =
      ctx.rule.enabled &&
      ctx.rule.active_version_id === message.rule_version_id &&
      ctx.version.status === "VALIDATED" &&
      ctx.camera.enabled;
    const now = new Date(),
      date = new Date(message.occurred_at);
    const late =
      now.getTime() - date.getTime() > 30000 ||
      date.getTime() - now.getTime() > 5000 ||
      !active;
    if (ctx.camera.source_type === "FILE" && message.source === "LIVE")
      fail(
        422,
        "SOURCE_MISMATCH",
        "Una grabación no puede identificarse como LIVE.",
      );
    if (
      message.source === "LIVE" &&
      (await tableAvailable(tx, "hg_camera_runtime"))
    ) {
      const runtime = (
        await tx.query("SELECT * FROM hg_camera_runtime WHERE camera_id=$1", [
          message.camera_id,
        ])
      ).rows[0];
      if (
        !runtime ||
        runtime.stream_session_id !== message.stream_session_id ||
        now.getTime() - new Date(runtime.last_heartbeat_at).getTime() > 15000
      )
        fail(
          422,
          "STALE_CAMERA_SESSION",
          "La sesión de cámara no está vigente.",
        );
    } else if (message.source === "LIVE")
      fail(
        503,
        "CAMERA_RUNTIME_UNAVAILABLE",
        "Falta el estado de observación de la cámara.",
      );
    const mode =
      (
        await tx.query("SELECT mode FROM hg_modes WHERE household_id=$1", [
          topicHousehold,
        ])
      ).rows[0]?.mode || "AWAY";
    let effective =
      active &&
      !late &&
      Array.isArray(d.modes) &&
      d.modes.includes(mode) &&
      withinSchedule(d.schedule, date);
    if (d.condition?.kind === "SENSOR_CORRELATION" && effective) {
      const c = d.condition;
      const signal = await tx.query(
        "SELECT 1 FROM hg_sensor_signals WHERE household_id=$1 AND device_id=$2 AND sensor_type=$3 AND state=$4 AND abs(extract(epoch FROM (occurred_at-$5::timestamptz)))<=$6 AND ($7='LIVE' OR source='SIMULATED')",
        [
          topicHousehold,
          c.device_id,
          c.sensor_type,
          c.expected_state,
          message.occurred_at,
          Math.min(60, c.window_seconds || 15),
          message.source,
        ],
      );
      if (!signal.rowCount) {
        await tx.query(
          "INSERT INTO hg_pending_correlations(event_id,household_id,visual_candidate,device_id,expires_at) VALUES($1,$2,$3,$4,$5::timestamptz+($6*interval '1 second')) ON CONFLICT DO NOTHING",
          [
            message.event_id,
            topicHousehold,
            JSON.stringify(message),
            c.device_id,
            message.occurred_at,
            c.window_seconds || 15,
          ],
        );
        return { status: "PENDING_CORRELATION", event_id: message.event_id };
      }
    }
    const cooldown = Math.max(
      0,
      Math.min(3600, Number(d.cooldown_seconds) || 0),
    );
    const key = [
      topicHousehold,
      message.camera_id,
      ctx.rule.id,
      message.event_type,
    ].join(":");
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key]);
    const cool = (
      await tx.query(
        "SELECT * FROM hg_cooldowns WHERE household_id=$1 AND camera_id=$2 AND rule_id=$3 AND event_type=$4",
        [topicHousehold, message.camera_id, ctx.rule.id, message.event_type],
      )
    ).rows[0];
    if (effective && cool && new Date(cool.cooldown_until) > now) {
      await tx.query(
        "UPDATE hg_cooldowns SET grouped_count=grouped_count+1 WHERE household_id=$1 AND camera_id=$2 AND rule_id=$3 AND event_type=$4",
        [topicHousehold, message.camera_id, ctx.rule.id, message.event_type],
      );
      await tx.query(
        "INSERT INTO hg_event_receipts(message_id,event_id,household_id,status,reason_code) VALUES($1,$2,$3,'REJECTED','COOLDOWN')",
        [message.message_id, message.event_id, topicHousehold],
      );
      return {
        status: "REJECTED",
        event_id: message.event_id,
        reason_code: "COOLDOWN",
      };
    }
    if (
      d.category !== message.category ||
      d.condition?.kind !== message.event_type
    )
      fail(
        422,
        "RULE_EVENT_MISMATCH",
        "El tipo de evento no coincide con la regla.",
      );
    const decisions = {
      rule_version_id: message.rule_version_id,
      rule_id: ctx.rule.id,
      rule_enabled_at_match: Boolean(active),
      mode,
      notify_requested: effective && d.actions.notify_enabled === true,
      clip_requested: effective && d.actions.save_clip_enabled === true,
      alarm_requested: effective && d.actions.alarm_enabled === true,
      emergency_requested: effective && d.actions.emergency_enabled === true,
      source: message.source,
      decided_at: now.toISOString(),
    };
    // Claims about a fall may never originate from missing video or a single frame.
    if (message.event_type === "POSSIBLE_FALL") {
      const e = message.evidence,
        span =
          new Date(e.visible_until || "").getTime() -
          new Date(e.visible_from || "").getTime();
      if (
        e.observability !== "VISIBLE" ||
        !Number.isFinite(span) ||
        span < Number(e.immobility_seconds || 0) * 1000 ||
        Number(e.immobility_seconds || 0) <
          Number(d.condition.immobility_seconds || 10) ||
        Math.abs(date.getTime() - new Date(e.visible_until!).getTime()) > 2000
      )
        decisions.emergency_requested = false;
    }
    if (message.event_type === "VISUAL_SEQUENCE") {
      decisions.alarm_requested = false;
      decisions.emergency_requested = false;
    }
    await tx.query(
      "INSERT INTO hg_events(id,household_id,camera_id,rule_version_id,source,category,event_type,severity,summary,confidence,occurred_at,decisions,evidence,producer,late) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
      [
        message.event_id,
        topicHousehold,
        message.camera_id,
        message.rule_version_id,
        message.source,
        message.category,
        message.event_type,
        d.severity || message.severity,
        message.summary,
        message.confidence,
        message.occurred_at,
        JSON.stringify(decisions),
        JSON.stringify(message.evidence),
        JSON.stringify(message.producer),
        late,
      ],
    );
    for (const [flag, kind] of [
      ["notify_requested", "PUSH"],
      ["clip_requested", "CLIP"],
      ["alarm_requested", "ALARM"],
      ["emergency_requested", "EMERGENCY"],
    ] as const)
      if (decisions[flag])
        await enqueueJob(tx, {
          household_id: topicHousehold,
          event_id: message.event_id,
          kind,
          payload: { ...message, pre_seconds: 5, post_seconds: 10 },
          idempotency_key: `${message.event_id}:${kind}`,
        });
    if (effective)
      await tx.query(
        "INSERT INTO hg_cooldowns(household_id,camera_id,rule_id,event_type,cooldown_until,last_event_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(household_id,camera_id,rule_id,event_type) DO UPDATE SET cooldown_until=excluded.cooldown_until,last_event_id=excluded.last_event_id,grouped_count=0",
        [
          topicHousehold,
          message.camera_id,
          ctx.rule.id,
          message.event_type,
          new Date(now.getTime() + cooldown * 1000),
          message.event_id,
        ],
      );
    await tx.query(
      "INSERT INTO hg_event_receipts(message_id,event_id,household_id,status) VALUES($1,$2,$3,'ACCEPTED')",
      [message.message_id, message.event_id, topicHousehold],
    );
    await tx.query(
      "UPDATE hg_pending_correlations SET state='MATCHED' WHERE event_id=$1",
      [message.event_id],
    );
    await emit(tx, topicHousehold, "event.created", message.event_id);
    return { status: "ACCEPTED", event_id: message.event_id };
  });
}
