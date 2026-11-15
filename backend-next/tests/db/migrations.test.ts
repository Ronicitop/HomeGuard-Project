import { Pool } from 'pg';
import { beforeAll, afterAll, expect, test } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyMigrations } from '../../lib/db/migrations';
let pool: Pool; let dir: string;
beforeAll(async () => {
 pool=new Pool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USER,password:process.env.DB_PASS,database:process.env.DB_NAME});
 const name=(await pool.query('select current_database() as name')).rows[0].name;
 if(!name.endsWith('_test')) throw new Error('Test database required');
 await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
 dir=await mkdtemp(join(tmpdir(),'hg-migrations-'));
});
afterAll(async()=>{await pool.end();await rm(dir,{recursive:true,force:true});});
test('applies a migration once and preserves data on repeated runs',async()=>{
 await writeFile(join(dir,'001_probe.sql'),'CREATE TABLE probe(id integer PRIMARY KEY); INSERT INTO probe VALUES (7);');
 const first=await applyMigrations(pool,dir); expect(first.applied).toEqual(['001_probe.sql']);
 expect((await applyMigrations(pool,dir)).applied).toEqual([]);
 expect((await pool.query('SELECT id FROM probe')).rows).toEqual([{id:7}]);
});
test('rejects modified checksums instead of silently rerunning',async()=>{
 await writeFile(join(dir,'001_probe.sql'),'CREATE TABLE changed(id int);');
 await expect(applyMigrations(pool,dir)).rejects.toThrow(/checksum/i);
 await writeFile(join(dir,'001_probe.sql'),'CREATE TABLE probe(id integer PRIMARY KEY); INSERT INTO probe VALUES (7);');
});
test('rolls back failed migration and never records it as applied',async()=>{
 await writeFile(join(dir,'002_bad.sql'),'CREATE TABLE rollback_probe(id int); SELECT missing_column FROM probe;');
 await expect(applyMigrations(pool,dir)).rejects.toThrow();
 expect((await pool.query("SELECT to_regclass('rollback_probe') as t")).rows[0].t).toBeNull();
 expect((await pool.query("SELECT 1 FROM hg_schema_migrations WHERE version='002_bad.sql'")).rowCount).toBe(0);
 await rm(join(dir,'002_bad.sql'));
});
test('serializes concurrent migration runners',async()=>{
 await writeFile(join(dir,'003_concurrent.sql'),'CREATE TABLE concurrent_probe(id int);');
 const runs=await Promise.all([applyMigrations(pool,dir),applyMigrations(pool,dir)]);
 expect(runs.flatMap(x=>x.applied)).toEqual(['003_concurrent.sql']);
});
