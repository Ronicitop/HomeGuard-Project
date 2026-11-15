import pool from '../db';
import {withTransaction} from '../db/transaction';
import {assertPermission,type AuthContext} from '../auth/permissions';
import {fail} from '../http/errors';
import {audit,emit} from '../audit/auditService';
import type {EventStatus} from '../../../contracts/types';
export async function listEvents(ctx:AuthContext,filter:Record<string,string>={},cursor:string|null=null,limit=20){
 assertPermission(ctx,'events.read');limit=Math.min(100,Math.max(1,Number(limit)||20));
 const args:any[]=[ctx.household_id];const where=['e.household_id=$1'];
 for(const field of ['category','status','severity','source','camera_id'])if(filter[field]){args.push(filter[field]);where.push(`e.${field}=$${args.length}`);}
 if(filter.search){args.push(`%${filter.search.slice(0,100).replace(/[\\%_]/g,'\\$&')}%`);where.push(`e.summary ILIKE $${args.length}`);}
 if(cursor){try{const c=JSON.parse(Buffer.from(cursor,'base64url').toString());if(!/^[a-f0-9-]{36}$/.test(c.id)||!Number.isFinite(Date.parse(c.date)))throw 0;args.push(c.date,c.id);where.push(`(e.occurred_at,e.id)<($${args.length-1}::timestamptz,$${args.length}::uuid)`);}catch{fail(400,'INVALID_CURSOR','La página solicitada no es válida.');}}
 args.push(limit+1);const rows=(await pool.query(`SELECT e.*,CASE WHEN NOT COALESCE((e.decisions->>'clip_requested')::boolean,false) THEN 'NOT_REQUESTED' WHEN EXISTS(SELECT 1 FROM hg_outbox j WHERE j.event_id=e.id AND j.kind='CLIP' AND j.status='FAILED') THEN 'FAILED' ELSE 'PENDING' END AS clip_status FROM hg_events e WHERE ${where.join(' AND ')} ORDER BY e.occurred_at DESC,e.id DESC LIMIT $${args.length}`,args)).rows;
 const more=rows.length>limit;const items=rows.slice(0,limit);const last=items.at(-1);
 return {items,next_cursor:more?Buffer.from(JSON.stringify({date:new Date(last.occurred_at).toISOString(),id:last.id})).toString('base64url'):null};
}
export async function getEvent(ctx:AuthContext,id:string){
 assertPermission(ctx,'events.read');const event=(await pool.query('SELECT * FROM hg_events WHERE id=$1 AND household_id=$2',[id,ctx.household_id])).rows[0];if(!event)fail(404,'NOT_FOUND','No se encontró el evento.');
 const notifications=(await pool.query('SELECT id,status,error_code,created_at FROM hg_notifications WHERE event_id=$1 AND household_id=$2 AND (user_id=$3 OR $4)',[id,ctx.household_id,ctx.user_id,ctx.role==='ADMINISTRADOR'])).rows;
 const jobs=(await pool.query('SELECT id,kind,status,error_code,created_at FROM hg_outbox WHERE event_id=$1 AND household_id=$2',[id,ctx.household_id])).rows;
 return {...event,notifications,jobs,clip_status:!event.decisions.clip_requested?'NOT_REQUESTED':jobs.some(j=>j.kind==='CLIP'&&j.status==='FAILED')?'FAILED':'PENDING'};
}
export async function transitionEvent(ctx:AuthContext,id:string,status:EventStatus,expectedRevision:number){
 assertPermission(ctx,'events.update');if(!['NEW','ACKNOWLEDGED','RESOLVED','FALSE_POSITIVE'].includes(status))fail(400,'INVALID_STATUS','Estado no válido.');
 return withTransaction(async tx=>{
  const before=(await tx.query('SELECT * FROM hg_events WHERE id=$1 AND household_id=$2 FOR UPDATE',[id,ctx.household_id])).rows[0];if(!before)fail(404,'NOT_FOUND','No se encontró el evento.');
  if(before.revision!==expectedRevision)fail(409,'REVISION_CONFLICT','El evento cambió. Actualizá la página.');
  const result=(await tx.query('UPDATE hg_events SET status=$3,revision=revision+1 WHERE id=$1 AND household_id=$2 RETURNING *',[id,ctx.household_id,status])).rows[0];
  await audit(tx,ctx,'event.status_changed',id,{status:before.status},{status});await emit(tx,ctx.household_id,'event.updated',id);return result;
 });
}
export async function readSse(ctx:AuthContext,lastSequence:string){
 assertPermission(ctx,'events.read');if(!/^\d{1,18}$/.test(lastSequence))fail(400,'INVALID_CURSOR','Cursor de actualizaciones inválido.');
 const min=(await pool.query('SELECT min(sequence)::text id FROM hg_sse_log WHERE household_id=$1 AND expires_at>now()',[ctx.household_id])).rows[0].id;
 const expired=lastSequence!=='0'&&min&&BigInt(lastSequence)<BigInt(min)-1n;
 const items=(await pool.query('SELECT * FROM hg_sse_log WHERE household_id=$1 AND sequence>$2::bigint AND expires_at>now() ORDER BY sequence LIMIT 100',[ctx.household_id,lastSequence])).rows;
 return {items,sync_required:Boolean(expired)};
}
