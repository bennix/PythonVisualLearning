import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const here=new URL('.',import.meta.url);
const DATA=JSON.parse(fs.readFileSync(new URL('truth.json',here),'utf8'));
const live=fs.readFileSync(new URL('live.js',here),'utf8');
const pure=live.slice(live.indexOf('function inRanges'),live.indexOf('let selected'));
const context=vm.createContext({DATA});vm.runInContext(pure,context);
for(const f of DATA.fixtures){const n=context.inspectName(f.name);assert.equal(n.identifier,f.identifier,f.name);assert.equal(n.keyword,f.keyword,f.name);assert.equal(n.normalized,f.normalized,f.name);}
for(const n of ['match','case','type','_']) assert.equal(context.inspectName(n).valid,true,n);
assert.equal(context.inspectName('list').state,'warning');
assert.equal(context.inspectName('bool').state,'warning');
assert.equal(DATA.samples.length,14);
assert.equal(DATA.samples.find(s=>s.type==='bool').checks.int,true);
const html=fs.readFileSync(new URL('../index.html',here),'utf8');
assert(!/(?:src|href)=["']https?:/.test(html));assert(!html.includes('/* LIVE */'));
const {solids,parts}=JSON.parse(fs.readFileSync(new URL('geometry.json',here),'utf8'));
assert.equal(parts,73);assert(solids.every(s=>s.w>0&&s.d>0&&s.h>0));
// Axis-aligned pieces never interpenetrate. Rounded/bevelled actual shape is contained by each box.
for(let i=0;i<solids.length;i++)for(let j=i+1;j<solids.length;j++){
 const a=solids[i],b=solids[j];const overlap=[Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),Math.min(a.y+a.d,b.y+b.d)-Math.max(a.y,b.y),Math.min(a.z+a.h,b.z+b.h)-Math.max(a.z,b.z)];
 assert(!overlap.every(d=>d>1e-7),`overlap ${i}/${j}: ${overlap}`);
}
// Full linear travel: sample every world unit, plus both gate limits.
for(let travel=0;travel<=247;travel++)for(const lift of [0,28]){
 const posed=solids.map((s,i)=>({...s,x:s.x+(i>=66?travel:0),z:s.z+((i===64||i===65)?lift:0)}));
 for(let i=0;i<posed.length;i++)for(let j=i+1;j<posed.length;j++){
  const a=posed[i],b=posed[j];
  assert(![Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),Math.min(a.y+a.d,b.y+b.d)-Math.max(a.y,b.y),Math.min(a.z+a.h,b.z+b.h)-Math.max(a.z,b.z)].every(d=>d>1e-7),`travel ${travel}, gate ${lift}, collision ${i}/${j}`);
 }
}
console.log('PASS: 496 travel/gate poses without bounding-box penetration (not a full Anatomy depth/support audit).');
console.log(`PASS: ${DATA.fixtures.length} Python identifier fixtures, soft keywords, builtin shadowing, 14 types, bool inheritance, offline resources, ${parts} positive solids and no rest-pose box penetration.`);
