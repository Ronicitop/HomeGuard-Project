import { beforeAll, afterAll, test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { pool, resetDatabase, HOME } from "../helpers";
import { runJob, recoverExhaustedJobs } from "../../lib/jobs/jobScheduler";
import {
  openIncident,
  getIncident,
} from "../../lib/emergencies/incidentService";
beforeAll(resetDatabase);
afterAll(() => pool.end());
test("last-attempt crashed leases become terminal instead of staying RUNNING forever", async () => {
  const id = randomUUID();
  await pool.query(
    "INSERT INTO hg_outbox(id,household_id,kind,payload,idempotency_key,status,attempts,lease_until) VALUES($1::uuid,$2,'CONFIG','{}',$1::text,'RUNNING',4,now()-interval '1 second')",
    [id, HOME],
  );
  await recoverExhaustedJobs();
  expect(
    (await pool.query("SELECT status FROM hg_outbox WHERE id=$1", [id])).rows[0]
      .status,
  ).toBe("FAILED");
});
test("clip jobs without a camera fail honestly and never manufacture evidence", async () => {
  await expect(
    runJob(
      { kind: "CLIP", household_id: HOME, payload: {}, event_id: randomUUID() },
      {} as any,
    ),
  ).rejects.toMatchObject({ code: "VISION_UNAVAILABLE" });
});
test("emergency jobs recheck the current policy and age before opening an incident", async () => {
  const id = randomUUID(),
    now = new Date();
  await pool.query(
    "INSERT INTO hg_events(id,household_id,source,category,event_type,severity,summary,occurred_at,decisions,evidence) VALUES($1,$2,'SIMULATED','EMERGENCY','POSSIBLE_FALL','CRITICAL','Simulación',$3,$4,$5)",
    [
      id,
      HOME,
      now,
      JSON.stringify({ emergency_requested: true }),
      JSON.stringify({
        observability: "VISIBLE",
        immobility_seconds: 10,
        visible_from: new Date(+now - 10000),
        visible_until: now,
      }),
    ],
  );
  await pool.query(
    "INSERT INTO hg_emergency_profiles(household_id,data) VALUES($1,$2)",
    [
      HOME,
      JSON.stringify({
        contact_name: "Prueba",
        address: "Aula ficticia",
        fictitious_data_confirmed: true,
      }),
    ],
  );
  await pool.query(
    "INSERT INTO hg_emergency_policies(household_id,enabled) VALUES($1,false)",
    [HOME],
  );
  await runJob(
    { kind: "EMERGENCY", household_id: HOME, event_id: id },
    {} as any,
  );
  expect(
    (await pool.query("SELECT 1 FROM hg_emergency_incidents")).rowCount,
  ).toBe(0);
  await pool.query("UPDATE hg_emergency_policies SET enabled=true");
  await runJob(
    { kind: "EMERGENCY", household_id: HOME, event_id: id },
    {} as any,
  );
  expect(
    (await pool.query("SELECT 1 FROM hg_emergency_incidents")).rowCount,
  ).toBe(1);
});
test("resident incident detail omits the private address transcript", async () => {
  const row = (await pool.query("SELECT * FROM hg_emergency_incidents LIMIT 1"))
    .rows[0];
  await pool.query(
    "INSERT INTO hg_simulated_calls(id,household_id,incident_id,state,transcript) VALUES($1,$2,$3,'RINGING','Dirección privada de prueba')",
    [randomUUID(), HOME, row.id],
  );
  const result = await getIncident(
    { user_id: 1, household_id: HOME, role: "RESIDENTE", session_id: "test" },
    row.id,
  );
  expect(result.profile_snapshot).toBeUndefined();
  expect(result.call.transcript).toBeUndefined();
});
