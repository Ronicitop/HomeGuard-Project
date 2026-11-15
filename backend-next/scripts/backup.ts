import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { config } from "../lib/config";
const directory = resolve("../.local/backups");
mkdirSync(directory, { recursive: true });
const filename = join(
  directory,
  `${config.db.database}-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`,
);
const binary = process.env.HG_PG_BIN || "C:/Program Files/PostgreSQL/18/bin";
const result = spawnSync(
  join(binary, "pg_dump.exe"),
  [
    "-h",
    config.db.host,
    "-p",
    String(config.db.port),
    "-U",
    config.db.user,
    "-d",
    config.db.database,
    "-Fc",
    "-f",
    filename,
  ],
  {
    windowsHide: true,
    env: { ...process.env, PGPASSWORD: config.db.password },
    encoding: "utf8",
  },
);
if (result.status !== 0) {
  console.error("No se pudo generar el respaldo.");
  process.exit(1);
}
console.log(`Respaldo guardado: ${filename}`);
