const { test } = require("node:test");
const assert = require("node:assert/strict");
const { allowed } = require("../mqtt-acl.cjs");
const home = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  id = "11111111-1111-4111-8111-111111111111";
const device = { role: "device", household_id: home, connection_id: id };
const base = `homeguard/v1/${home}/devices/${id}`;
test("device MQTT ACL confines both directions to its own exact topics", () => {
  assert.equal(allowed(device, base + "/telemetry", "publish"), true);
  assert.equal(allowed(device, base + "/ack", "publish"), true);
  assert.equal(allowed(device, base + "/commands", "subscribe"), true);
  for (const topic of [
    base + "/commands",
    base + "/+",
    base + "/#",
    base.replace(id, home) + "/telemetry",
    `homeguard/v1/${home}/actuators/ack`,
  ])
    assert.equal(allowed(device, topic, "publish"), false);
  assert.equal(allowed(device, base + "/telemetry", "subscribe"), false);
  assert.equal(
    allowed(device, base.replace(home, id) + "/commands", "subscribe"),
    false,
  );
});
test("processor can subscribe to device input but cannot subscribe to device commands or publish fake telemetry", () => {
  const processor = { role: "processor" };
  assert.equal(
    allowed(processor, "homeguard/v1/+/devices/+/telemetry", "subscribe"),
    true,
  );
  assert.equal(
    allowed(processor, "homeguard/v1/+/devices/+/ack", "subscribe"),
    true,
  );
  assert.equal(allowed(processor, base + "/commands", "publish"), true);
  assert.equal(allowed(processor, base + "/telemetry", "publish"), false);
  assert.equal(allowed(processor, base + "/commands", "subscribe"), false);
  assert.equal(
    allowed(
      { role: "simulator", household_id: home },
      base + "/ack",
      "publish",
    ),
    false,
  );
});
