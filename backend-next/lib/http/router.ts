import {ZodError} from 'zod';
import {authRoute} from './authRoutes';
import {eventRoutes} from './eventRoutes';
import {securityRoutes} from './securityRoutes';
import {emergencyRoutes} from './emergencyRoutes';
import {memberRoutes} from './memberRoutes';
import {platformRoutes} from './platformRoutes';
import {notificationRoutes} from './notificationRoutes';
import {requireSession,assertOrigin} from '../auth/sessionService';
import {cors,json,errorResponse} from './response';
import {AppError} from './errors';
export async function handleApi(request:Request,segments:string[]):Promise<Response>{
 try{
  assertOrigin(request);if(request.method==='OPTIONS')return cors(new Response(null,{status:204}),request);
  const auth=await authRoute(request,segments.join('/'));if(auth)return cors(auth,request);
  const ctx=await requireSession(request);
  for(const route of [eventRoutes,securityRoutes,emergencyRoutes,memberRoutes,platformRoutes,notificationRoutes]){const response=await route(request,segments,ctx);if(response)return cors(response,request);}
  return cors(json({error:{code:'NOT_FOUND',message:'El módulo solicitado no está disponible.'}},404),request);
 }catch(error){return cors(errorResponse(error instanceof ZodError?new AppError(400,'INVALID_INPUT','Los datos enviados no son válidos.'):error),request);}
}
