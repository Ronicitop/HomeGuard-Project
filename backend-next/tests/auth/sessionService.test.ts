import { beforeAll,afterAll,test,expect } from 'vitest';
import {pool,resetDatabase,HOME,OTHER} from '../helpers';
import {hashPassword,verifyPassword} from '../../lib/auth/passwordService';
import {login,requireSession,revokeSession} from '../../lib/auth/sessionService';
import {assertPermission,authorizeResource} from '../../lib/auth/permissions';
beforeAll(async()=>{
 await resetDatabase();
 const hash=await hashPassword('Test-HomeGuard-123!');
 for(const [id,name] of [[1,'admin'],[2,'guest']] as const)await pool.query('INSERT INTO Usuario(id,nombre,apellido,email,password_hash) VALUES($1,$2,$2,$3,$4)',[id,name,`${name}@test.local`,hash]);
 await pool.query('INSERT INTO hg_memberships VALUES($1,1,\'ADMINISTRADOR\'),($1,2,\'INVITADO\')',[HOME]);
 await pool.query('INSERT INTO hg_households(id,name) VALUES($1,\'Other\')',[OTHER]);
});
afterAll(()=>pool.end());
test('password hashing verifies only the correct password without storing plaintext',async()=>{
 const hash=await hashPassword('Long-Test-123!');expect(hash).not.toContain('Long-Test-123!');expect(await verifyPassword('Long-Test-123!',hash)).toBe(true);expect(await verifyPassword('wrong',hash)).toBe(false);expect(await verifyPassword('plain','plain')).toBe(false);
});
test('wrong credentials never issue a session',async()=>{
 await expect(login('admin@test.local','incorrect','test-ip')).rejects.toMatchObject({status:401});
});
test('me resolves actual subject, token is hashed, and logout revokes it',async()=>{
 const issued=await login('guest@test.local','Test-HomeGuard-123!','test-ip');
 const req=new Request('http://localhost/api/v1/auth/me',{headers:{Authorization:`Bearer ${issued.token}`}});
 const ctx=await requireSession(req);expect(ctx.user_id).toBe(2);expect(ctx.role).toBe('INVITADO');
 expect((await pool.query('SELECT token_hash FROM hg_sessions WHERE id=$1',[ctx.session_id])).rows[0].token_hash).not.toBe(issued.token);
 await revokeSession(ctx);await expect(requireSession(req)).rejects.toMatchObject({status:401});
});
test('guest cannot command actuators or read people and cross-household resources are hidden',()=>{
 const ctx={user_id:2,household_id:HOME,role:'INVITADO' as const,session_id:'test'};
 expect(()=>assertPermission(ctx,'actuators.command')).toThrow();expect(()=>assertPermission(ctx,'people.read')).toThrow();expect(()=>authorizeResource(ctx,OTHER)).toThrow();
});
test('cookie mutations require CSRF proof but bearer requests do not use cookie auth',async()=>{
 const issued=await login('admin@test.local','Test-HomeGuard-123!','csrf-ip');
 const headers={cookie:`hg_session=${issued.token}`,origin:'http://localhost:5173'};
 await expect(requireSession(new Request('http://localhost/api/v1/mode',{method:'PATCH',headers}))).rejects.toMatchObject({status:403});
 const ctx=await requireSession(new Request('http://localhost/api/v1/mode',{method:'PATCH',headers:{...headers,'x-csrf-token':issued.csrf_token}}));expect(ctx.user_id).toBe(1);
});
test('five failed attempts lock the login without revealing account existence',async()=>{
 for(let i=0;i<5;i++)await login('unknown@test.local','bad','locked-ip').catch(()=>{});
 await expect(login('unknown@test.local','bad','locked-ip')).rejects.toMatchObject({status:429});
});
test('disabling household membership invalidates an existing session',async()=>{
 const issued=await login('guest@test.local','Test-HomeGuard-123!','disable-ip');
 await pool.query('UPDATE hg_memberships SET enabled=false WHERE household_id=$1 AND user_id=2',[HOME]);
 await expect(requireSession(new Request('http://localhost/api/v1/auth/me',{headers:{authorization:`Bearer ${issued.token}`}}))).rejects.toMatchObject({status:401});
});
