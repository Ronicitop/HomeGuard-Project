import {beforeAll,afterAll,test,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {pool,resetDatabase,HOME} from '../helpers';
import {registerPushDevice,queueNotifications,deliverNotification} from '../../lib/notifications/deliveryService';
const ctx={user_id:1,household_id:HOME,role:'ADMINISTRADOR' as const,session_id:'test'};const installation=randomUUID();let event:any;
beforeAll(async()=>{await resetDatabase();process.env.HG_SECRET_KEY=Buffer.alloc(32,7).toString('base64');process.env.HG_PUSH_ENABLED='true';await pool.query("INSERT INTO Usuario(id,nombre,apellido,email,password_hash) VALUES(1,'Test','Test','test@test.local','test-unusable')");await pool.query("INSERT INTO hg_memberships(household_id,user_id,role) VALUES($1,1,'ADMINISTRADOR')",[HOME]);event=(await pool.query("INSERT INTO hg_events(id,household_id,source,category,event_type,severity,summary,occurred_at,decisions) VALUES($1,$2,'SIMULATED','SECURITY','TEST','WARNING','Private detail',now(),'{\"notify_requested\":true}') RETURNING *",[randomUUID(),HOME])).rows[0];});afterAll(()=>pool.end());
test('push device tokens are encrypted at rest and scoped to an installation',async()=>{
 await registerPushDevice(ctx,{installation_id:installation,token:'ExponentPushToken[test-token]',platform:'android'});
 const row=(await pool.query('SELECT token_encrypted FROM hg_push_devices WHERE installation_id=$1',[installation])).rows[0];expect(row.token_encrypted).not.toContain('test-token');
});
test('duplicate notification planning creates one delivery per installation',async()=>{
 await Promise.all([queueNotifications(event),queueNotifications(event)]);expect((await pool.query('SELECT 1 FROM hg_notifications WHERE event_id=$1',[event.id])).rowCount).toBe(1);
});
test('provider invalid-token response disables that device without claiming success',async()=>{
 const notification=(await pool.query('SELECT id FROM hg_notifications WHERE event_id=$1',[event.id])).rows[0];
 const result=await deliverNotification(notification.id,async()=>Response.json({data:{status:'error',details:{error:'DeviceNotRegistered'}}}));
 expect(result.status).toBe('FAILED');expect((await pool.query('SELECT enabled FROM hg_push_devices WHERE installation_id=$1',[installation])).rows[0].enabled).toBe(false);
});
test('preferences changed after enqueue are checked again before provider delivery',async()=>{
 await registerPushDevice(ctx,{installation_id:installation,token:'ExponentPushToken[test-token]',platform:'android'});
 const id=randomUUID();await pool.query("INSERT INTO hg_notifications(id,household_id,event_id,user_id,installation_id,status,channel) VALUES($1,$2,$3,1,$4,'QUEUED','EMERGENCY_CHALLENGE')",[id,HOME,event.id,installation]);
 let requests=0;const result=await deliverNotification(id,async()=>{requests++;return Response.json({data:{status:'ok',id:'ticket'}});});
 expect(requests).toBe(0);expect(result.status).toBe('SKIPPED');
});
