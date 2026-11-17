export const version='human-3.3.6-faceres';
export function compatible(p){return p.modelo===version&&Array.isArray(p.descriptores)&&p.descriptores.length>=3&&p.descriptores.every(d=>Array.isArray(d)&&d.length===1024&&d.every(Number.isFinite));}
export function normalize(box){return [box[0]/640,box[1]/480,box[2]/640,box[3]/480].map(v=>Math.max(0,Math.min(1,v)));}
export function confirm(seen,d,now,windowMs){const key=d.category+':'+(d.profileId||0),s=seen.get(key)||{count:0,last:0,sent:0};s.count=now-s.last<windowMs?s.count+1:1;s.last=now;const emit=s.count>=3&&now-s.sent>=30000;if(emit)s.sent=now;seen.set(key,s);return emit;}

export function classify(objects,faces,profiles,similarity){
 const detections=objects.filter(o=>['person','dog','cat'].includes(o.class)&&o.score>=.6).map(o=>({category:o.class,score:o.score,box:normalize(o.bbox),label:o.class==='person'?'Persona sin identificar':o.class==='cat'?'Gato':'Perro'}));
 for(const f of faces){if(!f.embedding||f.embedding.length!==1024||f.score<.8)continue;let best=0,match;for(const p of profiles.filter(compatible))for(const d of p.descriptores){const score=similarity(f.embedding,d);if(score>best){best=score;match=p;}}const known=best>=.65&&match,box=normalize(f.box);for(let i=detections.length-1;i>=0;i--){const d=detections[i];if(d.category==='person'&&box[0]+box[2]/2>=d.box[0]&&box[0]+box[2]/2<=d.box[0]+d.box[2]&&box[1]+box[3]/2>=d.box[1]&&box[1]+box[3]/2<=d.box[1]+d.box[3])detections.splice(i,1);}detections.push({category:known?'resident':'unknown',profileId:known?match.id:undefined,score:known?best:f.score,box,label:known?'Residente reconocido: '+match.nombre:'Rostro desconocido'});}
 return detections;
}
