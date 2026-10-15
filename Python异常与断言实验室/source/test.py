"""Independent check: re-trace every program (without truth.py) and compare events, stacks and outcomes."""
import contextlib, io, json, sys, warnings
from pathlib import Path

d = json.loads((Path(__file__).parent / "truth.json").read_text())
by = {e["title"]: e for e in d["examples"]}


def retrace(code, optimize):
    seen, out = [], io.StringIO()
    def t(frame, ev, arg):
        if frame.f_code.co_filename != "<chk>":
            return None
        if ev in ("line", "exception"):
            depth, f = 0, frame
            while f is not None and f.f_code.co_filename == "<chk>":
                depth, f = depth + 1, f.f_back
            seen.append((ev, frame.f_lineno, frame.f_code.co_name, depth, arg[0].__name__ if ev == "exception" else None))
        return t
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        c = compile(code, "<chk>", "exec", optimize=1 if optimize else -1)
    err = None
    with contextlib.redirect_stdout(out):
        sys.settrace(t)
        try:
            exec(c, {})
        except Exception as e:
            err = type(e).__name__
        finally:
            sys.settrace(None)
    return seen, out.getvalue(), err


for e in d["examples"]:
    seen, out, err = retrace("\n".join(e["code"]) + "\n", e["optimize"])
    mine = [(s["event"], s["line"], s["frame"], len(s["stack"]), s.get("exc")) for s in e["steps"]]
    assert seen == mine, e["title"]
    assert out == e["out"], e["title"]
    assert err == (e["error"].split(":")[0] if e["error"] else None), e["title"]
    if e["error"]:
        assert e["traceback"].strip().splitlines()[-1] == e["error"], e["title"]
    for s in e["steps"]:
        if s["event"] == "exception":
            assert s["kind"] == "raise" and "⚠" not in s["detail"] and s["exc"] in s["detail"]

# Behaviour facts that must hold whatever the data says.
f = by["finally：无论如何都执行"]
assert f["out"].splitlines()[-1] == "关闭文件"
m = by["except 类型不匹配时"]
assert m["out"] == "清理\n" and m["error"].startswith("IndexError"), "finally runs, then the exception escapes"
p = by["异常沿调用栈向上传播"]
exc_depths = [len(s["stack"]) for s in p["steps"] if s["event"] == "exception"]
assert exc_depths == [3, 2, 1], "exception climbs divide → average → main"
assert by["finally 在 return 之前执行"]["out"] == "finally 先执行\n来自 try\n"
assert by["else：没出错才执行"]["out"] == "成功，n = 42\n"
assert by["多个 except：从上往下匹配"]["out"] == "缺少键 'b'\n"
assert by["assert 条件不成立"]["error"] == "AssertionError: x 必须为正数"
assert by["陷阱：assert 加括号永远成立"]["warnings"] and by["陷阱：assert 加括号永远成立"]["error"] is None
assert by["python -O 会删除 assert"]["out"] == "assert 被跳过了\n" and 2 not in [s["line"] for s in by["python -O 会删除 assert"]["steps"]]
assert by["在函数中检查前提"]["out"] == "3.0\n" and by["在函数中检查前提"]["error"] == "AssertionError: 列表不能为空"
assert all(len(e["code"]) <= 11 and max(len(s["stack"]) for s in e["steps"]) <= 3 for e in d["examples"]), "fits 11 seats and 3 stack registers"
print(f"PASS: {len(d['examples'])} programs re-traced independently (lines, frames, stack depth, exception events, output, final error); 11 behaviour facts hold.")
