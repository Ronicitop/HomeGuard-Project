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
test("camera preflight supports authorized browser origins without requiring a session", async () => {
  const response = await handleCameraApi(
    new Request("http://localhost:3000/api/streams", {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization",
      },
    }),
  );
  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-origin")).toBe(
    "http://localhost:5173",
  );
  expect(response.headers.get("access-control-allow-headers")).toContain(
    "Authorization",
  );
});
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

test("detection settings are scoped to the household and only an admin can toggle them", async () => {
  const created = await call("vision", "POST", {
    action: "camera",
    name: "Ajustes",
  });
  const id = (await created.json()).id;
  const input = { cameraId: id, feature: "posture", enabled: true };
  for (const user of [2, 3])
    expect((await call("camera-settings", "POST", input, user)).status).toBe(
      403,
    );
  const foreign = (
    await pool.query(
      "INSERT INTO Camara(nombre,household_id) VALUES('Ajustes privados',$1) RETURNING id",
      [OTHER],
    )
  ).rows[0].id;
  expect(
    (await call("camera-settings", "POST", { ...input, cameraId: foreign }))
      .status,
  ).toBe(404);
  const updated = await call("camera-settings", "POST", input);
  expect(updated.status).toBe(200);
  const cameras = await (await call("streams", "GET", undefined, 2)).json();
  expect(
    cameras.find((c: { id: number }) => c.id === id).detection_settings,
  ).toEqual({
    people: true,
    faces: true,
    pets: true,
    motion: false,
    posture: true,
  });
});

test("movement events reject disabled and stale revisions; equivalent observations deduplicate per track", async () => {
  const { storeEvent } = await import("../../../inference/events.mjs");
  const { randomUUID } = await import("node:crypto");
  const session = await createSession(1, HOME);
  const context = await requireSession(
    new Request("http://localhost/api/v1/auth/me", {
      headers: { authorization: "Bearer " + session.token },
    }),
  );
  const publisher = randomUUID(),
    processor = randomUUID();
  await pool.query("DELETE FROM SesionCamara");
  for (const [id, type] of [
    [publisher, "publish"],
    [processor, "process"],
  ]) {
    await pool.query(
      "INSERT INTO SesionCamara(id,token_hash,camara_id,usuario_id,tipo,ruta,expira_en,household_id,auth_session_id) VALUES($1,$2,$3,1,$4,'test',now()+interval '1 minute',$5,$6)",
      [id, id, camera, type, HOME, context.session_id],
    );
  }
  const job = {
    id: processor,
    publisher,
    camara_id: camera,
    household_id: HOME,
    revision: 1,
  };
  const event = { category: "motion", score: 0.9 };
  const count = async () =>
    Number(
      (
        await pool.query(
          "SELECT count(*) FROM EventoCamara WHERE camara_id=$1",
          [camera],
        )
      ).rows[0].count,
    );
  await storeEvent(pool, job, event);
  expect(await count()).toBe(0);
  const toggle = async (feature: string, enabled: boolean) =>
    (
      await (
        await call("camera-settings", "POST", {
          cameraId: camera,
          feature,
          enabled,
        })
      ).json()
    ).detection_revision;
  const current = await toggle("motion", true);
  await storeEvent(pool, job, event);
  expect(await count()).toBe(0);
  job.revision = current;
  await storeEvent(pool, job, event);
  await storeEvent(pool, job, event);
  expect(await count()).toBe(1);
  job.revision = await toggle("posture", true);
  for (const key of ["first", "first", "second"])
    await storeEvent(pool, job, {
      category: "standing",
      trackKey: key,
      score: 0.85,
    });
  expect(await count()).toBe(3);
});
