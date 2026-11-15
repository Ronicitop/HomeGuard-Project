// Local-only files; never print credentials or pass them as process arguments.
const {readFileSync,writeFileSync,mkdirSync,existsSync}=require('node:fs');const {join}=require('node:path');const {randomBytes,scryptSync}=require('node:crypto');
const root=join(__dirname,'..'),local=join(root,'.local');mkdirSync(local,{recursive:true});
const envPath=join(root,'backend-next/.env.local');let env=existsSync(envPath)?readFileSync(envPath,'utf8'):'';
function ensure(key,value){if(!new RegExp(`^${key}=`,`m`).test(env))env+=`\n${key}=${value}\n`;}
if(!existsSync(join(local,'broker-users.json'))){
 const home='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';const clients=['processor','vision','simulator'].map(role=>({username:`hg-${role}`,role,household_id:home,password:randomBytes(32).toString('base64url')}));
 writeFileSync(join(local,'broker-clients.json'),JSON.stringify(clients,null,2),{mode:0o600});
 writeFileSync(join(local,'broker-users.json'),JSON.stringify(clients.map(({password,...user})=>{const salt=randomBytes(16).toString('hex');return {...user,salt,hash:scryptSync(password,salt,32).toString('hex')};}),null,2),{mode:0o600});
 const processor=clients[0];ensure('MQTT_USERNAME',processor.username);ensure('MQTT_PASSWORD',processor.password);
}
ensure('HG_SECRET_KEY',randomBytes(32).toString('base64'));ensure('HG_DEMO_MODE','true');ensure('HG_PUSH_ENABLED','false');ensure('HG_EMERGENCY_TRANSPORT','SIMULATED');
ensure('HG_PIPER_PYTHON',JSON.stringify(join(local,'voice-venv/Scripts/python.exe').replaceAll('\\','/')));ensure('HG_PIPER_MODEL',JSON.stringify(join(local,'voices/es_ES-davefx-medium/es_ES-davefx-medium.onnx').replaceAll('\\','/')));
writeFileSync(envPath,env,{mode:0o600});console.log('Configuración local preparada; secretos guardados fuera de Git.');
