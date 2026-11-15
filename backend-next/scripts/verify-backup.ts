import { Pool } from "pg";
import { spawnSync } from "node:child_process";
import { resolve, join, sep } from "node:path";
import { config } from "../lib/config";
async function main() {
  const file = resolve(process.argv[2] || "");
  const root = resolve("../.local/backups") + sep;
  if (!file.startsWith(root) || !file.endsWith(".dump"))
    throw new Error("Usa un dump del directorio de respaldos.");
  const name = "homeguard_restore_test";
  const admin = new Pool({ ...config.db, database: "postgres" });
  try {
    if (
      (await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [name]))
        .rowCount
    )
      throw new Error(
        "La DB de verificacion ya existe; revisala antes de continuar.",
      );
    await admin.query(`CREATE DATABASE ${name}`);
    const result = spawnSync(
      join(
        process.env.HG_PG_BIN || "C:/Program Files/PostgreSQL/18/bin",
        "pg_restore.exe",
      ),
      [
        "-h",
        config.db.host,
        "-p",
        String(config.db.port),
        "-U",
        config.db.user,
        "-d",
        name,
        "--exit-on-error",
        file,
      ],
      {
        windowsHide: true,
        encoding: "utf8",
        env: { ...process.env, PGPASSWORD: config.db.password },
      },
    );
    if (result.status !== 0)
      throw new Error("Fallo la restauracion de prueba.");
    const restored = new Pool({ ...config.db, database: name });
    try {
      console.log(
        `Restauracion verificada: ${(await restored.query("SELECT count(*)::int n FROM Usuario")).rows[0].n} usuarios. DB original intacta.`,
      );
    } finally {
      await restored.end();
    }
    await admin.query(`DROP DATABASE ${name}`);
  } finally {
    await admin.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
