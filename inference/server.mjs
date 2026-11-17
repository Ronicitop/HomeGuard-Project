import { createServer } from "node:http";
import { fork } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import pg from "pg";
const secret = process.env.INFERENCE_SECRET;
if (!secret || secret.length < 32)
  throw Error("INFERENCE_SECRET must contain at least 32 characters");
const pool = new pg.Pool({
  host: process.env.DB_HOST || "db",
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASS,
  database: process.env.DB_NAME || "homeguard_db",
  max: 1,
  connectionTimeoutMillis: 4000,
});
let ready = false,
  cameraId = null,
  snapshot = { status: "starting", detections: [] },
  child,
  closing = false;
function boot() {
  child = fork(new URL("./engine.mjs", import.meta.url), [], {
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  child.on("message", (m) => {
    if (m.kind === "ready") ready = true;
    if (m.kind === "snapshot") {
      snapshot = m.snapshot;
      cameraId = m.cameraId;
    }
  });
  child.on("exit", () => {
    ready = false;
    cameraId = null;
    snapshot = { status: "unavailable", detections: [] };
    if (!closing) setTimeout(boot, 3000);
  });
}
boot();
const watchdog = setInterval(() => {
  if (ready && cameraId && snapshot.at && Date.now() - snapshot.at > 30000)
    child.kill("SIGKILL");
}, 5000);
const server = createServer(async (req, res) => {
  const send = (d, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(d));
  };
  if (req.url === "/health") return send({ ready }, ready ? 200 : 503);
  const a = Buffer.from(req.headers.authorization || ""),
    b = Buffer.from("Bearer " + secret);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    return send({ error: "Forbidden" }, 403);
  try {
    if (req.method === "GET" && req.url.startsWith("/snapshot?")) {
      const id = Number(
        new URL(req.url, "http://internal").searchParams.get("cameraId"),
      );
      return send(
        cameraId === id
          ? snapshot
          : { status: ready ? "disconnected" : "starting", detections: [] },
      );
    }
    if (req.method === "POST" && req.url === "/enroll") {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 4096) return send({ error: "Too large" }, 413);
      }
      const b = JSON.parse(raw);
      const admin = await pool.query(
        "SELECT 1 FROM Usuario u JOIN hg_memberships m ON m.user_id=u.id JOIN hg_sessions a ON a.user_id=u.id AND a.household_id=m.household_id WHERE u.id=$1 AND u.activo AND m.enabled AND m.role='ADMINISTRADOR' AND m.household_id=$2 AND a.id=$3 AND a.revoked_at IS NULL AND a.expires_at>NOW()",
        [b.userId, b.householdId, b.authSessionId],
      );
      if (!admin.rowCount) return send({ error: "Forbidden" }, 403);
      if (!child.connected)
        return send({ error: "Análisis no disponible" }, 503);
      if (cameraId !== b.cameraId)
        return send(
          { error: "La cámara no tiene una transmisión activa" },
          409,
        );
      if (b.action === "cancel") {
        child.send(b);
        return send({ ok: true });
      }
      if (
        b.action !== "enroll" ||
        cameraId !== b.cameraId ||
        !snapshot.at ||
        Date.now() - snapshot.at > 5000 ||
        b.consent !== true ||
        typeof b.name !== "string" ||
        !b.name.trim() ||
        b.name.length > 100
      )
        return send(
          { error: "Inicia una transmisión antes de registrar" },
          409,
        );
      child.send(b);
      return send({ ok: true });
    }
    return send({ error: "Not found" }, 404);
  } catch {
    return send({ error: "Servicio no disponible" }, 503);
  }
}).listen(8090, "0.0.0.0");
async function shutdown() {
  closing = true;
  clearInterval(watchdog);
  server.close();
  child.kill("SIGTERM");
  setTimeout(() => {
    child.kill("SIGKILL");
    process.exit(0);
  }, 9000).unref();
  await pool.end();
  child.once("exit", () => process.exit(0));
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
