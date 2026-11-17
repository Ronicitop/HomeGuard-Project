import { expireStreams } from "../lib/streams";
import pool, { query } from "../lib/db";
const t = setInterval(() => expireStreams().catch(console.error), 5000);
const clean = () =>
  query("DELETE FROM EventoCamara WHERE fecha<NOW()-interval '30 days'");
void clean().catch(console.error);
const daily = setInterval(() => clean().catch(console.error), 86400000);
for (const sig of ["SIGTERM", "SIGINT"])
  process.on(sig, async () => {
    clearInterval(t);
    clearInterval(daily);
    await pool.end();
    process.exit(0);
  });
