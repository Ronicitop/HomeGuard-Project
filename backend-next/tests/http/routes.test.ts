import { beforeAll, afterAll, test, expect } from "vitest";
import { pool, resetDatabase, HOME } from "../helpers";
import { hashPassword } from "../../lib/auth/passwordService";
import { handleApi } from "../../lib/http/router";
import { legacyEndpoint } from "../../lib/http/legacyRoutes";
let token: string;
let csrf: string;
beforeAll(async () => {
  await resetDatabase();
  for (const [id, name, role] of [
    [1, "admin", "ADMINISTRADOR"],
    [2, "guest", "INVITADO"],
  ]) {
    await pool.query(
      "INSERT INTO Usuario(id,nombre,apellido,email,password_hash) VALUES($1,$2,$2,$3,$4)",
      [
        id,
        name,
        `${name}@test.local`,
        await hashPassword("Test-HomeGuard-123!"),
      ],
    );
    await pool.query(
      "INSERT INTO hg_memberships(household_id,user_id,role) VALUES($1,$2,$3)",
      [HOME, id, role],
    );
  }
  await pool.query("SELECT setval(pg_get_serial_sequence('Usuario','id'),2)");
});
afterAll(() => pool.end());
async function call(
  method: string,
  path: string,
  body?: any,
  headers: Record<string, string> = {},
) {
  return handleApi(
    new Request(`http://localhost:3000/api/v1/${path}`, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
    path.split("/"),
  );
}
test("HTTP boundaries require authentication and reject an untrusted origin", async () => {
  expect((await call("GET", "events")).status).toBe(401);
  expect(
    (
      await call(
        "POST",
        "auth/login",
        { email: "admin@test.local", password: "Test-HomeGuard-123!" },
        { origin: "https://untrusted.example" },
      )
    ).status,
  ).toBe(403);
});
test("web login sets an HttpOnly cookie and exposes CSRF without a bearer token", async () => {
  const response = await call("POST", "auth/login", {
    email: "admin@test.local",
    password: "Test-HomeGuard-123!",
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  const data = await response.json();
  expect(data.token).toBeUndefined();
  expect(data.user.id).toBe(1);
  csrf = data.csrf_token;
  token = /hg_session=([^;]+)/.exec(response.headers.get("set-cookie")!)![1];
});
test("CSRF-protected web mutations reject body identity spoofing and stale updates", async () => {
  const headers = {
    cookie: `hg_session=${token}`,
    origin: "http://localhost:5173",
    "x-csrf-token": csrf,
  };
  const me = await (await call("GET", "auth/me", undefined, headers)).json();
  expect(me.id).toBe(1);
  const mode = await (await call("GET", "mode", undefined, headers)).json();
  const spoof = await call(
    "PATCH",
    "mode",
    { mode: "HOME", expected_revision: mode.revision, usuario_id: 2 },
    headers,
  );
  expect(spoof.status).toBe(400);
  expect(
    (
      await call(
        "PATCH",
        "mode",
        { mode: "HOME", expected_revision: mode.revision },
        headers,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await call(
        "PATCH",
        "mode",
        { mode: "AWAY", expected_revision: mode.revision },
        headers,
      )
    ).status,
  ).toBe(409);
});
test("mobile login returns a bearer token and guest commands are rejected server-side", async () => {
  const issued = await (
    await call("POST", "auth/login", {
      email: "guest@test.local",
      password: "Test-HomeGuard-123!",
      platform: "mobile",
    })
  ).json();
  expect(issued.token).toBeTruthy();
  expect(
    (
      await call(
        "POST",
        "actuators/ACT_SIRENA_01/commands",
        { state: "ON" },
        {
          authorization: `Bearer ${issued.token}`,
          "idempotency-key": "guest-attempt",
        },
      )
    ).status,
  ).toBe(403);
});
test("explicit demo events are marked simulated and never create a real camera", async () => {
  const response = await call(
    "POST",
    "demo/events",
    { scenario: "INTRUSION", notify_enabled: false, save_clip_enabled: false },
    {
      cookie: `hg_session=${token}`,
      origin: "http://localhost:5173",
      "x-csrf-token": csrf,
      "idempotency-key": "demo-1",
    },
  );
  expect(response.status).toBe(201);
  const event = await response.json();
  expect(event.source).toBe("SIMULATED");
  expect(event.camera_id).toBeNull();
});
test("emergency policies cannot enable real calling or run without a confirmed demo profile", async () => {
  const headers = {
    cookie: `hg_session=${token}`,
    origin: "http://localhost:5173",
    "x-csrf-token": csrf,
  };
  expect(
    (
      await call(
        "PUT",
        "emergency-policy",
        {
          enabled: true,
          immobility_seconds: 10,
          response_seconds: 20,
          transport: "PSTN",
          expected_revision: 0,
        },
        headers,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await call(
        "PUT",
        "emergency-policy",
        {
          enabled: true,
          immobility_seconds: 10,
          response_seconds: 20,
          transport: "SIMULATED",
          expected_revision: 0,
        },
        headers,
      )
    ).status,
  ).toBe(422);
});
test("legacy endpoints no longer expose data without a server session", async () => {
  for (const path of [
    "status",
    "auth/me",
    "admin/users",
    "admin/devices",
    "admin/thresholds",
  ])
    expect(
      (await legacyEndpoint(new Request(`http://localhost/api/${path}`), path))
        .status,
    ).toBe(401);
  expect(
    (
      await legacyEndpoint(
        new Request("http://localhost/api/alerts/resolve", {
          method: "POST",
          headers: {
            cookie: `hg_session=${token}`,
            "x-csrf-token": csrf,
            "content-type": "application/json",
          },
          body: "{}",
        }),
        "alerts/resolve",
      )
    ).status,
  ).toBe(400);
});
