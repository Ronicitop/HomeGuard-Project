import { drainDeviceInbox } from "../lib/connections/inbox";
import { expireDeviceCommands } from "../lib/connections/commands";
import { randomUUID } from "node:crypto";
import mqtt from "mqtt";
import pool from "../lib/db";
import { config } from "../lib/config";
import { ingestDetection } from "../lib/events/eventIngestor";
import { requireVisionPorts } from "../lib/integrations/vision";
import { recordTelemetry } from "../lib/integrations/legacyTelemetry";
import {
  claimJobs,
  finishJob,
  retryJob,
  renewJob,
} from "../lib/jobs/outboxService";
import {
  runJob,
  recoverExhaustedJobs,
  type JobTransport,
} from "../lib/jobs/jobScheduler";
import { receiveActuatorAck } from "../lib/actuators/commandService";
import {
  advanceDueIncidents,
  recoverAfterRestart,
} from "../lib/emergencies/incidentService";
import { recoverNotificationAttempts } from "../lib/notifications/deliveryService";
import { fail } from "../lib/http/errors";
import { expireStreams } from "../lib/streams";
import { reconcileReceipts } from "../lib/notifications/receiptsService";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
async function main() {
  const adapter = resolve("lib/integrations/visionAdapter.ts");
  if (existsSync(adapter)) {
    const module = await import(pathToFileURL(adapter).href);
    await module.registerVisionAdapter();
  }
  const workerId = randomUUID();
  let stopping = false,
    busy = false,
    incoming = 0;
  const lock = await pool.connect();
  if (
    !(await lock.query("SELECT pg_try_advisory_lock(716403992) locked")).rows[0]
      .locked
  )
    throw new Error("Ya existe un procesador activo.");
  await recoverAfterRestart(new Date());
  await recoverNotificationAttempts();
  const client = mqtt.connect(config.mqtt, {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clientId: `hg-processor-${workerId}`,
    reconnectPeriod: 2000,
    connectTimeout: 5000,
  });
  const topics = [
    "detections/proposed",
    "encounters/observed",
    "vision/heartbeat",
    "jobs/ack",
    "jobs/clip/completed",
    "jobs/clip/failed",
    "actuators/ack",
    "iot/telemetry",
    "devices/+/telemetry",
    "devices/+/ack",
  ];
  const waiters = new Map<
    string,
    {
      home: string;
      kind: string;
      resolve: () => void;
      reject: (e: Error) => void;
    }
  >();
  const publish = (topic: string, data: unknown) =>
    new Promise<void>((yes, no) => {
      if (!client.connected) return no(new Error("MQTT_OFFLINE"));
      const timeout = setTimeout(
        () => no(new Error("MQTT_PUBLISH_TIMEOUT")),
        5000,
      );
      client.publish(topic, JSON.stringify(data), { qos: 1 }, (e) => {
        clearTimeout(timeout);
        e ? no(e) : yes();
      });
    });
  async function waitResult(
    id: string,
    home: string,
    kind: string,
    send: () => Promise<void>,
    timeout: number,
  ) {
    await new Promise<void>((yes, no) => {
      const timer = setTimeout(() => {
        waiters.delete(id);
        no(new Error(`${kind}_ACK_TIMEOUT`));
      }, timeout);
      waiters.set(id, {
        home,
        kind,
        resolve: () => {
          clearTimeout(timer);
          waiters.delete(id);
          yes();
        },
        reject: (e) => {
          clearTimeout(timer);
          waiters.delete(id);
          no(e);
        },
      });
      send().catch((e) => {
        waiters.get(id)?.reject(e);
      });
    });
  }
  const transport: JobTransport = {
    publish,
    requestCommand: async (job) => {
      const cmd = (
        await pool.query(
          "SELECT * FROM hg_actuator_commands WHERE id=$1 AND household_id=$2",
          [job.payload.command_id, job.household_id],
        )
      ).rows[0];
      if (!cmd) fail(404, "COMMAND_NOT_FOUND", "Comando no encontrado.");
      if (cmd.status === "CONFIRMED") return;
      if (cmd.status !== "REQUESTED") return;
      await waitResult(
        cmd.id,
        job.household_id,
        "ACTUATOR",
        () =>
          publish(`homeguard/v1/${job.household_id}/actuators/command`, {
            schema_version: "1.0",
            message_type: "actuator.command.v1",
            household_id: job.household_id,
            command_id: cmd.id,
            code: cmd.legacy_code,
            state: cmd.requested_state,
            transport: "SIMULATED",
          }),
        5000,
      );
    },
    requestClip: async (job) => {
      requireVisionPorts(); // A must register its artifact writer in this process before clip jobs run.
      await waitResult(
        job.id,
        job.household_id,
        "CLIP",
        () =>
          publish(`homeguard/v1/${job.household_id}/jobs/clip/requested`, {
            ...job.payload,
            schema_version: "1.0",
            message_type: "clip.requested.v1",
            job_id: job.id,
            event_id: job.event_id,
            household_id: job.household_id,
            pre_seconds: 5,
            post_seconds: 10,
          }),
        45000,
      );
    },
  };
  client.on("connect", () => {
    for (const topic of topics)
      client.subscribe(`homeguard/v1/+/${topic}`, { qos: 1 });
  });
  client.on("error", () =>
    console.error(
      "Procesador: broker no disponible; trabajos conservados en DB.",
    ),
  );
  client.on("message", async (topic, bytes) => {
    if (stopping || bytes.length > 65536 || incoming >= 32) return;
    incoming++;
    try {
      const parts = topic.split("/"),
        home = parts[2],
        kind = parts.slice(3).join("/");
      if (!/^[a-f0-9-]{36}$/.test(home)) return;
      const data = JSON.parse(bytes.toString());
      if (data.household_id !== undefined && data.household_id !== home)
        throw new Error("TOPIC_SCOPE_MISMATCH");
      if (parts[3] === "devices" && parts.length === 6) {
        // Device packets were committed by the broker before PUBACK. The durable
        // inbox is processed independently, including after disconnected workers.
      } else if (kind === "detections/proposed") {
        const result = await ingestDetection(data, home);
        await publish(`homeguard/v1/${home}/detections/ack`, {
          schema_version: "1.0",
          message_type: "detection.ack.v1",
          household_id: home,
          message_id: data.message_id,
          ...result,
        });
      } else if (kind === "actuators/ack") {
        await receiveActuatorAck(data, home);
        waiters.get(data.command_id)?.home === home &&
          waiters.get(data.command_id)?.resolve();
      } else if (kind === "iot/telemetry") await recordTelemetry(home, data);
      else if (kind === "vision/heartbeat") {
        if (data.message_type !== "vision.heartbeat.v1")
          throw new Error("INVALID_HEARTBEAT");
        await pool.query(
          "INSERT INTO hg_service_health(name,status) VALUES($1,'ONLINE') ON CONFLICT(name) DO UPDATE SET status='ONLINE',last_seen=now()",
          [`vision:${home}`],
        );
      } else if (kind === "encounters/observed") {
        if (data.message_type !== "encounter.observed.v1")
          throw new Error("INVALID_ENCOUNTER");
        await requireVisionPorts().upsertEncounter(data);
      } else if (kind === "jobs/ack") {
        const job = (
          await pool.query(
            "SELECT id FROM hg_outbox WHERE id=$1 AND household_id=$2 AND status='RUNNING' AND lease_owner=$3",
            [data.job_id, home, workerId],
          )
        ).rows[0];
        if (!job) throw new Error("UNKNOWN_JOB_ACK");
        if (["RECEIVED", "RUNNING"].includes(data.status))
          await renewJob(job.id, workerId);
      } else if (kind.startsWith("jobs/clip/")) {
        const job = (
          await pool.query(
            "SELECT * FROM hg_outbox WHERE id=$1 AND household_id=$2 AND kind='CLIP' AND event_id=$3",
            [data.job_id, home, data.event_id],
          )
        ).rows[0];
        if (!job || !waiters.has(job.id))
          throw new Error("UNKNOWN_CLIP_RESULT");
        if (kind.endsWith("/failed"))
          waiters.get(job.id)?.reject(new Error("CLIP_FAILED"));
        else {
          if (data.message_type !== "clip.completed.v1" || !data.artifact_ref)
            throw new Error("INVALID_CLIP_RESULT");
          await requireVisionPorts().recordClipResult(data);
          waiters.get(job.id)?.resolve();
        }
      }
    } catch (error) {
      console.error(
        "Mensaje rechazado:",
        (error as any).code || "INVALID_MESSAGE",
      );
    } finally {
      incoming--;
    }
  });
  async function tick() {
    if (busy || stopping) return;
    busy = true;
    try {
      await recoverExhaustedJobs();
      await pool.query(
        "UPDATE hg_pending_correlations SET state='EXPIRED' WHERE state='PENDING' AND expires_at<now()",
      );
      const jobs = await claimJobs(workerId, new Date(), 8);
      await Promise.all(
        jobs.map(async (job) => {
          try {
            await runJob(job, transport);
            await finishJob(job.id, workerId, "COMPLETED");
          } catch (error) {
            const code = String(
              (error as any).code || (error as Error).message || "JOB_FAILED",
            ).slice(0, 80);
            await retryJob(job.id, workerId, code);
          }
        }),
      );
    } catch (error) {
      console.error("Procesador: ciclo fallido, se reintentará.");
    } finally {
      busy = false;
    }
  }
  let devicesBusy = false;
  const deviceTimer = setInterval(async () => {
    if (devicesBusy || stopping) return;
    devicesBusy = true;
    try {
      await expireDeviceCommands();
      await drainDeviceInbox();
    } catch {
      console.error(
        "Procesador: entrada de equipos pendiente; se reintentará.",
      );
    } finally {
      devicesBusy = false;
    }
  }, 500);
  const timer = setInterval(tick, 500);
  // A slow clip/voice/provider job must not delay the independent response deadline.
  const deadlineTimer = setInterval(
    () =>
      void advanceDueIncidents(new Date()).catch(() =>
        console.error("No se pudo avanzar el plazo de emergencias."),
      ),
    500,
  );
  const receiptTimer = setInterval(() => void reconcileReceipts(), 60000);
  const streamTimer = setInterval(
    () =>
      void expireStreams().catch(() =>
        console.error("No se pudo limpiar la sesión de video."),
      ),
    5000,
  );
  const heartbeat = setInterval(async () => {
    try {
      await pool.query(
        "INSERT INTO hg_service_health(name,status) VALUES('event-processor','ONLINE'),('mqtt',$1) ON CONFLICT(name) DO UPDATE SET status=excluded.status,last_seen=now()",
        [client.connected ? "ONLINE" : "OFFLINE"],
      );
    } catch {}
  }, 5000);
  async function stop() {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    clearInterval(deviceTimer);
    clearInterval(deadlineTimer);
    clearInterval(receiptTimer);
    clearInterval(streamTimer);
    clearInterval(heartbeat);
    for (const w of waiters.values()) w.reject(new Error("PROCESS_STOPPING"));
    client.end();
    for (let i = 0; (busy || devicesBusy) && i < 50; i++)
      await new Promise((r) => setTimeout(r, 100));
    await lock.query("SELECT pg_advisory_unlock(716403992)");
    lock.release();
    await pool.end();
    process.exit(0);
  }
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, stop);
  console.log(
    "Procesador HomeGuard listo; llamadas simuladas; equipos reales aislados por credencial.",
  );
}
main().catch(() => {
  console.error("No se pudo iniciar el procesador; revisá configuración y DB.");
  process.exit(1);
});
