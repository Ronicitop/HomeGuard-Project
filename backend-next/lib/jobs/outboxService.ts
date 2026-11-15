import type {PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {withTransaction} from '../db/transaction';
import pool from '../db';
import {fail} from '../http/errors';
export async function enqueueJob(tx:PoolClient,input:{household_id:string,event_id?:string,kind:string,payload:unknown,idempotency_key:string}){
 const id=randomUUID();const row=await tx.query('INSERT INTO hg_outbox(id,household_id,event_id,kind,payload,idempotency_key) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(idempotency_key) DO UPDATE SET idempotency_key=excluded.idempotency_key RETURNING *',[id,input.household_id,input.event_id||null,input.kind,JSON.stringify(input.payload),input.idempotency_key]);return row.rows[0];
}
export async function claimJobs(workerId:string,now:Date,limit:number):Promise<any[]>{
 return withTransaction(async tx=>(await tx.query("WITH due AS (SELECT id FROM hg_outbox WHERE attempts<4 AND ((status='QUEUED' AND next_attempt_at<=$2) OR (status='RUNNING' AND lease_until<$2)) ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT $3) UPDATE hg_outbox j SET status='RUNNING',attempts=attempts+1,lease_owner=$1,lease_until=$2::timestamptz+interval '60 seconds',updated_at=$2 FROM due WHERE j.id=due.id RETURNING j.*",[workerId,now,Math.min(100,Math.max(1,limit))])).rows);
}
export async function finishJob(id:string,owner:string,status:'COMPLETED'|'FAILED'|'UNKNOWN'|'CANCELLED',errorCode?:string):Promise<void>{
 const result=await pool.query("UPDATE hg_outbox SET status=$3,error_code=$4,lease_until=NULL,lease_owner=NULL,updated_at=now() WHERE id=$1 AND lease_owner=$2 AND status='RUNNING'",[id,owner,status,errorCode||null]);
 if(!result.rowCount)fail(409,'JOB_LEASE_LOST','El trabajo ya no pertenece a este proceso.');
}
export async function renewJob(id:string,owner:string){return (await pool.query("UPDATE hg_outbox SET lease_until=now()+interval '60 seconds',updated_at=now() WHERE id=$1 AND lease_owner=$2 AND status='RUNNING'",[id,owner])).rowCount===1;}
export async function retryJob(id:string,owner:string,errorCode:string){
 await pool.query("UPDATE hg_outbox SET status=CASE WHEN attempts>=4 THEN 'FAILED' ELSE 'QUEUED' END,error_code=$3,next_attempt_at=now()+ CASE attempts WHEN 1 THEN interval '1 second' WHEN 2 THEN interval '5 seconds' ELSE interval '15 seconds' END,lease_owner=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND lease_owner=$2 AND status='RUNNING'",[id,owner,errorCode]);
}
