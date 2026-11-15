import dotenv from 'dotenv';
import { resolve } from 'node:path';
dotenv.config({path:resolve(process.cwd(),'.env.local')});
export const DEMO_HOME='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const config={
 db:{host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||55432),user:process.env.DB_USER||'homeguard',password:process.env.DB_PASS,database:process.env.DB_NAME||'homeguard_db'},
 demo:process.env.HG_DEMO_MODE==='true',
 origins:(process.env.HG_WEB_ORIGIN||'http://localhost:5173,http://127.0.0.1:5173').split(',').map(x=>x.trim()),
 mqtt:process.env.MQTT_BROKER_URL||'mqtt://127.0.0.1:1883',
 mediaRoot:resolve(process.env.HG_MEDIA_ROOT||'../.local/media'),
};
