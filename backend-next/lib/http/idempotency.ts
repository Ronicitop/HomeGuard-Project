import type {PoolClient} from 'pg';
import type {AuthContext} from '../auth/permissions';
import {createHash} from 'node:crypto';
import {fail} from './errors';
function canonical(value:any):any{return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;}
export async function idempotent<T>(tx:PoolClient,ctx:AuthContext,operation:string,key:string,body:unknown,fn:()=>Promise<T>):Promise<T>{
 if(!key||key.length>128)fail(400,'IDEMPOTENCY_KEY_REQUIRED','Falta una clave válida de operación.');
 const scopedOperation=`${ctx.user_id}:${operation}`;const hash=createHash('sha256').update(JSON.stringify(canonical(body))).digest('hex');
 await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${ctx.household_id}:${scopedOperation}:${key}`]);
 const row=(await tx.query('SELECT * FROM hg_idempotency WHERE household_id=$1 AND operation=$2 AND key=$3 AND expires_at>now()',[ctx.household_id,scopedOperation,key])).rows[0];
 if(row){if(row.body_hash!==hash)fail(409,'IDEMPOTENCY_CONFLICT','La misma clave se usó para una solicitud diferente.');return row.response;}
 const response=await fn();await tx.query('INSERT INTO hg_idempotency(household_id,operation,key,body_hash,response) VALUES($1,$2,$3,$4,$5) ON CONFLICT(household_id,operation,key) DO UPDATE SET body_hash=excluded.body_hash,response=excluded.response,expires_at=excluded.expires_at',[ctx.household_id,scopedOperation,key,hash,JSON.stringify(response)]);return response;
}
