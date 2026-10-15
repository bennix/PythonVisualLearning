"""Independent re execution: does not import truth.py or its evaluator."""
import re,json,io,contextlib
from pathlib import Path
root=Path(__file__).parent
d=json.loads((root/'truth.json').read_text()); total=0
for c in d['examples']:
 for v in c['variants']:
  p,t,f=c['pattern'],c['text'],v['flag_value'];fn=v['fn']
  if fn in ['search','match','fullmatch']:
   m=getattr(re,fn)(p,t,f); ms=[] if m is None else [m]
  else: ms=[] if fn=='escape' else list(re.finditer(p,t,f))
  assert len(ms)==len(v['matches'])
  for m,s in zip(ms,v['matches']):
   assert m.group()==s['text']==t[s['span'][0]:s['span'][1]]
   assert list(m.span())==s['span'] and list(m.groups())==s['groups'] and m.groupdict()==s['groupdict']
   assert [list(m.span(i)) for i in range(1,len(m.groups())+1)]==s['group_spans']
  if fn in ['sub','subn']: result=getattr(re,fn)(p,c['repl'],t,flags=f)
  elif fn=='escape': result=re.escape(p)
  elif fn=='compile': result=re.compile(p,f).findall(t)
  elif fn in ['findall','split']: result=getattr(re,fn)(p,t,flags=f)
  elif fn=='finditer': result=[dict(text=m[0],span=list(m.span()),groups=list(m.groups()),groupdict=m.groupdict(),group_spans=[list(m.span(i)) for i in range(1,len(m.groups())+1)]) for m in ms]
  else: result=None if not ms else v['matches'][0]
  assert json.loads(json.dumps(result))==v['result'],(c['id'],fn)
  if fn not in ['search','match','fullmatch']:assert repr(result)==v['result_repr']
  ns={}
  with contextlib.redirect_stdout(io.StringIO()):exec(v['code'],ns)
  assert ns['pattern']==p and ns['text']==t
  total+=1
# Boundary expectations independent of generated data.
assert re.search('cat$','cat\n').span()==(0,3)
assert re.fullmatch('cat$','cat\n') is None
assert re.search(r'\d+','没有数字') is None
assert re.search('^$','').span()==(0,0)
assert [m.span() for m in re.finditer('a*','baa')]==[(0,0),(1,3),(3,3)]
assert re.search(r'\w+','🙂中文').span()==(1,3)
assert re.findall(r'(\w+)=(\d+)','a=1')==[('a','1')]
assert re.findall(r'\w+=(\d+)','a=1')==['1']
assert re.findall(r'\w+=\d+','a=1')==['a=1']
assert re.search(r'(a)?b','b').span(1)==(-1,-1)
assert re.sub(r'(\d{4})-(\d{2})-(\d{2})',r'\3/\2/\1','2026-99-99')=='99/99/2026'
print(f'PASS: {len(d["examples"])} cases, {total} variants; all spans/groups/results independently recomputed; all code examples executed; 11 boundary assertions.')
