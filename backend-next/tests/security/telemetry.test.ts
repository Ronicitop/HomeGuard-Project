import { beforeAll, afterAll, test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { pool, resetDatabase, HOME, OTHER } from "../helpers";
import { recordTelemetry } from "../../lib/integrations/legacyTelemetry";
beforeAll(async () => {
  await resetDatabase();
  await pool.query(
    "INSERT INTO DispositivoESP32(device_id,nombre,zona) VALUES('demo-device','Demo','Aula')",
  );
});
afterAll(() => pool.end());
const send = (sensor: string, state: string, valor?: number) =>
  recordTelemetry(HOME, {
    message_id: randomUUID(),
    device_id: "demo-device",
    sensor,
    state,
    valor,
    source: "SIMULATED",
  });
test("scoped telemetry persists once and rejects a device in another household", async () => {
  const packet = {
    message_id: randomUUID(),
    device_id: "demo-device",
    sensor: "puerta",
    state: "CLOSED",
    source: "SIMULATED",
  };
  await recordTelemetry(HOME, packet);
  await recordTelemetry(HOME, packet);
  expect((await pool.query("SELECT 1 FROM TelemetriaSensor")).rowCount).toBe(1);
  await expect(
    recordTelemetry(OTHER, { ...packet, message_id: randomUUID() }),
  ).rejects.toMatchObject({ status: 404 });
});
test("AWAY correlates door and motion, while DISARMED suppresses intrusion", async () => {
  await send("puerta", "OPEN");
  await send("movimiento", "MOTION_DETECTED");
  expect(
    (
      await pool.query(
        "SELECT 1 FROM hg_events WHERE event_type='IOT_INTRUSION'",
      )
    ).rowCount,
  ).toBe(1);
  await pool.query("UPDATE hg_modes SET mode='DISARMED'");
  await send("puerta", "OPEN");
  await send("movimiento", "MOTION_DETECTED");
  expect(
    (
      await pool.query(
        "SELECT 1 FROM hg_events WHERE event_type='IOT_INTRUSION'",
      )
    ).rowCount,
  ).toBe(1);
});
test("smoke with high temperature and water leak retain legacy demo alerts", async () => {
  await send("humo", "SMOKE_DETECTED");
  await send("temperatura", "CRITICAL", 45);
  await send("agua", "WATER_LEAK");
  expect(
    (
      await pool.query(
        "SELECT event_type FROM hg_events WHERE event_type IN ('IOT_FIRE','IOT_WATER')",
      )
    ).rowCount,
  ).toBe(2);
  expect(
    (await pool.query("SELECT 1 FROM hg_legacy_event_map")).rowCount,
  ).toBeGreaterThanOrEqual(3);
});
