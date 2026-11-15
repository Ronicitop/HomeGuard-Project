import {beforeAll,afterAll,test,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {pool,resetDatabase,HOME} from '../helpers';
import {getMode,setMode,requestActuatorCommand,receiveActuatorAck} from '../../lib/actuators/commandService';
const ctx={user_id:1,household_id:HOME,role:'ADMINISTRADOR' as const,session_id:'test'};
beforeAll(async()=>{await resetDatabase();await pool.query("INSERT INTO Usuario(id,nombre,apellido,email,password_hash) VALUES(1,'Test','Admin','test@test.local','unusable-test-password')");await pool.query("INSERT INTO DispositivoESP32(device_id,nombre,zona) VALUES('test-device','Demo','Sala')");await pool.query("INSERT INTO Actuador(device_id,codigo,nombre,tipo,estado_actual) VALUES('test-device','ACT_SIRENA_01','Sirena','SIRENA','OFF')");});afterAll(()=>pool.end());
test('mode changes atomically and rejects stale revisions',async()=>{
 const before=await getMode(ctx);const updated=await setMode(ctx,'DISARMED',before.revision);expect(updated.mode).toBe('DISARMED');
 await expect(setMode(ctx,'AWAY',before.revision)).rejects.toMatchObject({status:409});expect((await getMode(ctx)).mode).toBe('DISARMED');
});
test('a requested command is not confirmed until an authenticated simulator ACK',async()=>{
 const key=randomUUID();const cmd=await requestActuatorCommand(ctx,{code:'ACT_SIRENA_01',state:'ON',idempotency_key:key});
 expect(cmd.status).toBe('REQUESTED');expect(cmd.confirmed_state).toBeNull();
 const same=await requestActuatorCommand(ctx,{code:'ACT_SIRENA_01',state:'ON',idempotency_key:key});expect(same.id).toBe(cmd.id);
 const ack=await receiveActuatorAck({command_id:cmd.id,state:'ON',confirmation_source:'SIMULATOR'},HOME);
 expect(ack.status).toBe('CONFIRMED');expect(ack.confirmation_source).toBe('SIMULATOR');
});
test('guest cannot issue commands and a forged household ACK cannot confirm them',async()=>{
 await expect(requestActuatorCommand({...ctx,role:'INVITADO'},{code:'ACT_SIRENA_01',state:'ON',idempotency_key:randomUUID()})).rejects.toMatchObject({status:403});
 await expect(receiveActuatorAck({command_id:randomUUID(),state:'ON',confirmation_source:'SIMULATOR'},HOME)).rejects.toMatchObject({status:404});
});
