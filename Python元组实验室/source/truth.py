"""Run every preset example in real Python, script its animation, and write truth.json."""
import json
import platform
from pathlib import Path

T = (3, 1, 4, 1, 5)
N = ((1, 2), (3, 4), (5, 6))
S = lambda xs: [repr(x) for x in xs]


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

    def __init__(self, **state):
        base = dict(slot=0, lit=[], src=S(T), seal=True, out=[], outLit=[], ok=True,
                    grid=[S(r) for r in N], rowSeal=[True] * 3, cells=[], row=0, col=0)
        base.update(state)
        self.state, self.steps = base, []

    def __call__(self, say, **change):
        self.state = {**self.state, "lit": [], "outLit": [], "cells": [], "ok": True, **change, "say": say}
        self.steps.append(dict(self.state))
        return self


examples = []


def add(mode, setup, code, note, film, identity=None, loop=None):
    ns = {}
    exec(setup, ns)
    result, error = run(code, ns)
    examples.append(dict(mode=mode, setup=setup, code=code, note=note, steps=film.steps,
                         result=result, error=error, identity=identity, loop=loop))


TS = "t = (3, 1, 4, 1, 5)"
NS_ = "n = ((1, 2), (3, 4), (5, 6))"

# ---------- 元组基础 ----------
add("tuple", TS, "t[0]", "元组和列表一样按位置取值，正索引从 0 开始。",
    Film()("读取 t[0] = 3", slot=0, lit=[0]))
add("tuple", TS, "t[-1]", "负索引从末尾倒数，-1 是最后一个元素。",
    Film()("读取 t[-1] = 5", slot=4, lit=[4]))
f = Film()
for i in (1, 2, 3):
    f(f"读取槽位 {i}", slot=i, lit=[i])
f("切片得到新元组 (1, 4, 1)", slot=3, lit=[1, 2, 3])
add("tuple", TS, "t[1:4]", "切片同样包含 start、不包含 stop，结果是一个新的元组。", f)
f = Film()
found = []
for i, v in enumerate(T):
    if v == 1:
        found.append(i)
    f(f"检查槽位 {i}：{v}" + (" ✓" if v == 1 else ""), slot=i, lit=[i])
f(f"共找到 {len(found)} 个 1", slot=4, lit=found)
add("tuple", TS, "t.count(1)", "元组只有两个方法：count 统计出现次数，index 查找第一次出现的位置。", f)
f = Film()
for i in (0, 1, 2):
    f(f"检查槽位 {i}" + ("：找到 4" if i == 2 else ""), slot=i, lit=[i])
add("tuple", TS, "t.index(4)", "index(x) 返回第一个等于 x 的索引；找不到会抛出 ValueError。", f)
add("tuple", TS, "t[0] = 9", "元组是不可变的：创建后不能修改、增加或删除元素。",
    Film()("定位槽位 0", slot=0, lit=[0])("封条锁定 · 拒绝写入 · TypeError", slot=0, lit=[0], ok=False))
add("tuple", TS, "t.append(2)", "元组没有 append、insert、remove、pop、sort 这些会修改自身的方法。",
    Film()("移到末尾", slot=5)("元组没有 append · AttributeError", slot=5, ok=False))
add("tuple", TS, "t + (9, 2)", "+ 不会修改 t，而是生成一个新元组；* 重复也一样。",
    Film()("原元组 t", slot=4)("拼接成新元组 · 原 t 不变", slot=6, src=S(T + (9, 2)), lit=[5, 6]),
    identity="t 仍然是 (3, 1, 4, 1, 5)")
add("tuple", TS, "a, b, *rest = t\n(a, b, rest)",
    "解包：按位置把元素分给多个变量。带 * 的变量收集剩余元素，而且它是一个列表。",
    Film()("a ← t[0] = 3", slot=0, lit=[0])("b ← t[1] = 1", slot=1, lit=[1])
    ("rest ← 剩余元素，装进列表", slot=4, lit=[2, 3, 4], out=S(T[2:]), outLit=[0, 1, 2]))
add("tuple", "", "type((5))", "只有括号不是元组：(5) 就是整数 5，括号只起分组作用。",
    Film(src=["5"], seal=False)("括号只是分组 · 没有封条 · 得到 int", slot=0, lit=[0]))
add("tuple", "", "type((5,))", "单元素元组必须写逗号：(5,)。",
    Film(src=["5"])("有逗号 · 得到 tuple", slot=0, lit=[0]))
add("tuple", "", "x = 1, 2, 3\nx", "真正创建元组的是逗号，括号常常可以省略；空元组写作 ()。",
    Film(src=S((1, 2, 3)), seal=False)("逗号把三个值封装成元组", slot=2, lit=[0, 1, 2], seal=True))

# ---------- 嵌套元组 ----------
NG = [S(r) for r in N]
add("nest", NS_, "n[1]", "嵌套元组的元素本身也是元组。n[1] 取出第 1 个内层元组。",
    Film()("选第 1 行 · 得到 (3, 4)", row=1, col=0, cells=[[1, 0], [1, 1]]))
add("nest", NS_, "n[1][0]", "n[i][j]：先选第 i 个内层元组，再选其中第 j 个元素。",
    Film()("第 1 行第 0 列 · 得到 3", row=1, col=0, cells=[[1, 0]]))
add("nest", NS_, "n[-1][-1]", "负索引在每一层都可以用。",
    Film()("最后一行最后一列 · 得到 6", row=2, col=1, cells=[[2, 1]]))
f = Film(src=[], seal=False)
flat = []
for r, p in enumerate(N):
    for c, x in enumerate(p):
        flat.append(repr(x))
        f(f"p = {p} · 取出 {x}", row=r, col=c, cells=[[r, c]], src=list(flat), lit=[len(flat) - 1], slot=len(flat) - 1)
f("封装为新元组", slot=5, seal=True)
add("nest", NS_, "tuple(x for p in n for x in p)", "展开：生成器表达式逐个取出元素，再交给 tuple() 封装。", f,
    loop="items = []\nfor p in n:\n    for x in p:\n        items.append(x)\nresult = tuple(items)")
add("nest", NS_, "n[0][0] = 9", "内层元组同样不可变。",
    Film()("定位 n[0][0]", row=0, col=0, cells=[[0, 0]])("内层也有封条 · TypeError", row=0, col=0, cells=[[0, 0]], ok=False))
BOX = "box = (1, [2, 3])"
add("nest", BOX, "box[1].append(4)\nbox",
    "元组只保证“装着哪些对象”不变；如果某个元素本身是列表，列表的内容仍然可以修改。",
    Film(grid=[["1"], ["2", "3"]], rowSeal=[True, False])("box[1] 是一个列表（没有封条）", row=1, col=1, cells=[[1, 0], [1, 1]])
    ("列表内部追加 4 · 元组没有换对象", row=1, col=2, grid=[["1"], ["2", "3", "4"]], cells=[[1, 2]]),
    identity="box[1] 还是同一个列表对象，只是内容变了")
add("nest", BOX, "box[1] = [9]", "但不能让元组的某个位置改为指向另一个对象。",
    Film(grid=[["1"], ["2", "3"]], rowSeal=[True, False])("定位 box[1]", row=1, col=0, cells=[[1, 0], [1, 1]])
    ("外层元组锁定 · 不能换成新对象 · TypeError", row=1, col=0, cells=[[1, 0], [1, 1]], ok=False))
add("nest", "", "d = {(1, 2): '起点'}\nd[(1, 2)]",
    "只包含不可变对象的元组是可哈希的，可以作为字典的键或放进集合；列表不行。",
    Film(grid=[["1", "2"]], rowSeal=[True])("(1, 2) 可哈希 · 作为字典键查到 '起点'", row=0, col=1, cells=[[0, 0], [0, 1]]))
add("nest", "", "hash((1, [2, 3]))", "元组里只要含有列表，就不可哈希，不能当字典键。",
    Film(grid=[["1"], ["2", "3"]], rowSeal=[True, False])("内部有列表 · 不可哈希 · TypeError", row=1, col=1, cells=[[1, 0], [1, 1]], ok=False))

# ---------- 元组 ⇄ 列表 ----------
f = Film()
for i, v in enumerate(T):
    f(f"复制 {v} 到列表第 {i} 位", slot=i, lit=[i], out=S(T[: i + 1]), outLit=[i])
f("得到列表 · 可以修改了 · 原元组不变", slot=4)
add("convert", TS, "list(t)", "list(元组) 按顺序复制元素，生成一个新的列表。原元组保持不变。", f)
LS = "lst = [3, 1, 4, 1, 5]"
f = Film(src=[], seal=False, out=S(T))
for i, v in enumerate(T):
    f(f"复制 {v} 到元组第 {i} 位", slot=i, lit=[i], src=S(T[: i + 1]), outLit=[i])
f("封装完成 · 元组锁定", slot=4, seal=True)
add("convert", LS, "tuple(lst)", "tuple(列表) 生成一个新的元组；之后再改 lst 也不会影响这个元组。", f)
f = Film()
for i, v in enumerate(T):
    f(f"list(t)：复制 {v}", slot=i, lit=[i], out=S(T[: i + 1]), outLit=[i])
f("lst.append(9)", slot=5, out=S(list(T) + [9]), outLit=[5])
mod = [0] + list(T[1:]) + [9]
f("lst[0] = 0", slot=0, out=S(mod), outLit=[0])
f("tuple(lst)：封装成新元组 t2", slot=5, src=S(mod), lit=list(range(6)), outLit=[])
add("convert", TS, "lst = list(t)\nlst.append(9)\nlst[0] = 0\nt2 = tuple(lst)\nt2",
    "想“修改”元组的常见做法：先转成列表，改完再转回元组。得到的是新元组，原来的 t 不变。", f,
    identity="t 仍然是 (3, 1, 4, 1, 5)")
f = Film()
for i in range(5):
    f(f"扫描槽位 {i}", slot=i, lit=[i])
f("排序结果放进新列表", slot=4, out=S(sorted(T)), outLit=list(range(5)))
add("convert", TS, "sorted(t)", "sorted() 接受任何可迭代对象，但总是返回列表；需要元组时写 tuple(sorted(t))。", f)
f = Film(src=[], seal=False)
for i, ch in enumerate("abc"):
    f(f"取出字符 '{ch}'", slot=i, src=S(tuple("abc"[: i + 1])), lit=[i])
f("封装成元组", slot=2, seal=True)
add("convert", "", "tuple('abc')", "tuple() 和 list() 可以转换任何可迭代对象：字符串、range、集合、字典的键等。", f)
f = Film(src=[], seal=False)
for i in range(4):
    f(f"range 产生 {i}", slot=i, src=S(tuple(range(i + 1))), lit=[i])
f("封装成元组", slot=3, seal=True)
add("convert", "", "tuple(range(4))", "range 对象按需产生数字，tuple() 把它们全部取出并固定下来。", f)
f = Film()
for r in range(3):
    f(f"第 {r} 个内层元组 → 列表", row=r, col=1, cells=[[r, 0], [r, 1]], rowSeal=[False] * (r + 1) + [True] * (2 - r))
add("convert", NS_, "[list(p) for p in n]", "嵌套结构需要逐层转换：用生成式把每个内层元组都转成列表。", f)
f = Film(grid=[["1", "2"], ["3", "4"]], rowSeal=[False, False])
for r in range(2):
    f(f"第 {r} 行列表 → 元组", row=r, col=1, cells=[[r, 0], [r, 1]], rowSeal=[True] * (r + 1) + [False] * (1 - r))
add("convert", "m = [[1, 2], [3, 4]]", "tuple(tuple(r) for r in m)", "反过来，把二维列表逐层转成嵌套元组，结果整体不可变、可哈希。", f)
add("convert", NS_, "list(n)", "list() 只转换最外层：结果是一个列表，但里面的元素仍然是元组。",
    Film()("外层变成列表 · 每一行仍有封条（仍是元组）", row=2, col=1, cells=[[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1]]))

data = {"python": platform.python_version(), "examples": examples}
for ex in examples:
    assert ex["steps"], ex["code"]
Path(__file__).with_name("truth.json").write_text(json.dumps(data, ensure_ascii=False, indent=1))
print(f"wrote truth.json · Python {data['python']} · {len(examples)} examples")
for ex in examples:
    print(ex["mode"], repr(ex["code"]), "→", ex["error"] or ex["result"])
