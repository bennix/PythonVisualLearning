import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as k from './iso-kit.mjs';
const here=fileURLToPath(new URL('.',import.meta.url));
const truth=JSON.parse(fs.readFileSync(here+'truth.json','utf8'));
// Figure parts: 4 feet + plate + trim + 4 anchors + 14×3 specimen docks
// + 2 rails + 2 stops + 4 rail mounts + 7 carriage parts + 6 gate parts = 73 solids.
// A linear specimen comparator: carriage position means binding, NOT type size or order.
const base={x:-166,y:-66,w:332,d:132,r:5};
const P=k.fitProjection([...k.boxCorners(base,-14,0),[-150,-45,65],[150,12,43]],800,460,{pad:52,azimuth:35,elevation:34});
const at=p=>k.iso(p,P), L=(d,tone='lo')=>k.lineSvg(d,{tone});
const solids=[]; let count=0;
function slab(x,y,w,d,z,h,tone='mid',detail=true){
 const plan={x,y,w,d,r:Math.min(1.1,w/5,d/5)};
 solids.push({x,y,w,d,z,h}); count++;
 let s=k.solidSvg(k.slabOf(plan,z,h,P,4,.4),{tone});
 if(detail && w>8 && d>7){s+=L(k.planOutline(k.insetPlan(plan,2),z+h,P),'faint');s+=k.dotsSvg(k.corners(plan,3).map(([x,y])=>at([x,y,z+h])),{size:.48,tone:'mid'});}
 return s;
}
let art=`<path class="iso-halo" d="${k.haloOf(base,-14,8,P)}"/>`;
for(const [x,y] of k.corners(base,19)) art+=slab(x-7,y-7,14,14,-14,5,'lo');
art+=slab(-166,-66,332,132,-9,9,'lo');
art+=L(k.planOutline(k.insetPlan(base,5),0,P));
for(const x of [-153,141])for(const y of [-53,45])art+=slab(x,y,12,9,0,2,'lo');
// Back row: each specimen has a plinth, body, and retaining cap.
truth.samples.forEach((s,i)=>{
 const x=-117+i*19;
 art+=`<g data-sample="${i}">`+slab(x,-43,16,31,0,3,'lo')+slab(x+2,-40,12,25,3,15,'hi')+slab(x+1,-42,14,3,18,3,'mid')+'</g>';
});
for(const x of [-128,141])for(const y of [1,29])art+=slab(x,y,10,9,0,5,'lo');
for(const y of [2,30])art+=slab(-128,y,279,5,5,4,'mid',false);
for(const x of [-133,151])art+=slab(x,0,5,40,0,13,'mid');
// Ruler is rooted at its strip edge; each station has a real registration mark.
art+=slab(-125,56,278,7,0,.6,'lo',false);
for(let i=0;i<14;i++)art+=L(k.lineOnTop([-109+i*19,56],[-109+i*19,60],.6,P),'mid');
// Gate sits left of specimen bank; moving shutter is held against two long slides.
art+=slab(-158,-39,27,38,0,5,'mid');
for(const y of [-36,-7])art+=slab(-156,y,5,4,5,58,'mid',false);
art+=slab(-157,-36,7,33,63,3,'mid');
art+=`<g id="gate">`+slab(-151,-32,3,25,7,20,'hi')+slab(-148,-24,5,9,12,4,'mid')+'</g>';
// Front binding carriage travels only along x; its contact pointer ends at sample dock.
let car=slab(-119,1,20,37,9,4,'mid');
for(const x of [-118,-103])for(const y of [2,31])car+=slab(x,y,4,5,13,3,'mid',false);
car+=slab(-112,-12,6,13,9,4,'hi',false);
car+=slab(-115,13,12,13,13,10,'hi');
art+=`<g id="carriage">${car}</g>`;
const svg=k.figureSvg({width:800,height:460,label:'Python 变量检验台：十四个对象样本固定在底座，绑定滑台沿双导轨移动，左侧名称闸门在名称合法时升起。',body:[art]});
const template=fs.readFileSync(here+'template.html','utf8');
const html=template.replace('/* KIT */',k.ISO_CSS).replace('/* STYLE */',fs.readFileSync(here+'style.css','utf8')).replace('<!-- FIGURE -->',svg).replace('/* DATA */',`const DATA=${JSON.stringify(truth)}; const P=${JSON.stringify(P)}; const PARTS=${count}; const AXIS=${JSON.stringify(k.iso([1,0,0],P).map((v,i)=>v-k.iso([0,0,0],P)[i]))}; const UP=${JSON.stringify(k.iso([0,0,1],P).map((v,i)=>v-k.iso([0,0,0],P)[i]))};`).replace('/* LIVE */',fs.readFileSync(here+'live.js','utf8'));
fs.writeFileSync(here+'../index.html',html);
fs.writeFileSync(here+'geometry.json',JSON.stringify({parts:count,solids,projection:P},null,2));
console.log(`Built standalone index.html · ${count} Anatomy solids · ${truth.samples.length} Python specimens`);
if(count<40||count>80) throw Error('Figure part budget');
