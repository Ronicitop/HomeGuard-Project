import pool from "../lib/db";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import "../lib/config";
async function main() {
  const checks: any[] = [];
  try {
    await pool.query("SELECT 1");
    checks.push({
      service: "PostgreSQL",
      status: "OK",
      detail: "Conexion autenticada",
    });
    for (const s of (
      await pool.query("SELECT name,status,last_seen FROM hg_service_health")
    ).rows)
      checks.push({
        service: s.name,
        status:
          Date.now() - new Date(s.last_seen).getTime() < 15000
            ? s.status
            : "OFFLINE",
        detail: "Latido persistido",
      });
    checks.push({
      service: "Vision/medios",
      status: (await pool.query("SELECT to_regclass('hg_cameras') t")).rows[0].t
        ? "INSTALLED"
        : "PENDING_A",
      detail: "Servicio de A",
    });
  } catch {
    checks.push({
      service: "PostgreSQL",
      status: "ERROR",
      detail: "Revisa DB_HOST/PORT/USER/PASS y servicio local",
    });
  }
  checks.push({
    service: "Voz Piper",
    status:
      existsSync(process.env.HG_PIPER_MODEL || "") &&
      existsSync(process.env.HG_PIPER_PYTHON || "")
        ? "READY"
        : "UNAVAILABLE",
    detail: "La transcripcion siempre sigue disponible",
  });
  checks.push({
    service: "Push Android",
    status:
      process.env.HG_PUSH_ENABLED === "true" ? "ENABLED" : "NOT_CONFIGURED",
    detail: "Requiere Expo/FCM y telefono",
  });
  checks.push({
    service: "Android SDK",
    status: existsSync(
      process.env.ANDROID_HOME ||
        resolve(process.env.LOCALAPPDATA || "", "Android/Sdk"),
    )
      ? "FOUND"
      : "MISSING",
    detail: "Export JS no equivale a APK",
  });
  checks.push({
    service: "Codex",
    status: "PENDING_A",
    detail: "Worker IA de A",
  });
  console.table(checks);
  console.log(
    "Demo: llamadas y actuadores simulados. LAN: IP privada, mismo WiFi, firewall limitado. DB/MQTT solo locales.",
  );
}
main().finally(() => pool.end());
