const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { scryptSync, timingSafeEqual, createHash } = require("node:crypto");
const { networkInterfaces } = require("node:os");
const { createRequire } = require("node:module");
const backendRequire = createRequire(
  join(__dirname, "../backend-next/package.json"),
);
backendRequire("dotenv").config({
  path: join(__dirname, "../backend-next/.env.local"),
  quiet: true,
});
const { Pool } = backendRequire("pg");
const pool = new Pool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 55432),
  user: process.env.DB_USER || "homeguard",
  password: process.env.DB_PASS,
  database: process.env.DB_NAME || "homeguard_db",
  max: 6,
  connectionTimeoutMillis: 3000,
});
const { allowed } = require("./mqtt-acl.cjs");
const aedes = require("aedes")({
  maxClientsIdLength: 128,
  connectTimeout: 5000,
});
const users = JSON.parse(
  readFileSync(
    process.env.HG_BROKER_USERS_FILE ||
      join(__dirname, "../.local/broker-users.json"),
    "utf8",
  ),
);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
async function deviceRow(id) {
  if (!uuid.test(id)) return null;
  return (
    await pool.query(
      "SELECT id,household_id,credential_hash,credential_generation FROM hg_connections WHERE id=$1 AND transport='MQTT' AND enabled AND deleted_at IS NULL",
      [id],
    )
  ).rows[0];
}
async function active(user) {
  const row = await deviceRow(user.connection_id);
  return (
    row &&
    row.household_id === user.household_id &&
    row.credential_generation === user.generation
  );
}
async function persistInput(user, topic, body) {
  if (!uuid.test(body.message_id || "")) throw deny();
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");
    await tx.query("SET LOCAL statement_timeout='4s'");
    const row = (
      await tx.query(
        "SELECT credential_generation FROM hg_connections WHERE id=$1 AND household_id=$2 AND transport='MQTT' AND enabled AND deleted_at IS NULL FOR UPDATE",
        [user.connection_id, user.household_id],
      )
    ).rows[0];
    if (!row || row.credential_generation !== user.generation) throw deny();
    if (
      (
        await tx.query(
          "SELECT count(*)::int n FROM hg_device_inbox WHERE connection_id=$1 AND processed_at IS NULL",
          [user.connection_id],
        )
      ).rows[0].n >= 600
    )
      throw deny();
    const result = await tx.query(
      "INSERT INTO hg_device_inbox(household_id,connection_id,credential_generation,message_id,kind,body) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(connection_id,message_id) DO UPDATE SET message_id=excluded.message_id WHERE hg_device_inbox.body=excluded.body AND hg_device_inbox.kind=excluded.kind AND hg_device_inbox.credential_generation=excluded.credential_generation RETURNING id",
      [
        user.household_id,
        user.connection_id,
        user.generation,
        body.message_id,
        topic.split("/")[5],
        JSON.stringify(body),
      ],
    );
    if (!result.rowCount) throw deny();
    await tx.query("COMMIT");
  } catch (e) {
    await tx.query("ROLLBACK");
    throw e;
  } finally {
    tx.release();
  }
}
const deny = () => new Error("MQTT operation denied");
aedes.authenticate = (client, username, password, done) => {
  void (async () => {
    if (!password || password.length > 256) return false;
    if (username?.startsWith("hg-device-")) {
      // Device sessions cannot retain subscriptions, queue commands, set wills or claim service IDs.
      if (client.clean !== true || client.id !== username || client._will)
        return false;
      const row = await deviceRow(username.slice(10));
      if (!row?.credential_hash) return false;
      const computed = createHash("sha256").update(password).digest(),
        expected = Buffer.from(row.credential_hash, "hex");
      if (
        expected.length !== computed.length ||
        !timingSafeEqual(expected, computed)
      )
        return false;
      client.hgUser = {
        role: "device",
        household_id: row.household_id,
        connection_id: row.id,
        generation: row.credential_generation,
      };
      return true;
    }
    const user = users.find((x) => x.username === username);
    if (!user) return false;
    const computed = scryptSync(password.toString(), user.salt, 32),
      expected = Buffer.from(user.hash, "hex");
    const ok =
      expected.length === computed.length &&
      timingSafeEqual(expected, computed);
    if (ok) client.hgUser = user;
    return ok;
  })().then(
    (ok) => done(null, ok),
    () => done(null, false),
  );
};
aedes.authorizePublish = (client, packet, done) => {
  void (async () => {
    if (
      !client ||
      packet.payload.length > 65536 ||
      packet.retain ||
      !allowed(client.hgUser, packet.topic, "publish")
    )
      throw deny();
    const user = client.hgUser;
    if (user.role === "device") {
      if (!(await active(user))) throw deny();
      const now = Date.now();
      if (!client.hgWindow || now - client.hgWindow > 60000) {
        client.hgWindow = now;
        client.hgCount = 0;
      }
      if (++client.hgCount > 600) throw deny();
      const body = JSON.parse(packet.payload.toString());
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw deny();
      await persistInput(user, packet.topic, body);
      packet.payload = Buffer.from(
        JSON.stringify({ credential_generation: user.generation, body }),
      );
    } else if (packet.topic.includes("/devices/")) {
      const p = packet.topic.split("/"),
        data = JSON.parse(packet.payload.toString()),
        row = await deviceRow(p[4]);
      if (
        !row ||
        row.household_id !== p[2] ||
        row.credential_generation !== data.credential_generation ||
        !Number.isFinite(Date.parse(data.expires_at)) ||
        Date.parse(data.expires_at) <= Date.now()
      )
        throw deny();
      if (!uuid.test(data.command_id || "")) throw deny();
      const command = (
        await pool.query(
          "SELECT d.requested_state,d.credential_generation,ch.key FROM hg_device_commands d JOIN hg_connection_channels ch ON ch.id=d.channel_id WHERE d.id=$1 AND d.connection_id=$2 AND d.household_id=$3 AND d.status IN ('QUEUED','SENT') AND d.expires_at>clock_timestamp() AND ch.deleted_at IS NULL AND ch.kind='ACTUATOR'",
          [data.command_id, p[4], p[2]],
        )
      ).rows[0];
      if (
        !command ||
        command.requested_state !== data.state ||
        command.key !== data.channel ||
        command.credential_generation !== data.credential_generation
      )
        throw deny();
    }
  })().then(
    () => done(null),
    () => done(deny()),
  );
};
aedes.authorizeSubscribe = (client, subscription, done) => {
  void (async () => {
    if (!allowed(client.hgUser, subscription.topic, "subscribe")) return null;
    if (client.hgUser.role === "device" && !(await active(client.hgUser)))
      return null;
    return subscription;
  })().then(
    (s) => done(null, s),
    () => done(deny()),
  );
};
aedes.authorizeForward = (client, packet) => {
  if (client.hgUser?.role !== "device") return packet;
  if (!allowed(client.hgUser, packet.topic, "subscribe")) return null;
  try {
    const data = JSON.parse(packet.payload.toString());
    if (
      data.credential_generation !== client.hgUser.generation ||
      !Number.isFinite(Date.parse(data.expires_at)) ||
      Date.parse(data.expires_at) <= Date.now()
    )
      return null;
  } catch {
    return null;
  }
  return packet;
};
// Revoke idle subscribers too. Each publication and subscription also checks the database.
let auditing = false;
const timer = setInterval(async () => {
  if (auditing) return;
  auditing = true;
  try {
    for (const c of Object.values(aedes.clients))
      if (c.hgUser?.role === "device" && !(await active(c.hgUser))) c.close();
  } catch {
    for (const c of Object.values(aedes.clients))
      if (c.hgUser?.role === "device") c.close();
  } finally {
    auditing = false;
  }
}, 2000);
const host = process.env.HG_MQTT_LAN_IP;
if (
  host &&
  (!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
    !Object.values(networkInterfaces())
      .flat()
      .some((a) => a?.address === host))
) {
  console.error("MQTT: seleccioná una IP privada asignada a esta PC.");
  process.exit(1);
}
const servers = ["127.0.0.1", ...(host ? [host] : [])].map((address) => {
  const server = require("node:net").createServer(aedes.handle);
  server.on("error", () => {
    console.error("MQTT no pudo iniciar; revisá la interfaz y el puerto.");
    stop(1);
  });
  server.listen(Number(process.env.HG_MQTT_PORT || 1883), address, () =>
    console.log(`HomeGuard MQTT autenticado en ${address}.`),
  );
  return server;
});
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  for (const server of servers) server.close();
  aedes.close(() => void pool.end().finally(() => process.exit(code)));
  setTimeout(() => process.exit(code), 3000).unref();
}
process.on("SIGTERM", () => stop());
process.on("SIGINT", () => stop());
