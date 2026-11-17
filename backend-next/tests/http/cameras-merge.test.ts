import { beforeAll, afterAll, test, expect } from "vitest";
import { pool, resetDatabase, HOME, OTHER } from "../helpers";
import {
  createSession,
  revokeSession,
  requireSession,
} from "../../lib/auth/sessionService";
import {
  handleCameraApi,
  handleStreamAuth,
} from "../../lib/cameras/legacyCameraApi";
beforeAll(async () => {
  await resetDatabase();
  for (const [id, role] of [
    [1, "ADMINISTRADOR"],
    [2, "RESIDENTE"],
    [3, "INVITADO"],
  ] as const) {
    await pool.query(
      "INSERT INTO Usuario(id,nombre,apellido,email,password_hash) VALUES($1,'Test','Camara',$2,'unusable-test')",
      [id, `${id}@camera.test`],
    );
    await pool.query(
      "INSERT INTO hg_memberships(household_id,user_id,role) VALUES($1,$2,$3)",
      [HOME, id, role],
    );
  }
  await pool.query(
    "INSERT INTO hg_households(id,name) VALUES($1,'Other home')",
    [OTHER],
  );
});
afterAll(() => pool.end());
async function call(path: string, method = "GET", data?: unknown, user = 1) {
  const issued = user ? await createSession(user, HOME) : null;
  return handleCameraApi(
    new Request(`http://localhost:3000/api/${path}`, {
      method,
      headers: {
        ...(issued ? { authorization: `Bearer ${issued.token}` } : {}),
        "Content-Type": "application/json",
      },
      body: data ? JSON.stringify(data) : undefined,
    }),
  );
}
let camera: number;
test("camera APIs accept the existing B session and admin can register a camera", async () => {
  expect((await call("vision", "GET", undefined, 0)).status).toBe(401);
  const response = await call("vision", "POST", {
    action: "camera",
    name: "Webcam laboratorio",
  });
  expect(response.status).toBe(201);
  camera = (await response.json()).id;
  expect(camera).toBeGreaterThan(0);
  expect((await (await call("vision")).json()).cameras).toHaveLength(1);
});
test("guest and resident camera mutation permissions are enforced", async () => {
  expect((await call("vision", "GET", undefined, 3)).status).toBe(403);
  expect((await call("vision", "GET", undefined, 2)).status).toBe(200);
  expect(
    (await call("vision", "POST", { action: "camera", name: "Forbidden" }, 2))
      .status,
  ).toBe(403);
});
test("other household cameras and facial descriptors are never disclosed", async () => {
  const foreign = (
    await pool.query(
      "INSERT INTO Camara(nombre,household_id) VALUES($1,$2) RETURNING id",
      ["Private foreign camera", OTHER],
    )
  ).rows[0];
  await pool.query(
    "INSERT INTO PerfilFacial(nombre,modelo,descriptores,household_id) VALUES('Foreign','test','[]',$1),('Own','test','[]',$2)",
    [OTHER, HOME],
  );
  const result = await (await call("vision")).json();
  expect(result.cameras.some((c: any) => c.id === foreign.id)).toBe(false);
  expect(result.profiles).toHaveLength(1);
  expect(result.profiles[0].descriptores).toBeUndefined();
  expect(
    (
      await call("streams", "POST", {
        cameraId: foreign.id,
        type: "publish",
        remote: true,
      })
    ).status,
  ).toBe(404);
});
test("camera cookie writes require CSRF from the same unified session", async () => {
  const s = await createSession(1, HOME);
  const make = (csrf?: string) =>
    new Request("http://localhost:3000/api/vision", {
      method: "POST",
      headers: {
        cookie: `hg_session=${s.token}`,
        origin: "http://localhost:5173",
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      body: JSON.stringify({ action: "camera", name: "CSRF webcam" }),
    });
  expect((await handleCameraApi(make())).status).toBe(403);
  expect((await handleCameraApi(make(s.csrf_token))).status).toBe(201);
});
test("stream media tokens are tied to a live B session and household", async () => {
  expect(
    (
      await call("streams", "POST", {
        cameraId: camera,
        type: "view",
        remote: true,
      })
    ).status,
  ).toBe(409);
  const s = await createSession(1, HOME),
    request = new Request("http://localhost:3000/api/streams", {
      method: "POST",
      headers: {
        authorization: `Bearer ${s.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cameraId: camera, type: "publish", remote: true }),
    });
  const response = await handleCameraApi(request);
  expect(response.status).toBe(201);
  const lease = await response.json();
  const auth = () =>
    handleStreamAuth(
      new Request("http://localhost:3000/api/streams/auth", {
        method: "POST",
        body: JSON.stringify({
          id: "media-test",
          action: "publish",
          protocol: "webrtc",
          path: lease.path,
          token: lease.token,
        }),
      }),
    );
  expect((await auth()).status).toBe(204);
  await revokeSession(
    await requireSession(
      new Request("http://localhost/api/v1/auth/me", {
        headers: { authorization: `Bearer ${s.token}` },
      }),
    ),
  );
  expect((await auth()).status).toBe(403);
});
test("browser-supplied facial descriptors and camera detections remain rejected", async () => {
  expect(
    (
      await call("vision", "POST", {
        action: "profile",
        name: "Forged",
        descriptors: [],
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await call("vision", "POST", {
        action: "event",
        cameraId: camera,
        category: "unknown",
        confidence: 1,
      })
    ).status,
  ).toBe(400);
});
test("inference cannot store detections against a camera or profile from another household", async () => {
  const { storeEvent } = await import("../../../inference/events.mjs");
  const foreign = (
    await pool.query("SELECT id FROM Camara WHERE household_id=$1", [OTHER])
  ).rows[0];
  const before = (await pool.query("SELECT count(*)::int n FROM EventoCamara"))
    .rows[0].n;
  await storeEvent(
    pool,
    {
      camara_id: foreign.id,
      household_id: HOME,
      id: "invalid",
      publisher: "invalid",
    },
    { category: "unknown", score: 0.9 },
  );
  expect(
    (await pool.query("SELECT count(*)::int n FROM EventoCamara")).rows[0].n,
  ).toBe(before);
});
