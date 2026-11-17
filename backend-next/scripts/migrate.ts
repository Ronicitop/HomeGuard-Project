import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
import fs from 'node:fs';
import pool, { query } from '../lib/db';
import { hashPassword } from '../lib/password';
async function main() { await query(fs.readFileSync('migrations/001-cameras.sql', 'utf8')); await query(fs.readFileSync('migrations/002-streams.sql','utf8')); await query(fs.readFileSync('migrations/003-server-vision.sql','utf8')); const c = await pool.connect(); try {
    await c.query('BEGIN');
    await c.query("SELECT pg_advisory_xact_lock(817241)");
    const done = await c.query("SELECT 1 FROM Migracion WHERE nombre='password-hashes'");
    if (!done.rowCount) {
        const users = await c.query('SELECT id,password_hash FROM Usuario');
        for (const u of users.rows)
            if (!u.password_hash.startsWith('scrypt$'))
                await c.query('UPDATE Usuario SET password_hash=$1 WHERE id=$2', [hashPassword(u.password_hash), u.id]);
        await c.query("INSERT INTO Migracion(nombre) VALUES('password-hashes')");
    }
    if (process.env.ADMIN_PASSWORD) {
        await c.query('UPDATE Usuario SET email=$1,password_hash=$2 WHERE id=1', [process.env.ADMIN_EMAIL, hashPassword(process.env.ADMIN_PASSWORD)]);
    }
    await c.query('COMMIT');
}
catch (e) {
    await c.query('ROLLBACK');
    throw e;
}
finally {
    c.release();
    await pool.end();
} }
main().catch(e => { console.error(e); process.exitCode = 1; });
