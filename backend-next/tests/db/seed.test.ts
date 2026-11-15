import {beforeAll,afterAll,test,expect} from 'vitest';
import {pool,resetDatabase} from '../helpers';import {seedDemo} from '../../lib/db/seedDemo';import {verifyPassword} from '../../lib/auth/passwordService';
beforeAll(resetDatabase);afterAll(()=>pool.end());
test('demo seed is repeatable, hashes legacy plaintext and preserves configured users',async()=>{
 await pool.query("INSERT INTO Usuario(nombre,apellido,email,password_hash) VALUES('Viejo','Usuario','legacy@test.local','abc123')");
 await seedDemo();const first=(await pool.query("SELECT password_hash FROM Usuario WHERE email='admin@homeguard.local'")).rows[0].password_hash;await seedDemo();
 expect((await pool.query('SELECT 1 FROM Usuario')).rowCount).toBe(2);expect((await pool.query("SELECT password_hash FROM Usuario WHERE email='admin@homeguard.local'")).rows[0].password_hash).toBe(first);expect(await verifyPassword('abc123',(await pool.query("SELECT password_hash FROM Usuario WHERE email='legacy@test.local'")).rows[0].password_hash)).toBe(true);
 expect((await pool.query('SELECT 1 FROM Actuador')).rowCount).toBe(3);
});
