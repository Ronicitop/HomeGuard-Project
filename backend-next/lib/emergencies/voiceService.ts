import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,rename,unlink,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import pool from '../db';
import {fail} from '../http/errors';
import {emit} from '../audit/auditService';
import {withTransaction} from '../db/transaction';
export function buildIncidentSpeech(incident:{profile_snapshot:any;created_at:string|Date;state:string}):string{
 const p=incident.profile_snapshot||{};const time=new Intl.DateTimeFormat('es-BO',{timeZone:'America/La_Paz',hour:'2-digit',minute:'2-digit'}).format(new Date(incident.created_at));
 return `Este es un aviso automatizado de HomeGuard en modo demostración. Se observó una posible caída, a las ${time}. Dirección de prueba: ${String(p.address||'sin configurar').slice(0,300)}. Responsable de prueba: ${String(p.contact_name||'sin configurar').slice(0,100)}. No se recibió confirmación de bienestar. Este aviso corresponde a una central simulada.`;
}
export const voiceDirectory=()=>resolve(process.env.HG_VOICE_CACHE||'../.local/private-voice');
export async function renderCallSpeech(callId:string,home:string){
 if(!/^[0-9a-f-]{36}$/i.test(callId))fail(400,'INVALID_CALL','Identificador no válido.');
 const call=(await pool.query('SELECT * FROM hg_simulated_calls WHERE id=$1 AND household_id=$2',[callId,home])).rows[0];if(!call)fail(404,'NOT_FOUND','No se encontró la llamada.');
 if(call.audio_status==='READY')return;
 const python=process.env.HG_PIPER_PYTHON,model=process.env.HG_PIPER_MODEL;
 if(!python||!model){await pool.query("UPDATE hg_simulated_calls SET audio_status='UNAVAILABLE' WHERE id=$1",[callId]);return;}
 const directory=voiceDirectory();await mkdir(directory,{recursive:true});const output=join(directory,`${callId}.wav`),temporary=join(directory,`${callId}.pending.wav`);
 try{
  await new Promise<void>((yes,no)=>{
   const child=spawn(python,['-m','piper','--model',model,'--output_file',temporary],{windowsHide:true,stdio:['pipe','ignore','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8'}});
   let error='';child.stderr.on('data',chunk=>{error=(error+String(chunk)).slice(-2000);});
   const timer=setTimeout(()=>{child.kill();no(new Error('VOICE_TIMEOUT'));},45000);
   child.on('error',e=>{clearTimeout(timer);no(e);});child.on('close',code=>{clearTimeout(timer);code===0?yes():no(new Error('VOICE_SYNTHESIS_FAILED'));});
   child.stdin.on('error',()=>{});child.stdin.end(call.transcript+'\n','utf8');
  });
  const bytes=await readFile(temporary);if(bytes.length<44||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')throw new Error('VOICE_INVALID_AUDIO');
  await rename(temporary,output);await withTransaction(async tx=>{await tx.query("UPDATE hg_simulated_calls SET audio_status='READY',audio_ref=$2,attempts=attempts+1 WHERE id=$1",[callId,callId]);await emit(tx,home,'emergency.updated',call.incident_id);});
 }catch(error){await unlink(temporary).catch(()=>{});await pool.query("UPDATE hg_simulated_calls SET audio_status='FAILED',attempts=attempts+1 WHERE id=$1",[callId]);fail(503,'VOICE_SYNTHESIS_FAILED','La voz local no pudo generarse; la transcripción sigue disponible.');}
}
export async function readCallAudio(incidentId:string,home:string){
 const call=(await pool.query("SELECT id FROM hg_simulated_calls WHERE incident_id=$1 AND household_id=$2 AND audio_status='READY'",[incidentId,home])).rows[0];if(!call)fail(404,'AUDIO_UNAVAILABLE','El audio aún no está disponible.');
 try{return await readFile(join(voiceDirectory(),`${call.id}.wav`));}catch{fail(410,'AUDIO_EXPIRED','El audio ya no está disponible.');}
}
