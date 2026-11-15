const routes={
 vision:{publish:['detections/proposed','encounters/observed','vision/heartbeat','jobs/ack','jobs/clip/completed','jobs/clip/failed'],subscribe:['detections/ack','jobs/clip/requested','config/changed']},
 simulator:{publish:['actuators/ack','iot/telemetry'],subscribe:['actuators/command']},
 processor:{publish:['detections/ack','jobs/clip/requested','config/changed','actuators/command'],subscribe:['detections/proposed','encounters/observed','vision/heartbeat','jobs/ack','jobs/clip/completed','jobs/clip/failed','actuators/ack','iot/telemetry']}
};
function allowed(user,topic,operation){
 if(!user||!routes[user.role])return false;
 const parts=topic.split('/');if(parts.length!==5||parts[0]!=='homeguard'||parts[1]!=='v1')return false;
 if(user.role==='processor'){if(parts[2]!=='+'&&!/^[a-f0-9-]{36}$/.test(parts[2]))return false;}
 else if(parts[2]!==user.household_id)return false;
 return routes[user.role][operation]?.includes(parts.slice(3).join('/'))||false;
}
module.exports={allowed,routes};
