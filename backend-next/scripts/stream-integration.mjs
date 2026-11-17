import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
const db = new pg.Client({
  host: process.env.DB_HOST || "db",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASS || "postgres",
  database: process.env.DB_NAME || "homeguard_db",
});
let cookie = "";
const base = process.env.TEST_ORIGIN || "http://localhost:3000";
async function call(path, body) {
  return fetch(base + "/api/" + path, {
    method: body ? "POST" : "GET",
    headers: { cookie, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}
await db.connect();
let camera;
try {
  assert.equal((await call("streams")).status, 403);
  const login = await call("auth/login", {
    email: "admin@homeguard.local",
    password: "admin123",
  });
  assert.equal(login.status, 200);
  cookie = login.headers.get("set-cookie").split(";")[0];
  camera = (
    await (
      await call("vision", { action: "camera", name: "Stream integration" })
    ).json()
  ).id;
  const pub = await (
    await call("streams", { cameraId: camera, type: "publish" })
  ).json();
  assert(pub.token);
  assert.equal(
    (await call("streams", { cameraId: camera, type: "publish" })).status,
    409,
  );
  const proc = await (
    await call("streams", { cameraId: camera, type: "view", remote: true })
  ).json();
  assert(proc.token);
  assert.equal(
    (await call("streams", { cameraId: camera, type: "view", remote: true }))
      .status,
    409,
  );
  const id = randomUUID();
  assert.equal(
    (
      await call("streams/auth", {
        token: pub.token,
        path: pub.path,
        action: "read",
        protocol: "webrtc",
        id,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("streams/auth", {
        token: pub.token,
        path: pub.path,
        action: "publish",
        protocol: "webrtc",
        id,
      })
    ).status,
    204,
  );
  assert.equal(
    (
      await call("streams/auth", {
        token: proc.token,
        path: pub.path,
        action: "read",
        protocol: "webrtc",
        id: randomUUID(),
      })
    ).status,
    204,
  );
  assert.equal(
    (
      await call("vision", {
        action: "event",
        cameraId: camera,
        category: "cat",
        confidence: 0.9,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("vision", {
        action: "event",
        cameraId: camera,
        sessionToken: proc.token,
        category: "cat",
        confidence: 0.9,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("vision", {
        action: "profile",
        name: "forged",
        consent: true,
        descriptors: [],
      })
    ).status,
    400,
  );
  const info = await (await call("vision")).json();
  assert(info.profiles.every((p) => !("descriptores" in p)));
  assert.equal(
    (await call("streams", { cameraId: camera, type: "process", remote: true }))
      .status,
    400,
  );
  await db.query(
    "UPDATE SesionCamara SET expira_en=NOW()-interval '1 second',media_id=NULL WHERE camara_id=$1",
    [camera],
  );
  assert.equal(
    (
      await call("streams/auth", {
        token: pub.token,
        path: pub.path,
        action: "publish",
        protocol: "webrtc",
        id,
      })
    ).status,
    403,
  );
  assert.equal(
    (await call("streams", { action: "renew", token: proc.token })).status,
    409,
  );
  console.log(
    "PASS: exclusivity, scoped media authorization, browser event/descriptor rejection, profile metadata isolation, expiry, renewal rejection",
  );
} finally {
  if (camera) await db.query("DELETE FROM Camara WHERE id=$1", [camera]);
  await call("auth/logout", {});
  await db.end();
}
