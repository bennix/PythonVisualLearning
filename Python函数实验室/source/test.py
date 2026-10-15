"""Independent check: re-run every example and re-derive bindings and sort orders without truth.py."""
import contextlib, inspect, io, json
from pathlib import Path

d = json.loads((Path(__file__).parent / "truth.json").read_text())
by = {e["title"]: e for e in d["examples"]}


def execute(code):
    ns, out = {}, io.StringIO()
    lines = code.split("\n")
    with contextlib.redirect_stdout(out):
        try:
            exec("\n".join(lines[:-1]), ns)
            v = eval(lines[-1], ns)
            return ns, repr(v), out.getvalue(), None
        except Exception as exc:
            return ns, None, out.getvalue(), f"{type(exc).__name__}: {exc}"


for e in d["examples"]:
    ns, value, printed, error = execute(e["code"])
    assert error == e["error"], (e["title"], error)
    assert printed == e["printed"], e["title"]
    if not error:
        assert value == (e["result"] if e["result"] is not None else "None"), (e["title"], value, e["result"])
    last = e["steps"][-1]
    assert last["ok"] == (error is None), ("flag down only on error", e["title"])

# Binding: for each call example, the parameter row ends holding exactly what bind() + defaults gives.
calls = {
    "位置参数：按顺序": ("intro", ("小红", 12), {}),
    "关键字参数：按名字": ("intro", (), {"age": 12, "name": "小红"}),
    "默认参数：可以不传": ("power", (5,), {}),
    "默认参数：传了就覆盖": ("power", (2, 10), {}),
    "*args：收集多余的位置参数": ("total", (1, 2, 3, 4), {}),
    "**kwargs：收集多余的关键字参数": ("profile", ("小李",), {"age": 13, "city": "北京"}),
    "仅关键字参数：* 后面的": ("move", (10,), {"speed": 3}),
    "仅位置参数：/ 前面的": ("clamp", (15,), {"hi": 12}),
    "几种形式组合": ("demo", (1, 5, 6, 7), {"c": 8, "d": 9}),
    "调用时用 * 和 ** 拆包": ("intro", (), {"name": "小王", "age": 11}),
}
for title, (name, args, kwargs) in calls.items():
    e = by[title]
    ns, *_ = execute(e["code"])
    sig = inspect.signature(ns[name])
    b = sig.bind(*args, **kwargs)
    b.apply_defaults()
    fixed = [p for p in sig.parameters.values() if p.kind not in (p.VAR_POSITIONAL, p.VAR_KEYWORD)]
    final = e["steps"][-1]
    assert final["out"] == [repr(b.arguments[p.name]) for p in fixed], (title, final["out"])
    for tag, row in zip(final["rowTag"], final["grid"]):
        pname = tag.lstrip("*")
        got = b.arguments.get(pname, () if tag.count("*") == 1 else {})
        want = [repr(x) for x in got] if tag.count("*") == 1 else [f"{k!r}: {v!r}" for k, v in got.items()]
        assert row == (want or ["（空）"]), (title, tag, row, want)
for title in ("仅关键字参数：用位置传会报错", "缺少参数会报错"):
    assert by[title]["error"].startswith("TypeError") and not by[title]["steps"][-1]["ok"]

# Sorting: the result row equals Python's sorted() on the same data.
for e in d["examples"]:
    if e["mode"] != "sort":
        continue
    final = e["steps"][-1]
    if e["result"] and e["result"].startswith("["):
        assert "[" + ", ".join(final["out"]) + "]" == e["result"], e["title"]
assert by["sort() 原地排序，返回 None"]["result"] == "(None, [92, 85, 78])"
assert by["默认排序"]["result"].startswith("['Kiwi'"), "uppercase sorts first"
assert by["多条件：先年龄，再姓名"]["result"] == repr(sorted([('小明', 12), ('小红', 11), ('小刚', 12), ('小丽', 11)], key=lambda p: (p[1], p[0])))
assert by["可变默认值的陷阱"]["result"] == "[1, 2]"
assert by["没有 return 就返回 None"]["printed"] == "你好, 小明\nNone\n"
print(f"PASS: {len(d['examples'])} examples re-run; {len(calls)} bindings re-derived with inspect.signature().bind(); sort rows match sorted(); error flags match.")
