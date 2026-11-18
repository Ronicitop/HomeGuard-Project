import { sign } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { buildPushPayload } from "./notificationService";

type DeliveryResult = {
  status: string;
  error_code?: string;
  ticket?: string;
  retry?: boolean;
  invalid_token?: boolean;
};
const tokenEndpoint = "https://oauth2.googleapis.com/token";
const scope = "https://www.googleapis.com/auth/firebase.messaging";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Only OAuth assertions are sent to Google. Credentials, provider messages and
// filesystem errors must never become user-visible error codes or log entries.
export async function deliverFcm(
  token: string,
  event: any,
  fetcher: (url: string, init?: RequestInit) => Promise<Response>,
): Promise<DeliveryResult> {
  let project: string, assertion: string;
  try {
    const file = process.env.HG_FCM_SERVICE_ACCOUNT_FILE;
    if (!file || (await stat(file)).size > 65536) throw new Error();
    const account = JSON.parse(await readFile(file, "utf8"));
    if (
      account.type !== "service_account" ||
      !/^[a-z][a-z0-9-]{3,62}$/.test(account.project_id) ||
      typeof account.client_email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(
        account.client_email,
      ) ||
      typeof account.private_key !== "string" ||
      (account.token_uri && account.token_uri !== tokenEndpoint)
    )
      throw new Error();
    project = account.project_id;
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: account.client_email, scope, aud: tokenEndpoint, iat: now, exp: now + 3600 })}`;
    assertion = `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), account.private_key).toString("base64url")}`;
  } catch {
    return { status: "FAILED", error_code: "FCM_NOT_CONFIGURED" };
  }

  let accessToken: string;
  try {
    const response = await fetcher(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 429 || response.status >= 500)
      return { status: "QUEUED", error_code: "FCM_AUTH_RETRY", retry: true };
    const auth = await response.json();
    if (
      !response.ok ||
      typeof auth.access_token !== "string" ||
      !auth.access_token
    )
      return { status: "FAILED", error_code: "FCM_AUTH_FAILED" };
    accessToken = auth.access_token;
  } catch {
    // Nothing has been submitted to FCM yet, so a retry cannot duplicate a push.
    return { status: "QUEUED", error_code: "FCM_AUTH_RETRY", retry: true };
  }

  const push = buildPushPayload(token, event);
  const data: Record<string, string> = {
    event_id: String(event.id),
    source: event.source === "LIVE" ? "LIVE" : "SIMULATED",
  };
  if (["EVENT", "EMERGENCY_CHALLENGE"].includes(event.notification_channel))
    data.notification_channel = event.notification_channel;
  if (uuid.test(event.id)) data.deep_link = `homeguard://events/${event.id}`;
  if (typeof event.incident_id === "string" && uuid.test(event.incident_id))
    data.incident_id = event.incident_id;
  try {
    const response = await fetcher(
      `https://fcm.googleapis.com/v1/projects/${project}/messages:send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: push.title, body: push.body },
            data,
            android: {
              priority: "HIGH",
              ttl: `${push.ttl}s`,
              notification: { channel_id: push.channelId, sound: push.sound },
            },
          },
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (response.status === 429 || response.status >= 500)
      return { status: "QUEUED", error_code: "PROVIDER_RETRY", retry: true };
    const result = await response.json();
    if (
      response.ok &&
      typeof result.name === "string" &&
      result.name.startsWith(`projects/${project}/messages/`)
    )
      return { status: "SENT", ticket: result.name.slice(0, 512) };
    const detail = Array.isArray(result.error?.details)
      ? result.error.details.find(
          (d: any) =>
            d["@type"] ===
            "type.googleapis.com/google.firebase.fcm.v1.FcmError",
        )
      : undefined;
    const code = detail?.errorCode || result.error?.status;
    const known = [
      "UNREGISTERED",
      "INVALID_ARGUMENT",
      "SENDER_ID_MISMATCH",
      "THIRD_PARTY_AUTH_ERROR",
      "UNAUTHENTICATED",
      "PERMISSION_DENIED",
      "NOT_FOUND",
    ];
    return {
      status: "FAILED",
      error_code: known.includes(code)
        ? `FCM_${code}`
        : "FCM_PROVIDER_REJECTED",
      // Generic INVALID_ARGUMENT may describe our payload, not the token.
      invalid_token:
        detail?.errorCode === "UNREGISTERED" ||
        detail?.errorCode === "INVALID_ARGUMENT",
    };
  } catch {
    return { status: "UNKNOWN", error_code: "DELIVERY_OUTCOME_UNKNOWN" };
  }
}
