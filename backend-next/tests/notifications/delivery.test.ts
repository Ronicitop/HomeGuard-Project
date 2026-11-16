import { beforeAll, afterAll, test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { pool, resetDatabase, HOME, OTHER } from "../helpers";
import {
  registerPushDevice,
  queueNotifications,
  deliverNotification,
} from "../../lib/notifications/deliveryService";
import { reconcileReceipts } from "../../lib/notifications/receiptsService";
const ctx = {
  user_id: 1,
  household_id: HOME,
  role: "ADMINISTRADOR" as const,
  session_id: "test",
};
const installation = randomUUID();

let event: any;
beforeAll(async () => {
  await resetDatabase();
  process.env.HG_SECRET_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.HG_PUSH_ENABLED = "true";
  await pool.query(
    "INSERT INTO Usuario(id,nombre,apellido,email,password_hash) VALUES(1,'Test','Test','test@test.local','test-unusable')",
  );
  await pool.query(
    "INSERT INTO hg_memberships(household_id,user_id,role) VALUES($1,1,'ADMINISTRADOR')",
    [HOME],
  );
  event = (
    await pool.query(
      "INSERT INTO hg_events(id,household_id,source,category,event_type,severity,summary,occurred_at,decisions) VALUES($1,$2,'SIMULATED','SECURITY','TEST','WARNING','Private detail',now(),'{\"notify_requested\":true}') RETURNING *",
      [randomUUID(), HOME],
    )
  ).rows[0];
});
afterAll(() => pool.end());
test("a provider receipt can revoke a dead token but never claims that the user read the alert", async () => {
  await registerPushDevice(ctx, {
    installation_id: installation,
    token: "ExponentPushToken[test-token]",
    platform: "android",
  });
  const id = randomUUID();
  await pool.query(
    "INSERT INTO hg_notifications(id,household_id,event_id,user_id,installation_id,status,channel,provider_ticket,created_at) VALUES($1,$2,$3,1,$4,'SENT','EMERGENCY_CHALLENGE','test-receipt',now()-interval '16 minutes')",
    [id, HOME, event.id, installation],
  );
  await reconcileReceipts(async () =>
    Response.json({
      data: {
        "test-receipt": {
          status: "error",
          details: { error: "DeviceNotRegistered" },
        },
      },
    }),
  );
  expect(
    (await pool.query("SELECT status FROM hg_notifications WHERE id=$1", [id]))
      .rows[0].status,
  ).toBe("FAILED");
  expect(
    (
      await pool.query(
        "SELECT enabled FROM hg_push_devices WHERE installation_id=$1",
        [installation],
      )
    ).rows[0].enabled,
  ).toBe(false);
  await pool.query("DELETE FROM hg_notifications WHERE id=$1", [id]);
});
test("push device tokens are encrypted at rest and scoped to an installation", async () => {
  await registerPushDevice(ctx, {
    installation_id: installation,
    token: "ExponentPushToken[test-token]",
    platform: "android",
  });
  const row = (
    await pool.query(
      "SELECT token_encrypted FROM hg_push_devices WHERE installation_id=$1",
      [installation],
    )
  ).rows[0];
  expect(row.token_encrypted).not.toContain("test-token");
});
test("duplicate notification planning creates one delivery per installation", async () => {
  await Promise.all([queueNotifications(event), queueNotifications(event)]);
  expect(
    (
      await pool.query("SELECT 1 FROM hg_notifications WHERE event_id=$1", [
        event.id,
      ])
    ).rowCount,
  ).toBe(1);
});
test("provider invalid-token response disables that device without claiming success", async () => {
  const notification = (
    await pool.query("SELECT id FROM hg_notifications WHERE event_id=$1", [
      event.id,
    ])
  ).rows[0];
  const result = await deliverNotification(notification.id, async () =>
    Response.json({
      data: { status: "error", details: { error: "DeviceNotRegistered" } },
    }),
  );
  expect(result.status).toBe("FAILED");
  expect(
    (
      await pool.query(
        "SELECT enabled FROM hg_push_devices WHERE installation_id=$1",
        [installation],
      )
    ).rows[0].enabled,
  ).toBe(false);
});
test("preferences changed after enqueue are checked again before provider delivery", async () => {
  await registerPushDevice(ctx, {
    installation_id: installation,
    token: "ExponentPushToken[test-token]",
    platform: "android",
  });
  const id = randomUUID();
  await pool.query(
    "INSERT INTO hg_notifications(id,household_id,event_id,user_id,installation_id,status,channel) VALUES($1,$2,$3,1,$4,'QUEUED','EMERGENCY_CHALLENGE')",
    [id, HOME, event.id, installation],
  );
  let requests = 0;
  const result = await deliverNotification(id, async () => {
    requests++;
    return Response.json({ data: { status: "ok", id: "ticket" } });
  });
  expect(requests).toBe(0);
  expect(result.status).toBe("SKIPPED");
});
test("disabling notify on the current rule suppresses a previously queued delivery", async () => {
  const camera = randomUUID(),
    rule = randomUUID(),
    version = randomUUID();
  await pool.query(
    "CREATE TABLE hg_cameras(id uuid PRIMARY KEY,household_id uuid,enabled boolean,deleted_at timestamptz);CREATE TABLE hg_rules(id uuid PRIMARY KEY,household_id uuid,enabled boolean,active_version_id uuid);CREATE TABLE hg_rule_versions(id uuid PRIMARY KEY,rule_id uuid,household_id uuid,definition jsonb,status text)",
  );
  await pool.query("INSERT INTO hg_cameras VALUES($1,$2,true,NULL)", [
    camera,
    HOME,
  ]);
  await pool.query("INSERT INTO hg_rules VALUES($1,$2,true,$3)", [
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
        actions: { notify_enabled: false },
        modes: ["AWAY"],
        condition: { kind: "ZONE_ENTRY" },
      }),
    ],
  );
  await pool.query(
    "UPDATE hg_events SET camera_id=$2,rule_version_id=$3 WHERE id=$1",
    [event.id, camera, version],
  );
  await pool.query(
    "UPDATE hg_notifications SET status='QUEUED' WHERE event_id=$1 AND channel='EVENT'",
    [event.id],
  );
  const n = (
    await pool.query(
      "SELECT id FROM hg_notifications WHERE event_id=$1 AND channel='EVENT'",
      [event.id],
    )
  ).rows[0];
  let calls = 0;
  const result = await deliverNotification(n.id, async () => {
    calls++;
    return Response.json({ data: { status: "ok", id: "ticket" } });
  });
  expect(calls).toBe(0);
  expect(result.status).toBe("SKIPPED");
});

test("knowing an installation ID cannot revoke another household device with an unrelated token", async () => {
  await pool.query("INSERT INTO hg_households(id,name) VALUES($1,'Other')", [
    OTHER,
  ]);
  await pool.query(
    "INSERT INTO hg_memberships(household_id,user_id,role) VALUES($1,1,'ADMINISTRADOR')",
    [OTHER],
  );
  const id = randomUUID();
  await registerPushDevice(
    { ...ctx, household_id: OTHER },
    {
      installation_id: id,
      token: "ExponentPushToken[private-other-device]",
      platform: "android",
    },
  );
  await registerPushDevice(ctx, {
    installation_id: id,
    token: "ExponentPushToken[different-device]",
    platform: "android",
  });
  expect(
    (
      await pool.query(
        "SELECT enabled FROM hg_push_devices WHERE household_id=$1 AND installation_id=$2",
        [OTHER, id],
      )
    ).rows[0].enabled,
  ).toBe(true);
});
