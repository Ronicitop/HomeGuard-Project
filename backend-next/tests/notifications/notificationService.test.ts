import {test,expect} from 'vitest';
import {planNotifications,buildPushPayload} from '../../lib/notifications/notificationService';
const event={id:'event-test',category:'SECURITY',source:'SIMULATED',decisions:{notify_requested:true},summary:'Persona privada en dirección privada'};
const device={installation_id:'device',user_id:1,role:'ADMINISTRADOR',enabled:true,categories:['SECURITY'],quiet_start:null,quiet_end:null,critical_demo_override:false};
test('notification preferences cannot override disabled notifications or household permissions',()=>{
 expect(planNotifications({...event,decisions:{notify_requested:false}},[device],new Date('2026-11-15T20:00:00Z'))).toEqual([]);
 expect(planNotifications(event,[{...device,role:'INVITADO'}],new Date('2026-11-15T20:00:00Z'))).toEqual([]);
});
test('quiet hours crossing midnight suppress ordinary alerts in the household timezone',()=>{
 expect(planNotifications(event,[{...device,quiet_start:'22:00',quiet_end:'07:00'}],new Date('2026-11-16T03:00:00Z'))).toEqual([]);
 expect(planNotifications(event,[device],new Date('2026-11-15T20:00:00Z'))).toHaveLength(1);
});
test('push contains an event reference and simulation marker without personal evidence',()=>{
 const payload=buildPushPayload('ExponentPushToken[test]',event);
 expect(payload.data).toEqual({event_id:'event-test',source:'SIMULATED'});expect(payload.title).toContain('Simulación');
 expect(JSON.stringify(payload)).not.toMatch(/Persona privada|dirección privada/);
});
