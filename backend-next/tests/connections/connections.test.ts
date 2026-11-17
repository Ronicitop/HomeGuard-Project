import { beforeAll, afterAll, test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { pool, resetDatabase, HOME, OTHER } from "../helpers";
import {
  createConnection,
  listConnections,
  getConnection,
  updateConnection,
  deleteConnection,
  rotateCredential,
} from "../../lib/connections/registry";
import {
  authenticateDevice,
  ingestTelemetry,
} from "../../lib/connections/telemetry";
import {
  requestDeviceCommand,
  pollCommands,
  acknowledgeCommand,
  expireDeviceCommands,
  dispatchDeviceCommand,
} from "../../lib/connections/commands";
import { handleApi } from "../../lib/http/router";
const admin = {
  user_id: 1,
  household_id: HOME,
  role: "ADMINISTRADOR" as const,
  session_id: "test",
};
const definition = (kind = "SENSOR", transport = "HTTP") => ({
  name: "Equipo real registrado",
  kind,
  transport,
  location: "Cocina",
  model: "",
  heartbeat_seconds: 15,
  enabled: true,
  webcam_device_id: null,
  channels:
    kind === "CAMERA"
      ? []
      : [
          {
            key: "main",
            name: kind === "ACTUATOR" ? "Salida" : "Temperatura",
            kind: kind === "ACTUATOR" ? "ACTUATOR" : "SENSOR",
            type: kind === "ACTUATOR" ? "RELAY" : "TEMPERATURE",
            unit: "",
          },
        ],
});
let sensor: any, output: any;
beforeAll(async () => {
  await resetDatabase();
  await pool.query(
    "INSERT INTO Usuario(id,nombre,apellido,email,password_hash) VALUES(1,'Admin','Test','connections@test.local','unusable')",
  );
  await pool.query(
    "INSERT INTO hg_memberships(household_id,user_id,role) VALUES($1,1,'ADMINISTRADOR')",
    [HOME],
  );
  await pool.query("INSERT INTO hg_households(id,name) VALUES($1,'Other')", [
    OTHER,
  ]);
});
afterAll(() => pool.end());
test("registry begins empty and registering hardware creates no measurements or online state", async () => {
  expect((await listConnections(admin)).items).toHaveLength(0);
  sensor = await createConnection(admin, definition());
  expect(sensor.connection.status).toBe("WAITING");
  expect(sensor.connection.channels[0].last_value).toBeNull();
  expect(sensor.credentials.token).toBeTruthy();
  const listed = await getConnection(admin, sensor.connection.id);
  expect(JSON.stringify(listed)).not.toContain(sensor.credentials.token);
  expect(JSON.stringify(listed)).not.toMatch(/credential_hash|token_hash/);
  expect(
    (await pool.query("SELECT 1 FROM hg_connection_samples")).rowCount,
  ).toBe(0);
});
test("only household administrators configure connections and revisions prevent lost updates", async () => {
  await expect(
    createConnection({ ...admin, role: "RESIDENTE" }, definition()),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    getConnection({ ...admin, household_id: OTHER }, sensor.connection.id),
  ).rejects.toMatchObject({ status: 404 });
  const changed = await updateConnection(admin, sensor.connection.id, {
    ...definition(),
    name: "Temperatura cocina",
    expected_revision: sensor.connection.revision,
  });
  expect(changed.name).toBe("Temperatura cocina");
  await expect(
    updateConnection(admin, sensor.connection.id, {
      ...definition(),
      expected_revision: sensor.connection.revision,
    }),
  ).rejects.toMatchObject({ status: 409 });
});
test("authenticated telemetry becomes LIVE, while bad channels, values and spoofed sources are rejected", async () => {
  await expect(
    authenticateDevice(sensor.connection.id, "wrong"),
  ).rejects.toMatchObject({ status: 401 });
  const identity = await authenticateDevice(
    sensor.connection.id,
    sensor.credentials.token,
  );
  const id = randomUUID();
  const packet = {
    schema_version: "1.0",
    message_id: id,
    readings: [{ channel: "main", value: 22.5 }],
  };
  await ingestTelemetry(identity, packet);
  await ingestTelemetry(identity, packet);
  const actual = await getConnection(admin, sensor.connection.id);
  expect(actual.status).toBe("ONLINE");
  expect(actual.channels[0].last_value).toBe(22.5);
  expect(
    (await pool.query("SELECT source FROM hg_connection_samples")).rows,
  ).toEqual([{ source: "LIVE" }]);
  await expect(
    ingestTelemetry(identity, {
      ...packet,
      message_id: randomUUID(),
      readings: [{ channel: "unknown", value: 1 }],
    }),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    ingestTelemetry(identity, {
      ...packet,
      message_id: randomUUID(),
      readings: [{ channel: "main", value: "OPEN" }],
    }),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    ingestTelemetry(identity, {
      ...packet,
      message_id: randomUUID(),
      source: "SIMULATED",
    }),
  ).rejects.toMatchObject({ status: 400 });
});
test("late readings remain history and do not replace a newer value; stale contact goes offline", async () => {
  const identity = await authenticateDevice(
    sensor.connection.id,
    sensor.credentials.token,
  );
  await ingestTelemetry(identity, {
    message_id: randomUUID(),
    observed_at: new Date(Date.now() - 600000).toISOString(),
    readings: [{ channel: "main", value: 10 }],
  });
  expect(
    (await getConnection(admin, sensor.connection.id)).channels[0].last_value,
  ).toBe(22.5);
  await pool.query(
    "UPDATE hg_connections SET last_seen=now()-interval '5 minutes' WHERE id=$1",
    [sensor.connection.id],
  );
  expect((await getConnection(admin, sensor.connection.id)).status).toBe(
    "OFFLINE",
  );
});
test("physical commands require contact, remain unconfirmed until ACK and deduplicate retries", async () => {
  output = await createConnection(admin, definition("ACTUATOR"));
  const channel = output.connection.channels[0];
  const key = randomUUID();
  await expect(
    requestDeviceCommand(admin, output.connection.id, channel.key, "ON", key),
  ).rejects.toMatchObject({ code: "DEVICE_OFFLINE" });
  const identity = await authenticateDevice(
    output.connection.id,
    output.credentials.token,
  );
  await ingestTelemetry(identity, {
    message_id: randomUUID(),
    heartbeat: true,
    readings: [],
  });
  const command = await requestDeviceCommand(
    admin,
    output.connection.id,
    channel.key,
    "ON",
    key,
  );
  expect(command.status).toBe("QUEUED");
  expect(
    (
      await requestDeviceCommand(
        admin,
        output.connection.id,
        channel.key,
        "ON",
        key,
      )
    ).id,
  ).toBe(command.id);
  const polled = await pollCommands(identity);
  expect(polled.items[0].id).toBe(command.id);
  expect(
    (await getConnection(admin, output.connection.id)).channels[0].last_value,
  ).toBeNull();
  await expect(
    acknowledgeCommand(identity, {
      message_id: randomUUID(),
      command_id: command.id,
      state: "OFF",
    }),
  ).rejects.toMatchObject({ status: 409 });
  await acknowledgeCommand(identity, {
    message_id: randomUUID(),
    command_id: command.id,
    state: "ON",
  });
  expect(
    (await getConnection(admin, output.connection.id)).channels[0].last_value,
  ).toBe("ON");
});
test("expiry, credential rotation and deletion cannot execute queued physical commands", async () => {
  const cmd = await requestDeviceCommand(
    admin,
    output.connection.id,
    "main",
    "OFF",
    randomUUID(),
  );
  await pool.query(
    "UPDATE hg_device_commands SET expires_at=now()-interval '1 second' WHERE id=$1",
    [cmd.id],
  );
  await expireDeviceCommands();
  expect(
    (
      await pool.query("SELECT status FROM hg_device_commands WHERE id=$1", [
        cmd.id,
      ])
    ).rows[0].status,
  ).toBe("EXPIRED");
  const oldIdentity = await authenticateDevice(
    sensor.connection.id,
    sensor.credentials.token,
  );
  const old = await getConnection(admin, sensor.connection.id);
  const rotated = await rotateCredential(
    admin,
    sensor.connection.id,
    old.revision,
  );
  await expect(
    authenticateDevice(sensor.connection.id, sensor.credentials.token),
  ).rejects.toMatchObject({ status: 401 });
  await expect(
    ingestTelemetry(oldIdentity, {
      message_id: randomUUID(),
      heartbeat: true,
      readings: [],
    }),
  ).rejects.toMatchObject({ status: 401 });
  const latest = await getConnection(admin, sensor.connection.id);
  await deleteConnection(admin, sensor.connection.id, latest.revision);
  expect(
    (await listConnections(admin)).items.some(
      (c: any) => c.id === sensor.connection.id,
    ),
  ).toBe(false);
  await expect(
    authenticateDevice(sensor.connection.id, rotated.credentials.token),
  ).rejects.toMatchObject({ status: 401 });
  expect(
    (await pool.query("SELECT 1 FROM hg_connection_samples")).rowCount,
  ).toBeGreaterThan(0);
});
test("HTTP device endpoints accept only their own bearer token and reject browser cookies alone", async () => {
  const made = await createConnection(admin, definition());
  const path = ["device-ingest", made.connection.id, "telemetry"];
  const packet = {
    message_id: randomUUID(),
    readings: [{ channel: "main", value: 19 }],
  };
  const call = (token?: string) =>
    handleApi(
      new Request("http://localhost:3000/api/v1/" + path.join("/"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(packet),
      }),
      path,
    );
  expect((await call()).status).toBe(401);
  expect((await call(made.credentials.token)).status).toBe(200);
  expect(
    (await getConnection(admin, made.connection.id)).channels[0].last_value,
  ).toBe(19);
  const rotated = await rotateCredential(
    admin,
    made.connection.id,
    made.connection.revision,
  );
  expect(rotated.connection.status).toBe("WAITING");
  expect((await call(made.credentials.token)).status).toBe(401);
});
test("dispatch rejects lost contact before publishing a physical command", async () => {
  const made = await createConnection(admin, definition("ACTUATOR", "MQTT"));
  const identity = await authenticateDevice(
    made.connection.id,
    made.credentials.token,
  );
  await ingestTelemetry(identity, {
    message_id: randomUUID(),
    heartbeat: true,
    readings: [],
  });
  const command = await requestDeviceCommand(
    admin,
    made.connection.id,
    "main",
    "ON",
    randomUUID(),
  );
  await pool.query(
    "UPDATE hg_connections SET last_seen=now()-interval '10 minutes' WHERE id=$1",
    [made.connection.id],
  );
  let sent = false;
  await dispatchDeviceCommand(
    { household_id: HOME, payload: { command_id: command.id } },
    async () => {
      sent = true;
    },
  );
  expect(sent).toBe(false);
});
test("configuration cannot cancel a command halfway through its authorized publication", async () => {
  const made = await createConnection(admin, definition("ACTUATOR", "MQTT"));
  const identity = await authenticateDevice(
    made.connection.id,
    made.credentials.token,
  );
  await ingestTelemetry(identity, {
    message_id: randomUUID(),
    heartbeat: true,
  });
  const cmd = await requestDeviceCommand(
    admin,
    made.connection.id,
    "main",
    "ON",
    randomUUID(),
  );
  let entered!: () => void, release!: () => void;
  const atPublish = new Promise<void>((r) => {
      entered = r;
    }),
    gate = new Promise<void>((r) => {
      release = r;
    });
  const dispatch = dispatchDeviceCommand(
    { household_id: HOME, payload: { command_id: cmd.id } },
    async () => {
      entered();
      await gate;
    },
  );
  await atPublish;
  let changed = false;
  const update = updateConnection(admin, made.connection.id, {
    ...definition("ACTUATOR", "MQTT"),
    name: "Salida modificada",
    expected_revision: made.connection.revision,
  }).then(() => {
    changed = true;
  });
  await new Promise((r) => setTimeout(r, 120));
  const changedBeforePublicationFinished = changed;
  release();
  await Promise.all([dispatch, update]);
  expect(changedBeforePublicationFinished).toBe(false);
});
test("delayed processing preserves original receipt time rather than inventing recent contact", async () => {
  const made = await createConnection(admin, definition());
  const identity = await authenticateDevice(
    made.connection.id,
    made.credentials.token,
  );
  await ingestTelemetry(
    identity,
    { message_id: randomUUID(), readings: [{ channel: "main", value: 15 }] },
    new Date(Date.now() - 600000),
  );
  const actual = await getConnection(admin, made.connection.id);
  expect(actual.status).toBe("OFFLINE");
  expect(actual.channels[0].last_value).toBeNull();
});
test("an earlier ACK cannot replace a later reported state when draining the durable inbox", async () => {
  const made = await createConnection(admin, definition("ACTUATOR", "MQTT"));
  const identity = await authenticateDevice(
    made.connection.id,
    made.credentials.token,
  );
  await ingestTelemetry(identity, {
    message_id: randomUUID(),
    heartbeat: true,
  });
  const cmd = await requestDeviceCommand(
    admin,
    made.connection.id,
    "main",
    "ON",
    randomUUID(),
  );
  const receipt = new Date();
  await ingestTelemetry(identity, {
    message_id: randomUUID(),
    observed_at: new Date(receipt.getTime() + 500).toISOString(),
    readings: [{ channel: "main", value: "OFF" }],
  });
  await acknowledgeCommand(
    identity,
    { message_id: randomUUID(), command_id: cmd.id, state: "ON" },
    receipt,
  );
  expect(
    (await getConnection(admin, made.connection.id)).channels[0].last_value,
  ).toBe("OFF");
});
