import {randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
const derive=(password:string,salt:string)=>new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key)));
export async function hashPassword(password:string):Promise<string>{
 if(password.length<10||password.length>1024)throw new Error('La contraseña debe tener entre 10 y 1024 caracteres.');
 return hashLegacyPassword(password);
}
// Used only by the explicit migration of existing accounts; new passwords use the policy above.
export async function hashLegacyPassword(password:string):Promise<string>{
 if(!password||password.length>1024)throw new Error('Contraseña legacy no válida.');
 const salt=randomBytes(16).toString('hex');return `$scrypt$16384$${salt}$${(await derive(password,salt)).toString('hex')}`;
}
export async function verifyPassword(password:string,hash:string):Promise<boolean>{
 const match=/^\$scrypt\$16384\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(hash||'');
 if(!match||password.length>1024)return false;
 return timingSafeEqual(await derive(password,match[1]),Buffer.from(match[2],'hex'));
}
