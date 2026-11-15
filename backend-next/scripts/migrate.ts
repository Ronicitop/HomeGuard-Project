import pool from '../lib/db';
import { applyMigrations } from '../lib/db/migrations';
import { resolve } from 'node:path';
applyMigrations(pool,resolve('migrations')).then(report=>console.log(JSON.stringify(report))).catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>pool.end());
