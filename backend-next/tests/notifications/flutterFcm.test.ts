import { beforeAll, afterAll, test, expect } from "vitest";
import { generateKeyPairSync, randomUUID, verify } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pool, resetDatabase, HOME, OTHER } from "../helpers";
import {
  registerPushDevice,
  queueNotifications,
  deliverNotification,
} from "../../lib/notifications/deliveryService";
import { reconcileReceipts } from "../../lib/notifications/receiptsService";
import { notificationRoutes } from "../../lib/http/notificationRoutes";
const ctx = {
  user_id: 1,
  household_id: HOME,
  role: "ADMINISTRADOR" as const,
  session_id: "test",
};
const token = "flutter-test-token:" + "a".repeat(140);
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
let directory: string, credentials: string;
beforeAll(async () => {
  await resetDatabase();
  process.env.HG_SECRET_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.HG_PUSH_ENABLED = "true";
  directory = await mkdtemp(join(tmpdir(), "homeguard-fcm-test-"));
  credentials = join(directory, "service-account.json");
  await writeFile(
    credentials,
    JSON.stringify({
      type: "service_account",
      project_id: "homeguard-test",
      client_email: "test@homeguard-test.iam.gserviceaccount.com",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
      token_uri: "https://oauth2.googleapis.com/token",
    }),
  );
  await pool.query(
    "INSERT INTO Usuario(id,nombre,apellido,email,password_hash) VALUES(1,'Test','Test','fcm@test.local','test-unusable')",
  );
  await pool.query("INSERT INTO hg_households(id,name) VALUES($1,'Other')", [
    OTHER,
  ]);
  await pool.query(
    "INSERT INTO hg_memberships(household_id,user_id,role) VALUES($1,1,'ADMINISTRADOR'),($2,1,'ADMINISTRADOR')",
    [HOME, OTHER],
  );
});
afterAll(async () => {
  delete process.env.HG_FCM_SERVICE_ACCOUNT_FILE;
  await rm(directory, { recursive: true, force: true });
  await pool.end();
});
async function queued() {
  const installation = randomUUID();
  const device = await registerPushDevice(ctx, {
    installation_id: installation,
    token,
    platform: "android",
    provider: "FCM",
  } as any);
  const event = (
    await pool.query(
      "INSERT INTO hg_events(id,household_id,source,category,event_type,severity,summary,occurred_at,decisions) VALUES($1,$2,'SIMULATED','SECURITY','FCM_TEST','WARNING','Private address and evidence',now(),'{\"notify_requested\":true}') RETURNING *",
      [randomUUID(), HOME],
    )
  ).rows[0];
  const incident = randomUUID();
  await pool.query(
    "INSERT INTO hg_emergency_incidents(id,household_id,event_id,state,response_deadline,policy_snapshot,profile_snapshot) VALUES($1,$2,$3,'PENDING_RESPONSE',now()+interval '1 minute','{}','{}')",
    [incident, HOME, event.id],
  );
  await queueNotifications(event);
  const notification = (
    await pool.query(
      "SELECT id FROM hg_notifications WHERE event_id=$1 AND installation_id=$2",
      [event.id, installation],
    )
  ).rows[0];
  return { device, event, incident, id: notification.id };
}
function fcmFetcher(send: (message: any) => Response) {
  return async (url: string, init?: RequestInit) => {
    if (url === "https://oauth2.googleapis.com/token") {
      const form = new URLSearchParams(String(init?.body));
      expect(form.get("grant_type")).toBe(
        "urn:ietf:params:oauth:grant-type:jwt-bearer",
      );
      const [header, claims, signature] = form.get("assertion")!.split(".");
      expect(
        JSON.parse(Buffer.from(header, "base64url").toString()),
      ).toMatchObject({ alg: "RS256", typ: "JWT" });
      expect(
        JSON.parse(Buffer.from(claims, "base64url").toString()),
      ).toMatchObject({
        iss: "test@homeguard-test.iam.gserviceaccount.com",
        aud: "https://oauth2.googleapis.com/token",
        scope: "https://www.googleapis.com/auth/firebase.messaging",
      });
      expect(
        verify(
          "RSA-SHA256",
          Buffer.from(`${header}.${claims}`),
          publicKey,
          Buffer.from(signature, "base64url"),
        ),
      ).toBe(true);
      return Response.json({
        access_token: "fake-oauth-access",
        expires_in: 3600,
        token_type: "Bearer",
      });
    }
    expect(url).toBe(
      "https://fcm.googleapis.com/v1/projects/homeguard-test/messages:send",
    );
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer fake-oauth-access",
    });
    return send(JSON.parse(String(init?.body)));
  };
}
test("Flutter FCM registration is encrypted, returns its provider, and GET never exposes the token", async () => {
  const installation = randomUUID();
  const response = await notificationRoutes(
    new Request("http://localhost/api/v1/push-devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        installation_id: installation,
        token,
        provider: "FCM",
        platform: "android",
      }),
    }),
    ["push-devices"],
    ctx,
  );
  expect(response?.status).toBe(201);
  expect(await response!.json()).toMatchObject({
    provider: "FCM",
    installation_id: installation,
  });
  const stored = (
    await pool.query("SELECT * FROM hg_push_devices WHERE installation_id=$1", [
      installation,
    ])
  ).rows[0];
  expect(stored.token_encrypted).not.toContain(token);
  const list = await notificationRoutes(
    new Request("http://localhost/api/v1/push-devices"),
    ["push-devices"],
    ctx,
  );
  const json = await list!.json();
  expect(json.items).toContainEqual(
    expect.objectContaining({ installation_id: installation, provider: "FCM" }),
  );
  expect(JSON.stringify(json)).not.toContain(token);
  expect(JSON.stringify(json)).not.toContain("token_encrypted");
});
test.each(["FCM", "EXPO", "OTHER"])(
  "invalid %s tokens cannot create a device",
  async (provider) => {
    await expect(
      registerPushDevice(ctx, {
        installation_id: randomUUID(),
        token: "bad token\n",
        platform: "android",
        provider,
      } as any),
    ).rejects.toMatchObject({ code: "INVALID_PUSH_TOKEN" });
  },
);
test("an FCM provider token cannot be mistaken for Expo and oversized FCM tokens are rejected", async () => {
  for (const input of [
    { token, provider: "EXPO" },
    { token: "a".repeat(4097), provider: "FCM" },
  ])
    await expect(
      registerPushDevice(ctx, {
        installation_id: randomUUID(),
        platform: "android",
        ...input,
      } as any),
    ).rejects.toMatchObject({ code: "INVALID_PUSH_TOKEN" });
});
test("installation rebinding requires matching provider as well as matching private token", async () => {
  const installation = randomUUID();
  const expoToken = "ExpoPushToken[shared-private-token]";
  await registerPushDevice(
    { ...ctx, household_id: OTHER },
    { installation_id: installation, token: expoToken, platform: "android" },
  );
  await pool.query(
    "UPDATE hg_push_devices SET provider='FCM' WHERE installation_id=$1",
    [installation],
  );
  await registerPushDevice(ctx, {
    installation_id: installation,
    token: expoToken,
    platform: "android",
  });
  expect(
    (
      await pool.query(
        "SELECT enabled FROM hg_push_devices WHERE household_id=$1 AND installation_id=$2",
        [OTHER, installation],
      )
    ).rows[0].enabled,
  ).toBe(true);
});
test("missing FCM credentials produces an explicit configuration failure without contacting a provider", async () => {
  delete process.env.HG_FCM_SERVICE_ACCOUNT_FILE;
  const item = await queued();
  let requests = 0;
  const result = await deliverNotification(item.id, async () => {
    requests++;
    throw new Error("must not send");
  });
  expect(result).toMatchObject({
    status: "FAILED",
    error_code: "FCM_NOT_CONFIGURED",
  });
  expect(requests).toBe(0);
});
test("FCM uses signed OAuth, sends safe visible background payload, and never uses Expo receipts", async () => {
  process.env.HG_FCM_SERVICE_ACCOUNT_FILE = credentials;
  const item = await queued();
  let sent = false;
  const result = await deliverNotification(
    item.id,
    fcmFetcher((payload) => {
      sent = true;
      expect(payload.message.token).toBe(token);
      expect(payload.message.notification.title).toContain("Simulación");
      expect(payload.message.notification.body).toBe(
        "Abrí la aplicación para revisar el evento.",
      );
      expect(payload.message.data).toMatchObject({
        event_id: item.event.id,
        incident_id: item.incident,
        source: "SIMULATED",
        deep_link: `homeguard://events/${item.event.id}`,
      });
      expect(payload.message.android).toMatchObject({
        priority: "HIGH",
        ttl: "300s",
        notification: { channel_id: "homeguard-events", sound: "default" },
      });
      expect(JSON.stringify(payload)).not.toContain("Private address");
      return Response.json({
        name: "projects/homeguard-test/messages/message-one",
      });
    }),
  );
  expect(sent).toBe(true);
  expect(result.status).toBe("SENT");
  expect(
    (
      await pool.query(
        "SELECT provider,provider_ticket FROM hg_notifications WHERE id=$1",
        [item.id],
      )
    ).rows[0],
  ).toEqual({
    provider: "FCM",
    provider_ticket: "projects/homeguard-test/messages/message-one",
  });
  await pool.query(
    "UPDATE hg_notifications SET created_at=now()-interval '16 minutes' WHERE id=$1",
    [item.id],
  );
  let receiptCalls = 0;
  await reconcileReceipts(async () => {
    receiptCalls++;
    return Response.json({ data: {} });
  });
  expect(receiptCalls).toBe(0);
});
test.each(["UNREGISTERED", "INVALID_ARGUMENT"])(
  "FCM %s token errors disable only the rejected device",
  async (errorCode) => {
    process.env.HG_FCM_SERVICE_ACCOUNT_FILE = credentials;
    const item = await queued();
    const result = await deliverNotification(
      item.id,
      fcmFetcher(() =>
        Response.json(
          {
            error: {
              status: errorCode,
              details: [
                {
                  "@type":
                    "type.googleapis.com/google.firebase.fcm.v1.FcmError",
                  errorCode,
                },
              ],
            },
          },
          { status: errorCode === "UNREGISTERED" ? 404 : 400 },
        ),
      ),
    );
    expect(result).toMatchObject({
      status: "FAILED",
      error_code: `FCM_${errorCode}`,
    });
    expect(
      (
        await pool.query("SELECT enabled FROM hg_push_devices WHERE id=$1", [
          item.device.id,
        ])
      ).rows[0].enabled,
    ).toBe(false);
  },
);
test("an invalid FCM payload does not revoke a valid token", async () => {
  process.env.HG_FCM_SERVICE_ACCOUNT_FILE = credentials;
  const item = await queued();
  const result = await deliverNotification(
    item.id,
    fcmFetcher(() =>
      Response.json(
        {
          error: {
            status: "INVALID_ARGUMENT",
            details: [
              {
                "@type": "type.googleapis.com/google.rpc.BadRequest",
                fieldViolations: [
                  { field: "message.data", description: "bad data" },
                ],
              },
            ],
          },
        },
        { status: 400 },
      ),
    ),
  );
  expect(result.status).toBe("FAILED");
  expect(
    (
      await pool.query("SELECT enabled FROM hg_push_devices WHERE id=$1", [
        item.device.id,
      ])
    ).rows[0].enabled,
  ).toBe(true);
});
test("FCM throttling is retryable while uncertain network delivery is never claimed sent", async () => {
  process.env.HG_FCM_SERVICE_ACCOUNT_FILE = credentials;
  const item = await queued();
  expect(
    await deliverNotification(
      item.id,
      fcmFetcher(() => Response.json({}, { status: 429 })),
    ),
  ).toMatchObject({ status: "QUEUED", retry: true });
  expect(
    await deliverNotification(
      item.id,
      fcmFetcher(() => {
        throw new Error("private provider content");
      }),
    ),
  ).toMatchObject({
    status: "UNKNOWN",
    error_code: "DELIVERY_OUTCOME_UNKNOWN",
  });
});
test("unreadable service-account files fail safely without exposing file content", async () => {
  process.env.HG_FCM_SERVICE_ACCOUNT_FILE = join(
    directory,
    "missing-private-key.json",
  );
  const item = await queued();
  const result = await deliverNotification(item.id, async () => {
    throw new Error("must not send");
  });
  expect(result).toMatchObject({
    status: "FAILED",
    error_code: "FCM_NOT_CONFIGURED",
  });
  expect(JSON.stringify(result)).not.toContain(directory);
});

test.each([
  { provider: "FCM" as const, token },
  { provider: "EXPO" as const, token: "ExpoPushToken[rotated-replacement]" },
])(
  "an in-flight Expo rejection cannot disable a replacement $provider device",
  async (replacement) => {
    const item = await queued();
    await registerPushDevice(ctx, {
      installation_id: item.device.installation_id,
      token: "ExpoPushToken[old-in-flight-token]",
      provider: "EXPO",
      platform: "android",
    });
    const result = await deliverNotification(item.id, async () => {
      await registerPushDevice(ctx, {
        installation_id: item.device.installation_id,
        ...replacement,
        platform: "android",
      });
      return Response.json({
        data: { status: "error", details: { error: "DeviceNotRegistered" } },
      });
    });
    expect(result).toMatchObject({
      status: "FAILED",
      error_code: "DeviceNotRegistered",
    });
    const device = (
      await pool.query(
        "SELECT provider,enabled FROM hg_push_devices WHERE id=$1",
        [item.device.id],
      )
    ).rows[0];
    expect(device).toEqual({ provider: replacement.provider, enabled: true });
  },
);

test.each(["EVENT", "EMERGENCY_CHALLENGE"])(
  "FCM identifies the authoritative %s channel even when the event has an incident",
  async (channel) => {
    process.env.HG_FCM_SERVICE_ACCOUNT_FILE = credentials;
    const item = await queued();
    if (channel === "EMERGENCY_CHALLENGE") {
      await pool.query(
        "INSERT INTO hg_emergency_policies(household_id,enabled) VALUES($1,true) ON CONFLICT(household_id) DO UPDATE SET enabled=true",
        [HOME],
      );
      await pool.query(
        "INSERT INTO hg_notification_preferences(household_id,user_id,critical_demo_override) VALUES($1,1,true) ON CONFLICT(household_id,user_id) DO UPDATE SET critical_demo_override=true",
        [HOME],
      );
      await pool.query("UPDATE hg_notifications SET channel=$2 WHERE id=$1", [
        item.id,
        channel,
      ]);
    }
    let sent: any;
    const result = await deliverNotification(
      item.id,
      fcmFetcher((payload) => {
        sent = payload;
        return Response.json({
          name: "projects/homeguard-test/messages/channel-check",
        });
      }),
    );
    expect(result.status).toBe("SENT");
    expect(sent.message.data).toMatchObject({
      incident_id: item.incident,
      notification_channel: channel,
    });
  },
);
