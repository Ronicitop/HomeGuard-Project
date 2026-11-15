import mqtt from "mqtt";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "../lib/config";
const credentials = JSON.parse(
  readFileSync(resolve("../.local/broker-clients.json"), "utf8"),
).find((x: any) => x.role === "simulator");
if (!config.demo) throw new Error("Simulator requires HG_DEMO_MODE");
const client = mqtt.connect(config.mqtt, {
  username: credentials.username,
  password: credentials.password,
  clientId: "homeguard-actuator-simulator",
  reconnectPeriod: 2000,
});
client.on("connect", () =>
  client.subscribe(
    `homeguard/v1/${credentials.household_id}/actuators/command`,
    { qos: 1 },
  ),
);
client.on("message", (topic, bytes) => {
  try {
    const data = JSON.parse(bytes.toString());
    if (
      data.message_type !== "actuator.command.v1" ||
      data.household_id !== credentials.household_id ||
      data.transport !== "SIMULATED" ||
      !["ON", "OFF"].includes(data.state) ||
      !/^[a-f0-9-]{36}$/.test(data.command_id)
    )
      return;
    client.publish(
      `homeguard/v1/${credentials.household_id}/actuators/ack`,
      JSON.stringify({
        schema_version: "1.0",
        message_type: "actuator.ack.v1",
        household_id: credentials.household_id,
        command_id: data.command_id,
        state: data.state,
        confirmation_source: "SIMULATOR",
      }),
      { qos: 1 },
    );
  } catch {
    console.error("Mensaje de simulador rechazado.");
  }
});
client.on("error", () => console.error("Simulador sin conexión MQTT."));
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => client.end(false, {}, () => process.exit(0)));
