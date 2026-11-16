import { test } from "node:test";
import assert from "node:assert/strict";
import {
  serverOrigin,
  eventFromNotification,
  createApi,
  incidentResponse,
} from "./domain.ts";
test("an aborted response body cannot become a successful null resource", async () => {
  const api = createApi(
    "https://demo.example",
    "token",
    () => {},
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => {
          throw new DOMException("Cancelled", "AbortError");
        },
      }) as Response,
  );
  await assert.rejects(() => api("events"));
});

test("server setup rejects localhost on a physical phone and invalid URLs", () => {
  assert.throws(() => serverOrigin("file:///private"));
  assert.throws(() => serverOrigin("http://localhost:3000"));
  assert.equal(
    serverOrigin("http://192.168.1.50:3000/"),
    "http://192.168.1.50:3000",
  );
  assert.throws(() => serverOrigin("https://server.example/path"));
});
test("push data is an opaque UUID destination which can be retained until login", () => {
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  assert.equal(eventFromNotification({ event_id: id }), id);
  assert.equal(eventFromNotification({ event_id: "../../admin" }), null);
  assert.equal(
    eventFromNotification({ event_id: "https://evil.example" }),
    null,
  );
});
test("expired sessions are cleared and the API never substitutes cached event content", async () => {
  let expired = false;
  const api = createApi(
    "https://demo.example",
    "private-test-token",
    () => {
      expired = true;
    },
    async (_url, init) => {
      assert.equal(
        (init?.headers as any).Authorization,
        "Bearer private-test-token",
      );
      return new Response('{"error":{"message":"Sesión vencida"}}', {
        status: 401,
      });
    },
  );
  await assert.rejects(() => api("events"));
  assert.equal(expired, true);
});
test("wellbeing responses use the same idempotency key when explicitly retried", () => {
  const response = incidentResponse("I_AM_OK", 3, "retry-key");
  assert.equal(response.headers["Idempotency-Key"], "retry-key");
  assert.deepEqual(JSON.parse(response.body), {
    response: "I_AM_OK",
    expected_revision: 3,
  });
});
