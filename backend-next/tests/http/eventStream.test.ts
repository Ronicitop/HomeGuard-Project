import { beforeAll, beforeEach, afterAll, test, expect } from "vitest";
import { pool, resetDatabase, HOME, OTHER } from "../helpers";
import { createSession, requireSession } from "../../lib/auth/sessionService";
import { eventRoutes } from "../../lib/http/eventRoutes";
let token: string;
beforeAll(async () => {
  await resetDatabase();
  await pool.query(
    "INSERT INTO Usuario(id,nombre,apellido,email,password_hash) VALUES(1,'Stream','Test','stream@test.local','unusable')",
  );
  await pool.query(
    "INSERT INTO hg_memberships(household_id,user_id,role) VALUES($1,1,'ADMINISTRADOR')",
    [HOME],
  );
  token = (await createSession(1, HOME)).token;
});
beforeEach(async () => {
  await pool.query("DELETE FROM hg_sse_log");
});
afterAll(() => pool.end());
async function log(home: string, entity: string) {
  return (
    await pool.query(
      "INSERT INTO hg_sse_log(household_id,event_name,entity_id) VALUES($1,'event.created',$2) RETURNING sequence::text",
      [home, entity],
    )
  ).rows[0].sequence as string;
}
async function stream(after: string, lastEventId?: string) {
  const abort = new AbortController();
  const request = new Request(`http://localhost/api/v1/stream?after=${after}`, {
    signal: abort.signal,
    headers: {
      authorization: `Bearer ${token}`,
      ...(lastEventId ? { "Last-Event-ID": lastEventId } : {}),
    },
  });
  const response = await eventRoutes(
    request,
    ["stream"],
    await requireSession(request),
  );
  const reader = response!.body!.getReader();
  return {
    response: response!,
    reader,
    abort,
    async close() {
      await reader.cancel();
      abort.abort();
    },
  };
}
async function chunk(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const value = await reader.read();
  expect(value.done).toBe(false);
  return new TextDecoder().decode(value.value);
}
test("latest starts at this household's real cursor and skips historical and foreign logs", async () => {
  await pool.query(
    "INSERT INTO hg_sse_log(household_id,event_name,entity_id) SELECT $1,'event.created','old-'||i FROM generate_series(1,160) i",
    [HOME],
  );
  const own = await log(HOME, "own-old");
  await log(OTHER, "foreign-private-entity");
  const opened = await stream("latest");
  try {
    expect(opened.response.headers.get("content-type")).toBe(
      "text/event-stream",
    );
    expect(await chunk(opened.reader)).toBe(
      `id: ${own}\nevent: sync_ready\ndata: {}\n\n`,
    );
    const followup = await chunk(opened.reader);
    expect(followup).toBe(": heartbeat\n\n");
    expect(followup).not.toMatch(/old-|foreign-private/);
  } finally {
    await opened.close();
  }
});
test("latest with no household logs emits zero even when another household has logs", async () => {
  await log(OTHER, "foreign");
  const opened = await stream("latest");
  try {
    expect(await chunk(opened.reader)).toBe(
      "id: 0\nevent: sync_ready\ndata: {}\n\n",
    );
  } finally {
    await opened.close();
  }
});
test.each([false, true])(
  "numeric resume stays compatible and Last-Event-ID takes priority (%s)",
  async (useHeader) => {
    const previous = await log(HOME, "seen-entity");
    await log(OTHER, "foreign-private-entity");
    const next = await log(HOME, "next-entity");
    const opened = await stream(
      useHeader ? "latest" : previous,
      useHeader ? previous : undefined,
    );
    try {
      expect(await chunk(opened.reader)).toBe(
        `id: ${next}\nevent: event.created\ndata: {"entity_id":"next-entity"}\n\n`,
      );
      expect(await chunk(opened.reader)).toBe(": heartbeat\n\n");
    } finally {
      await opened.close();
    }
  },
);
test("a latest cursor cannot be resolved without a live authenticated session", async () => {
  const request = new Request("http://localhost/api/v1/stream?after=latest");
  await expect(
    eventRoutes(request, ["stream"], {
      user_id: 1,
      household_id: HOME,
      role: "ADMINISTRADOR",
      session_id: "stale",
    }),
  ).rejects.toMatchObject({ status: 401 });
});
