import { beforeAll, afterAll, test, expect } from "vitest";
import { randomUUID, randomBytes, scryptSync } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { writeFile, mkdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:net";
import mqtt, { type MqttClient } from "mqtt";
import { pool, resetDatabase, HOME } from "../helpers";
import {
  createConnection,
  getConnection,
  rotateCredential,
  updateConnection,
} from "../../lib/connections/registry";
import { requestDeviceCommand } from "../../lib/connections/commands";
const ctx = {
  user_id: 1,
  household_id: HOME,
  role: "ADMINISTRADOR" as const,
  session_id: "test",
};
const children: ChildProcess[] = [],
  clients: MqttClient[] = [];
let brokerFile: string,
  port: number,
  secret: string,
  worker: ChildProcess,
  workerEnv: NodeJS.ProcessEnv;
async function until(check: () => Promise<boolean>, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error("Timed out waiting for MQTT integration");
}
async function connect(username: string, password: string) {
  const client = mqtt.connect(`mqtt://127.0.0.1:${port}`, {
    username,
    password,
    clientId: username,
    clean: true,
    reconnectPeriod: 0,
    connectTimeout: 2000,
  });
  clients.push(client);
  client.on("error", () => {});
  await new Promise<void>((yes, no) => {
    client.once("connect", () => yes());
    client.once("error", () => no(new Error("MQTT auth failed")));
  });
  return client;
}
function send(client: MqttClient, topic: string, payload: unknown) {
  return new Promise<void>((yes, no) =>
    client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) =>
      err ? no(err) : yes(),
    ),
  );
}
beforeAll(async () => {
  await resetDatabase();
  await pool.query(
    "INSERT INTO Usuario(id,nombre,apellido,email,password_hash) VALUES(1,'Wire','Test','wire@test.local','unusable')",
  );
  await pool.query(
    "INSERT INTO hg_memberships(household_id,user_id,role) VALUES($1,1,'ADMINISTRADOR')",
    [HOME],
  );
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as any).port;
  await new Promise<void>((r) => server.close(() => r()));
  secret = randomBytes(24).toString("hex");
  const salt = randomBytes(16).toString("hex");
  await mkdir(resolve("../.local"), { recursive: true });
  brokerFile = resolve(`../.local/mqtt-wire-${randomUUID()}.json`);
  await writeFile(
    brokerFile,
    JSON.stringify([
      {
        username: "wire-processor",
        role: "processor",
        salt,
        hash: scryptSync(secret, salt, 32).toString("hex"),
      },
    ]),
    { mode: 0o600 },
  );
  const env = {
    ...process.env,
    HG_MQTT_LAN_IP: "",
    HG_MQTT_PORT: String(port),
    HG_BROKER_USERS_FILE: brokerFile,
    MQTT_BROKER_URL: `mqtt://127.0.0.1:${port}`,
    MQTT_USERNAME: "wire-processor",
    MQTT_PASSWORD: secret,
  };
  const broker = spawn(process.execPath, [resolve("../scripts/broker.cjs")], {
    env,
    windowsHide: true,
    stdio: "ignore",
  });
  children.push(broker);
  await until(async () => {
    try {
      const c = await connect("wire-processor", secret);
      await c.endAsync();
      return true;
    } catch {
      return false;
    }
  });
  workerEnv = env;
  worker = spawn(
    process.execPath,
    ["--import", "tsx", resolve("workers/eventProcessor.ts")],
    { env, windowsHide: true, stdio: "ignore" },
  );
  children.push(worker);
  await until(
    async () =>
      !!(
        await pool.query(
          "SELECT 1 FROM hg_service_health WHERE name='event-processor'",
        )
      ).rowCount,
    10000,
  );
}, 20000);
test("accepted MQTT data survives worker downtime and cancelled commands are denied by the broker", async () => {
  worker.kill();
  await new Promise((r) => worker.once("exit", r));
  const definition = {
    name: "Persistencia MQTT",
    kind: "ACTUATOR",
    transport: "MQTT",
    channels: [
      { key: "main", name: "Salida", kind: "ACTUATOR", type: "RELAY" },
    ],
  };
  const made = await createConnection(ctx, definition);
  const cred = made.credentials!,
    device = await connect(cred.username, cred.token);
  await device.subscribeAsync(cred.topics.commands);
  await send(device, cred.topics.telemetry, {
    message_id: randomUUID(),
    readings: [{ channel: "main", value: "OFF" }],
  });
  const inbox = await pool.query(
    "SELECT processed_at FROM hg_device_inbox WHERE connection_id=$1",
    [made.connection.id],
  );
  expect(inbox.rowCount).toBe(1);
  expect(inbox.rows[0].processed_at).toBeNull();
  expect((await getConnection(ctx, made.connection.id)).status).toBe("WAITING");
  worker = spawn(
    process.execPath,
    ["--import", "tsx", resolve("workers/eventProcessor.ts")],
    { env: workerEnv, windowsHide: true, stdio: "ignore" },
  );
  children.push(worker);
  await until(
    async () =>
      (await getConnection(ctx, made.connection.id)).channels[0].last_value ===
      "OFF",
  );
  worker.kill();
  await new Promise((r) => worker.once("exit", r));
  const cmd = await requestDeviceCommand(
    ctx,
    made.connection.id,
    "main",
    "ON",
    randomUUID(),
  );
  await updateConnection(ctx, made.connection.id, {
    ...definition,
    name: "Cambio cancela",
    expected_revision: made.connection.revision,
  });
  let count = 0;
  device.on("message", () => {
    count++;
  });
  const publisher = await connect("wire-processor", secret);
  publisher.publish(
    cred.topics.commands,
    JSON.stringify({
      schema_version: "1.0",
      command_id: cmd.id,
      channel: "main",
      state: "ON",
      expires_at: cmd.expires_at,
      credential_generation: 1,
    }),
    { qos: 1 },
    () => {},
  );
  await new Promise((r) => setTimeout(r, 500));
  expect(count).toBe(0);
  publisher.end(true);
  worker = spawn(
    process.execPath,
    ["--import", "tsx", resolve("workers/eventProcessor.ts")],
    { env: workerEnv, windowsHide: true, stdio: "ignore" },
  );
  children.push(worker);
}, 20000);
afterAll(async () => {
  for (const c of clients) c.end(true);
  for (const child of children) child.kill();
  await Promise.all(
    children.map((c) =>
      c.exitCode !== null || c.signalCode !== null
        ? Promise.resolve()
        : new Promise((r) => c.once("exit", r)),
    ),
  );
  if (brokerFile) await unlink(brokerFile);
  await pool.end();
});
test("actual MQTT socket → broker → worker → database → command → device ACK; rotation disconnects old session", async () => {
  const made = await createConnection(ctx, {
    name: "MQTT wire test only",
    kind: "ACTUATOR",
    transport: "MQTT",
    channels: [
      { key: "main", name: "Salida test", kind: "ACTUATOR", type: "RELAY" },
    ],
  });
  const cred = made.credentials!;
  const device = await connect(cred.username, cred.token);
  await device.subscribeAsync(cred.topics.commands, { qos: 1 });
  await send(device, cred.topics.telemetry, {
    message_id: randomUUID(),
    heartbeat: true,
    readings: [],
  });
  await until(
    async () =>
      (await getConnection(ctx, made.connection.id)).status === "ONLINE",
  );
  let received: any;
  device.on("message", (_topic, bytes) => {
    received = JSON.parse(bytes.toString());
  });
  const cmd = await requestDeviceCommand(
    ctx,
    made.connection.id,
    "main",
    "ON",
    randomUUID(),
  );
  await until(async () => received?.command_id === cmd.id);
  expect(received.credential_generation).toBe(1);
  expect(
    (await getConnection(ctx, made.connection.id)).channels[0].last_value,
  ).toBeNull();
  await send(device, cred.topics.ack, {
    message_id: randomUUID(),
    command_id: cmd.id,
    state: "ON",
  });
  await until(
    async () =>
      (await getConnection(ctx, made.connection.id)).channels[0].last_value ===
      "ON",
  );
  const samples = (
    await pool.query(
      "SELECT source FROM hg_connection_samples WHERE connection_id=$1",
      [made.connection.id],
    )
  ).rows;
  expect(samples).toEqual([{ source: "LIVE" }]);
  await rotateCredential(ctx, made.connection.id, made.connection.revision);
  await until(async () => !device.connected, 5000);
  await expect(connect(cred.username, cred.token)).rejects.toThrow(
    "MQTT auth failed",
  );
}, 20000);
