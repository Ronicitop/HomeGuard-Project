import {config} from '../lib/config';import pool from '../lib/db';import {seedDemo} from '../lib/db/seedDemo';
async function main(){if(!config.demo)throw new Error('El seed requiere HG_DEMO_MODE=true');console.log(await seedDemo());}main().catch(()=>{console.error('No se pudo preparar la demo. Revisá migraciones/configuración.');process.exitCode=1;}).finally(()=>pool.end());
