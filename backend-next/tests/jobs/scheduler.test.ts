import { beforeAll, afterAll, test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { pool, resetDatabase, HOME } from "../helpers";
import { runJob, recoverExhaustedJobs } from "../../lib/jobs/jobScheduler";
import { retryJob } from "../../lib/jobs/outboxService";
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
test("automatic intrusion commands queued before disarming are cancelled before publication", async () => {
  const event = randomUUID(),
    command = randomUUID();
  await pool.query(
    "INSERT INTO hg_events(id,household_id,source,category,event_type,severity,summary,occurred_at) VALUES($1,$2,'SIMULATED','SECURITY','IOT_INTRUSION','CRITICAL','Demo',now())",
    [event, HOME],
  );
  await pool.query(
    "INSERT INTO hg_actuator_commands(id,household_id,legacy_code,requested_state,source,event_id,idempotency_key) VALUES($1::uuid,$2,'ACT_SIRENA_01','ON','AUTO_EVENT',$3,$1::text)",
    [command, HOME, event],
  );
  await pool.query("UPDATE hg_modes SET mode='DISARMED'");
  let publications = 0;
  await runJob(
    {
      kind: "ACTUATOR",
      household_id: HOME,
      event_id: event,
      payload: { command_id: command },
    },
    {
      requestCommand: async () => {
        publications++;
      },
    } as any,
  );
  expect(publications).toBe(0);
  expect(
    (
      await pool.query("SELECT status FROM hg_actuator_commands WHERE id=$1", [
        command,
      ])
    ).rows[0].status,
  ).toBe("CANCELLED");
});
test("exhausting delivery retries also terminates the visible notification", async () => {
  await pool.query(
    "INSERT INTO Usuario(id,nombre,apellido,email,password_hash) VALUES(1,'Prueba','Usuario','queue@test.local','unusable')",
  );
  await pool.query(
    "INSERT INTO hg_memberships(household_id,user_id,role) VALUES($1,1,'RESIDENTE')",
    [HOME],
  );
  const n = randomUUID(),
    j = randomUUID(),
    e = (await pool.query("SELECT id FROM hg_events LIMIT 1")).rows[0].id;
  await pool.query(
    "INSERT INTO hg_notifications(id,household_id,event_id,user_id,installation_id,status) VALUES($1,$2,$3,1,$4,'QUEUED')",
    [n, HOME, e, randomUUID()],
  );
  await pool.query(
    "INSERT INTO hg_outbox(id,household_id,kind,payload,idempotency_key,status,attempts,lease_owner,lease_until) VALUES($1::uuid,$2,'PUSH_DELIVERY',$3,$1::text,'RUNNING',4,'unit-owner',now()+interval '60 seconds')",
    [j, HOME, JSON.stringify({ notification_id: n })],
  );
  await retryJob(j, "unit-owner", "PROVIDER_RETRY");
  expect(
    (await pool.query("SELECT status FROM hg_notifications WHERE id=$1", [n]))
      .rows[0].status,
  ).toBe("FAILED");
});
test("restart recovery reconciles an exhausted delivery lease without resending an uncertain send", async () => {
  const n = randomUUID(),
    e = (await pool.query("SELECT id FROM hg_events LIMIT 1")).rows[0].id;
  await pool.query(
    "INSERT INTO hg_notifications(id,household_id,event_id,user_id,installation_id,status) VALUES($1,$2,$3,1,$4,'SENDING')",
    [n, HOME, e, randomUUID()],
  );
  const job = randomUUID();
  await pool.query(
    "INSERT INTO hg_outbox(id,household_id,kind,payload,idempotency_key,status,attempts,lease_until) VALUES($1::uuid,$2,'PUSH_DELIVERY',$3,$1::text,'RUNNING',4,now()-interval '1 second')",
    [job, HOME, JSON.stringify({ notification_id: n })],
  );
  await recoverExhaustedJobs();
  expect(
    (await pool.query("SELECT status FROM hg_notifications WHERE id=$1", [n]))
      .rows[0].status,
  ).toBe("UNKNOWN");
});
test("a disabled vision rule cancels its queued automatic actuator command", async () => {
  const camera = randomUUID(),
    rule = randomUUID(),
    version = randomUUID(),
    event = randomUUID(),
    command = randomUUID();
  await pool.query(
    "CREATE TABLE hg_cameras(id uuid PRIMARY KEY,household_id uuid,enabled boolean,deleted_at timestamptz);CREATE TABLE hg_rules(id uuid PRIMARY KEY,household_id uuid,enabled boolean,active_version_id uuid);CREATE TABLE hg_rule_versions(id uuid PRIMARY KEY,rule_id uuid,household_id uuid,definition jsonb,status text)",
  );
  await pool.query("INSERT INTO hg_cameras VALUES($1,$2,true,NULL)", [
    camera,
    HOME,
  ]);
  await pool.query("INSERT INTO hg_rules VALUES($1,$2,false,$3)", [
    rule,
    HOME,
    version,
  ]);
  await pool.query(
    "INSERT INTO hg_rule_versions VALUES($1,$2,$3,$4,'VALIDATED')",
    [
      version,
      rule,
      HOME,
      JSON.stringify({
        camera_id: camera,
        actions: { alarm_enabled: true },
        modes: ["AWAY"],
        condition: { kind: "ZONE_ENTRY" },
      }),
    ],
  );
  await pool.query("UPDATE hg_modes SET mode='AWAY'");
  await pool.query(
    "INSERT INTO hg_events(id,household_id,camera_id,rule_version_id,source,category,event_type,severity,summary,occurred_at,decisions) VALUES($1,$2,$3,$4,'SIMULATED','SECURITY','ZONE_ENTRY','WARNING','Demo',now(),'{\"alarm_requested\":true}')",
    [event, HOME, camera, version],
  );
  await pool.query(
    "INSERT INTO hg_actuator_commands(id,household_id,legacy_code,requested_state,source,event_id,idempotency_key) VALUES($1::uuid,$2,'ACT_SIRENA_01','ON','AUTO_EVENT',$3,$1::text)",
    [command, HOME, event],
  );
  let count = 0;
  await runJob(
    {
      kind: "ACTUATOR",
      household_id: HOME,
      event_id: event,
      payload: { command_id: command },
    },
    {
      requestCommand: async () => {
        count++;
      },
    } as any,
  );
  expect(count).toBe(0);
  expect(
    (
      await pool.query("SELECT status FROM hg_actuator_commands WHERE id=$1", [
        command,
      ])
    ).rows[0].status,
  ).toBe("CANCELLED");
});
