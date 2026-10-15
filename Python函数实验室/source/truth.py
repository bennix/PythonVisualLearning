"""Run every preset in real Python and script its animation; write truth.json.

Binding steps come from inspect.signature(f).bind(...), the same rules Python uses for a call,
so the page never invents which argument lands in which parameter.
"""
import contextlib
import inspect
import io
import json
import platform
from pathlib import Path

KIND = {
    inspect.Parameter.POSITIONAL_ONLY: "仅位置",
    inspect.Parameter.POSITIONAL_OR_KEYWORD: "普通",
    inspect.Parameter.VAR_POSITIONAL: "*args",
    inspect.Parameter.KEYWORD_ONLY: "仅关键字",
    inspect.Parameter.VAR_KEYWORD: "**kwargs",
}


def run(code):
    ns, out = {}, io.StringIO()
    error = None
    with contextlib.redirect_stdout(out):
        try:
            lines = code.rstrip("\n").split("\n")
            exec("\n".join(lines[:-1]), ns)
            try:
                compiled = compile(lines[-1], "<demo>", "eval")
            except SyntaxError:
                exec(lines[-1], ns)
                return ns, None, out.getvalue(), None
            value = eval(compiled, ns)
            return ns, value, out.getvalue(), None
        except Exception as exc:
            error = f"{type(exc).__name__}: {exc}"
    return ns, None, out.getvalue(), error


class Film:
    def __init__(self, **state):
        base = dict(slot=0, lit=[], src=[], srcTag=[], seal=False, out=[], outTag=[], outLit=[], outSeal=False,
                    ok=True, grid=[], rowSeal=[], rowTag=[], cells=[], row=0, col=0)
        base.update(state)
        self.state, self.steps = base, []

    def __call__(self, say, **change):
        self.state = {**self.state, "lit": [], "outLit": [], "cells": [], "ok": True, **change, "say": say}
        self.steps.append(dict(self.state))
        return self


def call_film(fn, call_args, call_kwargs, result, error, ret_label="返回"):
    """Arguments (front) bind into parameter slots (back); extras go to the *args / **kwargs trays."""
    sig = inspect.signature(fn)
    params = list(sig.parameters.values())
    fixed = [p for p in params if p.kind not in (p.VAR_POSITIONAL, p.VAR_KEYWORD)]
    var_pos = next((p for p in params if p.kind == p.VAR_POSITIONAL), None)
    var_kw = next((p for p in params if p.kind == p.VAR_KEYWORD), None)
    src = [repr(a) for a in call_args] + [f"{k}={v!r}" for k, v in call_kwargs.items()]
    tags = ["位置"] * len(call_args) + ["关键字"] * len(call_kwargs)
    names = [p.name for p in fixed]
    out = ["?"] * len(fixed)
    out_tags = [p.name + ("=" + repr(p.default) if p.default is not p.empty else "") for p in fixed]
    rows, row_tags = [], []
    if var_pos:
        rows.append([]); row_tags.append("*" + var_pos.name)
    if var_kw:
        rows.append([]); row_tags.append("**" + var_kw.name)
    f = Film(src=src, srcTag=tags, out=list(out), outTag=out_tags, grid=[list(r) for r in rows], rowTag=row_tags,
             rowSeal=[False] * len(rows))
    f(f"调用 {fn.__name__}(" + ", ".join(src) + ")" + f" · 函数有 {len(params)} 个形参", slot=0)
    try:
        bound = sig.bind(*call_args, **call_kwargs)
    except TypeError as exc:
        f(f"无法绑定 · TypeError: {exc}", slot=0, ok=False)
        return f
    pos_used = 0
    for i, a in enumerate(call_args):
        if pos_used < len(fixed) and fixed[pos_used].kind in (inspect.Parameter.POSITIONAL_ONLY, inspect.Parameter.POSITIONAL_OR_KEYWORD):
            out[pos_used] = repr(a)
            f(f"位置实参 {a!r} → 按顺序放进形参 {names[pos_used]}", slot=i, lit=[i], out=list(out), outLit=[pos_used])
            pos_used += 1
        else:
            r = row_tags.index("*" + var_pos.name)
            rows[r].append(repr(a))
            f(f"多出来的位置实参 {a!r} → 收进元组 {var_pos.name}", slot=i, lit=[i], grid=[list(x) for x in rows],
              cells=[[r, len(rows[r]) - 1]], row=r, col=len(rows[r]) - 1)
    for j, (k, v) in enumerate(call_kwargs.items()):
        i = len(call_args) + j
        if k in names:
            out[names.index(k)] = repr(v)
            f(f"关键字实参 {k}={v!r} → 按名字放进形参 {k}", slot=i, lit=[i], out=list(out), outLit=[names.index(k)])
        else:
            r = row_tags.index("**" + var_kw.name)
            rows[r].append(f"{k!r}: {v!r}")
            f(f"没有名为 {k} 的形参 → 收进字典 {var_kw.name}", slot=i, lit=[i], grid=[list(x) for x in rows],
              cells=[[r, len(rows[r]) - 1]], row=r, col=len(rows[r]) - 1)
    missing = [n for n, v in zip(names, out) if v == "?"]
    if missing:
        bound.apply_defaults()
        for n in missing:
            out[names.index(n)] = repr(bound.arguments[n])
        f("没有传值的形参使用默认值：" + "、".join(f"{n}={bound.arguments[n]!r}" for n in missing), slot=len(src) - 1,
          out=list(out), outLit=[names.index(n) for n in missing])
    for r in range(len(rows)):
        rows[r] = rows[r] or ["（空）"]
    f("绑定完成 · 开始执行函数体", grid=[list(x) for x in rows], rowSeal=[t.startswith("*") and not t.startswith("**") for t in row_tags])
    if error:
        f(f"函数体出错 · {error}", ok=False)
    else:
        f(f"{ret_label} {result}", outSeal=True)
    return f


examples = []


def add(mode, title, code, note, film_fn=None, call=None):
    ns, value, out, error = run(code)
    result = None if error else (repr(value) if value is not None or not code.rstrip().split("\n")[-1].startswith(("print", "show")) else None)
    if film_fn:
        film = film_fn(ns, value, error)
    else:
        name, args, kwargs = call
        film = call_film(ns[name], args, kwargs, repr(value), error)
    examples.append({"mode": mode, "title": title, "code": code.strip("\n"), "note": note,
                     "result": result, "printed": out, "error": error, "steps": film.steps})


def simple(ns, value, error, say):
    return Film(src=[], out=[repr(value)] if not error else [], outSeal=True)(say)


# ---------- 定义与调用 ----------
add("define", "def 定义、return 返回", """
def area(w, h):
    return w * h

area(3, 4)
""", "def 函数名(形参): 定义函数，缩进的代码是函数体；return 把结果交还给调用者。定义时不执行，调用时才执行。",
    call=("area", (3, 4), {}))
add("define", "没有 return 就返回 None", """
def greet(name):
    print('你好,', name)

result = greet('小明')
print(result)
""", "函数体没有 return（或只写 return）时，调用结果是 None。print 只是显示，不等于返回。",
    film_fn=lambda ns, v, e: call_film(ns["greet"], ("小明",), {}, "None", e, "打印后返回"))
add("define", "return 多个值（打包成元组）", """
def min_max(nums):
    return min(nums), max(nums)

lo, hi = min_max([4, 1, 9])
(lo, hi)
""", "return a, b 实际返回一个元组 (a, b)，调用方可以直接解包到多个变量。",
    film_fn=lambda ns, v, e: call_film(ns["min_max"], ([4, 1, 9],), {}, "(1, 9)", e))
add("define", "函数是对象，可以赋值和传递", """
def double(x):
    return x * 2

f = double
f(21)
""", "函数名只是指向函数对象的变量：可以赋给别的名字、放进列表、当作参数传给另一个函数。",
    call=("f", (21,), {}))
add("define", "局部变量只在函数内部", """
def calc():
    temp = 10
    return temp + 1

calc()
temp
""", "函数里赋值的变量是局部变量，函数结束后就不存在了；在外面访问会报 NameError。",
    film_fn=lambda ns, v, e: Film(src=["calc()"], srcTag=["调用"], out=["11"], outTag=["calc() 返回"], outSeal=True)
    ("calc() 返回 11 · 局部变量 temp 随函数结束而消失", lit=[0], outLit=[0])("在函数外访问 temp · NameError", ok=False))

# ---------- 参数形式 ----------
add("params", "位置参数：按顺序", """
def intro(name, age):
    return f'{name}，{age} 岁'

intro('小红', 12)
""", "位置实参按从左到右的顺序，依次交给形参。顺序写反，结果就错了。", call=("intro", ("小红", 12), {}))
add("params", "关键字参数：按名字", """
def intro(name, age):
    return f'{name}，{age} 岁'

intro(age=12, name='小红')
""", "写成 形参名=值，按名字对应，顺序可以任意。", call=("intro", (), {"age": 12, "name": "小红"}))
add("params", "默认参数：可以不传", """
def power(base, exp=2):
    return base ** exp

power(5)
""", "定义时写 exp=2，调用时不传 exp 就用默认值 2。带默认值的形参必须放在没有默认值的后面。",
    call=("power", (5,), {}))
add("params", "默认参数：传了就覆盖", """
def power(base, exp=2):
    return base ** exp

power(2, 10)
""", "传了实参，默认值就被覆盖。", call=("power", (2, 10), {}))
add("params", "*args：收集多余的位置参数", """
def total(*nums):
    return sum(nums)

total(1, 2, 3, 4)
""", "形参前加 * 表示把所有多出来的位置实参收进一个元组。名字常写作 args，也可以自己起。",
    call=("total", (1, 2, 3, 4), {}))
add("params", "**kwargs：收集多余的关键字参数", """
def profile(name, **info):
    return f'{name}: {info}'

profile('小李', age=13, city='北京')
""", "形参前加 ** 表示把没有对应形参的关键字实参收进一个字典。", call=("profile", ("小李",), {"age": 13, "city": "北京"}))
add("params", "仅关键字参数：* 后面的", """
def move(x, *, speed=1):
    return x * speed

move(10, speed=3)
""", "单独的 * 之后的形参只能用关键字传入，调用时更清楚，避免传错位置。", call=("move", (10,), {"speed": 3}))
add("params", "仅关键字参数：用位置传会报错", """
def move(x, *, speed=1):
    return x * speed

move(10, 3)
""", "* 后面的 speed 不接受位置实参，所以 move(10, 3) 报 TypeError。", call=("move", (10, 3), {}))
add("params", "仅位置参数：/ 前面的", """
def clamp(n, /, lo=0, hi=10):
    return max(lo, min(n, hi))

clamp(15, hi=12)
""", "/ 之前的形参只能按位置传（Python 3.8+），不能写 n=15。内置函数里常见。", call=("clamp", (15,), {"hi": 12}))
add("params", "几种形式组合", """
def demo(a, b=2, *args, c, **kw):
    return (a, b, args, c, kw)

demo(1, 5, 6, 7, c=8, d=9)
""", "固定顺序：普通 → 默认 → *args → 仅关键字 → **kwargs。每个实参按规则落到唯一的位置。",
    call=("demo", (1, 5, 6, 7), {"c": 8, "d": 9}))
add("params", "缺少参数会报错", """
def area(w, h):
    return w * h

area(3)
""", "没有默认值的形参必须传值，少传会报 TypeError，并告诉你缺哪一个。", call=("area", (3,), {}))
add("params", "调用时用 * 和 ** 拆包", """
def intro(name, age):
    return f'{name}，{age} 岁'

data = {'name': '小王', 'age': 11}
intro(**data)
""", "调用时 *列表 把元素拆成位置实参，**字典 把键值拆成关键字实参。", call=("intro", (), {"name": "小王", "age": 11}))
add("params", "可变默认值的陷阱", """
def add_item(x, box=[]):
    box.append(x)
    return box

add_item(1)
add_item(2)
""", "默认值只在定义函数时计算一次。可变对象（列表）做默认值会在多次调用之间共享，应写 box=None 再在函数里新建。",
    film_fn=lambda ns, v, e: Film(src=["add_item(1)", "add_item(2)"], srcTag=["第 1 次", "第 2 次"], out=[], outTag=[], grid=[["（空）"]], rowTag=["默认 box"], rowSeal=[False])
    ("定义时只创建了一个默认列表", row=0, cells=[[0, 0]])
    ("第 1 次调用 · 往默认列表放入 1", slot=0, lit=[0], grid=[["1"]], cells=[[0, 0]])
    ("第 2 次调用 · 还是同一个列表，变成 [1, 2]", slot=1, lit=[1], grid=[["1", "2"]], cells=[[0, 0], [0, 1]], out=["[1, 2]"], outTag=["返回"], outSeal=True))

# ---------- 匿名函数 ----------
add("lambda", "lambda 写法", """
square = lambda x: x * x
square(6)
""", "lambda 参数: 表达式 创建一个没有名字的小函数，表达式的值就是返回值，不用写 return。",
    call=("square", (6,), {}))
add("lambda", "多个参数", """
add = lambda a, b=10: a + b
add(5)
""", "lambda 也能有多个参数和默认值，规则与 def 完全相同。", call=("add", (5,), {}))
add("lambda", "lambda 与 def 等价", """
def square_def(x):
    return x * x

square = lambda x: x * x
(square_def(7), square(7))
""", "lambda 只能写一个表达式，不能写多条语句。逻辑复杂时用 def 更清楚。",
    film_fn=lambda ns, v, e: Film(src=["7", "7"], srcTag=["def 版", "lambda 版"], out=["49", "49"], outTag=["square_def(7)", "square(7)"])
    ("两种写法传入同一个实参 7", slot=0, lit=[0, 1])("结果相同：都是 49", slot=1, outLit=[0, 1], outSeal=True))
add("lambda", "配合 map 和 filter", """
nums = [1, 2, 3, 4, 5]
list(filter(lambda n: n % 2 == 1, map(lambda n: n * 10, nums)))
""", "lambda 最常用来当作参数传给另一个函数：map 对每个元素变换，filter 按条件筛选。",
    film_fn=lambda ns, v, e: Film(src=[str(n) for n in [1, 2, 3, 4, 5]], srcTag=["nums"] * 5, out=[], outTag=[])
    ("map：每个元素 × 10", slot=4, lit=[0, 1, 2, 3, 4], out=["10", "20", "30", "40", "50"], outTag=["map"] * 5)
    ("filter：只留下奇数 · 10 到 50 全是偶数", slot=4, out=[], outTag=[], outSeal=True))

# ---------- 排序 ----------
def sort_film(items, key, label, reverse=False, key_repr=None):
    src = [repr(x) for x in items]
    keys = [key(x) for x in items]
    order = sorted(range(len(items)), key=lambda i: keys[i], reverse=reverse)
    f = Film(src=src, srcTag=[""] * len(items), out=[], outTag=[])
    for i, x in enumerate(items):
        f(f"key({x!r}) = {keys[i]!r}", slot=i, lit=[i], srcTag=[repr(k) if j <= i else "" for j, k in enumerate(keys)])
    f(f"按 key {'从大到小' if reverse else '从小到大'}排好 · key 相同保持原序", slot=len(items) - 1,
      out=[src[i] for i in order], outTag=[repr(keys[i]) for i in order], outLit=list(range(len(items))), outSeal=True)
    return f


def sorting(title, code, note, items, key, reverse=False):
    add("sort", title, code, note, film_fn=lambda ns, v, e: sort_film(items, key, title, reverse))


WORDS = ["banana", "Kiwi", "apple", "fig"]
sorting("默认排序", """
words = ['banana', 'Kiwi', 'apple', 'fig']
sorted(words)
""", "字符串默认按字符编码比较，大写字母排在所有小写字母前面，所以 'Kiwi' 最先。", WORDS, lambda s: s)
sorting("key=len：按长度", """
words = ['banana', 'Kiwi', 'apple', 'fig']
sorted(words, key=len)
""", "key 接收一个函数：先对每个元素算出 key 值，再按 key 值排序。这里直接传内置函数 len。", WORDS, len)
sorting("key=lambda：忽略大小写", """
words = ['banana', 'Kiwi', 'apple', 'fig']
sorted(words, key=lambda s: s.lower())
""", "用 lambda 临时写一个 key 函数：比较前先转成小写。元素本身不变，只是比较依据变了。", WORDS, lambda s: s.lower())
STU = [("小明", 85), ("小红", 92), ("小刚", 78)]
sorting("按元组的第 2 项排序", """
students = [('小明', 85), ('小红', 92), ('小刚', 78)]
sorted(students, key=lambda s: s[1])
""", "列表里是 (姓名, 分数) 元组，key=lambda s: s[1] 表示按分数比较。", STU, lambda s: s[1])
sorting("reverse=True：从高到低", """
students = [('小明', 85), ('小红', 92), ('小刚', 78)]
sorted(students, key=lambda s: s[1], reverse=True)
""", "reverse=True 把结果倒过来，得到降序。", STU, lambda s: s[1], reverse=True)
PEOPLE = [("小明", 12), ("小红", 11), ("小刚", 12), ("小丽", 11)]
sorting("多条件：先年龄，再姓名", """
people = [('小明', 12), ('小红', 11), ('小刚', 12), ('小丽', 11)]
sorted(people, key=lambda p: (p[1], p[0]))
""", "key 返回元组时，先比第 1 项，相同再比第 2 项。中文姓名按字符编码比较。", PEOPLE, lambda p: (p[1], p[0]))
NUMS = [-7, 3, -1, 5]
sorting("按绝对值排序", """
nums = [-7, 3, -1, 5]
sorted(nums, key=abs)
""", "key=abs 按绝对值比较，结果里保留原来的正负号。", NUMS, abs)
add("sort", "sort() 原地排序，返回 None", """
scores = [85, 92, 78]
result = scores.sort(key=lambda s: -s)
(result, scores)
""", "列表的 sort() 方法直接修改原列表并返回 None；sorted() 返回新列表、原列表不变。两者都接受 key 和 reverse。",
    film_fn=lambda ns, v, e: sort_film([85, 92, 78], lambda s: -s, "", False))

for ex in examples:
    assert ex["steps"], ex["title"]
    for st in ex["steps"]:
        assert len(st["src"]) <= 9 and len(st["out"]) <= 9 and len(st["grid"]) <= 3, ex["title"]
        assert all(len(r) <= 4 for r in st["grid"]), ex["title"]

data = {"python": platform.python_version(), "examples": examples}
Path(__file__).with_name("truth.json").write_text(json.dumps(data, ensure_ascii=False, indent=1))
print(f"wrote truth.json · Python {data['python']} · {len(examples)} examples")
for ex in examples:
    print(f"{ex['mode']:7} {len(ex['steps']):2} · {ex['title']} → {ex['error'] or ex['result']}" + (f" | printed {ex['printed']!r}" if ex["printed"] else ""))
