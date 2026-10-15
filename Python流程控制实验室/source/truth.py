"""Trace every preset program line by line in real Python and write truth.json.

Each step records the line about to run, the variables at that moment, the output so far,
and which flow event (branch taken, loop start, break, continue, ...) it represents.
"""
import contextlib
import io
import json
import platform
import sys
from pathlib import Path

MAX_STEPS = 80


def condition(src):
    s = src.strip()
    for word in ("if ", "elif ", "while "):
        if s.startswith(word) and s.endswith(":"):
            return s[len(word):-1]
    return None


def trace(code):
    steps, out = [], io.StringIO()
    lines = code.split("\n")

    def tracer(frame, event, arg):
        if frame.f_code.co_filename != "<demo>":
            return None
        if event == "line" and frame.f_code.co_name == "<module>":
            names = {k: repr(v) for k, v in frame.f_locals.items() if not k.startswith("__")}
            step = {"line": frame.f_lineno, "vars": names, "out": out.getvalue()}
            cond = condition(lines[frame.f_lineno - 1])
            if cond is not None:
                step["cond"] = cond
                step["value"] = repr(eval(cond, frame.f_globals))
            steps.append(step)
            if len(steps) > MAX_STEPS:
                raise RuntimeError("step budget exceeded")
        return tracer

    error = None
    with contextlib.redirect_stdout(out):
        sys.settrace(tracer)
        try:
            exec(compile(code, "<demo>", "exec"), {})
        except Exception as exc:
            error = f"{type(exc).__name__}: {exc}"
        finally:
            sys.settrace(None)
    final = {"line": 0, "vars": steps[-1]["vars"] if steps else {}, "out": out.getvalue()}
    return steps, final, error


def kind(src):
    s = src.strip()
    for word, k in (("if ", "if"), ("elif ", "elif"), ("else:", "else"), ("while ", "while"), ("for ", "for"),
                    ("break", "break"), ("continue", "continue"), ("pass", "pass"), ("match ", "match"),
                    ("case ", "case"), ("try:", "try"), ("except", "except"), ("finally:", "finally")):
        if s.startswith(word):
            return k
    return "stmt"


def indent(src):
    return len(src) - len(src.lstrip())


def header_of(lines, n):
    """The if/for/while/try header that an else/except at line n (1-based) belongs to."""
    level = indent(lines[n - 1])
    for j in range(n - 2, -1, -1):
        src = lines[j]
        if src.strip() and indent(src) == level and kind(src) in ("if", "elif", "for", "while", "try"):
            if kind(src) != "elif":
                return kind(src)
        if src.strip() and indent(src) < level:
            break
    return None


def where(nxt):
    return f"第 {nxt} 行" if nxt else "程序末尾"


def into_else(lines, here, nxt):
    """True when execution jumps from line `here` straight into the body of its own else."""
    return bool(nxt and nxt >= 2 and lines[nxt - 2].strip() == "else:" and indent(lines[nxt - 2]) == indent(lines[here - 1]))


def detail(lines, steps, i):
    st = steps[i]
    k, nxt, src = st["kind"], st["next"], lines[st["line"] - 1].strip()
    after = steps[i + 1]["vars"] if i + 1 < len(steps) else {}
    if k in ("if", "elif"):
        if st["taken"]:
            return f"{st['cond']} → {st['value']} · 进入代码块"
        return f"{st['cond']} → {st['value']} · " + ("进入 else 块" if into_else(lines, st["line"], nxt) else f"跳过，去{where(nxt)}")
    if k == "while":
        if st["taken"]:
            return f"{st['cond']} → {st['value']} · 执行循环体"
        return f"{st['cond']} → {st['value']} · 条件不成立，循环结束" + ("，执行循环的 else 块" if into_else(lines, st["line"], nxt) else f"，去{where(nxt)}")
    if k == "for":
        target = src[4:src.index(" in ")]
        if st["taken"]:
            names = [t.strip() for t in target.split(",")]
            return "取出下一个元素：" + ", ".join(f"{n} = {after.get(n, '?')}" for n in names)
        if into_else(lines, st["line"], nxt):
            return "元素已取完，循环正常结束（没有 break）· 执行循环的 else 块"
        return f"元素已取完 · 循环结束，去{where(nxt)}"
    if k == "case":
        pattern = src[5:-1]
        return f"case {pattern} · " + ("匹配成功，执行这一支" if st["taken"] else "不匹配，试下一个 case")
    if k == "match":
        subject = src[6:-1]
        return f"match {subject}（{subject} = {st['vars'].get(subject, '?')}）· 依次比较下面的 case"
    if k == "break":
        return f"break · 立即跳出所在循环，去{where(nxt)}"
    if k == "continue":
        return f"continue · 跳过本次剩余语句，回到{where(nxt)}"
    if k == "pass":
        return "pass · 占位，什么也不做，继续下一行"
    if k == "else":
        owner = header_of(lines, st["line"])
        if owner in ("for", "while"):
            return "循环正常结束、没有被 break 打断 · 执行 else 块"
        return "前面的条件都不成立 · 执行 else 块"
    if k == "try":
        return "try · 尝试执行下面的代码，出错就跳到 except"
    if k == "except":
        return "出现了匹配的错误 · 跳到 except 块处理"
    if nxt is not None and nxt <= st["line"]:
        owner = lines[nxt - 1].strip().split(" ")[0]
        return f"执行这一行 · 循环体结束，回到第 {nxt} 行（{owner}）"
    if nxt is not None and nxt > st["line"] + 1:
        return f"执行这一行 · 跳过后面的分支，去第 {nxt} 行"
    return "执行这一行"


examples = []


def add(mode, title, code, note):
    lines = code.strip("\n").split("\n")
    steps, final, error = trace("\n".join(lines) + "\n")
    assert steps, title
    for i, st in enumerate(steps):
        st["kind"] = kind(lines[st["line"] - 1])
        nxt = steps[i + 1]["line"] if i + 1 < len(steps) else None
        st["next"] = nxt
        k, here = st["kind"], st["line"]
        # What the condition decided, read from where execution went next.
        if k in ("if", "elif", "while"):
            st["taken"] = nxt == here + 1
        elif k == "for":
            st["taken"] = nxt == here + 1
        elif k == "case":
            st["taken"] = nxt == here + 1
        else:
            st["taken"] = None
        st["detail"] = detail(lines, steps, i)
    examples.append({"mode": mode, "title": title, "code": lines, "note": note, "steps": steps,
                     "final": final, "error": error})


# ---------- 条件判断 ----------
add("branch", "if / else：二选一", """
score = 72
if score >= 60:
    result = '及格'
else:
    result = '不及格'
print(result)
""", "条件为 True 走 if 下面缩进的代码块，否则走 else 块。两个分支只会执行一个。")
add("branch", "if / elif / else：多选一", """
score = 85
if score >= 90:
    grade = 'A'
elif score >= 80:
    grade = 'B'
elif score >= 60:
    grade = 'C'
else:
    grade = 'D'
print(grade)
""", "从上往下依次判断，遇到第一个为 True 的条件就执行它的块，后面的 elif / else 全部跳过。")
add("branch", "条件顺序很重要", """
score = 95
if score >= 60:
    grade = '及格'
elif score >= 90:
    grade = '优秀'
print(grade)
""", "95 也满足 score >= 60，所以第一个分支先命中，'优秀' 永远轮不到。范围大的条件应放在后面。")
add("branch", "多个独立的 if", """
n = 6
if n % 2 == 0:
    print('偶数')
if n % 3 == 0:
    print('3 的倍数')
""", "两个独立的 if 都会被判断，可以都执行；而 if / elif 最多只执行一个分支。")
add("branch", "and / or 组合条件", """
age = 15
has_ticket = True
if age >= 12 and has_ticket:
    print('可以入场')
else:
    print('不能入场')
""", "and 要求两边都为 True；or 只要一边为 True。not 取反。")
add("branch", "真值判断：空列表为假", """
items = []
if items:
    print('有', len(items), '件')
else:
    print('列表为空')
""", "0、0.0、''、[]、{}、None 都被当作 False；非空容器和非零数字被当作 True。")
add("branch", "条件表达式（三元写法）", """
x = -4
label = '正数' if x > 0 else '非正数'
print(label)
""", "a if 条件 else b 是一个表达式，一行内完成二选一，并把结果赋给变量。")

# ---------- 循环 ----------
add("loop", "for 遍历列表", """
total = 0
for n in [3, 1, 4]:
    total += n
print(total)
""", "for 依次取出每个元素赋给 n，执行一次循环体；取完后回到 for 行发现没有元素了，循环结束。")
add("loop", "for + range()", """
for i in range(1, 4):
    print(i * i)
""", "range(1, 4) 产生 1、2、3，不包含 4。range(n) 从 0 开始。")
add("loop", "while 条件循环", """
n = 3
while n > 0:
    print(n)
    n -= 1
print('发射!')
""", "while 每次先判断条件，为 True 就执行循环体，然后回到 while 行重新判断。循环体内必须让条件最终变为 False。")
add("loop", "累加直到超过上限", """
total = 0
n = 0
while total <= 10:
    n += 1
    total += n
print(n, total)
""", "while 适合“次数事先不确定，直到满足某个条件才停”的情况。")
add("loop", "嵌套循环", """
for row in range(1, 3):
    for col in range(1, 3):
        print(row, '×', col, '=', row * col)
""", "外层每走一次，内层都要从头完整走一遍：共 2 × 2 = 4 次。")
add("loop", "enumerate 同时取下标", """
for i, name in enumerate(['甲', '乙']):
    print(i, name)
""", "enumerate 每次给出 (下标, 元素)，比自己维护计数器更简洁。")

# ---------- 跳转 ----------
add("jump", "break：提前结束循环", """
for n in [5, 7, 8, 9]:
    if n % 2 == 0:
        print('第一个偶数', n)
        break
print('结束')
""", "break 立即跳出它所在的这一层循环，后面的 9 不会再被检查。")
add("jump", "continue：跳过本次", """
for n in range(5):
    if n % 2 == 0:
        continue
    print(n)
""", "continue 跳过本次循环剩下的语句，直接回到循环开头取下一个元素。")
add("jump", "for … else：没有 break 才执行", """
for n in [3, 5, 7]:
    if n % 2 == 0:
        print('找到偶数')
        break
else:
    print('全是奇数')
""", "循环正常走完（没有被 break 打断）时，才执行 else 块。适合“找遍了也没找到”的情况。")
add("jump", "for … else：被 break 打断", """
for n in [3, 4, 7]:
    if n % 2 == 0:
        print('找到偶数', n)
        break
else:
    print('全是奇数')
""", "这次在 4 处 break，所以 else 块被跳过。")
add("jump", "while True + break", """
tries = 0
while True:
    tries += 1
    if tries == 3:
        break
print('尝试了', tries, '次')
""", "while True 本身永远不会停，必须靠循环体里的 break 退出。常用于“直到满足条件为止”。")
add("jump", "break 只跳出一层", """
for a in range(2):
    for b in range(3):
        if b == 1:
            break
        print(a, b)
""", "内层的 break 只结束内层循环，外层循环照常继续下一轮。")
add("jump", "pass：什么也不做", """
for n in range(3):
    if n == 1:
        pass
    else:
        print(n)
""", "pass 是占位语句，语法上需要一个代码块但暂时什么都不做时使用。它和 continue 不同，不会跳过后面的语句。")

# ---------- 综合 ----------
add("combo", "match / case 分支匹配", """
for cmd in ['go', 'stop', 'jump']:
    match cmd:
        case 'go':
            print('前进')
        case 'stop' | 'pause':
            print('停下')
        case _:
            print('未知指令')
""", "match（Python 3.10+）从上往下比较每个 case，执行第一个匹配的；| 表示“或”，_ 匹配任何值，相当于 else。")
add("combo", "try / except 处理错误", """
for text in ['12', 'abc']:
    try:
        n = int(text)
        print('数字', n)
    except ValueError:
        print('不是数字:', text)
""", "try 块里出错时，立即跳到匹配的 except 块，程序不会崩溃，循环继续。")
add("combo", "找出质数", """
for n in range(2, 8):
    for d in range(2, n):
        if n % d == 0:
            break
    else:
        print(n, '是质数')
""", "综合应用：内层循环找因数，找到就 break；没被 break 打断的 else 说明没有因数，n 是质数。")
add("combo", "猜数字（预设输入）", """
answer = 7
for guess in [4, 9, 7]:
    if guess < answer:
        print(guess, '太小')
    elif guess > answer:
        print(guess, '太大')
    else:
        print(guess, '猜对了!')
        break
""", "if / elif / else 判断大小，猜对时 break 结束。这里用预设的猜测代替 input()。")
add("combo", "统计及格人数", """
scores = [58, 90, 72, 45]
passed = 0
for s in scores:
    if s >= 60:
        passed += 1
print(passed, '/', len(scores))
""", "循环 + 条件 + 计数器，是最常见的数据处理模式。")

data = {"python": platform.python_version(), "examples": examples}
Path(__file__).with_name("truth.json").write_text(json.dumps(data, ensure_ascii=False, indent=1))
print(f"wrote truth.json · Python {data['python']} · {len(examples)} examples")
for ex in examples:
    print(f"{ex['mode']:6} {len(ex['steps']):3} steps · {ex['title']} → {ex['final']['out']!r}" + (f" ERROR {ex['error']}" if ex["error"] else ""))
