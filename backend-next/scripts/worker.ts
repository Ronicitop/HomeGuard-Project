import {expireStreams} from '../lib/streams';
import pool, { query } from '../lib/db';
import { iniciarServicioMQTT, detenerServicioMQTT } from '../lib/mqttWorker';
iniciarServicioMQTT();
async function cleanup() { await query("DELETE FROM EventoCamara WHERE fecha<NOW()-interval '30 days'"); await query('DELETE FROM Sesion WHERE expira_en<NOW()'); }
cleanup().catch(console.error);
const streamsTimer=setInterval(()=>expireStreams().catch(console.error),5000);
const timer = setInterval(() => cleanup().catch(console.error), 86400000);
for (const sig of ['SIGTERM', 'SIGINT'])
    process.on(sig, async () => { clearInterval(streamsTimer); clearInterval(timer); await detenerServicioMQTT(); await pool.end(); process.exit(0); });
