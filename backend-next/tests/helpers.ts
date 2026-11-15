import pool from "../lib/db";
import { applyMigrations } from "../lib/db/migrations";
import { resolve } from "node:path";
export { pool };
export const HOME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export async function resetDatabase() {
  const name = (await pool.query("SELECT current_database() name")).rows[0]
    .name;
  if (!name.endsWith("_test"))
    throw new Error("Refusing to reset non-test database");
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  await applyMigrations(pool, resolve("migrations"));
}
