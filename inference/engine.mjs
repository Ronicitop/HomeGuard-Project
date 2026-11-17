import { lookup } from "node:dns/promises";
import { storeEvent } from "./events.mjs";
import * as tf from "@tensorflow/tfjs-node";
import ffmpeg from "ffmpeg-static";
import coco from "@tensorflow-models/coco-ssd";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Human } = require("@vladmandic/human");
import pg from "pg";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import {
  randomBytes,
  randomUUID,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { version, compatible, classify, confirm } from "./logic.mjs";
const secret = process.env.INFERENCE_SECRET;
if (!secret || secret.length < 32)
  throw Error("INFERENCE_SECRET must contain at least 32 characters");
const pool = new pg.Pool({
  host: process.env.DB_HOST || "db",
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASS,
  database: process.env.DB_NAME || "homeguard_db",
  max: 3,
  connectionTimeoutMillis: 5000,
});
const digest = (t) => createHash("sha256").update(t).digest("hex");
let activeFF = null;
let ready = false,
  job = null,
  snapshot = { status: "starting", detections: [] },
  enroll = null,
  closing = false;
process.on("message", (b) => {
  if (job?.camara_id !== b.cameraId || job?.household_id !== b.householdId)
    return;
  if (b.action === "cancel") enroll = null;
  else if (b.action === "enroll" && job?.camara_id === b.cameraId)
    enroll = {
      name: b.name.trim(),
      userId: b.userId,
      authSessionId: b.authSessionId,
      samples: [],
      status: "capturing",
      deadline: Date.now() + 60000,
    };
});
function publish() {
  process.send?.({
    kind: "snapshot",
    snapshot: {
      ...snapshot,
      enrollment: enroll
        ? { count: enroll.samples.length, status: enroll.status }
        : null,
    },
    cameraId: job?.camara_id,
  });
}
const detector = await coco.load({
  base: "lite_mobilenet_v2",
  modelUrl: "file:///app/models/coco/model.json",
});
const h = new Human({
  backend: "tensorflow",
  modelBasePath: "file:///app/models/human/",
  face: {
    enabled: true,
    detector: { rotation: false, maxDetected: 5, skipFrames: 0, skipTime: 0 },
    description: { enabled: true, skipFrames: 0, skipTime: 0 },
    mesh: { enabled: false },
    iris: { enabled: false },
    emotion: { enabled: false },
    antispoof: { enabled: false },
    liveness: { enabled: false },
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  gesture: { enabled: false },
});
await h.load();
ready = true;
process.send?.({ kind: "ready" });
async function acquire() {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(817242)");
    const pub = (
      await c.query(
        "SELECT s.* FROM SesionCamara s JOIN hg_sessions a ON a.id=s.auth_session_id JOIN hg_memberships m ON m.user_id=s.usuario_id AND m.household_id=s.household_id WHERE s.tipo='publish' AND s.expira_en>NOW() AND a.revoked_at IS NULL AND a.expires_at>NOW() AND a.household_id=s.household_id AND m.enabled AND m.role IN ('ADMINISTRADOR','RESIDENTE') ORDER BY s.expira_en DESC LIMIT 1",
      )
    ).rows[0];
    if (
      !pub ||
      (await c.query("SELECT 1 FROM SesionCamara WHERE tipo='process'"))
        .rowCount
    ) {
      await c.query("ROLLBACK");
      return null;
    }
    const media = await fetch(
      "http://mediamtx:9997/v3/paths/get/" + encodeURIComponent(pub.ruta),
      { signal: AbortSignal.timeout(2000) },
    );
    if (!media.ok || !(await media.json()).ready) {
      await c.query("ROLLBACK");
      return null;
    }
    const token = randomBytes(32).toString("hex"),
      id = randomUUID();
    await c.query(
      "INSERT INTO SesionCamara(id,token_hash,camara_id,usuario_id,tipo,ruta,expira_en,household_id,auth_session_id) VALUES($1,$2,$3,$4,'process',$5,NOW()+interval '15 seconds',$6,$7)",
      [
        id,
        digest(token),
        pub.camara_id,
        pub.usuario_id,
        pub.ruta,
        pub.household_id,
        pub.auth_session_id,
      ],
    );
    await c.query("COMMIT");
    return { ...pub, id, token, publisher: pub.id };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
async function run(j) {
  job = j;
  enroll = null;
  let latest = null,
    partial = Buffer.alloc(0),
    alive = true,
    stopping = false,
    seq = 0,
    lastFrame = Date.now(),
    lastFace = 0,
    lastError = "";
  const seen = new Map();
  snapshot = {
    status: "connecting",
    generation: j.publisher,
    cameraId: j.camara_id,
    detections: [],
  };
  publish();
  const { address: mediaAddress } = await lookup("mediamtx", { family: 4 });
  const ff = spawn(
    ffmpeg,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-threads",
      "1",
      "-filter_threads",
      "1",
      "-probesize",
      "32768",
      "-analyzeduration",
      "1000000",
      "-rtsp_transport",
      "tcp",
      "-i",
      `rtsp://worker:${j.token}@${mediaAddress}:8554/${j.ruta}`,
      "-an",
      "-vf",
      "fps=3,scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2",
      "-pix_fmt",
      "rgb24",
      "-f",
      "rawvideo",
      "pipe:1",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  activeFF = ff;
  // Bound buffers to one decoded frame and one partial frame; never queue inference.
  ff.stdout.on("data", (chunk) => {
    partial = Buffer.concat([partial, chunk]);
    while (partial.length >= 640 * 480 * 3) {
      latest = Buffer.from(partial.subarray(0, 640 * 480 * 3));
      partial = partial.subarray(640 * 480 * 3);
      lastFrame = Date.now();
    }
  });
  ff.stderr.on("data", (chunk) => {
    lastError = (
      lastError + chunk.toString().split(j.token).join("[redacted]")
    ).slice(-500);
  });
  ff.on("error", (e) => {
    alive = false;
    console.warn("Video decoder could not start:", e.code);
  });
  ff.on("exit", (code, signal) => {
    alive = false;
    if (!stopping && !closing && (code || (signal && signal !== "SIGTERM")))
      console.warn("Video decoder interrupted:", code, signal);
  });
  const heartbeat = setInterval(async () => {
    try {
      const r = await pool.query(
        "UPDATE SesionCamara SET expira_en=NOW()+interval '15 seconds' WHERE id=$1 AND expira_en>NOW() AND EXISTS(SELECT 1 FROM SesionCamara p JOIN hg_sessions a ON a.id=p.auth_session_id WHERE p.id=$2 AND p.expira_en>NOW() AND a.revoked_at IS NULL AND a.expires_at>NOW()) RETURNING id",
        [j.id, j.publisher],
      );
      if (!r.rowCount) alive = false;
    } catch {
      alive = false;
    }
  }, 3000);
  try {
    while (alive && !closing) {
      const begin = Date.now();
      if (begin - lastFrame > 30000) break;
      if (!latest) {
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      const frame = latest,
        capturedAt = lastFrame;
      latest = null;
      const input = tf.tensor3d(new Uint8Array(frame), [480, 640, 3], "int32");
      let objects = [],
        faces = [],
        degraded = false;
      try {
        objects = await detector.detect(input);
        snapshot = {
          status: "live",
          generation: j.publisher,
          cameraId: j.camara_id,
          sequence: ++seq,
          at: capturedAt,
          width: 640,
          height: 480,
          detections: classify(objects, [], [], () => 0),
        };
        publish();
        try {
          faces = (await h.detect(input)).face;
        } catch {
          degraded = true;
        }
        const ps = (
          await pool.query("SELECT * FROM PerfilFacial WHERE household_id=$1", [
            j.household_id,
          ])
        ).rows;
        const detections = classify(objects, faces, ps, (a, b) =>
          h.match.similarity(a, b),
        );
        const pending = enroll;
        if (pending?.status === "capturing") {
          if (Date.now() > pending.deadline) {
            pending.status = "expired";
            pending.samples = [];
          } else if (
            faces.length === 1 &&
            faces[0].embedding?.length === 1024 &&
            faces[0].score >= 0.8 &&
            Date.now() - lastFace > 500
          ) {
            lastFace = Date.now();
            pending.samples.push(Array.from(faces[0].embedding));
            if (pending.samples.length === 5) {
              const a = await pool.query(
                "SELECT 1 FROM Usuario u JOIN hg_memberships m ON m.user_id=u.id JOIN hg_sessions a ON a.user_id=u.id AND a.household_id=m.household_id WHERE u.id=$1 AND u.activo AND m.enabled AND m.role='ADMINISTRADOR' AND m.household_id=$2 AND a.id=$3 AND a.revoked_at IS NULL AND a.expires_at>NOW()",
                [pending.userId, j.household_id, pending.authSessionId],
              );
              if (a.rowCount && enroll === pending)
                await pool.query(
                  "INSERT INTO PerfilFacial(nombre,modelo,descriptores,household_id) VALUES($1,$2,$3,$4)",
                  [
                    pending.name,
                    version,
                    JSON.stringify(pending.samples),
                    j.household_id,
                  ],
                );
              pending.status = a.rowCount ? "saved" : "cancelled";
              pending.samples = [];
            }
          }
        }
        const duration = Date.now() - begin;
        snapshot = {
          ...snapshot,
          status: degraded ? "degraded" : "live",
          at: capturedAt,
          durationMs: duration,
          detections,
          incompatibleProfiles: ps
            .filter((p) => !compatible(p))
            .map((p) => p.nombre),
        };
        publish();
        const present = new Set();
        for (const d of detections) {
          const key = d.category + ":" + (d.profileId || 0);
          if (present.has(key)) continue;
          present.add(key);
          if (confirm(seen, d, Date.now(), Math.max(3000, duration * 3 + 1000)))
            await storeEvent(pool, j, d);
        }
      } finally {
        input.dispose();
      }
      await new Promise((r) =>
        setTimeout(r, Math.max(0, 500 - (Date.now() - begin))),
      );
    }
  } finally {
    stopping = true;
    clearInterval(heartbeat);
    if (seq === 0)
      console.warn(
        "No decoded video frames:",
        lastError || "decoder startup timed out",
      );
    ff.kill("SIGTERM");
    activeFF = null;
    enroll = null;
    snapshot = { status: "disconnected", detections: [] };
    publish();
    await pool.query("UPDATE SesionCamara SET expira_en=NOW() WHERE id=$1", [
      j.id,
    ]);
    job = null;
  }
}
async function loop() {
  while (!closing) {
    try {
      const j = await acquire();
      if (j) await run(j);
    } catch (e) {
      console.error("Analysis interrupted:", e.message);
      snapshot = { status: "unavailable", detections: [] };
      publish();
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}
const main = loop();
async function shutdown() {
  closing = true;
  activeFF?.kill("SIGTERM");
  setTimeout(() => process.exit(0), 8000).unref();
  await main;
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
