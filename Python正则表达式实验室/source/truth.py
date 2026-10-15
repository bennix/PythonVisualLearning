import re, json, sys
from pathlib import Path
HERE=Path(__file__).parent
cases=[]
def add(title,p,text,note,fn='finditer',cat='元字符',repl=''):
    cases.append(dict(id=len(cases),title=title,pattern=p,text=text,note=note,fn=fn,cat=cat,repl=repl))
add('点号与 DOTALL',r'a.b','a中b a\nb','点号默认不跨换行；S 使点号也匹配换行。')
add('行首 ^ 与 MULTILINE',r'^cat','cat\ndog\ncat','M 使 ^ 也匹配每一行的开头。')
add('行尾 $ 的例外',r'cat$','cat\n','即使没有 M，$ 也可在字符串末尾的一个换行符之前匹配。')
add('星号与零长度',r'a*','baa','* 是零次或多次；空匹配是成功匹配，不是 None。')
add('加号 +',r'a+','baa a','+ 至少一次。')
add('问号 ?',r'colou?r','color colour','? 使前一个原子可选。')
add('次数 {m,n}',r'\d{2,4}','1 22 33333','贪婪地匹配 2–4 个数字；更长数字可能分段匹配。')
add('字符类 []',r'[a-c]+','cab xyz','方括号选一个字符；a-c 表示范围。')
add('否定类 [^]',r'[^0-9]+','ab12中3','^ 仅在字符类开头表示否定。')
add('字符类里的 ^',r'[a^]+','a^^ b','不在字符类开头的 ^ 是普通字符。')
add('分支 |',r'cat|dog','dog cat','分支按从左到右尝试，不是选择最长分支。')
add('捕获组 ()',r'(\w+)=(\d+)','x=12 中=3','括号编号从 1 开始；group(0) 是整个匹配。')
add('非捕获组 (?:)',r'(?:ab)+','abab ab','分组但不占用捕获组编号。')
add('转义与原始字符串',r'\d+\.\d+','v1.25 v2x30','r 字符串减少 Python 字符串层的反斜杠转义；\\. 匹配点号本身。')
add('Unicode 数字 \\d / \\D',r'\d+|\D+','价１２元3','Python 默认 Unicode：\\d 不只 0–9；\\D 是其补集。')
add('Unicode 单词 \\w / \\W',r'\w+|\W+','中文_A 🙂!','\\w 包括 Unicode 字母、数字及下划线，不等同 ASCII。索引按码点计。')
add('空白 \\s / \\S',r'\s+|\S+','中\t文\n  OK','\\s 匹配 Unicode 空白；\\S 是非空白。')
add('单词边界 \\b',r'\bcat\b','cat scatter cat!','正则中的 \\b 是零宽单词边界，不是退格；使用 r 字符串，字符类内 \\b 则是退格。')
add('贪婪量词',r'<.*>','<b>中</b><i>文</i>','.* 尽可能多取，仍须满足后续模式。')
add('非贪婪量词',r'<.*?>','<b>中</b><i>文</i>','*? 尽可能少取；这不是通用 HTML 解析方案。')
add('正向先行断言',r'\d+(?=元)','12元 30美元','(?=...) 检查右侧，不消费断言中的文字。')
add('负向先行断言',r'cat(?!s)','cat cats cat!','(?!...) 要求右侧不匹配。')
add('后行断言',r'(?<=¥)\d+','¥12 $30','(?<=...) 检查左侧；Python re 的后行断言需固定宽度。')
add('search / match / fullmatch',r'\d+','订单 42','search 找任意位置；match 只检查开头；fullmatch 要求整个字符串匹配。','search','函数')
add('search 无结果',r'\d+','没有数字','结果 None 是正常的未匹配状态，不是异常。','search','函数')
add('findall：没有捕获组',r'\w+=\d+','a=1 b=22','没有捕获组时，findall 返回整个匹配的字符串列表。','findall','函数')
add('findall：一个捕获组',r'\w+=(\d+)','a=1 b=22','一个捕获组时，findall 返回该组字符串列表。','findall','函数')
add('findall：多个捕获组',r'(\w+)=(\d+)','a=1 b=22','多个捕获组时，findall 返回元组列表。','findall','函数')
add('finditer 与匹配对象',r'(?P<key>\w+)=(?P<value>\d+)','温度=23 湿度=60','finditer 返回迭代器；示例将它转成可读记录。groups 为元组，groupdict 为命名组字典。','finditer','函数')
add('sub：电话脱敏',r'(\d{3})\d{4}(\d{4})','联系 13812345678 或 13987654321','替换串中的 \\1、\\2 引用捕获组；这里只演示连续 11 位数字的脱敏。','sub','综合案例',r'\1****\2')
add('subn：清洗空白',r'\s+','Python\t 正则\n  实验室','subn 返回 (新字符串, 替换次数)，不会自动去掉首尾空白。','subn','综合案例',' ')
add('split：保留分隔符',r'([,;])','a,b;c','split 的捕获组会把分隔符也放进列表。','split','函数')
add('compile：重复使用',r'\bpython\b','Python python PYTHON','compile 返回可复用模式对象；此例再调用其 findall。I 忽略大小写。','compile','函数')
add('escape：字面量检索','a+b?.','a+b?.','escape 转义模式中的特殊字符，返回字符串；不是替换串的转义工具。','escape','函数')
add('日志字段提取',r'(?P<level>INFO|ERROR)\s+user=(?P<user>\w+)\s+ms=(?P<ms>\d+)','2026-10-15 INFO user=小明 ms=23\n2026-10-15 ERROR user=alice ms=108','命名组提取级别、用户名、耗时；完整输入保留在文本带。','finditer','综合案例')
add('日期格式重排',r'(\d{4})-(\d{2})-(\d{2})','记录 2026-10-15，边界 2026-99-99','仅识别和重排格式，不校验月份天数，也不验证真实日期。','sub','综合案例',r'\3/\2/\1')
add('简单邮箱形式校验',r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}','alice@example.com','fullmatch 校验全串；这里只是简单形式检查，不是完整 RFC 或邮箱有效性验证。','fullmatch','综合案例')
add('可选捕获与未参与组',r'(a)?b','b ab','未参与捕获组为 None，其 span 是 (-1,-1)；不同于成功的零长度匹配。','finditer','函数')
add('空输入与空匹配',r'^$','','空输入上也能成功匹配 [0,0)；不要用匹配文本是否为空判断成功。','search','函数')

def record(m):
    return dict(text=m.group(),span=list(m.span()),groups=list(m.groups()),groupdict=m.groupdict(),group_spans=[list(m.span(i)) for i in range(1,len(m.groups())+1)])
def evaluate(c,fn,flag):
    p,t=c['pattern'],c['text']; f=sum(int(getattr(re,x)) for x in flag); rx=re.compile(p,f)
    if fn in ('search','match','fullmatch'):
        m=getattr(rx,fn)(t); matches=[record(m)] if m is not None else []; result=None if m is None else record(m); result_repr='None' if m is None else f'Match: group(0)={m.group()!r}, span={m.span()!r}'
    else:
        matches=[] if fn=='escape' else [record(m) for m in rx.finditer(t)]
        if fn in ('finditer',): result=matches
        elif fn=='compile': result=rx.findall(t)
        elif fn=='escape': result=re.escape(p)
        elif fn in ('sub','subn'): result=getattr(rx,fn)(c['repl'],t)
        else: result=getattr(rx,fn)(t)
        result_repr=repr(result)
    fl=' | '.join('re.'+x for x in flag) or '0'
    pattern='r'+repr(p).replace('\\\\','\\') if "'" not in p and '\n' not in p else repr(p)
    # All predefined patterns permit a simple raw literal.
    pattern="r'"+p+"'"
    setup=f'import re\n\ntext = {t!r}\npattern = {pattern}\nflags = {fl}\n'
    if fn=='compile': code=setup+'rx = re.compile(pattern, flags)\nresult = rx.findall(text)\nprint(result)'
    elif fn=='escape': code=setup+'result = re.escape(pattern)\nprint(result)'
    elif fn in ('sub','subn'): code=setup+f'result = re.{fn}(pattern, {c["repl"]!r}, text, flags=flags)\nprint(result)'
    elif fn in ('search','match','fullmatch','finditer'):
        code=setup+f'result = re.{fn}(pattern, text, flags)\n'
        code+=('matches = list(result)\n' if fn=='finditer' else 'matches = [] if result is None else [result]\n')+'for m in matches:\n    print(m.group(), m.groups(), m.groupdict())\n    print(m.span(), m.start(), m.end())\nif not matches:\n    print(None)'
    else: code=setup+f'result = re.{fn}(pattern, text, flags=flags)\nprint(result)'
    return dict(fn=fn,flags=flag,flag_value=f,compiled_flags=int(rx.flags),matches=matches,result=result,result_repr=result_repr,code=code)
if __name__=='__main__':
    for c in cases:
        funcs=['search','match','fullmatch'] if c['id']==23 else [c['fn']]
        c['variants']=[evaluate(c,fn,fl) for fn in funcs for fl in ['', 'I','M','S','IM','IS','MS','IMS']]
    out=dict(python=sys.version.split()[0],examples=cases)
    (HERE/'truth.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
    print(f'{len(cases)} examples; {sum(len(c["variants"]) for c in cases)} real Python variants')
