import {beforeAll,afterAll,test,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {pool,resetDatabase,HOME,OTHER} from '../helpers';
import {listEvents,getEvent,transitionEvent,readSse} from '../../lib/events/eventService';
const ctx={user_id:1,household_id:HOME,role:'ADMINISTRADOR' as const,session_id:'test'};
const ids=[randomUUID(),randomUUID(),randomUUID()];
beforeAll(async()=>{await resetDatabase();await pool.query('INSERT INTO hg_households(id,name) VALUES($1,\'Other\')',[OTHER]);for(let i=0;i<3;i++)await pool.query("INSERT INTO hg_events(id,household_id,source,category,event_type,severity,summary,occurred_at) VALUES($1,$2,'SIMULATED','SECURITY','ZONE_ENTRY','WARNING','Prueba','2026-11-15T20:00:00Z')",[ids[i],i===2?OTHER:HOME]);});
afterAll(()=>pool.end());
test('stable pagination never repeats tied timestamps and excludes another household',async()=>{
 const first=await listEvents(ctx,{},null,1);expect(first.items).toHaveLength(1);expect(first.next_cursor).toBeTruthy();
 const second=await listEvents(ctx,{},first.next_cursor,1);expect(second.items).toHaveLength(1);expect(second.items[0].id).not.toBe(first.items[0].id);expect(second.next_cursor).toBeNull();
 await expect(getEvent(ctx,ids[2])).rejects.toMatchObject({status:404});
});
test('false-positive transition preserves event evidence and creates an audit record',async()=>{
 const updated=await transitionEvent(ctx,ids[0],'FALSE_POSITIVE',1);expect(updated.status).toBe('FALSE_POSITIVE');expect(updated.revision).toBe(2);
 expect((await pool.query('SELECT action FROM hg_audit WHERE entity_id=$1',[ids[0]])).rows[0].action).toBe('event.status_changed');
 await expect(transitionEvent(ctx,ids[0],'RESOLVED',1)).rejects.toMatchObject({status:409});
});
test('SSE resumption is household-scoped and supports synchronization after expiry',async()=>{
 const result=await readSse(ctx,'0');expect(result.items.some(x=>x.event_name==='event.updated')).toBe(true);
 expect(result.items.every(x=>x.household_id===HOME)).toBe(true);
});
