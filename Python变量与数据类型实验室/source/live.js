'use strict';
const $=s=>document.querySelector(s);
const nameInput=$('#name'), readout=$('[data-readout]'), stage=$('#stage');
const still=matchMedia('(prefers-reduced-motion: reduce)');
function inRanges(cp,ranges){let l=0,r=ranges.length-1;while(l<=r){const m=(l+r)>>1,[a,b]=ranges[m];if(cp<a)r=m-1;else if(cp>b)l=m+1;else return true;}return false;}
function inspectName(name){
 const chars=Array.from(name),normalized=name.normalize('NFKC');
 const identifier=chars.length>0&&inRanges(chars[0].codePointAt(0),DATA.start)&&chars.slice(1).every(c=>inRanges(c.codePointAt(0),DATA.continuation));
 const keyword=DATA.keywords.includes(name);
 const valid=identifier&&!keyword;
 let state='ok',message='可用 · 合法标识符。';
 if(!identifier){state='error';message=name?'不可用 · 首字符须为允许的 Unicode 字符或下划线，后续才可含数字；不能含空格、连字符等。':'请输入一个变量名。';}
 else if(keyword){state='error';message='不可用 · '+name+' 是 Python 硬关键字。';}
 else {
  if(DATA.builtins.includes(normalized)){state='warning';message='可用，但不建议 · 会遮蔽内置名称 '+normalized+'。';}
  if(DATA.soft.includes(name)||['match','case','type','_'].includes(name))message+=' 它在特定语法位置可作软关键字，普通赋值中可用。';
  if(normalized!==name){state='warning';message+=' NFKC 规范化后为 '+normalized+'，两种写法可能绑定同一个名字。';}
  if(/[A-Z]/.test(name)&&state==='ok')message+=' PEP 8 建议普通变量使用小写 snake_case，但不强制。';
 }
 return {identifier,keyword,normalized,valid,state,message};
}
let selected=0,position=0,target=0,gate=0,gateTarget=0,frame=0,last=0,visible=false,touring=!still.matches,elapsed=0;
let touchedAt=performance.now(),hover=false;
const buttons=[];
DATA.samples.forEach((sample,i)=>{const b=document.createElement('button');b.textContent=sample.type;b.setAttribute('aria-pressed',String(i===0));b.addEventListener('click',()=>{touch();select(i);});$('#samples').append(b);buttons.push(b);});
Object.keys(DATA.samples[0].checks).forEach(t=>{const o=document.createElement('option');o.value=t;o.textContent=t==='NoneType'?'NoneType · 写作 type(None)':t;$('#compare').append(o);});
function compare(){const s=DATA.samples[selected],t=$('#compare').value,code=t==='NoneType'?'type(None)':t;$('#exact-label').textContent='type(x) is '+code;$('#instance-label').textContent='isinstance(x, '+code+')';$('#exact').textContent=s.type===t?'True':'False';$('#instance').textContent=s.checks[t]?'True':'False';$('#compare-note').textContent=s.type==='bool'&&t==='int'?'关键区别：True 的精确类型是 bool，但 bool 继承自 int，所以两项结果不同。':t==='object'?'所有这里展示的对象都是 object 的实例。':s.type==='NoneType'?'NoneType 不是通常可直接使用的内置名称；这里用 type(None) 得到该类型。':'左侧检查精确类型；右侧检查这个类型或它的子类。';}
function binding(){const n=inspectName(nameInput.value),s=DATA.samples[selected];$('#assignment').textContent=n.valid?nameInput.value+' = '+s.expr:'未绑定 · 请先修正变量名';$('#binding-note').textContent=n.valid?'名字不装着“固定类型的盒子”，它绑定一个对象。换一个样本，就是让这个名字重新绑定。':'名称不合法时，赋值无法成立；你仍可在右侧查看样本对象的类型。';}
function validate(){const n=inspectName(nameInput.value);$('#name-result').textContent=n.message;$('#name-result').dataset.state=n.state;nameInput.setAttribute('aria-invalid',String(!n.valid));gateTarget=n.valid?28:0;binding();run();}
function select(i){selected=Math.max(0,Math.min(DATA.samples.length-1,i));target=selected*19;const s=DATA.samples[selected];buttons.forEach((b,j)=>b.setAttribute('aria-pressed',String(j===selected)));$('#sample-title').textContent=s.type+' / '+s.label;$('#mutable').textContent=s.mutable;$('#sample-expr').textContent=s.expr;$('#sample-note').textContent=s.note;$('#type-repr').textContent=s.typeRepr;$('#type-name').textContent="'"+s.type+"'";stage.setAttribute('aria-label','当前样本 '+s.type+'。左右方向键切换类型，Home 到首项，End 到末项。');binding();compare();run();}
// Projection translation uses the exact kit camera; no geometry is regenerated per frame.
// These screen vectors are supplied from the build's actual iso() projection below.
function place(){const moving=Math.abs(position-target)>.03||Math.abs(gate-gateTarget)>.03;$('#carriage').setAttribute('transform','translate('+(AXIS[0]*position)+' '+(AXIS[1]*position)+')');$('#gate').setAttribute('transform','translate('+(UP[0]*gate)+' '+(UP[1]*gate)+')');readout.textContent=moving?'滑台定位中 · '+DATA.samples[selected].type:(!inspectName(nameInput.value).valid?'闸门关闭 · 未绑定':'已绑定 · '+DATA.samples[selected].type);stage.dataset.settled=String(!moving);stage.dataset.sample=String(selected);}
function tick(now){frame=0;const dt=last?Math.min((now-last)/1000,1/30):1/60;last=now;
 if(touring&&!still.matches&&!hover&&!document.querySelector('.workspace').contains(document.activeElement)&&now-touchedAt>3600){elapsed+=dt;if(elapsed>3.8){elapsed=0;select((selected+1)%DATA.samples.length);}}
 const a=1-Math.exp(-dt/.23);position=still.matches?target:position+(target-position)*a;gate=still.matches?gateTarget:gate+(gateTarget-gate)*a;
 if(Math.abs(position-target)<.01)position=target;if(Math.abs(gate-gateTarget)<.01)gate=gateTarget;place();
 if(visible&&!document.hidden&&(position!==target||gate!==gateTarget||touring&&!still.matches)){if(!frame)frame=requestAnimationFrame(tick);}
}
function run(){if(still.matches){position=target;gate=gateTarget;place();return;}if(!frame&&visible&&!document.hidden){last=0;frame=requestAnimationFrame(tick);}}
function touch(){touchedAt=performance.now();elapsed=0;}
nameInput.addEventListener('input',()=>{touch();validate();});
document.querySelectorAll('[data-name]').forEach(b=>b.addEventListener('click',()=>{touch();nameInput.value=b.dataset.name;validate();}));
$('#compare').addEventListener('change',()=>{touch();compare();});
$('#theme').addEventListener('click',()=>{const dark=document.body.dataset.theme!=='dark';document.body.dataset.theme=dark?'dark':'light';$('#theme').textContent=dark?'浅色模式':'深色模式';$('#theme').setAttribute('aria-label',dark?'切换至浅色主题':'切换至深色主题');});
function tourUI(){$('#tour').setAttribute('aria-pressed',String(touring));$('#tour').textContent=touring?'暂停巡览':'自动巡览';$('#tour-status').textContent=still.matches?'已遵循系统减少动态效果设置':touring?'空闲时自动浏览样本':'巡览暂停 · 可手动切换';}
$('#tour').addEventListener('click',()=>{touch();touring=still.matches?false:!touring;tourUI();run();});
const workspace=$('.workspace');workspace.addEventListener('pointerenter',()=>{hover=true;touch();});workspace.addEventListener('pointerleave',()=>{hover=false;touch();run();});workspace.addEventListener('focusin',touch);workspace.addEventListener('focusout',()=>{touch();run();});
stage.addEventListener('keydown',e=>{let next=selected;if(e.key==='ArrowRight'||e.key==='ArrowUp')next++;else if(e.key==='ArrowLeft'||e.key==='ArrowDown')next--;else if(e.key==='Home')next=0;else if(e.key==='End')next=13;else return;e.preventDefault();touch();select(next);});
new IntersectionObserver(entries=>{visible=entries[entries.length-1].isIntersecting;if(visible)run();else{cancelAnimationFrame(frame);frame=0;}},{rootMargin:'120px 0px'}).observe(stage);
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else run();});
still.addEventListener('change',()=>{if(still.matches){touring=false;cancelAnimationFrame(frame);frame=0;}tourUI();run();});
$('#version').textContent='Python '+DATA.python+' / Unicode '+DATA.unicode+' / '+PARTS+' 个实体零件';
window.lab={inspectName,fixtures:DATA.fixtures,samples:DATA.samples,select,get state(){return {selected,position,target,gate,gateTarget,touring,frame};}};
select(0);validate();tourUI();place();
