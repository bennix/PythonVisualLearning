"""Generate offline Python truth, never evaluate user input."""
import sys, json, keyword, builtins, unicodedata
from pathlib import Path
rows = [
 ('42',42,'整数','不可变','任意精度整数；不带小数点。'),
 ('3.14',3.14,'浮点数','不可变','二进制浮点近似值；0.1 + 0.2 不一定等于 0.3。'),
 ('2 + 3j',2+3j,'复数','不可变','由实部与虚部组成，虚数单位写作 j。'),
 ('True',True,'布尔值','不可变','只有 True 和 False；bool 是 int 的子类。'),
 ('"你好"','你好','文本','不可变','Unicode 字符串；索引得到的仍是 str。'),
 ('[1, 2]',[1,2],'列表','可变','有序序列，可追加、删除或替换元素。'),
 ('(1,)',(1,),'元组','不可变','单元素元组需要逗号；(1) 只是整数。元组内可引用可变对象。'),
 ('range(3)',range(3),'范围','不可变','表示 0、1、2 的整数序列，不会预先生成整个列表。'),
 ('{"a": 1}',{'a':1},'字典','可变','键值映射，保留插入顺序；键必须可哈希。{} 是空字典。'),
 ('{1, 2}',{1,2},'集合','可变','元素唯一且可哈希，无位置索引；空集合写 set()，不是 {}。'),
 ('frozenset({1, 2})',frozenset({1,2}),'冻结集合','不可变','不可变集合，可作为字典键或其他集合的元素。'),
 ('b"AB"',b'AB','字节串','不可变','字节序列；每项是 0–255 的整数，不是文本字符。'),
 ('bytearray(b"AB")',bytearray(b'AB'),'字节数组','可变','可变的字节序列，可原位修改单个字节。'),
 ('None',None,'空值','不可变','表示没有值；其类型是 NoneType，不等于 0 或空字符串。'),
]
types=[int,float,complex,bool,str,list,tuple,range,dict,set,frozenset,bytes,bytearray,type(None),object]
samples=[dict(expr=e,type=type(v).__name__,label=l,mutable=m,note=n,typeRepr=str(type(v)),checks={t.__name__:isinstance(v,t) for t in types}) for e,v,l,m,n in rows]
def ranges(test):
 out=[]; start=last=None
 for cp in range(0x110000):
  if test(chr(cp)):
   if start is None: start=cp
   last=cp
  elif start is not None: out.append([start,last]); start=None
 if start is not None: out.append([start,last])
 return out
names=['score','学生','_cache','2name','first-name','class','True','match','case','type','list','Score','变量2','K','ｃｌａｓｓ','a\u200db','a\u0301','😀','', ' x','None']
doc=dict(python=sys.version.split()[0],unicode=unicodedata.unidata_version,keywords=keyword.kwlist,soft=keyword.softkwlist,builtins=dir(builtins),start=ranges(str.isidentifier),continuation=ranges(lambda c: ('a'+c).isidentifier()),samples=samples,fixtures=[dict(name=n,identifier=n.isidentifier(),keyword=keyword.iskeyword(n),normalized=unicodedata.normalize('NFKC',n)) for n in names])
Path(__file__).with_name('truth.json').write_text(json.dumps(doc,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
assert type(True) is bool and isinstance(True,int)
assert type({}) is dict and type(set()) is set and type((1,)) is tuple
print(f'Python {doc["python"]}, Unicode {doc["unicode"]}: {len(samples)} samples; {len(doc["start"])} / {len(doc["continuation"])} identifier ranges')
