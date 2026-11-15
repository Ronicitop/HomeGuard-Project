import type { Pool } from "pg";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
export async function applyMigrations(
  pool: Pool,
  directory: string,
): Promise<{ applied: string[]; deferred: string[] }> {
  const client = await pool.connect();
  const applied: string[] = [];
  const deferred: string[] = [];
  try {
    await client.query("SELECT pg_advisory_lock(716403991)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS hg_schema_migrations(version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const version of (await readdir(directory))
      .filter((x) => /^\d+_.+\.sql$/.test(x))
      .sort()) {
      const original = await readFile(join(directory, version), "utf8");
      const sql = original.replace(/\r\n/g, "\n");
      const hash = (value: string) =>
        createHash("sha256").update(value).digest("hex");
      const checksum = hash(sql);
      const prior = await client.query(
        "SELECT checksum FROM hg_schema_migrations WHERE version=$1",
        [version],
      );
      if (prior.rowCount) {
        if (
          ![
            checksum,
            hash(original),
            hash(sql.replace(/\n/g, "\r\n")),
          ].includes(prior.rows[0].checksum)
        )
          throw new Error(`Migration checksum mismatch: ${version}`);
        if (prior.rows[0].checksum !== checksum)
          await client.query(
            "UPDATE hg_schema_migrations SET checksum=$2 WHERE version=$1",
            [version, checksum],
          );
        continue;
      }
      const requirements = [
        ...sql.matchAll(/^-- requires-table: ([a-z0-9_]+)$/gm),
      ].map((x) => x[1]);
      let missing = false;
      for (const table of requirements) {
        if (
          !(await client.query("SELECT to_regclass($1) AS t", [table])).rows[0]
            .t
        )
          missing = true;
      }
      if (missing) {
        deferred.push(version);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO hg_schema_migrations(version,checksum) VALUES ($1,$2)",
          [version, checksum],
        );
        await client.query("COMMIT");
        applied.push(version);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    return { applied, deferred };
  } finally {
    await client.query("SELECT pg_advisory_unlock(716403991)").catch(() => {});
    client.release();
  }
}
