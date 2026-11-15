import pool from '../db';
import {type AuthContext,assertPermission} from '../auth/permissions';
import {tableAvailable} from '../integrations/vision';
import {json} from './response';
export async function platformRoutes(request:Request,p:string[],ctx:AuthContext):Promise<Response|null>{
 if(request.method!=='GET')return null;const path=p.join('/');
 if(path==='health'){
  assertPermission(ctx,'health.read');const services=(await pool.query('SELECT name,status,last_seen,details FROM hg_service_health')).rows.map(x=>({name:x.name,status:Date.now()-new Date(x.last_seen).getTime()>15000?'OFFLINE':x.status,last_seen:x.last_seen}));
  return json({database:'ONLINE',demo_mode:true,services,integrations:{vision:await tableAvailable(pool,'hg_cameras'),push:process.env.HG_PUSH_ENABLED==='true',voice:Boolean(process.env.HG_PIPER_MODEL),codex:'OWNED_BY_A'},pending_jobs:(await pool.query("SELECT count(*)::int n FROM hg_outbox WHERE household_id=$1 AND status IN ('QUEUED','RUNNING')",[ctx.household_id])).rows[0].n});
 }
 if(path==='dashboard'){
  assertPermission(ctx,'dashboard.read');const counts=(await pool.query("SELECT count(*)::int total,count(*) FILTER(WHERE status='NEW')::int new,count(*) FILTER(WHERE category='SECURITY' AND status='NEW')::int security,count(*) FILTER(WHERE category='EMERGENCY' AND status='NEW')::int emergency FROM hg_events WHERE household_id=$1",[ctx.household_id])).rows[0];
  const mode=(await pool.query('SELECT mode,revision FROM hg_modes WHERE household_id=$1',[ctx.household_id])).rows[0]||{mode:'AWAY',revision:0};
  const activeIncidents=ctx.role==='INVITADO'?[]:(await pool.query("SELECT id,state,response_deadline,state_revision FROM hg_emergency_incidents WHERE household_id=$1 AND state IN ('PENDING_RESPONSE','CALLING_SIMULATED','CONNECTED_SIMULATED','NEEDS_REVIEW') ORDER BY created_at DESC LIMIT 10",[ctx.household_id])).rows;
  return json({counts,mode,active_incidents:activeIncidents,timezone:'America/La_Paz',demo_mode:true});
 }
 if(path==='legacy/status'){
  assertPermission(ctx,'dashboard.read');const mode=(await pool.query('SELECT mode FROM hg_modes WHERE household_id=$1',[ctx.household_id])).rows[0]?.mode||'AWAY';
  if(ctx.role==='INVITADO')return json({modo:mode,dispositivos:[],alertasRecientes:[],energia:null,plano2D:[],actuadores:[]});
  const telemetria=(await pool.query('SELECT DISTINCT ON(t.tipo_sensor) t.* FROM TelemetriaSensor t JOIN DispositivoESP32 d ON d.device_id=t.device_id WHERE d.household_id=$1 ORDER BY t.tipo_sensor,t.fecha_registro DESC',[ctx.household_id])).rows;
  const alerts=(await pool.query('SELECT * FROM AlertaCorrelacionada WHERE household_id=$1 AND NOT resuelta ORDER BY fecha_hora DESC LIMIT 100',[ctx.household_id])).rows;
  const energy=(await pool.query('SELECT c.* FROM ConsumoElectrico c JOIN DispositivoESP32 d ON d.device_id=c.device_id WHERE d.household_id=$1 ORDER BY c.fecha_registro DESC LIMIT 1',[ctx.household_id])).rows[0]||null;
  return json({modo:mode,dispositivos:telemetria,alertasActivas:alerts.length,alertasRecientes:alerts,energia:energy,plano2D:(await pool.query('SELECT * FROM DispositivoUbicacion2D WHERE household_id=$1',[ctx.household_id])).rows,actuadores:(await pool.query('SELECT * FROM Actuador WHERE household_id=$1',[ctx.household_id])).rows});
 }
 if(path==='legacy/devices'){
  assertPermission(ctx,'health.read');return json({items:(await pool.query("SELECT *,CASE WHEN ultimo_heartbeat>now()-interval '60 seconds' THEN 'EN_LINEA' ELSE 'FUERA_DE_LINEA' END estado_conexion FROM DispositivoESP32 WHERE household_id=$1 ORDER BY device_id",[ctx.household_id])).rows,next_cursor:null});
 }
 if(path==='legacy/thresholds'){
  assertPermission(ctx,'health.read');return json({items:(await pool.query('SELECT * FROM ConfiguracionUmbral WHERE household_id=$1 ORDER BY id',[ctx.household_id])).rows,next_cursor:null});
 }
 return null;
}
