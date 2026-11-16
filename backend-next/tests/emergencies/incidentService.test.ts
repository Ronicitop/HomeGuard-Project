import { beforeAll, afterAll, test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { pool, resetDatabase, HOME } from "../helpers";
import {
  openIncident,
  respondIncident,
  advanceDueIncidents,
  recoverAfterRestart,
  getIncident,
} from "../../lib/emergencies/incidentService";
import {
  acceptSimulatedCall,
  closeIncident,
} from "../../lib/emergencies/simulatedCallService";
import { buildIncidentSpeech } from "../../lib/emergencies/voiceService";
const ctx = {
  user_id: 1,
  household_id: HOME,
  role: "ADMINISTRADOR" as const,
  session_id: "test",
};
const policy = {
  enabled: true,
  immobility_seconds: 10,
  response_seconds: 20,
  revision: 1,
  transport: "SIMULATED",
};
const profile = {
  contact_name: "Persona de prueba",
  address: "DOMICILIO FICTICIO - Aula 1",
  access_notes: "Puerta de práctica",
  contacts: [{ name: "Contacto simulado", phone: "DEMO-001" }],
  fictitious_data_confirmed: true,
};
beforeAll(async () => {
  await resetDatabase();
  await pool.query(
    "INSERT INTO hg_emergency_policies(household_id,enabled) VALUES($1,true)",
    [HOME],
  );
});
afterAll(() => pool.end());
async function event(observability = "VISIBLE") {
  const id = randomUUID(),
    now = new Date();
  const evidence = {
    observability,
    immobility_seconds: 10,
    visible_from: new Date(now.getTime() - 10000).toISOString(),
    visible_until: now.toISOString(),
  };
  return (
    await pool.query(
      "INSERT INTO hg_events(id,household_id,source,category,event_type,severity,summary,occurred_at,evidence,decisions) VALUES($1,$2,'SIMULATED','EMERGENCY','POSSIBLE_FALL','CRITICAL','Posible caída',$3,$4,$5) RETURNING *",
      [
        id,
        HOME,
        now,
        JSON.stringify(evidence),
        JSON.stringify({ emergency_requested: true }),
      ],
    )
  ).rows[0];
}
test("lost observations cannot create an emergency incident", async () => {
  expect(await openIncident(await event("LOST"), policy, profile)).toBeNull();
});
test("requesting help cannot bypass a disabled global emergency policy", async () => {
  const incident = await openIncident(await event(), policy, profile);
  await pool.query(
    "UPDATE hg_emergency_policies SET enabled=false WHERE household_id=$1",
    [HOME],
  );
  try {
    await expect(
      respondIncident(
        ctx,
        incident.id,
        { response: "REQUEST_HELP", expected_revision: 1 },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "POLICY_DISABLED" });
  } finally {
    await pool.query(
      "UPDATE hg_emergency_policies SET enabled=true WHERE household_id=$1",
      [HOME],
    );
  }
});
test("disabled current policy overrides a previously enabled snapshot", async () => {
  await pool.query(
    "UPDATE hg_emergency_policies SET enabled=false WHERE household_id=$1",
    [HOME],
  );
  expect(await openIncident(await event(), policy, profile)).toBeNull();
  await pool.query(
    "UPDATE hg_emergency_policies SET enabled=true WHERE household_id=$1",
    [HOME],
  );
});
test("stale incidents require an administrator to explicitly request help after restart", async () => {
  const incident = await openIncident(await event(), policy, profile);
  await recoverAfterRestart(new Date(Date.now() + 600000));
  await expect(
    respondIncident(
      { ...ctx, role: "RESIDENTE" },
      incident.id,
      { response: "REQUEST_HELP", expected_revision: 2 },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 403 });
});
test("I_AM_OK cancels once and repeated idempotency keys do not re-open it", async () => {
  const incident = await openIncident(await event(), policy, profile);
  const key = randomUUID();
  const first = await respondIncident(
    ctx,
    incident.id,
    { response: "I_AM_OK", expected_revision: 1 },
    key,
  );
  expect(first.state).toBe("CANCELLED");
  expect(
    (
      await respondIncident(
        ctx,
        incident.id,
        { response: "I_AM_OK", expected_revision: 1 },
        key,
      )
    ).state,
  ).toBe("CANCELLED");
  expect(
    (
      await pool.query(
        "SELECT 1 FROM hg_simulated_calls WHERE incident_id=$1",
        [incident.id],
      )
    ).rowCount,
  ).toBe(0);
});
test("deadline creates exactly one simulated call and one operator can accept", async () => {
  const incident = await openIncident(await event(), policy, profile);
  await Promise.all([
    advanceDueIncidents(new Date(Date.now() + 21000)),
    advanceDueIncidents(new Date(Date.now() + 21000)),
  ]);
  const current = await getIncident(ctx, incident.id);
  expect(current.state).toBe("CALLING_SIMULATED");
  expect(current.call).toBeTruthy();
  const attempts = await Promise.allSettled([
    acceptSimulatedCall(ctx, incident.id, current.state_revision),
    acceptSimulatedCall(ctx, incident.id, current.state_revision),
  ]);
  expect(attempts.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  expect(
    (
      await pool.query(
        "SELECT 1 FROM hg_simulated_calls WHERE incident_id=$1",
        [incident.id],
      )
    ).rowCount,
  ).toBe(1);
  const active = await getIncident(ctx, incident.id);
  await closeIncident(ctx, incident.id, active.state_revision);
  expect((await getIncident(ctx, incident.id)).state).toBe("CLOSED");
});
test("restart with an expired deadline requires review instead of making a historical call", async () => {
  const incident = await openIncident(await event(), policy, profile);
  await recoverAfterRestart(new Date(Date.now() + 600000));
  expect((await getIncident(ctx, incident.id)).state).toBe("NEEDS_REVIEW");
  expect(
    (
      await pool.query(
        "SELECT 1 FROM hg_simulated_calls WHERE incident_id=$1",
        [incident.id],
      )
    ).rowCount,
  ).toBe(0);
});
test("speech identifies simulation and reports observations without claiming medical diagnosis", () => {
  const speech = buildIncidentSpeech({
    profile_snapshot: profile,
    created_at: new Date().toISOString(),
    state: "CALLING_SIMULATED",
  });
  expect(speech).toContain("demostración");
  expect(speech).toContain("posible caída");
  expect(speech).not.toMatch(
    /inconsciente|ambulancia enviada|diagnóstico confirmado/i,
  );
});
