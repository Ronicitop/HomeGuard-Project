import { beforeAll, afterAll, test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pool, resetDatabase, HOME, OTHER } from "../helpers";
import { ingestDetection } from "../../lib/events/eventIngestor";
import { claimJobs, finishJob } from "../../lib/jobs/outboxService";
import { validateContract } from "../../lib/contracts";
let sample: any;
beforeAll(async () => {
  await resetDatabase();
  sample = JSON.parse(
    await readFile("../contracts/fixtures/detection-simulated.json", "utf8"),
  );
  // Minimal A-shaped fixtures exist only in tests. Production B does not create A tables.
  await pool.query(
    "CREATE TABLE hg_cameras(id uuid PRIMARY KEY,household_id uuid NOT NULL,enabled boolean NOT NULL,status text,revision int,deleted_at timestamptz); CREATE TABLE hg_rules(id uuid PRIMARY KEY,household_id uuid NOT NULL,enabled boolean NOT NULL,active_version_id uuid,revision int); CREATE TABLE hg_rule_versions(id uuid PRIMARY KEY,rule_id uuid NOT NULL,household_id uuid NOT NULL,definition jsonb NOT NULL,status text NOT NULL,dependencies_snapshot jsonb)",
  );
  await pool.query(
    "INSERT INTO hg_cameras VALUES($1,$2,true,'ONLINE',3,NULL)",
    [sample.camera_id, HOME],
  );
  await pool.query("INSERT INTO hg_rules VALUES($1,$2,true,$3,1)", [
    "22222222-2222-4222-8222-222222222222",
    HOME,
    sample.rule_version_id,
  ]);
  await setActions(true, true);
});
afterAll(() => pool.end());
async function setActions(notify: boolean, clip: boolean) {
  const definition = {
    name: "Zona demo",
    camera_id: sample.camera_id,
    category: "SECURITY",
    severity: "WARNING",
    condition: { kind: "ZONE_ENTRY" },
    modes: ["AWAY"],
    cooldown_seconds: 0,
    schedule: {
      timezone: "America/La_Paz",
      days: [1, 2, 3, 4, 5, 6, 7],
      start: "00:00",
      end: "24:00",
    },
    actions: {
      notify_enabled: notify,
      save_clip_enabled: clip,
      alarm_enabled: false,
      emergency_enabled: false,
    },
  };
  await pool.query(
    "INSERT INTO hg_rule_versions VALUES($1,$2,$3,$4,'VALIDATED','{}') ON CONFLICT(id) DO UPDATE SET definition=excluded.definition",
    [
      sample.rule_version_id,
      "22222222-2222-4222-8222-222222222222",
      HOME,
      JSON.stringify(definition),
    ],
  );
}
const proposal = () => ({
  ...sample,
  message_id: randomUUID(),
  event_id: randomUUID(),
  occurred_at: new Date().toISOString(),
});
test("strict contract rejects unknown instructions and invalid evidence", () => {
  expect(validateContract("detection-proposed", proposal()).valid).toBe(true);
  expect(
    validateContract("detection-proposed", {
      ...proposal(),
      execute: "call emergency",
    }).valid,
  ).toBe(false);
  expect(
    validateContract("detection-proposed", { ...proposal(), confidence: 2 })
      .valid,
  ).toBe(false);
});
test("100 duplicate deliveries create one event and one job per requested effect", async () => {
  const p = proposal();
  await Promise.all(
    Array.from({ length: 100 }, () => ingestDetection(p, HOME)),
  );
  expect(
    (await pool.query("SELECT 1 FROM hg_events WHERE id=$1", [p.event_id]))
      .rowCount,
  ).toBe(1);
  const jobs = (
    await pool.query(
      "SELECT kind FROM hg_outbox WHERE event_id=$1 ORDER BY kind",
      [p.event_id],
    )
  ).rows;
  expect(jobs.map((x) => x.kind)).toEqual(["CLIP", "PUSH"]);
});
test("clip and notification flags are independent", async () => {
  await setActions(false, true);
  let p = proposal();
  await ingestDetection(p, HOME);
  expect(
    (
      await pool.query("SELECT kind FROM hg_outbox WHERE event_id=$1", [
        p.event_id,
      ])
    ).rows.map((x) => x.kind),
  ).toEqual(["CLIP"]);
  await setActions(true, false);
  p = proposal();
  await ingestDetection(p, HOME);
  expect(
    (
      await pool.query("SELECT kind FROM hg_outbox WHERE event_id=$1", [
        p.event_id,
      ])
    ).rows.map((x) => x.kind),
  ).toEqual(["PUSH"]);
});
test("wrong topic household never persists or executes a proposal", async () => {
  const p = proposal();
  await expect(ingestDetection(p, OTHER)).rejects.toThrow();
  expect(
    (await pool.query("SELECT 1 FROM hg_events WHERE id=$1", [p.event_id]))
      .rowCount,
  ).toBe(0);
});
test("stale observations remain in history without side effects", async () => {
  const p = {
    ...proposal(),
    occurred_at: new Date(Date.now() - 60000).toISOString(),
  };
  await ingestDetection(p, HOME);
  expect(
    (await pool.query("SELECT late FROM hg_events WHERE id=$1", [p.event_id]))
      .rows[0].late,
  ).toBe(true);
  expect(
    (
      await pool.query("SELECT 1 FROM hg_outbox WHERE event_id=$1", [
        p.event_id,
      ])
    ).rowCount,
  ).toBe(0);
});
test("concurrent workers cannot claim the same job and a finished job is not retried", async () => {
  const [a, b] = await Promise.all([
    claimJobs("worker-a", new Date(), 100),
    claimJobs("worker-b", new Date(), 100),
  ]);
  expect(new Set([...a, ...b].map((j) => j.id)).size).toBe(a.length + b.length);
  expect(a.length + b.length).toBeGreaterThan(0);
  const job = [...a, ...b][0];
  await finishJob(job.id, job.lease_owner, "COMPLETED");
  expect(
    (await pool.query("SELECT status FROM hg_outbox WHERE id=$1", [job.id]))
      .rows[0].status,
  ).toBe("COMPLETED");
  await expect(
    finishJob(job.id, "not-the-lease-owner", "FAILED"),
  ).rejects.toThrow();
});
