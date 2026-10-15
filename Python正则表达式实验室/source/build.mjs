import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as k from './iso-kit.mjs';
const dir=fileURLToPath(new URL('.',import.meta.url));
const data=JSON.parse(fs.readFileSync(dir+'truth.json'));
// Figure parts: base + four feet; text bed, two rails and four stops;
// ruler; 12 registration pads; two seven-piece span jaws;
// three five-piece open capture bins; scanner body, shoes, lens, trim, nameplate.
const base={x:-170,y:-80,w:340,d:160,r:7},W=820,H=460;
const P=k.fitProjection([...k.boxCorners(base,-16,0),[-140,30,40],[140,-60,35]],W,H,{pad:42,azimuth:55,elevation:38});
let count=0;const boxes=[];
function slab(x,y,w,d,z,h,tone='mid',r=1){count++;boxes.push({x,y,w,d,z,h,r});return k.solidSvg(k.slabOf({x,y,w,d,r},z,h,P,5,.5),{tone,lit:tone==='lit'});}
const line=(d,tone='lo')=>k.lineSvg(d,{tone});
const screws=(x,y,w,d,z)=>k.dotsSvg(k.corners({x,y,w,d,r:1},2.5).map(([a,b])=>k.iso([a,b,z],P)),{size:.6,tone:'mid'});
let body=`<path class="iso-halo" d="${k.haloOf(base,-16,10,P)}"/>`;
for(const [x,y] of k.corners(base,18))body+=slab(x-6,y-6,12,12,-16,6,'lo',2);
body+=slab(-170,-80,340,160,-10,10,'lo',7)+line(k.planOutline(k.insetPlan(base,5),0,P),'faint')+screws(-170,-80,340,160,0);
body+=slab(-147,-17,282,40,0,4,'lo',3);
// Twelve keycaps show a 12-character window of the text; live code writes each glyph and lights the matched keys.
const text=(at,z,size,tone,id,anchor='middle')=>k.faceTextSvg(k.topMatrix(at,z,P),'',{size,tone,anchor}).replace('<text ',`<text id="${id}" `);
for(let i=0;i<12;i++){const x=-141+i*23;body+=`<g id="key${i}">`+slab(x,-10,20,26,4,1,'hi')+line(k.planOutline({x:x+3,y:-7,w:14,d:20,r:1},5,P),'faint')+text([x+10,7.5],5,10,'hi','kt'+i)+`</g>`+text([x+10,21.2],4,3.4,'mid','ki'+i);}
for(const y of [-27,35]){body+=slab(-143,y,278,4,4,3);for(const x of [-151,135])body+=slab(x,y-3,8,10,0,11)+screws(x,y-3,8,10,11);}
body+=slab(-143,47,278,10,0,1,'lo');
const ticks=k.topTicks(-138,130,5,5,47,1,[2.5,4.5],P);body+=line(ticks.minor)+line(ticks.major,'mid');
// Collection bins: floor and four real walls, open above.
for(let i=0;i<3;i++){let x=-100+i*75;body+=`<g id="bin${i}">`+slab(x,-67,54,29,0,3,'lo')+slab(x,-67,54,2,3,13)+slab(x,-65,2,25,3,13)+slab(x+52,-65,2,25,3,13)+slab(x,-40,54,2,3,9)+`</g>`;}
function jaw(id,y){let s=slab(-144,y,9,12,7,5,'hi')+slab(-144,y+2,2,8,12,16,'hi')+slab(-142,y+2,8,8,25,3,'hi');for(const a of [0,6])s+=slab(-144+a,y,3,12,5,2);s+=slab(-143,y+4,4,4,28,2)+slab(-142,y+5,2,2,30,2);return `<g id="${id}">${s}</g>`;}
body+=jaw('startjaw',-30)+jaw('endjaw',32);
body+=`<g id="scanner">`+slab(-146,-15,10,36,5,3,'lit')+slab(-149,-15,3,7,5,5)+slab(-149,14,3,7,5,5)+slab(-144,-8,6,22,8,2,'lit')+slab(-143,-5,4,16,10,1,'hi')+`</g>`;
body+=slab(-140,59,222,19,0,2,'mid',2)+slab(-138,61,218,15,2,0.4,'lo',1)+screws(-140,59,222,19,2)+text([-134,66.4],2.4,5,'mid','call','start')+text([-134,73.6],2.4,5.6,'hi','out','start');
body+=slab(90,62,42,10,0,1,'lo')+k.faceTextSvg(k.topMatrix([111,69],1,P),'RE · LAB',{size:4,anchor:'middle',tone:'mid'});
const svg=k.figureSvg({width:W,height:H,label:'正则文本检验台：十二个键帽依次显示被匹配文本的字符，命中的字符键高亮；扫描滑台和起止夹具停在匹配的起点与终点；前方显示屏给出函数调用与 Python 结果；后侧三个开口仓表示捕获组。',body});
const html=fs.readFileSync(dir+'template.html','utf8').replace('/* KIT */',()=>k.ISO_CSS).replace('/* STYLE */',()=>fs.readFileSync(dir+'style.css','utf8')).replace('<!-- FIGURE -->',()=>svg).replace('/* SCRIPT */',()=>`const DATA=${JSON.stringify(data)};const AXIS=${JSON.stringify(k.iso([1,0,0],P).map((v,i)=>v-k.iso([0,0,0],P)[i]))};const PARTS=${count};\n`+fs.readFileSync(dir+'live.js','utf8'));
fs.writeFileSync(dir+'../index.html',html);fs.writeFileSync(dir+'geometry.json',JSON.stringify({parts:count,boxes,P},null,2));
console.log('Built',count,'solids',data.examples.length,'cases');if(count<40||count>80)throw Error('part budget');
