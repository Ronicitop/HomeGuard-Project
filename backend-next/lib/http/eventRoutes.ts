import { z } from "zod";
import { body, json, uuid, revision } from "./response";
import { type AuthContext, assertPermission } from "../auth/permissions";
import {
  listEvents,
  getEvent,
  transitionEvent,
  readSse,
  latestSseSequence,
} from "../events/eventService";
import { createDemoEvent } from "../events/demoService";
import { requireSession } from "../auth/sessionService";
import { fail } from "./errors";
export async function eventRoutes(
  request: Request,
  p: string[],
  ctx: AuthContext,
): Promise<Response | null> {
  const method = request.method,
    url = new URL(request.url);
  if (p.join("/") === "demo/events" && method === "POST") {
    const input = await body(
      request,
      z
        .object({
          scenario: z.enum(["INTRUSION", "POSSIBLE_FALL", "SYSTEM"]),
          notify_enabled: z.boolean().default(true),
          save_clip_enabled: z.boolean().default(false),
        })
        .strict(),
    );
    return json(
      await createDemoEvent(
        ctx,
        input,
        request.headers.get("idempotency-key") || "",
      ),
      201,
    );
  }
  if (p[0] === "events" && p.length === 1 && method === "GET")
    return json(
      await listEvents(
        ctx,
        Object.fromEntries(url.searchParams),
        url.searchParams.get("cursor"),
        Number(url.searchParams.get("limit") || 20),
      ),
    );
  if (p[0] === "events" && p.length === 2) {
    const id = uuid.parse(p[1]);
    if (method === "GET") return json(await getEvent(ctx, id));
    if (method === "PATCH") {
      const input = await body(
        request,
        z
          .object({
            status: z.enum([
              "NEW",
              "ACKNOWLEDGED",
              "RESOLVED",
              "FALSE_POSITIVE",
            ]),
            expected_revision: revision,
          })
          .strict(),
      );
      return json(
        await transitionEvent(ctx, id, input.status, input.expected_revision),
      );
    }
  }
  if (p[0] === "stream" && p.length === 1 && method === "GET") {
    assertPermission(ctx, "events.read");
    let cursor =
      request.headers.get("last-event-id") ||
      url.searchParams.get("after") ||
      "0";
    const latest = cursor === "latest";
    if (latest) cursor = await latestSseSequence(await requireSession(request));
    else if (!/^\d{1,18}$/.test(cursor))
      fail(400, "INVALID_CURSOR", "Cursor no válido.");
    let timer: ReturnType<typeof setInterval> | undefined;
    let stopped = false,
      busy = false;
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const stop = () => {
          if (stopped) return;
          stopped = true;
          if (timer) clearInterval(timer);
          try {
            controller.close();
          } catch {}
        };
        const tick = async () => {
          if (stopped || busy) return;
          busy = true;
          try {
            await requireSession(request);
            const result = await readSse(ctx, cursor);
            if (result.sync_required)
              controller.enqueue(
                encoder.encode("event: sync_required\ndata: {}\n\n"),
              );
            for (const item of result.items) {
              cursor = String(item.sequence);
              controller.enqueue(
                encoder.encode(
                  `id: ${cursor}\nevent: ${item.event_name}\ndata: ${JSON.stringify({ entity_id: item.entity_id, ...item.minimal_payload })}\n\n`,
                ),
              );
            }
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
          } catch {
            stop();
          } finally {
            busy = false;
          }
        };
        if (request.signal.aborted) {
          stop();
          return;
        }
        request.signal.addEventListener("abort", stop, { once: true });
        if (latest)
          controller.enqueue(
            encoder.encode(`id: ${cursor}\nevent: sync_ready\ndata: {}\n\n`),
          );
        timer = setInterval(tick, 3000);
        void tick();
      },
      cancel() {
        stopped = true;
        if (timer) clearInterval(timer);
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }
  return null;
}
