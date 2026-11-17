import { test, expect } from "vitest";
import { readingText, statusText, installerConfiguration } from "./models";
import type { Provision } from "./models";
test("unreported sensor and actuator values never display a fabricated normal state", () => {
  expect(
    readingText({
      kind: "SENSOR",
      type: "TEMPERATURE",
      unit: "°C",
      last_value: null,
    }),
  ).toBe("Sin lecturas");
  expect(
    readingText({ kind: "SENSOR", type: "DOOR", unit: "", last_value: false }),
  ).toBe("Cerrada");
  expect(
    readingText({ kind: "SENSOR", type: "SMOKE", unit: "", last_value: true }),
  ).toBe("Detectado");
  expect(
    readingText({ kind: "SENSOR", type: "POWER", unit: "W", last_value: 0 }),
  ).toBe("0 W");
  expect(
    readingText({
      kind: "ACTUATOR",
      type: "RELAY",
      unit: "",
      last_value: null,
    }),
  ).toBe("Sin lecturas");
  expect(statusText.WAITING).toBe("Esperando datos");
});
test("installer download contains connection details only for the selected protocol", () => {
  const provision = {
    connection: {
      id: "device",
      name: "Puerta",
      transport: "MQTT",
      heartbeat_seconds: 15,
      channels: [
        { key: "main", name: "Puerta", kind: "SENSOR", type: "DOOR", unit: "" },
      ],
    },
    credentials: {
      token: "private-test-key",
      username: "hg-device-test",
      generation: 1,
      topics: {
        telemetry: "own/telemetry",
        commands: "own/commands",
        ack: "own/ack",
      },
      http_path: "/api/v1/device-ingest/device",
    },
  } as Provision;
  const mqtt = installerConfiguration(provision, "192.168.1.50");
  expect(mqtt.mqtt).toMatchObject({
    host: "192.168.1.50",
    port: 1883,
    password: "private-test-key",
    clean: true,
  });
  expect(mqtt.http).toBeUndefined();
  const http = installerConfiguration(
    {
      ...provision,
      connection: { ...provision.connection, transport: "HTTP" },
    },
    "localhost",
  );
  expect(http.http).toEqual({
    base_url: "http://localhost:3000/api/v1/device-ingest/device",
    bearer_token: "private-test-key",
  });
  expect(http.mqtt).toBeUndefined();
});
