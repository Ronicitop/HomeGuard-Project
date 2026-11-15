import type {PoolClient} from 'pg';
import type {AuthContext} from '../auth/permissions';
const forbidden=/password|token|secret|credential|authorization/i;
export function sanitize(value:unknown):unknown{
 if(Array.isArray(value))return value.map(sanitize);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!forbidden.test(k)).map(([k,v])=>[k,sanitize(v)]));
 return value;
}
export async function audit(tx:PoolClient,ctx:Pick<AuthContext,'household_id'|'user_id'>,action:string,entityId:string,before?:unknown,after?:unknown){
 await tx.query('INSERT INTO hg_audit(household_id,actor_id,action,entity_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6)',[ctx.household_id,ctx.user_id,action,entityId,JSON.stringify(sanitize(before??null)),JSON.stringify(sanitize(after??null))]);
}
export async function emit(tx:PoolClient,householdId:string,name:string,entityId:string,payload:unknown={}){
 await tx.query('INSERT INTO hg_sse_log(household_id,event_name,entity_id,minimal_payload) VALUES($1,$2,$3,$4)',[householdId,name,entityId,JSON.stringify(payload)]);
}
