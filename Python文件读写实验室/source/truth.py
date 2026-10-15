"""Run every preset program in a fresh temp folder under a line tracer and write truth.json.

At each step it records what is really on disk (bytes and decoded text), every open file
object's mode, cursor position (tell) and unflushed buffer, the variables, and the output.
"""
import contextlib
import csv
import io
import json
import os
import re
import platform
import sys
import tempfile
from pathlib import Path

MAX_STEPS = 90


def kind(src):
    s = src.strip()
    for word, k in (("with ", "with"), ("for ", "for"), ("if ", "if"), ("try:", "try"), ("except", "except"),
                    ("import ", "import")):
        if s.startswith(word):
            return k
    for call, k in (("open(", "open"), (".close()", "close"), (".write(", "write"), (".writelines(", "write"),
                    (".writerow", "write"), ("json.dump(", "write"), (".read(", "read"), (".readline(", "read"),
                    (".readlines(", "read"), ("json.load(", "read"), ("csv.reader(", "read"), ("csv.DictReader(", "read"),
                    (".seek(", "seek"), (".flush()", "flush"), ("json.dumps(", "convert"), ("json.loads(", "convert")):
        if call in s:
            return k
    return "stmt"


def disk_state(root):
    files = {}
    for p in sorted(Path(root).iterdir()):
        if p.is_file():
            raw = p.read_bytes()
            try:
                text = raw.decode("utf-8")
            except UnicodeDecodeError:
                text = None
            files[p.name] = {"bytes": len(raw), "text": text, "hex": raw[:24].hex(" ")}
    return files


class Tracked(io.TextIOWrapper):
    """A TextIOWrapper that counts the bytes passed to write(); behaves exactly like built-in open's object."""

    def write(self, s):
        n = super().write(s)
        self.sent += len(s.encode(self.encoding))
        return n


def tracked_open(file, mode="r", buffering=-1, encoding=None, errors=None, newline=None):
    if "b" in mode:
        return open(file, mode, buffering, encoding, errors, newline)
    raw = open(file, mode.replace("t", "") + "b", buffering)
    f = Tracked(raw, encoding=encoding, errors=errors, newline=newline)
    f.mode = mode
    f.sent = 0
    f.start = os.path.getsize(file) if "a" in mode else 0
    return f


def handles(frame):
    out = {}
    for name, v in frame.f_locals.items():
        if isinstance(v, io.TextIOWrapper) and not name.startswith("__"):
            h = {"file": os.path.basename(v.name), "mode": v.mode, "closed": v.closed, "encoding": v.encoding}
            if not v.closed:
                if v.writable() and not v.readable():
                    h["tell"] = None
                    h["pending"] = max(0, v.start + v.sent - os.path.getsize(v.name))
                else:
                    try:
                        h["tell"] = v.tell()
                    except (OSError, ValueError):
                        h["tell"] = None
                    h["pending"] = 0
            out[name] = h
    return out


def show(v):
    if isinstance(v, io.TextIOWrapper):
        return f"<文件对象 {os.path.basename(v.name)} {v.mode}{' 已关闭' if v.closed else ''}>"
    r = repr(v)
    return r if len(r) <= 70 else r[:67] + "..."


def trace(code, setup):
    out = io.StringIO()
    steps, final = [], {}
    with tempfile.TemporaryDirectory() as root:
        for name, content in setup.items():
            Path(root, name).write_bytes(content.encode("utf-8") if isinstance(content, str) else content)
        here = os.getcwd()
        os.chdir(root)

        def tracer(frame, event, arg):
            if frame.f_code.co_filename != "<demo>":
                return None
            if event == "return" and frame.f_code.co_name == "<module>":
                final["disk"], final["handles"], final["out"] = disk_state(root), handles(frame), out.getvalue()
                final["vars"] = {k: show(v) for k, v in frame.f_locals.items()
                                 if not k.startswith("__") and not callable(v) and type(v).__name__ != "module"}
            if event in ("line", "exception") and frame.f_code.co_name == "<module>":
                st = {"line": frame.f_lineno, "event": event, "disk": disk_state(root), "handles": handles(frame),
                      "vars": {k: show(v) for k, v in frame.f_locals.items()
                               if not k.startswith("__") and not callable(v) and type(v).__name__ != "module"},
                      "out": out.getvalue()}
                if event == "exception":
                    st["exc"] = f"{arg[0].__name__}: {arg[1]}"
                steps.append(st)
                if len(steps) > MAX_STEPS:
                    raise RuntimeError("step budget")
            return tracer

        error = None
        with contextlib.redirect_stdout(out):
            sys.settrace(tracer)
            try:
                exec(compile(code, "<demo>", "exec"), {"open": tracked_open})
            except Exception as exc:
                error = f"{type(exc).__name__}: {exc}"
            finally:
                sys.settrace(None)
        final_disk = disk_state(root)
        if not final:
            final = {"disk": final_disk, "handles": steps[-1]["handles"] if steps else {}, "out": out.getvalue(),
                     "vars": steps[-1]["vars"] if steps else {}}
        os.chdir(here)
    return steps, out.getvalue(), error, final_disk, final


def explain(lines, steps, i):
    st = steps[i]
    src = lines[st["line"] - 1].strip()
    prev = steps[i - 1] if i else None
    nxt = steps[i + 1] if i + 1 < len(steps) else None
    if st["event"] == "exception":
        return f"出错 · {st['exc']}"
    k = kind(src)
    after = st["after"]
    # A `with` line reported again after its body means the block is exiting: the file is closed.
    if k == "with" and prev and prev["line"] > st["line"]:
        return "离开 with 块 · 自动调用 close()，缓冲区的内容写入磁盘"
    if k == "with":
        m = re.search(r"open\('([^']+)'(?:,\s*'([rwabxt+]+)')?", src)
        mode = (m.group(2) or "r") if m else "r"
        what = {"r": "读取", "w": "写入（先清空）", "a": "追加"}.get(mode[0], mode)
        return f"with open('{m.group(1)}', '{mode}') · {what}模式打开，块结束时自动关闭"
    if k == "open":
        return "open() · 打开文件，得到文件对象" + ("；'w' 模式会立即清空原文件" if "'w'" in src else "")
    if k == "close":
        return "close() · 关闭文件，缓冲区写入磁盘"
    if k == "flush":
        return "flush() · 不关闭文件，立即把缓冲区写入磁盘"
    if k == "write":
        grew = any(after["disk"].get(n, {}).get("bytes", 0) != st["disk"].get(n, {}).get("bytes", 0) for n in after["disk"])
        pend = sum(h.get("pending", 0) for h in after["handles"].values())
        if grew:
            return "写入 · 内容已到达磁盘"
        return f"写入 · {pend} 字节先放在缓冲区，磁盘上暂时还看不到" if pend else "写入"
    if k == "read":
        pos = [h.get("tell") for h in after["handles"].values() if h.get("tell") is not None]
        return "读取 · 从当前位置往后读" + (f"，读完后位置移到第 {pos[0]} 字节" if pos else "")
    if k == "seek":
        return "seek() · 移动读写位置"
    if k == "convert":
        return "json.dumps / loads · 在字符串和 Python 对象之间转换，不涉及文件"
    if k == "for":
        return "for · 逐行（或逐条记录）遍历"
    if k == "import":
        return "导入模块"
    return "执行这一行"


examples = []


def add(mode, title, code, note, setup=None):
    lines = code.strip("\n").split("\n")
    steps, out, error, final_disk, final = trace("\n".join(lines) + "\n", setup or {})
    assert steps, title
    # Each step shows the state after its line ran: the next snapshot, or the final one.
    for i, st in enumerate(steps):
        after = steps[i + 1] if i + 1 < len(steps) else final
        st["after"] = {k: after[k] for k in ("disk", "handles", "vars", "out")}
    for i, st in enumerate(steps):
        st["next"] = steps[i + 1]["line"] if i + 1 < len(steps) else None
        st["kind"] = "error" if st["event"] == "exception" else kind(lines[st["line"] - 1])
        st["detail"] = explain(lines, steps, i)
    examples.append({"mode": mode, "title": title, "code": lines, "note": note, "steps": steps, "out": out,
                     "error": error, "setup": setup or {}, "finalDisk": final_disk})


POEM = "床前明月光\n疑是地上霜\n举头望明月\n"

# ---------- 文本文件 ----------
add("text", "with open 写入文本", """
with open('note.txt', 'w', encoding='utf-8') as f:
    f.write('第一行\\n')
    f.write('第二行\\n')
print('写好了')
""", "with open(文件名, 'w', encoding='utf-8') as f 打开文件，块结束时自动关闭。write 不会自动换行，要自己写 \\n。")
add("text", "read() 一次读完", """
with open('poem.txt', encoding='utf-8') as f:
    text = f.read()
print(text)
print(len(text), '个字符')
""", "默认模式 'r' 是读取。read() 返回整个文件内容的字符串，换行符 \\n 也算字符。", {"poem.txt": POEM})
add("text", "for 逐行读取", """
with open('poem.txt', encoding='utf-8') as f:
    for line in f:
        print(line.strip())
""", "文件对象可以直接用 for 遍历，每次得到一行（包含末尾的 \\n），用 strip() 去掉。大文件也只占很少内存。", {"poem.txt": POEM})
add("text", "readline 与读写位置", """
with open('poem.txt', encoding='utf-8') as f:
    a = f.readline()
    b = f.readline()
    f.seek(0)
    c = f.readline()
print(a, b, c)
""", "文件对象记着当前位置：每次读取都从上次停下的地方继续。seek(0) 回到开头。", {"poem.txt": POEM})
add("text", "readlines 得到列表", """
with open('poem.txt', encoding='utf-8') as f:
    lines = f.readlines()
print(lines)
""", "readlines() 返回每一行组成的列表，每个元素都带着 \\n。", {"poem.txt": POEM})
add("text", "'w' 会清空原文件", """
with open('poem.txt', 'w', encoding='utf-8') as f:
    f.write('新内容\\n')
""", "'w' 模式打开的瞬间，原来的内容就被清空了，即使还没写任何东西。", {"poem.txt": POEM})
add("text", "'a' 追加到末尾", """
with open('poem.txt', 'a', encoding='utf-8') as f:
    f.write('低头思故乡\\n')
""", "'a' 模式保留原内容，新写入的放在文件末尾。", {"poem.txt": POEM})
add("text", "不用 with 时必须 close", """
f = open('log.txt', 'w', encoding='utf-8')
f.write('重要数据')
size = 0
f.close()
done = True
""", "写入的内容先放在内存缓冲区里，close()（或 flush()）之后才真正写到磁盘。忘记关闭可能丢数据，所以推荐用 with。")
add("text", "文件不存在", """
try:
    with open('missing.txt', encoding='utf-8') as f:
        print(f.read())
except FileNotFoundError as e:
    print('找不到文件:', e.filename)
""", "以读取模式打开不存在的文件会抛出 FileNotFoundError，可以用 try / except 处理。")
add("text", "编码不一致会出错", """
with open('cn.txt', 'w', encoding='utf-8') as f:
    f.write('中文')
with open('cn.txt', encoding='gbk') as f:
    print(f.read())
""", "用 UTF-8 写入、却用 GBK 读取，字节对不上就会 UnicodeDecodeError。读写时要用同一种编码，推荐始终写 encoding='utf-8'。")

# ---------- CSV ----------
SCORES = "姓名,语文,数学\n小明,88,95\n小红,92,81\n"
add("csv", "csv.writer 写入表格", """
import csv
rows = [['姓名', '分数'], ['小明', 88], ['小红', 92]]
with open('scores.csv', 'w', newline='', encoding='utf-8') as f:
    writer = csv.writer(f)
    writer.writerows(rows)
""", "csv.writer 把每个列表写成一行，元素之间加逗号。打开 CSV 时写 newline=''，避免在 Windows 上多出空行。")
add("csv", "csv.reader 读取", """
import csv
with open('scores.csv', newline='', encoding='utf-8') as f:
    for row in csv.reader(f):
        print(row)
""", "csv.reader 把每一行拆成字符串列表。注意：读出来的数字也是字符串，计算前要 int()。", {"scores.csv": SCORES})
add("csv", "DictReader 按列名读取", """
import csv
with open('scores.csv', newline='', encoding='utf-8') as f:
    for row in csv.DictReader(f):
        print(row['姓名'], int(row['数学']))
""", "DictReader 把第一行当作列名，每一行变成字典，用列名取值，比记下标更清楚。", {"scores.csv": SCORES})
add("csv", "DictWriter 写入字典", """
import csv
people = [{'name': '小李', 'age': 12}, {'name': '小王', 'age': 11}]
with open('people.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=['name', 'age'])
    w.writeheader()
    w.writerows(people)
""", "DictWriter 需要 fieldnames 指定列顺序；writeheader() 写表头行。")
add("csv", "含逗号的值自动加引号", """
import csv
with open('items.csv', 'w', newline='', encoding='utf-8') as f:
    csv.writer(f).writerow(['苹果', '红色,圆形', 5])
with open('items.csv', newline='', encoding='utf-8') as f:
    print(next(csv.reader(f)))
""", "值里本身有逗号时，csv 模块会自动用双引号包起来，读回时也能正确还原。所以不要自己用 split(',') 解析 CSV。")
add("csv", "统计：计算平均分", """
import csv
total = 0
count = 0
with open('scores.csv', newline='', encoding='utf-8') as f:
    for row in csv.DictReader(f):
        total += int(row['数学'])
        count += 1
print('数学平均分', total / count)
""", "综合应用：逐行读取、把字符串转成数字、累加统计。", {"scores.csv": SCORES})

# ---------- JSON ----------
CONFIG = '{"name": "小明", "level": 3, "tags": ["python", "数学"], "vip": false}'
add("json", "json.dump 写入文件", """
import json
data = {'name': '小明', 'level': 3, 'tags': ['python', '数学']}
with open('data.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
""", "json.dump(对象, 文件) 把字典、列表等写成 JSON 文本。ensure_ascii=False 保留中文原样，indent=2 让文件分行缩进、便于阅读。")
add("json", "json.load 读取文件", """
import json
with open('config.json', encoding='utf-8') as f:
    cfg = json.load(f)
print(cfg['name'], cfg['tags'][1], cfg['vip'])
""", "json.load(文件) 把 JSON 文本还原成 Python 对象：对象 → dict，数组 → list，true/false → True/False，null → None。", {"config.json": CONFIG})
add("json", "dumps / loads：字符串互转", """
import json
s = json.dumps({'ok': True, 'x': None, 'n': (1, 2)})
back = json.loads(s)
print(s)
print(back)
""", "带 s 的版本处理字符串而不是文件。元组会变成 JSON 数组，读回来是列表；True/None 写成 true/null。")
add("json", "中文：ensure_ascii 的区别", """
import json
a = json.dumps({'城市': '北京'})
b = json.dumps({'城市': '北京'}, ensure_ascii=False)
print(a)
print(b)
""", "默认 ensure_ascii=True，中文被写成 \\uXXXX 转义；设为 False 才保留中文原样。两种读回来结果相同。")
add("json", "读取 → 修改 → 写回", """
import json
with open('config.json', encoding='utf-8') as f:
    cfg = json.load(f)
cfg['level'] += 1
cfg['vip'] = True
with open('config.json', 'w', encoding='utf-8') as f:
    json.dump(cfg, f, ensure_ascii=False)
""", "修改 JSON 文件的标准做法：读进来成为字典，改字典，再整体写回。", {"config.json": CONFIG})
add("json", "JSON 格式错误", """
import json
try:
    json.loads("{'name': '小明'}")
except json.JSONDecodeError as e:
    print('格式错误:', e.msg)
""", "JSON 要求字符串用双引号，单引号不合法，会抛出 JSONDecodeError。")
add("json", "集合不能写成 JSON", """
import json
try:
    json.dumps({'ids': {1, 2}})
except TypeError as e:
    print(e)
""", "JSON 只支持 dict、list、str、int、float、bool、None（元组会转成数组）。集合等其他类型要先转换，比如 list(集合)。")

for ex in examples:
    for st in ex["steps"]:
        assert len(st["disk"]) <= 2, (ex["title"], list(st["disk"]))
        assert len(st["handles"]) <= 1, ex["title"]
    assert len(ex["code"]) <= 11, ex["title"]

data = {"python": platform.python_version(), "examples": examples}
Path(__file__).with_name("truth.json").write_text(json.dumps(data, ensure_ascii=False, indent=1))
print(f"wrote truth.json · Python {data['python']} · {len(examples)} examples")
for ex in examples:
    disk = {k: v["bytes"] for k, v in ex["finalDisk"].items()}
    print(f"{ex['mode']:5} {len(ex['steps']):2} · {ex['title']} · disk {disk} · out {ex['out'][:40]!r}" + (f" · ERR {ex['error']}" if ex["error"] else ""))
