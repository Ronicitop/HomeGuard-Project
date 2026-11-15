import {z} from 'zod';
import pool from '../db';
import {type AuthContext,assertPermission} from '../auth/permissions';
import {getMode,setMode,requestActuatorCommand} from '../actuators/commandService';
import {body,json,revision} from './response';
export async function securityRoutes(request:Request,p:string[],ctx:AuthContext):Promise<Response|null>{
 if(p[0]==='mode'&&p.length===1){
  if(request.method==='GET')return json(await getMode(ctx));
  if(request.method==='PATCH'){const input=await body(request,z.object({mode:z.enum(['HOME','AWAY','DISARMED']),expected_revision:revision}).strict());return json(await setMode(ctx,input.mode,input.expected_revision));}
 }
 if(p[0]==='actuators'&&p.length===1&&request.method==='GET'){
  assertPermission(ctx,'actuators.read');const rows=(await pool.query('SELECT a.*,to_jsonb(c) AS last_command FROM Actuador a LEFT JOIN LATERAL(SELECT id,status,requested_state,confirmed_state,confirmation_source,created_at FROM hg_actuator_commands WHERE legacy_code=a.codigo AND household_id=$1 ORDER BY created_at DESC LIMIT 1)c ON true WHERE a.household_id=$1 ORDER BY a.id',[ctx.household_id])).rows;return json({items:rows,next_cursor:null});
 }
 if(p[0]==='actuators'&&p[2]==='commands'&&p.length===3&&request.method==='POST'){
  assertPermission(ctx,'actuators.command');const input=await body(request,z.object({state:z.enum(['ON','OFF'])}).strict());
  return json(await requestActuatorCommand(ctx,{code:p[1],state:input.state,idempotency_key:request.headers.get('idempotency-key')||''}),202);
 }
 return null;
}
