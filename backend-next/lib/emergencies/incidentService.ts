import {randomUUID} from 'node:crypto';
import pool from '../db';
import {withTransaction} from '../db/transaction';
import {type AuthContext,assertPermission} from '../auth/permissions';
import {fail} from '../http/errors';
import {audit,emit} from '../audit/auditService';
import {idempotent} from '../http/idempotency';
import {startSimulatedCall} from './transitions';
export async function openIncident(event:any,policy:any,profile:any):Promise<any|null>{
 const e=event.evidence||{},span=Date.parse(e.visible_until)-Date.parse(e.visible_from);
 if(!policy?.enabled||policy.transport!=='SIMULATED'||!profile?.fictitious_data_confirmed||!profile.address||!profile.contact_name||!event.decisions?.emergency_requested||event.event_type!=='POSSIBLE_FALL'||e.observability!=='VISIBLE'||!Number.isFinite(span)||span<policy.immobility_seconds*1000||Number(e.immobility_seconds)<policy.immobility_seconds)return null;
 return withTransaction(async tx=>{
  const current=(await tx.query("SELECT e.* FROM hg_events e JOIN hg_households h ON h.id=e.household_id WHERE e.id=$1 AND h.demo_mode FOR UPDATE",[event.id])).rows[0];
  if(!current)fail(409,'DEMO_ONLY','Las llamadas de este sistema son únicamente simuladas.');
  const existing=(await tx.query('SELECT * FROM hg_emergency_incidents WHERE event_id=$1',[event.id])).rows[0];if(existing)return existing;
  const id=randomUUID();const incident=(await tx.query("INSERT INTO hg_emergency_incidents(id,household_id,event_id,state,response_deadline,policy_snapshot,profile_snapshot) VALUES($1,$2,$3,'PENDING_RESPONSE',$4,$5,$6) RETURNING *",[id,event.household_id,event.id,new Date(Date.now()+policy.response_seconds*1000),JSON.stringify(policy),JSON.stringify(profile)])).rows[0];
  await emit(tx,event.household_id,'emergency.updated',id);return incident;
 });
}
export async function getIncident(ctx:AuthContext,id:string){
 assertPermission(ctx,'emergencies.read');const row=(await pool.query('SELECT * FROM hg_emergency_incidents WHERE id=$1 AND household_id=$2',[id,ctx.household_id])).rows[0];if(!row)fail(404,'NOT_FOUND','No se encontró la emergencia.');
 const call=(await pool.query('SELECT id,state,audio_status,transcript,created_at,accepted_at FROM hg_simulated_calls WHERE incident_id=$1 AND household_id=$2',[id,ctx.household_id])).rows[0]||null;
 return {...row,profile_snapshot:ctx.role==='ADMINISTRADOR'?row.profile_snapshot:undefined,call:call?{...call,transcript:ctx.role==='ADMINISTRADOR'?call.transcript:undefined}:null};
}
export async function respondIncident(ctx:AuthContext,id:string,body:{response:'I_AM_OK'|'REQUEST_HELP';expected_revision:number},key:string){
 assertPermission(ctx,'emergencies.respond');if(!['I_AM_OK','REQUEST_HELP'].includes(body.response))fail(400,'INVALID_RESPONSE','Respuesta no válida.');
 await withTransaction(async tx=>idempotent(tx,ctx,`emergency.respond:${id}`,key,body,async()=>{
  const row=(await tx.query('SELECT * FROM hg_emergency_incidents WHERE id=$1 AND household_id=$2 FOR UPDATE',[id,ctx.household_id])).rows[0];if(!row)fail(404,'NOT_FOUND','No se encontró la emergencia.');
  if(row.state_revision!==body.expected_revision)fail(409,'REVISION_CONFLICT','La emergencia cambió. Volvé a consultar su estado.');
  if(['CANCELLED','CLOSED','FAILED'].includes(row.state))fail(409,'INCIDENT_CLOSED','El incidente ya terminó.');
  if(body.response==='I_AM_OK'){
   if(row.state==='CONNECTED_SIMULATED')await tx.query('UPDATE hg_emergency_incidents SET cancellation_requested=true,state_revision=state_revision+1,updated_at=now() WHERE id=$1',[id]);
   else{await tx.query("UPDATE hg_emergency_incidents SET state='CANCELLED',state_revision=state_revision+1,updated_at=now() WHERE id=$1",[id]);await tx.query("UPDATE hg_simulated_calls SET state='CANCELLED',closed_at=now() WHERE incident_id=$1 AND state='RINGING'",[id]);}
  }else{
   if(!['PENDING_RESPONSE','NEEDS_REVIEW'].includes(row.state))fail(409,'ALREADY_ESCALATED','La central simulada ya tiene el aviso.');
   await startSimulatedCall(tx,row);
  }
  await audit(tx,ctx,'emergency.responded',id,{state:row.state},{response:body.response});await emit(tx,ctx.household_id,'emergency.updated',id);
  return (await tx.query('SELECT state,state_revision FROM hg_emergency_incidents WHERE id=$1',[id])).rows[0];
 }));
 return getIncident(ctx,id);
}
export async function advanceDueIncidents(now:Date){
 return withTransaction(async tx=>{
  const due=(await tx.query("SELECT i.* FROM hg_emergency_incidents i JOIN hg_emergency_policies p ON p.household_id=i.household_id WHERE i.state='PENDING_RESPONSE' AND i.response_deadline<=$1 AND p.enabled FOR UPDATE OF i SKIP LOCKED",[now])).rows;
  for(const incident of due)await startSimulatedCall(tx,incident);return {advanced:due.length};
 });
}
export async function recoverAfterRestart(startedAt:Date){
 return withTransaction(async tx=>{
  const affected=(await tx.query("UPDATE hg_emergency_incidents SET state='NEEDS_REVIEW',state_revision=state_revision+1,updated_at=now() WHERE state='PENDING_RESPONSE' AND response_deadline<=$1 RETURNING id,household_id",[startedAt])).rows;
  for(const i of affected)await emit(tx,i.household_id,'emergency.updated',i.id);return {needs_review:affected.length};
 });
}
