import { Pool } from "pg";
import { config } from "./config";

const pool = new Pool({ ...config.db, max: 10, connectionTimeoutMillis: 5000 });

export const query = (text: string, params?: any[]) => pool.query(text, params);
export default pool;
