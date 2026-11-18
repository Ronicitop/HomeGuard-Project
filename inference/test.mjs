import {test} from 'node:test';import assert from 'node:assert/strict';import {compatible,normalize,confirm,version,classify} from './logic.mjs';
test('legacy descriptor compatibility rejects malformed and mismatched models',()=>{assert(compatible({modelo:version,descriptores:Array.from({length:5},()=>Array(1024).fill(.1))}));assert(!compatible({modelo:'other',descriptores:[]}));assert(!compatible({modelo:version,descriptores:[[NaN]]}));});
test('temporal confirmation resets and deduplicates',()=>{const seen=new Map(),d={category:'unknown'};assert(!confirm(seen,d,100000,3000));assert(!confirm(seen,d,100500,3000));assert(confirm(seen,d,101000,3000));assert(!confirm(seen,d,101500,3000));assert(!confirm(seen,d,140000,3000));assert(!confirm(seen,d,140500,3000));assert(confirm(seen,d,141000,3000));});
test('boxes use canonical letterboxed dimensions',()=>assert.deepEqual(normalize([160,120,320,240]),[.25,.25,.5,.5]));

const face={box:[100,100,100,100],score:.95,embedding:Array(1024).fill(.1)},person={class:'person',score:.9,bbox:[0,0,400,480]},cat={class:'cat',score:.9,bbox:[400,200,100,100]};
test('person with no usable face stays unidentified alongside pet',()=>assert.deepEqual(classify([person,cat],[{...face,embedding:undefined}],[],()=>0).map(d=>d.category),['person','cat']));
test('valid unregistered face is unknown; recognized face replaces person box',()=>{assert.deepEqual(classify([person,cat],[face],[],()=>0).map(d=>d.category),['cat','unknown']);const p={id:1,nombre:'Ana',modelo:version,descriptores:Array.from({length:5},()=>Array(1024).fill(.1))};assert.deepEqual(classify([person,cat],[face],[p],()=>.8).map(d=>d.category),['cat','resident']);});
test('facial degradation preserves object detection',()=>assert.deepEqual(classify([person,cat],[],[],()=>0).map(d=>d.category),['person','cat']));

import {movement,postures,transitions} from "./activity.mjs";
test("scene motion ignores uniform light changes and detects a moving region",()=>{
  const state={}, frame=Buffer.alloc(640*480*3,70);
  assert.deepEqual(movement(frame,state),[]);
  frame.fill(120); assert.deepEqual(movement(frame,state),[]);
  for(let y=100;y<230;y++)frame.fill(220,(y*640+100)*3,(y*640+250)*3);
  assert.equal(movement(frame,state)[0].category,"motion");
});
test("two people's postures preserve their tracks when detection order reverses",()=>{
  const person=(x,seated)=>({box:[x,30,110,210],score:.9,keypoints:
    ["Shoulder","Hip","Knee","Ankle"].map((joint,i)=>({part:"left"+joint,score:.9,
      position:[x+(seated && i>=2 ? 45:0),[40,100,seated?103:155,210][i]]}))});
  const a=person(30,true), b=person(300,false), state={};
  const first=postures([a,b],state,100,3000);
  assert.deepEqual(first.map(d=>d.category),["sitting","standing"]);
  assert.deepEqual(postures([b,a],state,600,3000).map(d=>d.trackKey),first.map(d=>d.trackKey).reverse());
  assert.equal(postures([{...a,keypoints:[]}],state,1000,3000)[0].category,"indeterminate");
});
test("an episode emits only on its third sample and after a confirmed change",()=>{
  const state=new Map(), d={category:"sitting",trackKey:"one"};
  const observations=["sitting","sitting","sitting","sitting","standing","standing","standing"];
  assert.deepEqual(observations.flatMap(category=>transitions(state,[{...d,category}])).map(e=>e.category),["sitting","standing"]);
  const motion={category:"motion"};
  const newState=new Map();
  const frames=[[motion],[motion],[motion],[],[],[],[motion],[motion],[motion]];
  assert.equal(frames.flatMap(frame=>transitions(newState,frame)).length,2);
});
