import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
import { Pool } from 'pg';
const pool = new Pool({
    max: Number(process.env.DB_POOL_MAX || 5),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'postgres',
    database: process.env.DB_NAME || 'homeguard_db',
});
export const query = (text: string, params?: any[]) => pool.query(text, params);
export default pool;
