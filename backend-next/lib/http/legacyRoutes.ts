import {z} from 'zod';
import pool from '../db';
import {requireSession,currentUser,assertOrigin} from '../auth/sessionService';
import {assertPermission} from '../auth/permissions';
import {body,json,cors,errorResponse} from './response';
import {authRoute} from './authRoutes';
import {platformRoutes} from './platformRoutes';
import {memberRoutes} from './memberRoutes';
import {getMode,setMode,requestActuatorCommand} from '../actuators/commandService';
import {fail} from './errors';
import {randomUUID} from 'node:crypto';
export async function legacyEndpoint(request:Request,path:string):Promise<Response>{
 try{
  assertOrigin(request);if(request.method==='OPTIONS')return cors(new Response(null,{status:204}),request);
  if(path==='auth/login'&&request.method==='POST'){
   const response=await authRoute(request,'auth/login');const data=await response!.json();return cors(json({...data,success:true,usuario:data.user},response!.status,response!.headers),request);
  }
  const ctx=await requireSession(request);let response:Response|null=null;
  if(path==='auth/me')response=json(await currentUser(ctx));
  if(path==='status')response=await platformRoutes(new Request(request.url),['legacy','status'],ctx);
  if(path==='mode'&&request.method==='POST'){
   const input=await body(request,z.object({modo:z.enum(['HOME','AWAY','DISARMED']),usuario_id:z.number().optional()}).strict());const before=await getMode(ctx);await setMode(ctx,input.modo,before.revision);response=json({success:true,modo:input.modo});
  }
  if(path==='actuators/command'&&request.method==='POST'){
   const input=await body(request,z.object({codigo:z.string().max(50),estado:z.enum(['ON','OFF']),usuario_id:z.number().optional()}).strict());
   response=json({success:true,command:await requestActuatorCommand(ctx,{code:input.codigo,state:input.estado,idempotency_key:request.headers.get('idempotency-key')||randomUUID()})},202);
  }
  if(path==='alerts/resolve'&&request.method==='POST'){
   assertPermission(ctx,'events.update');const input=await body(request,z.object({id_alerta:z.coerce.number().int().positive()}).strict());
   const row=await pool.query('UPDATE AlertaCorrelacionada SET resuelta=true WHERE id=$1 AND household_id=$2 RETURNING id',[input.id_alerta,ctx.household_id]);if(!row.rowCount)fail(404,'NOT_FOUND','No se encontró la alerta.');response=json({success:true});
  }
  if(path==='admin/devices'&&request.method==='GET'){const result=await platformRoutes(request,['legacy','devices'],ctx);response=json((await result!.json()).items);}
  if(path==='admin/thresholds'){
   assertPermission(ctx,request.method==='GET'?'health.read':'rules.configure');
   if(request.method==='GET'){const result=await platformRoutes(request,['legacy','thresholds'],ctx);response=json((await result!.json()).items);}
   if(request.method==='POST'){const input=await body(request,z.object({tipo_sensor:z.string().min(1).max(50),valor_minimo:z.number().finite().nullable(),valor_maximo:z.number().finite().nullable(),unidad:z.string().max(20)}).strict());if(input.valor_minimo!==null&&input.valor_maximo!==null&&input.valor_minimo>input.valor_maximo)fail(400,'INVALID_THRESHOLD','El mínimo supera el máximo.');await pool.query('INSERT INTO ConfiguracionUmbral(tipo_sensor,valor_minimo,valor_maximo,unidad,usuario_id,household_id) VALUES($1,$2,$3,$4,$5,$6)',[input.tipo_sensor,input.valor_minimo,input.valor_maximo,input.unidad,ctx.user_id,ctx.household_id]);response=json({success:true});}
  }
  if(path==='admin/users'&&request.method==='GET'){
   const result=await memberRoutes(request,['members'],ctx);const data=await result!.json();response=json({usuarios:data.items.map((u:any)=>({...u,rol:u.role,activo:u.enabled})),roles:(await pool.query('SELECT id,nombre,descripcion FROM Rol ORDER BY id')).rows});
  }
  if(path==='admin/users'&&request.method==='POST')fail(410,'USE_MEMBERS_API','Usá el módulo de miembros autenticado para registrar usuarios.');
  if(!response)fail(404,'NOT_FOUND','Ruta no disponible.');response.headers.set('Deprecation','true');return cors(response,request);
 }catch(error){return cors(errorResponse(error),request);}
}
