(()=>{const A=(b,s)=>{if(!b)throw Error(s)};let checked=0,windows=0;
for(const c of LAB.data.examples){LAB.selectCase(c.id);for(const v of c.variants){document.getElementById('fn').value=v.fn;document.getElementById('flags').value=v.flags;document.getElementById('flags').dispatchEvent(new Event('change'));
 const chars=Array.from(c.text);const ms=v.matches.length?v.matches:[null];
 ms.forEach((m,i)=>{if(m)document.getElementById('matches').children[i].click();
  const [from,to]=document.getElementById('stage').dataset.window.split('-').map(Number);A(to-from===Math.min(12,chars.length),'window size '+c.id);if(chars.length>12)windows++;
  for(let k=0;k<12;k++){const i2=from+k,cap=document.getElementById('key'+k),t=document.getElementById('kt'+k).textContent;
   const want=i2<chars.length?(({' ':'␠','\n':'↵','\t':'⇥'})[chars[i2]]||chars[i2]):'';A(t===want,'glyph '+c.id+' key '+k);
   const hit=!!(m&&i2<chars.length&&i2>=m.span[0]&&i2<m.span[1]);A(cap.dataset.hit===String(hit),'hit '+c.id+' key '+k);
   A(document.getElementById('ki'+k).textContent===(i2<chars.length?String(i2):''),'index '+c.id);}
  if(m&&m.span[1]>m.span[0])A(m.span[0]>=from&&m.span[0]<to,'match start in window '+c.id);
  const out=document.getElementById('out').textContent;A(out.startsWith('→ '),'out');if(!m)A(out.includes(v.result_repr.slice(0,10))||out.length>=40,'no-match shows result '+c.id);
  checked++;});}}
return {pass:true,states:checked,longTextStates:windows};})()
