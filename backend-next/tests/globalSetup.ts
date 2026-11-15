import { Pool } from "pg";
export default async function setup() {
  const name = process.env.HG_TEST_DB || "homeguard_b_test";
  if (!/^[a-z0-9_]+_test$/.test(name)) throw new Error("Unsafe test database");
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: "postgres",
  });
  try {
    const exists = await pool.query(
      "SELECT 1 FROM pg_database WHERE datname=$1",
      [name],
    );
    if (!exists.rowCount) await pool.query(`CREATE DATABASE "${name}"`);
  } finally {
    await pool.end();
  }
}
