import {mkdir,writeFile,copyFile,readdir} from 'node:fs/promises';
await mkdir('models/coco',{recursive:true});await mkdir('models/human',{recursive:true});
const url='https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/model.json';
async function get(url,path){const r=await fetch(url);if(!r.ok)throw Error('Model download '+r.status);await writeFile(path,new Uint8Array(await r.arrayBuffer()));}
await get(url,'models/coco/model.json');const model=await (await import('node:fs/promises')).readFile('models/coco/model.json','utf8');for(const g of JSON.parse(model).weightsManifest)for(const f of g.paths)await get(new URL(f,url),'models/coco/'+f);
for(const f of ['blazeface.json','blazeface.bin','faceres.json','faceres.bin','README.md'])await copyFile('node_modules/@vladmandic/human/models/'+f,'models/human/'+f);
for(const [n,d] of [['human','@vladmandic/human'],['coco','@tensorflow-models/coco-ssd'],['tensorflow','@tensorflow/tfjs-node']])for(const f of await readdir('node_modules/'+d))if(/license|notice/i.test(f))await copyFile('node_modules/'+d+'/'+f,'models/'+n+'-'+f);
