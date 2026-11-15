import {randomUUID} from 'node:crypto';
import {type AuthContext,assertPermission} from '../auth/permissions';
import {withTransaction} from '../db/transaction';
import {idempotent} from '../http/idempotency';
import {config} from '../config';
import {fail} from '../http/errors';
import {audit,emit} from '../audit/auditService';
import {enqueueJob} from '../jobs/outboxService';
export async function createDemoEvent(ctx:AuthContext,input:{scenario:string,notify_enabled:boolean,save_clip_enabled:boolean},key:string){
 assertPermission(ctx,'demo.manage');if(!config.demo)fail(403,'DEMO_DISABLED','El modo de demostración no está habilitado.');
 return withTransaction(async tx=>idempotent(tx,ctx,'demo.event',key,input,async()=>{
  const household=(await tx.query('SELECT demo_mode FROM hg_households WHERE id=$1',[ctx.household_id])).rows[0];if(!household?.demo_mode)fail(403,'DEMO_DISABLED','La vivienda no está en modo demostración.');
  const fall=input.scenario==='POSSIBLE_FALL',now=new Date();const id=randomUUID();
  const decisions={demo:true,notify_requested:input.notify_enabled,clip_requested:input.save_clip_enabled,alarm_requested:false,emergency_requested:fall,source:'SIMULATED',decided_at:now.toISOString()};
  const evidence=fall?{observability:'VISIBLE',immobility_seconds:10,visible_from:new Date(now.getTime()-10000).toISOString(),visible_until:now.toISOString(),synthetic:true}:{synthetic:true,observability:'VISIBLE'};
  const event=(await tx.query("INSERT INTO hg_events(id,household_id,source,category,event_type,severity,summary,occurred_at,decisions,evidence,producer) VALUES($1,$2,'SIMULATED',$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",[id,ctx.household_id,fall?'EMERGENCY':input.scenario==='SYSTEM'?'SYSTEM':'SECURITY',input.scenario,fall?'CRITICAL':'WARNING',fall?'Simulación: posible caída e inmovilidad observada.':input.scenario==='INTRUSION'?'Simulación: ingreso en una zona protegida.':'Simulación: aviso de prueba del sistema.',now,JSON.stringify(decisions),JSON.stringify(evidence),JSON.stringify({name:'homeguard-demo',version:'1.0'})])).rows[0];
  for(const [flag,kind] of [['notify_requested','PUSH'],['clip_requested','CLIP'],['emergency_requested','EMERGENCY']] as const)if(decisions[flag])await enqueueJob(tx,{household_id:ctx.household_id,event_id:id,kind,payload:{event_id:id,source:'SIMULATED'},idempotency_key:`${id}:${kind}`});
  await audit(tx,ctx,'demo.event_created',id,null,{scenario:input.scenario,source:'SIMULATED'});await emit(tx,ctx.household_id,'event.created',id);return event;
 }));
}
