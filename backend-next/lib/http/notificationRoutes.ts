import {z} from 'zod';
import pool from '../db';
import {type AuthContext,assertPermission} from '../auth/permissions';
import {body,json,uuid,revision} from './response';
import {registerPushDevice} from '../notifications/deliveryService';
import {withTransaction} from '../db/transaction';
import {fail} from './errors';
export async function notificationRoutes(request:Request,p:string[],ctx:AuthContext):Promise<Response|null>{
 const path=p.join('/');if(!['push-devices','notification-preferences'].includes(path))return null;assertPermission(ctx,'notifications.manage');
 if(path==='push-devices'){
  if(request.method==='GET')return json({items:(await pool.query('SELECT id,installation_id,platform,enabled,last_seen FROM hg_push_devices WHERE household_id=$1 AND user_id=$2 ORDER BY last_seen DESC',[ctx.household_id,ctx.user_id])).rows,next_cursor:null});
  if(request.method==='POST'){const input=await body(request,z.object({installation_id:uuid,token:z.string().min(10).max(500),platform:z.literal('android')}).strict());return json(await registerPushDevice(ctx,input),201);}
  if(request.method==='DELETE'){const input=await body(request,z.object({installation_id:uuid}).strict());await pool.query('UPDATE hg_push_devices SET enabled=false WHERE household_id=$1 AND user_id=$2 AND installation_id=$3',[ctx.household_id,ctx.user_id,input.installation_id]);return json({success:true});}
 }
 if(path==='notification-preferences'){
  if(request.method==='GET')return json((await pool.query('SELECT categories,quiet_start,quiet_end,critical_demo_override,revision FROM hg_notification_preferences WHERE household_id=$1 AND user_id=$2',[ctx.household_id,ctx.user_id])).rows[0]||{categories:['SECURITY','MOVEMENT','EMERGENCY','SYSTEM'],quiet_start:null,quiet_end:null,critical_demo_override:false,revision:0});
  if(request.method==='PATCH'){
   const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable();
   const input=await body(request,z.object({categories:z.array(z.enum(['SECURITY','MOVEMENT','EMERGENCY','SYSTEM'])).max(4),quiet_start:time,quiet_end:time,critical_demo_override:z.boolean(),expected_revision:revision}).strict());
   if(Boolean(input.quiet_start)!==Boolean(input.quiet_end))fail(400,'INCOMPLETE_QUIET_HOURS','Completá el inicio y el fin del horario silencioso.');
   const result=await withTransaction(async tx=>{await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${ctx.household_id}:${ctx.user_id}:preferences`]);const old=(await tx.query('SELECT revision FROM hg_notification_preferences WHERE household_id=$1 AND user_id=$2',[ctx.household_id,ctx.user_id])).rows[0];if((old?.revision||0)!==input.expected_revision)fail(409,'REVISION_CONFLICT','Las preferencias cambiaron. Volvé a cargarlas.');return (await tx.query('INSERT INTO hg_notification_preferences(household_id,user_id,categories,quiet_start,quiet_end,critical_demo_override) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(household_id,user_id) DO UPDATE SET categories=excluded.categories,quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end,critical_demo_override=excluded.critical_demo_override,revision=hg_notification_preferences.revision+1 RETURNING categories,quiet_start,quiet_end,critical_demo_override,revision',[ctx.household_id,ctx.user_id,input.categories,input.quiet_start,input.quiet_end,input.critical_demo_override])).rows[0];});return json(result);
  }
 }
 return null;
}
