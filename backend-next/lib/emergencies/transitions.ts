import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { emit } from "../audit/auditService";
import { enqueueJob } from "../jobs/outboxService";
import { buildIncidentSpeech } from "./voiceService";
export async function startSimulatedCall(tx: PoolClient, incident: any) {
  const id = randomUUID();
  const transcript = buildIncidentSpeech(incident);
  const call = (
    await tx.query(
      "INSERT INTO hg_simulated_calls(id,household_id,incident_id,state,transcript) VALUES($1,$2,$3,'RINGING',$4) ON CONFLICT(incident_id) DO UPDATE SET incident_id=excluded.incident_id RETURNING *",
      [id, incident.household_id, incident.id, transcript],
    )
  ).rows[0];
  await tx.query(
    "UPDATE hg_emergency_incidents SET state='CALLING_SIMULATED',state_revision=state_revision+1,updated_at=now() WHERE id=$1",
    [incident.id],
  );
  await enqueueJob(tx, {
    household_id: incident.household_id,
    event_id: incident.event_id,
    kind: "VOICE",
    payload: { call_id: call.id },
    idempotency_key: `${call.id}:VOICE`,
  });
  await emit(tx, incident.household_id, "emergency.updated", incident.id);
  return call;
}
