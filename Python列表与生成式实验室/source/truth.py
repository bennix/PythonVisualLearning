"""Run every preset example in real Python and write truth.json for the page."""
import json
import platform
from pathlib import Path

NUMS = [3, 1, 4, 1, 5, 9]
M = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]


def run(code, ns):
    """Run code; the last line is evaluated as an expression when possible."""
    lines = code.strip().split("\n")
    try:
        if len(lines) > 1:
            exec("\n".join(lines[:-1]), ns)
        try:
            compiled = compile(lines[-1], "<demo>", "eval")
        except SyntaxError:
            exec(lines[-1], ns)
            return {"value": None, "repr": None, "error": None}
        value = eval(compiled, ns)
        return {"value": value, "repr": repr(value), "error": None}
    except Exception as exc:  # the page shows the real exception text
        return {"value": None, "repr": None, "error": f"{type(exc).__name__}: {exc}"}


def show(v):
    return v if isinstance(v, str) else repr(v)


examples = []

# ---------- 列表：索引、切片、方法 ----------
LIST = [
    ("nums[0]", "index", 0, "正索引从 0 开始：第一个元素在 0 号槽。"),
    ("nums[-1]", "index", -1, "负索引从末尾倒数：-1 是最后一个元素，等价于 nums[len(nums) - 1]。"),
    ("nums[2:5]", "slice", (2, 5, None), "切片 [start:stop] 包含 start，不包含 stop，结果是一个新列表。"),
    ("nums[::2]", "slice", (None, None, 2), "step=2 表示每隔一个取一次；省略 start/stop 表示从头到尾。"),
    ("nums[::-1]", "slice", (None, None, -1), "step 为负数时倒着取，nums[::-1] 得到反转后的新列表，原列表不变。"),
    ("nums[10]", "index", 10, "索引超出范围会抛出 IndexError。"),
    ("nums[4:100]", "slice", (4, 100, None), "切片不会越界报错：超出的部分会被自动截断。"),
    ("nums[1] = 8\nnums", "assign", 1, "列表是可变的：可以直接给某个位置重新赋值。"),
    ("nums.append(2)", "method", "append", "append 在末尾添加一个元素，原地修改，返回 None。"),
    ("nums.insert(1, 7)", "method", "insert", "insert(i, x) 把 x 插到索引 i，后面的元素整体后移。"),
    ("nums.pop()", "method", "pop", "pop() 删除并返回最后一个元素；pop(i) 删除索引 i 处的元素。"),
    ("nums.remove(1)", "method", "remove", "remove(x) 只删除第一个等于 x 的元素，返回 None；找不到时抛出 ValueError。"),
    ("nums.sort()", "method", "sort", "sort() 原地排序并返回 None，所以不要写 nums = nums.sort()。"),
    ("sorted(nums)", "sorted", None, "sorted() 返回一个新的已排序列表，原来的 nums 保持不变。"),
]

for code, kind, arg, note in LIST:
    ns = {"nums": list(NUMS)}
    out = run(code, ns)
    after = ns["nums"]
    n = len(NUMS)
    visit, stops, output = [], None, None
    if kind == "index":
        visit = [arg if arg >= 0 else n + arg]
    elif kind == "slice":
        s = slice(*arg)
        visit = list(range(*s.indices(n)))
        start, stop, _ = s.indices(n)
        stops = [start, stop] if (arg[2] or 1) > 0 else None
        output = out["value"]
    elif kind == "assign":
        visit = [arg]
    elif kind == "method":
        visit = {
            "append": [n],
            "insert": [1],
            "pop": [n - 1],
            "remove": [NUMS.index(1)],
            "sort": list(range(n)),
        }[arg]
    elif kind == "sorted":
        visit = list(range(n))
        output = out["value"]
    if kind == "index" and out["error"]:
        visit = [min(arg, 8)]
    examples.append({
        "mode": "list", "code": code, "kind": kind, "note": note,
        "before": list(NUMS), "after": after, "visit": visit, "stops": stops,
        "output": [show(v) for v in output] if output is not None else None,
        "result": out["repr"], "error": out["error"],
        "mutated": after != NUMS,
    })

# ---------- 列表生成式 ----------
COMP = [
    ("x * 2", None, "最基本的形式：对每个元素做同样的变换，结果数量与原列表相同。"),
    ("x", "x % 2 == 1", "末尾的 if 是过滤条件：只有条件为真的元素才会进入新列表。"),
    ("x * x", "x > 2", "先过滤再变换：每个元素先经过 if，通过后才计算 x * x。"),
    ("'奇' if x % 2 else '偶'", None, "写在 for 前面的 a if 条件 else b 是条件表达式：不过滤，每个元素都会输出。"),
]
for expr, cond, note in COMP:
    code = f"[{expr} for x in nums" + (f" if {cond}" if cond else "") + "]"
    ns = {"nums": list(NUMS)}
    out = run(code, ns)
    passes, values = [], []
    for v in NUMS:
        ok = True if cond is None else bool(eval(cond, {"x": v}))
        passes.append(ok)
        if ok:
            values.append(eval(expr, {"x": v}))
    assert values == out["value"], code
    loop = "result = []\nfor x in nums:\n"
    if cond:
        loop += f"    if {cond}:\n        result.append({expr})"
    else:
        loop += f"    result.append({expr})"
    examples.append({
        "mode": "comp", "code": code, "kind": "comp", "note": note, "loop": loop,
        "before": list(NUMS), "after": list(NUMS), "visit": list(range(len(NUMS))),
        "pass": passes, "output": [show(v) for v in values],
        "result": out["repr"], "error": None, "filtered": cond is not None,
    })

scope_code = "squares = [x * x for x in nums]\nx"
ns = {"nums": list(NUMS)}
scope = run(scope_code, ns)
examples.append({
    "mode": "comp", "code": scope_code, "kind": "scope",
    "note": "Python 3 中，生成式里的循环变量 x 只在生成式内部存在，外面访问会抛出 NameError；普通 for 循环的变量则会留在外面。",
    "loop": "squares = []\nfor x in nums:\n    squares.append(x * x)\nx   # 9：普通 for 循环的变量会留下",
    "before": list(NUMS), "after": list(NUMS), "visit": list(range(len(NUMS))),
    "pass": [True] * len(NUMS), "output": [show(v) for v in ns["squares"]],
    "result": None, "error": scope["error"], "filtered": False,
})

# ---------- 嵌套列表 ----------
NEST = [
    ("m[1]", [[1, c] for c in range(3)], 1, None, "m[1] 取出第 1 行，它本身也是一个列表。"),
    ("m[1][2]", [[1, 2]], 1, 2, "m[i][j]：先用 i 选行，再用 j 在这一行里选列。"),
    ("m[-1][0]", [[2, 0]], 2, 0, "负索引同样适用：m[-1] 是最后一行，再取它的第 0 个元素。"),
    ("[x for row in m for x in row]", [[r, c] for r in range(3) for c in range(3)], None, None,
     "展开（扁平化）：多个 for 的顺序与嵌套循环的书写顺序相同，先外层 row，再内层 x。"),
    ("[[row[i] for row in m] for i in range(3)]", [[r, c] for c in range(3) for r in range(3)], None, None,
     "转置：外层按列号 i 循环，内层从每一行取第 i 个，得到新的 3×3 列表。"),
]
for code, cells, row, col, note in NEST:
    ns = {"m": [list(r) for r in M]}
    out = run(code, ns)
    v = out["value"]
    if isinstance(v, list) and v and isinstance(v[0], list):
        flat = [x for r in v for x in r]
    else:
        flat = v if isinstance(v, list) else None
    loop = None
    if code.startswith("[x for row"):
        loop = "result = []\nfor row in m:\n    for x in row:\n        result.append(x)"
    elif code.startswith("[[row[i]"):
        loop = "result = []\nfor i in range(3):\n    new_row = []\n    for row in m:\n        new_row.append(row[i])\n    result.append(new_row)"
    examples.append({
        "mode": "nest", "code": code, "kind": "nest", "note": note, "loop": loop,
        "matrix": M, "cells": cells, "row": row, "col": col,
        "output": [show(x) for x in flat] if flat and code.startswith("[") else None,
        "result": out["repr"], "error": None, "shared": False,
    })

for code, shared, note in [
    ("g = [[0] * 3] * 3\ng[0][0] = 1\ng", True,
     "陷阱：[[0] * 3] * 3 把同一个内层列表复制了 3 次引用。改 g[0][0]，三行同时变化。"),
    ("g = [[0] * 3 for _ in range(3)]\ng[0][0] = 1\ng", False,
     "正确写法：生成式每次循环都新建一个内层列表，三行互不影响。"),
]:
    ns = {}
    out = run(code, ns)
    same = ns["g"][0] is ns["g"][1]
    examples.append({
        "mode": "nest", "code": code, "kind": "shared", "note": note, "loop": None,
        "matrix": ns["g"], "cells": [[r, 0] for r in range(3)] if shared else [[0, 0]],
        "row": 0, "col": 0, "output": None, "result": out["repr"], "error": None,
        "shared": shared, "identity": f"g[0] is g[1]  →  {same}",
    })

data = {"python": platform.python_version(), "nums": NUMS, "m": M, "examples": examples}
Path(__file__).with_name("truth.json").write_text(json.dumps(data, ensure_ascii=False, indent=1))
print(f"wrote truth.json · Python {data['python']} · {len(examples)} examples")
