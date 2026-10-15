"""Run every preset example in real Python, script its animation, and write truth.json."""
import json
import platform
from pathlib import Path

S0 = "Hi Python"
SETUP = f"s = {S0!r}"


def C(text):
    """A string as type blocks: one block per character, spaces shown as ␣."""
    return ["␣" if ch == " " else ch for ch in text]


def run(code, ns):
    lines = code.strip().split("\n")
    try:
        if len(lines) > 1:
            exec("\n".join(lines[:-1]), ns)
        try:
            compiled = compile(lines[-1], "<demo>", "eval")
        except SyntaxError:
            exec(lines[-1], ns)
            return None, None
        return repr(eval(compiled, ns)), None
    except Exception as exc:
        return None, f"{type(exc).__name__}: {exc}"


class Film:
    """Each step is a full machine state; frames inherit from the previous one."""

    def __init__(self, src=S0, **state):
        base = dict(slot=0, lit=[], src=C(src), seal=True, out=[], outLit=[], outSeal=False,
                    ok=True, grid=[], rowSeal=[], cells=[], row=0, col=0)
        base.update(state)
        self.state, self.steps = base, []

    def __call__(self, say, **change):
        self.state = {**self.state, "lit": [], "outLit": [], "cells": [], "ok": True, **change, "say": say}
        self.steps.append(dict(self.state))
        return self


examples = []


def add(mode, setup, code, note, film, check=None, identity=None):
    ns = {}
    exec(setup, ns)
    result, error = run(code, ns)
    examples.append(dict(mode=mode, setup=setup, code=code, note=note, steps=film.steps,
                         result=result, error=error, identity=identity, check=check))


def scan(film, text, upto, mark=lambda i: False, say=lambda i, ch: f"检查第 {i} 个字符 {ch!r}"):
    for i in range(upto):
        film(say(i, text[i]), slot=i, lit=[i])
    return film


def cast(film, result, say="浇铸新字符串 · 原字符串不变", slot=None):
    out = C(result)
    for i in range(len(out)):
        film(f"写入新字符串第 {i} 位：{result[i]!r}", slot=i if slot is None else slot, out=out[: i + 1], outLit=[i])
    return film(say, outSeal=True, slot=len(out) - 1 if slot is None else slot)


# ---------- 字符串基础 ----------
add("basic", SETUP, "s[0]", "字符串是字符的序列，正索引从 0 开始。",
    Film()("读取 s[0] = 'H'", slot=0, lit=[0]))
add("basic", SETUP, "s[-1]", "负索引从末尾倒数，-1 是最后一个字符。",
    Film()("读取 s[-1] = 'n'", slot=8, lit=[8]))
f = Film()
for i in range(3, 9):
    f(f"复制第 {i} 个字符", slot=i, lit=[i], out=C(S0[3: i + 1]), outLit=[i - 3])
f("切片得到新字符串 'Python'", slot=8, outSeal=True)
add("basic", SETUP, "s[3:]", "切片 [start:stop] 包含 start、不包含 stop；省略 stop 表示一直取到末尾。", f, check="out")
f = Film()
for n, i in enumerate(range(8, -1, -1)):
    f(f"倒着取第 {i} 个字符", slot=i, lit=[i], out=C(S0[::-1][: n + 1]), outLit=[n])
f("得到反转后的新字符串", slot=0, outSeal=True)
add("basic", SETUP, "s[::-1]", "步长为 -1 时倒着取，得到反转的字符串，是最常用的反转写法。", f, check="out")
add("basic", SETUP, "len(s)", "len() 返回字符个数，空格也算一个字符。",
    scan(Film(), S0, 9)("共 9 个字符（含 1 个空格）", slot=8, lit=list(range(9))))
add("basic", SETUP, "s[0] = 'h'", "字符串和元组一样不可变：不能修改其中某个字符。",
    Film()("定位第 0 个字符", slot=0, lit=[0])("封条锁定 · 拒绝写入 · TypeError", slot=0, lit=[0], ok=False))
f = Film()
f("取出 s[:2]", slot=1, lit=[0, 1], out=C("Hi"), outLit=[0, 1])
f("拼接 '!' · 得到新字符串", slot=2, out=C("Hi!"), outLit=[2], outSeal=True)
add("basic", SETUP, "s[:2] + '!'", "+ 拼接、* 重复都会生成新字符串；想“修改”字符串，就是生成一个新的再重新赋值。", f, check="out")
add("basic", SETUP, "'Py' in s", "in 检查子串是否出现在字符串中，返回 True 或 False。",
    scan(Film(), S0, 4)("在第 3 位找到 'Py' · True", slot=4, lit=[3, 4]))
add("basic", "", "'42' + 1", "字符串不能直接和数字相加，要先转换：int('42') + 1 或 '42' + str(1)。",
    Film(src="42")("类型不同 · 不能相加 · TypeError", slot=1, lit=[0, 1], ok=False))
add("basic", "name = '小明'\nage = 12", "f'{name}今年{age}岁'", "f-string 在字符串前加 f，花括号里的表达式会被计算并转成文本。",
    cast(Film(src="小明", seal=True)("读取变量 name", slot=1, lit=[0, 1]), "小明今年12岁", "f-string 生成新字符串", slot=6), check="out")

# ---------- 常用方法 ----------
f = Film()
for i in range(9):
    f(f"{S0[i]!r} → {S0[i].upper()!r}", slot=i, lit=[i], out=C(S0.upper()[: i + 1]), outLit=[i])
f("返回新字符串 · s 仍是 'Hi Python'", slot=8, outSeal=True)
add("method", SETUP, "s.upper()", "upper() 返回全部大写的新字符串，lower() 返回全部小写的新字符串。原字符串不变。", f, check="out",
    identity="s 仍然是 'Hi Python'")
f = Film()
for i in range(9):
    f(f"{S0[i]!r} → {S0[i].lower()!r}", slot=i, lit=[i], out=C(S0.lower()[: i + 1]), outLit=[i])
f("返回新字符串", slot=8, outSeal=True)
add("method", SETUP, "s.lower()", "比较时常先统一大小写，例如 answer.lower() == 'yes'。", f, check="out")
add("method", SETUP, "s.find('P')", "find(sub) 返回子串第一次出现的位置。",
    scan(Film(), S0, 4)("在第 3 位找到 'P' · 返回 3", slot=3, lit=[3]))
add("method", SETUP, "s.find('z')", "find 找不到时返回 -1，不会报错。",
    scan(Film(), S0, 9)("扫描完毕没找到 · 返回 -1", slot=8))
add("method", SETUP, "s.index('z')", "index 和 find 作用相同，但找不到时抛出 ValueError。",
    scan(Film(), S0, 9)("扫描完毕没找到 · ValueError", slot=8, ok=False))
add("method", SETUP, "s.count('o')", "count(sub) 统计子串出现的次数。",
    scan(Film(), S0, 9)("共找到 1 个 'o'", slot=7, lit=[7]))
f = Film()
f("找到 'Hi'", slot=1, lit=[0, 1])
cast(f, "Yo Python", "替换结果是新字符串 · s 不变")
add("method", SETUP, "s.replace('Hi', 'Yo')", "replace(old, new) 把所有 old 替换为 new，返回新字符串。", f, check="out")
add("method", SETUP, "s.startswith('Hi')", "startswith / endswith 检查开头和结尾，返回布尔值。",
    Film()("比较开头 2 个字符 · True", slot=1, lit=[0, 1]))
f = Film(src="  hi  ")
f("跳过开头空格", slot=1, lit=[0, 1])("跳过结尾空格", slot=5, lit=[4, 5])
cast(f, "hi", "去掉两端空白 · 中间的空格会保留", slot=3)
add("method", "t = '  hi  '", "t.strip()", "strip() 去掉两端的空白字符；lstrip() / rstrip() 只去一端。处理输入时很常用。", f, check="out")
add("method", SETUP, "s.isalpha()", "isalpha() 判断是否全是字母；空格不是字母，所以这里是 False。isdigit() 判断是否全是数字。",
    scan(Film(), S0, 3)("第 2 个是空格 · 返回 False", slot=2, lit=[2]))
f = Film(src="hi python")
for i in range(9):
    f(f"{'单词首字母大写' if i in (0, 3) else '保持小写'}：{'hi python'[i]!r}", slot=i, lit=[i], out=C("Hi Python"[: i + 1]), outLit=[i])
f("返回新字符串", slot=8, outSeal=True)
add("method", "u = 'hi python'", "u.title()", "title() 让每个单词首字母大写；capitalize() 只让整个字符串的第一个字母大写。", f, check="out")

# ---------- 分割与连接 ----------
def split_film(text, sep, pieces):
    f = Film(src=text)
    done, start = [], 0
    for i, ch in enumerate(text):
        is_sep = ch == sep if sep else ch == " "
        if is_sep or i == len(text) - 1:
            end = i if is_sep else i + 1
            done.append(repr(text[start:end]))
            f(f"切出 {text[start:end]!r}", slot=i, lit=list(range(start, end)), grid=[[p] for p in done],
              rowSeal=[True] * len(done), row=len(done) - 1, cells=[[len(done) - 1, 0]])
            start = i + 1
    assert [eval(p) for p in done] == pieces
    return f("得到一个列表，每一段都是新字符串", grid=[[p] for p in done], rowSeal=[True] * len(done), row=len(done) - 1)


add("split", SETUP, "s.split()", "split() 不带参数时按空白切分，返回一个字符串列表。",
    split_film(S0, None, S0.split()), check="grid")
add("split", "", "'a,b,c'.split(',')", "split(sep) 按指定分隔符切分，常用于处理 CSV 这类数据。",
    split_film("a,b,c", ",", ["a", "b", "c"]), check="grid")
words = ["a", "b", "c"]
f = Film(src="", seal=False, grid=[[repr(w)] for w in words], rowSeal=[True] * 3)
built = ""
for i, w in enumerate(words):
    built += ("-" if i else "") + w
    f(f"取出 {w!r}" + ("，前面加分隔符 '-'" if i else ""), row=i, cells=[[i, 0]], src=C(built), lit=[len(built) - 1], slot=len(built) - 1)
f("连接成一个新字符串", seal=True, slot=4)
add("split", "", "'-'.join(['a', 'b', 'c'])", "join 是分隔符字符串的方法：'分隔符'.join(列表)。列表里的元素必须都是字符串。", f, check="src")
f = Film(src="", seal=False, grid=[["'Hi'"], ["'Python'"]], rowSeal=[True, True])
f("取出 'Hi'", row=0, cells=[[0, 0]], src=C("Hi"), lit=[0, 1], slot=1)
f("加 '␣' 再取出 'Python'", row=1, cells=[[1, 0]], src=C("Hi Python"), lit=list(range(3, 9)), slot=8)
f("拆开再拼回原样", seal=True)
add("split", SETUP, "' '.join(s.split())", "split 和 join 是一对：先拆成列表，处理后再拼回字符串。", f, check="src")
add("split", "", "'-'.join(['a', 1])", "join 只能连接字符串；列表里有数字时会报 TypeError，可以先用 str() 转换。",
    Film(src="", seal=False, grid=[["'a'"], ["1"]], rowSeal=[True, False])("取出 'a'", row=0, cells=[[0, 0]], src=["a"], lit=[0])
    ("1 不是字符串 · TypeError", row=1, cells=[[1, 0]], src=["a"], ok=False))

data = {"python": platform.python_version(), "examples": examples}
Path(__file__).with_name("truth.json").write_text(json.dumps(data, ensure_ascii=False, indent=1))
print(f"wrote truth.json · Python {data['python']} · {len(examples)} examples")
for ex in examples:
    print(ex["mode"], repr(ex["code"]), "→", ex["error"] or ex["result"], f"({len(ex['steps'])} steps)")
