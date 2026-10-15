"""Independent check, without truth.py: run each program with the REAL built-in open() in a clean temp
folder and compare final disk contents, output and errors with truth.json (recorded with a counting open)."""
import contextlib, io, json, os, sys, tempfile
from pathlib import Path

d = json.loads((Path(__file__).parent / "truth.json").read_text())
by = {e["title"]: e for e in d["examples"]}

for e in d["examples"]:
    out = io.StringIO()
    with tempfile.TemporaryDirectory() as root:
        for name, content in e["setup"].items():
            Path(root, name).write_bytes(content.encode("utf-8"))
        here = os.getcwd(); os.chdir(root)
        err = None
        lines = []
        def t(frame, ev, arg):
            if frame.f_code.co_filename != "<chk>": return None
            if ev == "line" and frame.f_code.co_name == "<module>": lines.append(frame.f_lineno)
            return t
        with contextlib.redirect_stdout(out):
            sys.settrace(t)
            try:
                exec(compile("\n".join(e["code"]) + "\n", "<chk>", "exec"), {})
            except Exception as exc:
                err = f"{type(exc).__name__}: {exc}"
            finally:
                sys.settrace(None)
        disk = {p.name: p.read_bytes() for p in Path(root).iterdir()}
        os.chdir(here)
    assert out.getvalue() == e["out"], e["title"]
    assert err == e["error"], e["title"]
    assert {k: len(v) for k, v in disk.items()} == {k: v["bytes"] for k, v in e["finalDisk"].items()}, e["title"]
    assert {k: v.decode("utf-8", "replace") for k, v in disk.items()} == {k: v["text"] for k, v in e["finalDisk"].items() if v["text"] is not None} | {k: disk[k].decode("utf-8", "replace") for k, v in e["finalDisk"].items() if v["text"] is None}, e["title"]
    assert lines == [s["line"] for s in e["steps"] if s["event"] == "line"], e["title"]
    for i, s in enumerate(e["steps"]):
        nxt = e["steps"][i + 1] if i + 1 < len(e["steps"]) else None
        if nxt:
            assert s["after"]["disk"] == nxt["disk"], ("after = next snapshot", e["title"], i)
        for h in s["after"]["handles"].values():
            if not h["closed"] and "w" in h["mode"] or "a" in h["mode"]:
                assert h.get("pending", 0) >= 0
    last = e["steps"][-1]["after"]["disk"]
    assert {k: v["bytes"] for k, v in last.items()} == {k: v["bytes"] for k, v in e["finalDisk"].items()}, ("last after = final disk", e["title"])

# Behaviour facts.
w = by["不用 with 时必须 close"]["steps"]
assert [s["after"]["disk"]["log.txt"]["bytes"] for s in w] == [0, 0, 0, 12, 12], "bytes reach disk only at close()"
assert w[1]["after"]["handles"]["f"]["pending"] == 12
assert by["'w' 会清空原文件"]["steps"][0]["after"]["disk"]["poem.txt"]["bytes"] == 0, "'w' empties on open"
assert by["'a' 追加到末尾"]["finalDisk"]["poem.txt"]["text"].endswith("低头思故乡\n") and by["'a' 追加到末尾"]["finalDisk"]["poem.txt"]["text"].startswith("床前明月光")
tells = [s["after"]["handles"]["f"]["tell"] for s in by["readline 与读写位置"]["steps"][:5]]
assert tells == [0, 16, 32, 0, 16], tells
assert by["编码不一致会出错"]["error"].startswith("UnicodeDecodeError")
assert by["含逗号的值自动加引号"]["finalDisk"]["items.csv"]["text"] == '苹果,"红色,圆形",5\r\n'
assert by["csv.reader 读取"]["out"].splitlines()[1] == "['小明', '88', '95']", "numbers come back as strings"
assert '"城市": "北京"' in by["中文：ensure_ascii 的区别"]["out"] and "\\u57ce" in by["中文：ensure_ascii 的区别"]["out"]
assert json.loads(by["读取 → 修改 → 写回"]["finalDisk"]["config.json"]["text"]) == {"name": "小明", "level": 4, "tags": ["python", "数学"], "vip": True}
assert by["文件不存在"]["finalDisk"] == {}
print(f"PASS: {len(d['examples'])} programs re-run with the real open(); disk bytes, text, output, errors and line order match; 11 behaviour facts hold.")
