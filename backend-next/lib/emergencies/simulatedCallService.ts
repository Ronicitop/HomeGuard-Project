import {withTransaction} from '../db/transaction';
import {type AuthContext,assertPermission} from '../auth/permissions';
import {fail} from '../http/errors';
import {audit,emit} from '../audit/auditService';
import {getIncident} from './incidentService';
export async function acceptSimulatedCall(ctx:AuthContext,id:string,expectedRevision:number){
 assertPermission(ctx,'demo.operator');await withTransaction(async tx=>{
  const incident=(await tx.query('SELECT * FROM hg_emergency_incidents WHERE id=$1 AND household_id=$2 FOR UPDATE',[id,ctx.household_id])).rows[0];if(!incident)fail(404,'NOT_FOUND','No se encontró la emergencia.');
  if(incident.state_revision!==expectedRevision||incident.state!=='CALLING_SIMULATED')fail(409,'CALL_UNAVAILABLE','La llamada ya cambió o fue atendida.');
  const call=await tx.query("UPDATE hg_simulated_calls SET state='CONNECTED',accepted_at=now() WHERE incident_id=$1 AND state='RINGING' RETURNING id",[id]);if(!call.rowCount)fail(409,'CALL_UNAVAILABLE','La llamada no está disponible.');
  await tx.query("UPDATE hg_emergency_incidents SET state='CONNECTED_SIMULATED',operator_id=$2,state_revision=state_revision+1,updated_at=now() WHERE id=$1",[id,ctx.user_id]);
  await audit(tx,ctx,'simulated_call.accepted',id);await emit(tx,ctx.household_id,'emergency.updated',id);
 });return getIncident(ctx,id);
}
export async function closeIncident(ctx:AuthContext,id:string,expectedRevision:number){
 assertPermission(ctx,'demo.operator');await withTransaction(async tx=>{
  const incident=(await tx.query('SELECT * FROM hg_emergency_incidents WHERE id=$1 AND household_id=$2 FOR UPDATE',[id,ctx.household_id])).rows[0];if(!incident)fail(404,'NOT_FOUND','No se encontró la emergencia.');
  if(incident.state_revision!==expectedRevision||!['CONNECTED_SIMULATED','NEEDS_REVIEW','FAILED'].includes(incident.state))fail(409,'INVALID_TRANSITION','El estado actual no permite cerrar el incidente.');
  await tx.query("UPDATE hg_emergency_incidents SET state='CLOSED',state_revision=state_revision+1,updated_at=now() WHERE id=$1",[id]);await tx.query("UPDATE hg_simulated_calls SET state='CLOSED',closed_at=now() WHERE incident_id=$1 AND state='CONNECTED'",[id]);
  await audit(tx,ctx,'emergency.closed',id);await emit(tx,ctx.household_id,'emergency.updated',id);
 });return getIncident(ctx,id);
}
