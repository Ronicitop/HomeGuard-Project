export const API_BASE=(import.meta.env.VITE_API_BASE_URL||'/api/v1').replace(/\/$/,'');
let csrf='';
export const setCsrfToken=(value:string)=>{csrf=value;};
export class ApiError extends Error{status:number;code:string;constructor(status:number,code:string,message:string){super(message);this.status=status;this.code=code;}}
async function request<T>(method:string,path:string,value?:unknown,signal?:AbortSignal):Promise<T>{
 const headers:Record<string,string>={Accept:'application/json'};
 if(value!==undefined)headers['Content-Type']='application/json';
 if(!['GET','HEAD'].includes(method)){headers['X-CSRF-Token']=csrf;headers['Idempotency-Key']=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`;}
 let response:Response;
 try{response=await fetch(`${API_BASE}${path}`,{method,headers,credentials:'include',body:value===undefined?undefined:JSON.stringify(value),signal:signal||AbortSignal.timeout(20000)});}catch(error){if(signal?.aborted)throw error;throw new ApiError(0,'NETWORK_ERROR','No se pudo conectar. Revisá el servidor y volvé a intentar.');}
 const data=await response.json().catch(()=>({}));
 if(!response.ok){if(response.status===401&&!path.endsWith('/auth/login'))window.dispatchEvent(new Event('hg:session-expired'));throw new ApiError(response.status,data.error?.code||'REQUEST_FAILED',data.error?.message||'No se pudo completar la operación.');}
 return data as T;
}
export const api={get:<T>(p:string,s?:AbortSignal)=>request<T>('GET',p,undefined,s),post:<T>(p:string,v:unknown={})=>request<T>('POST',p,v),patch:<T>(p:string,v:unknown)=>request<T>('PATCH',p,v),put:<T>(p:string,v:unknown)=>request<T>('PUT',p,v),delete:<T>(p:string,v:unknown)=>request<T>('DELETE',p,v)};
export const errorMessage=(error:unknown)=>error instanceof Error?error.message:'Ocurrió un problema. Volvé a intentar.';
export function refreshData(){window.dispatchEvent(new Event('hg:refresh'));}
