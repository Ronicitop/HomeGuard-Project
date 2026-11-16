const { test } = require("node:test");
const assert = require("node:assert/strict");
const { allowed } = require("../mqtt-acl.cjs");
const home = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
test("vision may propose only inside its own household and cannot forge actuator acknowledgements", () => {
  const user = { role: "vision", household_id: home };
  assert.equal(
    allowed(user, `homeguard/v1/${home}/detections/proposed`, "publish"),
    true,
  );
  assert.equal(
    allowed(user, `homeguard/v1/${other}/detections/proposed`, "publish"),
    false,
  );
  assert.equal(
    allowed(user, `homeguard/v1/${home}/actuators/ack`, "publish"),
    false,
  );
  assert.equal(allowed(user, "#", "subscribe"), false);
});
test("simulator receives commands but cannot publish configuration; unauthenticated client denied", () => {
  const user = { role: "simulator", household_id: home };
  assert.equal(
    allowed(user, `homeguard/v1/${home}/actuators/command`, "subscribe"),
    true,
  );
  assert.equal(
    allowed(user, `homeguard/v1/${home}/config/changed`, "publish"),
    false,
  );
  assert.equal(
    allowed(null, `homeguard/v1/${home}/actuators/ack`, "publish"),
    false,
  );
});
test("all three clip routes are authorized with six segments and remain household-scoped", () => {
  const vision = { role: "vision", household_id: home },
    processor = { role: "processor" };
  assert.equal(
    allowed(processor, `homeguard/v1/${home}/jobs/clip/requested`, "publish"),
    true,
  );
  assert.equal(
    allowed(vision, `homeguard/v1/${home}/jobs/clip/requested`, "subscribe"),
    true,
  );
  for (const result of ["completed", "failed"]) {
    assert.equal(
      allowed(vision, `homeguard/v1/${home}/jobs/clip/${result}`, "publish"),
      true,
    );
    assert.equal(
      allowed(processor, `homeguard/v1/+/jobs/clip/${result}`, "subscribe"),
      true,
    );
    assert.equal(
      allowed(vision, `homeguard/v1/${other}/jobs/clip/${result}`, "publish"),
      false,
    );
  }
  assert.equal(
    allowed(
      vision,
      `homeguard/v1/${home}/jobs/clip/completed/extra`,
      "publish",
    ),
    false,
  );
});
