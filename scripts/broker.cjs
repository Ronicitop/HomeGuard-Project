const {readFileSync}=require('node:fs');const {join}=require('node:path');const {scryptSync,timingSafeEqual}=require('node:crypto');
const {allowed}=require('./mqtt-acl.cjs');const aedes=require('aedes')({maxClientsIdLength:128});
const users=JSON.parse(readFileSync(join(__dirname,'../.local/broker-users.json'),'utf8'));
aedes.authenticate=(client,username,password,done)=>{
 const user=users.find(x=>x.username===username);if(!user||!password||password.length>256)return done(null,false);
 const computed=scryptSync(password.toString(),user.salt,32),expected=Buffer.from(user.hash,'hex');const ok=expected.length===computed.length&&timingSafeEqual(expected,computed);if(ok)client.hgUser=user;done(null,ok);
};
aedes.authorizePublish=(client,packet,done)=>done(!client||packet.payload.length>65536||packet.retain||!allowed(client.hgUser,packet.topic,'publish')?new Error('MQTT publish denied'):null);
aedes.authorizeSubscribe=(client,subscription,done)=>done(null,allowed(client.hgUser,subscription.topic,'subscribe')?subscription:null);
const server=require('node:net').createServer(aedes.handle);server.on('error',()=>{console.error('MQTT no pudo iniciar: verificá el puerto.');process.exitCode=1;});
server.listen(Number(process.env.HG_MQTT_PORT||1883),'127.0.0.1',()=>console.log('HomeGuard MQTT autenticado, solo loopback.'));
function stop(){server.close();aedes.close(()=>process.exit(0));setTimeout(()=>process.exit(0),3000).unref();}process.on('SIGTERM',stop);process.on('SIGINT',stop);
