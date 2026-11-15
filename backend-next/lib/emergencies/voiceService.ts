export function buildIncidentSpeech(incident:{profile_snapshot:any;created_at:string|Date;state:string}):string{
 const p=incident.profile_snapshot||{};const time=new Intl.DateTimeFormat('es-BO',{timeZone:'America/La_Paz',hour:'2-digit',minute:'2-digit'}).format(new Date(incident.created_at));
 return `Este es un aviso automatizado de HomeGuard en modo demostración. Se observó una posible caída, a las ${time}. Dirección de prueba: ${String(p.address||'sin configurar').slice(0,300)}. Responsable de prueba: ${String(p.contact_name||'sin configurar').slice(0,100)}. No se recibió confirmación de bienestar. Este aviso corresponde a una central simulada.`;
}
