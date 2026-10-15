(()=>{const A=(b,m)=>{if(!b)throw Error(m)};let worst={ret:0,chip:0},n=0;const room=CFG.G.screen.w-12;
lab.examples.forEach((e,i)=>{lab.select(i);for(let k=0;k<e.steps.length;k++){lab.show(k);
 for(const id of ['ret-value','ret-label']){const w=document.getElementById(id).getComputedTextLength();worst.ret=Math.max(worst.ret,w);A(w<=room+0.5,id+' overflow '+i+' '+k+' '+w);}
 document.querySelectorAll('#src-chips .iso-face-text,#out-chips .iso-face-text,#tray-chips .iso-face-text').forEach(t=>{const w=t.getComputedTextLength()*Math.abs(t.transform.baseVal.consolidate()?1:1);});
 n++;}
 lab.show(e.steps.length-1);const shown=document.getElementById('ret-value').textContent,fin=e.steps[e.steps.length-1],want=e.error||(e.mode==='sort'&&fin.outTag.length?'key: '+fin.outTag.join(e.code.includes('reverse=True')?' ≥ ':' ≤ '):(e.result!==null?e.result:'None'));A(shown===want||(shown.endsWith('…')&&want.startsWith(shown.slice(0,-1))),'ret text '+i);});
return JSON.stringify({pass:true,states:n,widestReturn:Math.round(worst.ret),room});})()
