"""Independent check: re-run every program in a fresh tracer and compare with truth.json.

It does not import truth.py. It also checks flow facts that must hold whatever the data says.
"""
import contextlib, io, json, sys
from pathlib import Path

d = json.loads((Path(__file__).parent / "truth.json").read_text())


def lines_and_output(code):
    seen, out = [], io.StringIO()
    def t(frame, ev, arg):
        if frame.f_code.co_filename != "<check>":
            return None
        if ev == "line" and frame.f_code.co_name == "<module>":
            seen.append(frame.f_lineno)
        return t
    with contextlib.redirect_stdout(out):
        sys.settrace(t)
        try:
            exec(compile(code, "<check>", "exec"), {})
        finally:
            sys.settrace(None)
    return seen, out.getvalue()


by = {e["title"]: e for e in d["examples"]}
for e in d["examples"]:
    seen, out = lines_and_output("\n".join(e["code"]) + "\n")
    assert seen == [s["line"] for s in e["steps"]], e["title"]
    assert out == e["final"]["out"], e["title"]
    assert e["steps"][-1]["out"] in out
    for i, s in enumerate(e["steps"]):
        assert s["next"] == (e["steps"][i + 1]["line"] if i + 1 < len(e["steps"]) else None)
        # Output only grows, one step at a time.
        if i:
            assert s["out"].startswith(e["steps"][i - 1]["out"])
        if s["kind"] in ("if", "elif", "while"):
            assert s["value"] is not None and s["taken"] == (s["next"] == s["line"] + 1), e["title"]
            if s["kind"] != "while":
                assert s["taken"] == bool(eval(s["value"])), (e["title"], s)
    assert len(e["code"]) <= 10 and all(len(s["vars"]) <= 3 for s in e["steps"]), "fits 10 seats and 3 registers"

# Flow facts.
assert "else" not in [s["kind"] for s in by["for … else：被 break 打断"]["steps"]] and "全是奇数" not in by["for … else：被 break 打断"]["final"]["out"]
assert by["for … else：没有 break 才执行"]["final"]["out"] == "全是奇数\n"
assert [s["line"] for s in by["if / elif / else：多选一"]["steps"]].count(7) == 0, "later elif is skipped"
assert by["条件顺序很重要"]["final"]["out"] == "及格\n"
assert by["break 只跳出一层"]["final"]["out"] == "0 0\n1 0\n"
assert by["continue：跳过本次"]["final"]["out"] == "1\n3\n"
assert by["pass：什么也不做"]["final"]["out"] == "0\n2\n"
assert by["找出质数"]["final"]["out"] == "".join(f"{p} 是质数\n" for p in (2, 3, 5, 7))
assert all(e["error"] is None for e in d["examples"])
html = (Path(__file__).parent.parent / "index.html").read_text()
assert "https://" not in html.split("<script>")[0].split("<body")[0]
print(f"PASS: {len(d['examples'])} programs re-traced independently; every line sequence, output, condition value and jump matches; 8 flow facts hold.")
