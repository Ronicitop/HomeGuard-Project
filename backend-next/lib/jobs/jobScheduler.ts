import pool from "../db";
import { fail } from "../http/errors";
import { loadRuleContext } from "../integrations/vision";
import {
  queueNotifications,
  deliverNotification,
} from "../notifications/deliveryService";
import { openIncident } from "../emergencies/incidentService";
import { renderCallSpeech } from "../emergencies/voiceService";
import { requestAutomaticCommand } from "../actuators/commandService";

export interface JobTransport {
  publish(topic: string, payload: unknown): Promise<void>;
  requestClip(job: any): Promise<void>;
  requestCommand(job: any): Promise<void>;
}
export async function recoverExhaustedJobs() {
  await pool.query(
    "UPDATE hg_outbox SET status='FAILED',error_code='LEASE_EXHAUSTED',lease_owner=NULL,lease_until=NULL,updated_at=now() WHERE status='RUNNING' AND attempts>=4 AND lease_until<now()",
  );
  await pool.query(
    "UPDATE hg_actuator_commands c SET status='FAILED' WHERE status='REQUESTED' AND EXISTS(SELECT 1 FROM hg_outbox j WHERE j.kind='ACTUATOR' AND j.household_id=c.household_id AND j.payload->>'command_id'=c.id::text AND j.status IN ('FAILED','UNKNOWN','CANCELLED'))",
  );
  await pool.query(
    "UPDATE hg_notifications n SET status=CASE WHEN n.status='SENDING' THEN 'UNKNOWN' ELSE 'FAILED' END,error_code='JOB_RETRIES_EXHAUSTED' FROM hg_outbox j WHERE j.kind='PUSH_DELIVERY' AND j.status='FAILED' AND n.household_id=j.household_id AND n.id::text=j.payload->>'notification_id' AND n.status IN ('QUEUED','SENDING')",
  );
}
async function effectStillAllowed(event: any, flag: string) {
  if (
    !event.decisions?.[flag] ||
    event.late ||
    Date.now() - new Date(event.occurred_at).getTime() >
      (flag === "notify_requested" ? 300000 : 30000)
  )
    return false;
  if (!event.rule_version_id) return event.source === "SIMULATED";
  const tx = await pool.connect();
  try {
    const c = await loadRuleContext(
      tx,
      event.household_id,
      event.camera_id,
      event.rule_version_id,
    );
    const action = (
      {
        alarm_requested: "alarm_enabled",
        emergency_requested: "emergency_enabled",
        notify_requested: "notify_enabled",
      } as Record<string, string>
    )[flag];
    const mode = (
      await tx.query("SELECT mode FROM hg_modes WHERE household_id=$1", [
        event.household_id,
      ])
    ).rows[0]?.mode;
    const critical = flag !== "notify_requested";
    return (
      c.rule.enabled &&
      c.camera.enabled &&
      c.rule.active_version_id === event.rule_version_id &&
      c.version.status === "VALIDATED" &&
      (!critical || c.version.definition.modes.includes(mode)) &&
      (flag !== "alarm_requested" || mode !== "DISARMED") &&
      c.version.definition.actions?.[action] === true
    );
  } finally {
    tx.release();
  }
}
export async function runJob(job: any, transport: JobTransport) {
  const event = job.event_id
    ? (
        await pool.query(
          "SELECT * FROM hg_events WHERE id=$1 AND household_id=$2",
          [job.event_id, job.household_id],
        )
      ).rows[0]
    : null;
  switch (job.kind) {
    case "PUSH":
      if (event && (await effectStillAllowed(event, "notify_requested")))
        await queueNotifications(event);
      return;
    case "PUSH_DELIVERY": {
      const result = await deliverNotification(job.payload.notification_id);
      if (result.retry)
        fail(
          503,
          result.error_code || "PROVIDER_RETRY",
          "Proveedor temporalmente no disponible.",
        );
      return;
    }
    case "EMERGENCY": {
      if (!event || !(await effectStillAllowed(event, "emergency_requested")))
        return;
      const policy = (
        await pool.query(
          "SELECT * FROM hg_emergency_policies WHERE household_id=$1",
          [job.household_id],
        )
      ).rows[0];
      const profile = (
        await pool.query(
          "SELECT data FROM hg_emergency_profiles WHERE household_id=$1",
          [job.household_id],
        )
      ).rows[0]?.data;
      const incident = await openIncident(event, policy, profile);
      if (incident) await queueNotifications(event, true);
      return;
    }
    case "ALARM": {
      if (!event || !(await effectStillAllowed(event, "alarm_requested")))
        return;
      const mode = (
        await pool.query("SELECT mode FROM hg_modes WHERE household_id=$1", [
          job.household_id,
        ])
      ).rows[0]?.mode;
      if (mode !== "DISARMED")
        await requestAutomaticCommand(event, "ACT_SIRENA_01", "ON");
      return;
    }
    case "ACTUATOR": {
      const cmd = (
        await pool.query(
          "SELECT * FROM hg_actuator_commands WHERE id=$1 AND household_id=$2",
          [job.payload.command_id, job.household_id],
        )
      ).rows[0];
      if (!cmd) fail(404, "COMMAND_NOT_FOUND", "Comando no encontrado.");
      if (cmd.status !== "REQUESTED") return;
      if (cmd.source === "AUTO_EVENT") {
        const mode = (
          await pool.query("SELECT mode FROM hg_modes WHERE household_id=$1", [
            job.household_id,
          ])
        ).rows[0]?.mode;
        let allowed = Boolean(
          event &&
          !event.late &&
          Date.now() - new Date(event.occurred_at).getTime() <= 30000,
        );
        if (allowed && event.rule_version_id)
          allowed = await effectStillAllowed(event, "alarm_requested");
        else if (allowed && event.event_type === "IOT_INTRUSION")
          allowed = mode === "AWAY";
        else if (allowed)
          allowed = ["IOT_FIRE", "IOT_WATER"].includes(event.event_type);
        const manualOverride = (
          await pool.query(
            "SELECT 1 FROM hg_actuator_commands WHERE household_id=$1 AND legacy_code=$2 AND source LIKE 'MANUAL%' AND created_at>$3 AND status IN ('REQUESTED','CONFIRMED') LIMIT 1",
            [job.household_id, cmd.legacy_code, cmd.created_at],
          )
        ).rowCount;
        if (!allowed || manualOverride) {
          await pool.query(
            "UPDATE hg_actuator_commands SET status='CANCELLED' WHERE id=$1 AND status='REQUESTED'",
            [cmd.id],
          );
          await pool.query(
            "INSERT INTO hg_audit(household_id,action,entity_id,after_data) VALUES($1,'actuator.dispatch_cancelled',$2,$3)",
            [
              job.household_id,
              cmd.id,
              JSON.stringify({
                reason: manualOverride
                  ? "MANUAL_OVERRIDE"
                  : "RULE_MODE_OR_EVENT_CHANGED",
              }),
            ],
          );
          return;
        }
      }
      await transport.requestCommand(job);
      return;
    }
    case "CLIP":
      if (!event?.camera_id)
        fail(
          503,
          "VISION_UNAVAILABLE",
          "Se necesita una cámara y el servicio de clips de A.",
        );
      await transport.requestClip(job);
      return;
    case "CONFIG":
      await transport.publish(
        `homeguard/v1/${job.household_id}/config/changed`,
        {
          schema_version: "1.0",
          message_type: "config.changed.v1",
          ...job.payload,
        },
      );
      return;
    case "VOICE":
      await renderCallSpeech(job.payload.call_id, job.household_id);
      return;
    default:
      fail(422, "UNKNOWN_JOB", "Tipo de trabajo no reconocido.");
  }
}
