"""Trace every preset program in real Python, including function frames and exception events.

Each step records: the line, which function frame it is in, the call stack, the exception
currently travelling (if any), variables, output so far, and a plain-language explanation.
"""
import contextlib
import io
import json
import platform
import sys
import traceback
import warnings
from pathlib import Path

MAX_STEPS = 80


def kind(src):
    s = src.strip()
    for word, k in (("try:", "try"), ("except", "except"), ("else:", "else"), ("finally:", "finally"),
                    ("raise", "raise"), ("assert ", "assert"), ("def ", "def"), ("return", "return"),
                    ("if ", "if"), ("for ", "for"), ("while ", "while")):
        if s.startswith(word):
            return k
    return "stmt"


def trace(code, optimize=-1):
    steps, out = [], io.StringIO()
    lines = code.split("\n")

    def frames(frame):
        stack = []
        while frame is not None and frame.f_code.co_filename == "<demo>":
            stack.append(frame.f_code.co_name)
            frame = frame.f_back
        return stack[::-1]

    def snapshot(frame):
        return {k: repr(v) for k, v in frame.f_locals.items()
                if not k.startswith("__") and not callable(v) and not isinstance(v, type)}

    def tracer(frame, event, arg):
        if frame.f_code.co_filename != "<demo>":
            return None
        if event == "line":
            steps.append({"line": frame.f_lineno, "frame": frame.f_code.co_name, "stack": frames(frame),
                          "vars": snapshot(frame), "out": out.getvalue(), "event": "line"})
        elif event == "exception":
            exc_type, exc, _ = arg
            steps.append({"line": frame.f_lineno, "frame": frame.f_code.co_name, "stack": frames(frame),
                          "vars": snapshot(frame), "out": out.getvalue(), "event": "exception",
                          "exc": exc_type.__name__, "msg": str(exc)})
        if len(steps) > MAX_STEPS:
            raise RuntimeError("step budget exceeded")
        return tracer

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        compiled = compile(code, "<demo>", "exec", optimize=optimize)
    error = tb = None
    with contextlib.redirect_stdout(out):
        sys.settrace(tracer)
        try:
            exec(compiled, {})
        except Exception as exc:
            error = f"{type(exc).__name__}: {exc}" if str(exc) else type(exc).__name__
            tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__)).replace('File "<demo>", ', "")
        finally:
            sys.settrace(None)
    return steps, out.getvalue(), error, tb, [str(w.message) for w in caught]


def block_of(lines, n):
    """Header keyword of the block that line n (1-based) sits in, e.g. 'finally', 'except', 'else'."""
    level = len(lines[n - 1]) - len(lines[n - 1].lstrip())
    for j in range(n - 2, -1, -1):
        src = lines[j]
        if src.strip() and len(src) - len(src.lstrip()) < level:
            return kind(src)
    return None


def explain(lines, steps, i, final_error):
    st = steps[i]
    src = lines[st["line"] - 1].strip()
    nxt = steps[i + 1] if i + 1 < len(steps) else None
    where = "函数 " + st["frame"] + "() 的" if st["frame"] != "<module>" else "主程序"
    if st["event"] == "exception":
        name = st["exc"] + (f": {st['msg']}" if st["msg"] else "")
        if nxt is None:
            return f"{name} · 没有人处理 · 程序终止，打印 Traceback"
        if nxt["event"] == "exception" and len(nxt["stack"]) < len(st["stack"]):
            return f"{name} · {where.replace(' 的', '')}里没有处理它 · 向上抛给调用者 {nxt['frame'] if nxt['frame'] != '<module>' else '主程序'}"
        if nxt["event"] == "exception":
            return f"{name} · {where}第 {st['line']} 行冒出来"
        target = lines[nxt["line"] - 1].strip()
        if target.startswith("except"):
            return f"{name} · {where}第 {st['line']} 行出错 · 跳到第 {nxt['line']} 行，逐个检查 except"
        if block_of(lines, nxt["line"]) == "finally":
            return f"{name} · 没有匹配的 except · 先执行 finally（第 {nxt['line']} 行），之后继续向上抛"
        return f"{name} · {where}第 {st['line']} 行出错 · 跳到第 {nxt['line']} 行"
    k = kind(src)
    if k == "try":
        return "try · 开始监视下面缩进的代码，出错就跳去 except"
    if k == "except":
        if nxt and nxt["line"] == st["line"] + 1 and nxt["event"] == "line":
            return f"{src.rstrip(':')} · 类型匹配，进入这个 except 块"
        if nxt and lines[nxt["line"] - 1].strip().startswith("except"):
            return f"{src.rstrip(':')} · 类型不匹配，检查下一个 except"
        if nxt and block_of(lines, nxt["line"]) == "finally":
            return f"{src.rstrip(':')} · 类型不匹配，也没有别的 except · 先执行 finally，之后异常继续向外抛"
        return f"{src.rstrip(':')} · 类型不匹配 · 异常继续向外抛"
    if k == "else":
        return "else · try 块没有出错，才执行这里"
    if k == "finally":
        return "finally · 无论是否出错都会执行"
    if k == "raise":
        return "raise · 把刚才捕获的异常原样再抛出" if src == "raise" else f"{src} · 主动抛出异常"
    if k == "assert":
        if nxt and nxt["event"] == "exception" and nxt["exc"] == "AssertionError":
            return f"{src} · 条件为 False · 抛出 AssertionError"
        return f"{src} · 条件为 True · 什么都不发生，继续"
    if src.startswith("class "):
        return f"定义异常类 {src[6:src.index('(')]}，继承自 {src[src.index('(') + 1:src.index(')')]}"
    if st["frame"] != "<module>" and lines[0].startswith("class ") and st["line"] <= 2:
        return "执行类体（定义类时运行一次）"
    if k == "def":
        return f"定义函数 {src[4:src.index('(')]}（此时不执行函数体）"
    if k == "return":
        if nxt and nxt["event"] == "exception" and nxt["frame"] == st["frame"]:
            return f"{src} · 计算返回值时出错"
        if nxt and len(nxt["stack"]) > len(st["stack"]):
            return f"{src} · 先调用 {nxt['frame']}() 计算返回值"
        if nxt and nxt["event"] == "line" and nxt["frame"] == st["frame"] and block_of(lines, nxt["line"]) == "finally":
            return f"{src} · 准备返回，但先要执行 finally"
        return f"{src} · 返回给调用者"
    if nxt and len(nxt["stack"]) > len(st["stack"]) and nxt["event"] == "line" and not src.startswith("class "):
        return f"调用函数 {nxt['frame']}() · 进入它的函数体"
    prev = steps[i - 1] if i else None
    if block_of(lines, st["line"]) == "finally" and not (prev and prev["event"] == "line" and block_of(lines, prev["line"]) == "finally"):
        return "进入 finally 块 · 无论是否出错都会执行（Python 不单独停在 finally: 这一行）"
    if block_of(lines, st["line"]) == "else" and not (prev and block_of(lines, prev["line"]) == "else"):
        return "进入 else 块 · try 没有出错才会执行（Python 不单独停在 else: 这一行）"
    return "执行这一行"


examples = []


def add(mode, title, code, note, optimize=-1):
    lines = code.strip("\n").split("\n")
    src = "\n".join(lines) + "\n"
    steps, out, error, tb, warns = trace(src, optimize)
    assert steps, title
    for i, st in enumerate(steps):
        st["next"] = steps[i + 1]["line"] if i + 1 < len(steps) else None
        st["kind"] = "raise" if st["event"] == "exception" else kind(lines[st["line"] - 1])
        st["detail"] = explain(lines, steps, i, error)
    final = {"line": 0, "vars": steps[-1]["vars"] if steps[-1]["frame"] == "<module>" else {}, "out": out, "stack": ["<module>"]}
    examples.append({"mode": mode, "title": title, "code": lines, "note": note, "steps": steps, "out": out, "final": final,
                     "error": error, "traceback": tb, "warnings": warns, "optimize": optimize == 1})


# ---------- 常见异常 ----------
add("errors", "ZeroDivisionError：除以零", """
a = 10
b = 0
print(a / b)
print('这一行不会执行')
""", "异常一旦发生而没人处理，程序立即终止，后面的代码都不会运行，并打印 Traceback 说明错误类型和位置。")
add("errors", "ValueError：值不合适", """
text = '12a'
n = int(text)
print(n)
""", "类型对但值不合适：int() 能接收字符串，但 '12a' 不是数字。")
add("errors", "TypeError：类型不对", """
age = 12
msg = '年龄：' + age
""", "运算或函数收到了不支持的类型：字符串不能直接和整数相加，应写 str(age)。")
add("errors", "IndexError：索引越界", """
nums = [1, 2, 3]
print(nums[3])
""", "列表只有索引 0、1、2，访问 3 越界。")
add("errors", "KeyError：字典没有这个键", """
scores = {'小明': 90}
print(scores['小红'])
""", "字典里没有这个键。可以用 scores.get('小红') 返回 None，或先用 in 判断。")
add("errors", "NameError：名字未定义", """
total = 5
print(totl)
""", "使用了没有定义的名字，常见原因是拼写错误。")
add("errors", "AttributeError：没有这个属性", """
nums = (1, 2)
nums.append(3)
""", "对象没有这个属性或方法：元组没有 append。")

# ---------- try / except ----------
add("try", "try / except 捕获异常", """
try:
    n = int('abc')
    print('转换成功')
except ValueError:
    print('输入的不是数字')
print('程序继续')
""", "try 块中出错，立刻跳到匹配的 except，try 里剩下的语句被跳过。处理完后程序继续往下走，不会崩溃。")
add("try", "as e 取得异常对象", """
try:
    x = 1 / 0
except ZeroDivisionError as e:
    print('出错了:', e)
    print('类型:', type(e).__name__)
""", "except 类型 as e 把异常对象绑定到 e，可以读出错误信息。")
add("try", "多个 except：从上往下匹配", """
data = {'a': 1}
try:
    print(data['b'])
except ValueError:
    print('值错误')
except KeyError as e:
    print('缺少键', e)
""", "按顺序检查每个 except，第一个类型匹配的被执行，其余跳过。")
add("try", "一个 except 捕获多种类型", """
for item in ['5', 'x', None]:
    try:
        print(int(item) * 2)
    except (ValueError, TypeError):
        print('跳过', item)
""", "把多种异常写成元组：except (ValueError, TypeError):。循环中捕获异常，可以跳过坏数据继续处理。")
add("try", "else：没出错才执行", """
try:
    n = int('42')
except ValueError:
    print('不是数字')
else:
    print('成功，n =', n)
""", "else 块在 try 没有抛出异常时执行。把“成功后才做的事”放在 else，而不是塞进 try，能避免误捕获。")
add("try", "finally：无论如何都执行", """
try:
    print('打开文件')
    x = 1 / 0
except ZeroDivisionError:
    print('处理错误')
finally:
    print('关闭文件')
""", "finally 不管有没有异常、有没有被捕获都会执行，常用于释放资源（关闭文件、断开连接）。")
add("try", "except 类型不匹配时", """
try:
    print([1, 2][5])
except KeyError:
    print('键错误')
finally:
    print('清理')
""", "IndexError 不是 KeyError，except 不会捕获它。finally 照常执行，之后异常继续向外抛，程序终止。")
add("try", "父类 Exception 能捕获子类", """
try:
    print({}['x'])
except LookupError as e:
    print('查找失败:', type(e).__name__)
""", "KeyError 和 IndexError 都是 LookupError 的子类；except 父类会捕获所有子类。except Exception 能捕获几乎所有错误，但太宽泛会掩盖问题。")

# ---------- 抛出与传播 ----------
add("raise", "raise 主动抛出", """
def set_age(age):
    if age < 0:
        raise ValueError('年龄不能为负数')
    return age

try:
    set_age(-3)
except ValueError as e:
    print('拒绝:', e)
""", "raise 异常类型('说明') 主动抛出异常，让调用者知道参数不合法。")
add("raise", "异常沿调用栈向上传播", """
def divide(a, b):
    return a / b

def average(nums):
    return divide(sum(nums), len(nums))

try:
    average([])
except ZeroDivisionError:
    print('列表不能为空')
""", "divide 里出错，它自己没处理，就抛给调用它的 average；average 也没处理，再抛给主程序，最终被 except 捕获。")
add("raise", "在函数内部处理", """
def safe_div(a, b):
    try:
        return a / b
    except ZeroDivisionError:
        return None

print(safe_div(6, 3))
print(safe_div(1, 0))
""", "异常在函数内部就被捕获，调用者完全不会看到它。")
add("raise", "finally 在 return 之前执行", """
def check():
    try:
        return '来自 try'
    finally:
        print('finally 先执行')

print(check())
""", "即使 try 里已经 return，finally 也会在函数真正返回前执行。")
add("raise", "except 中再次 raise", """
def load(text):
    try:
        return int(text)
    except ValueError:
        print('记录日志')
        raise

try:
    load('?')
except ValueError as e:
    print('外层处理:', e)
""", "单独写 raise 会把当前异常原样再抛出：先在内层做点记录，再交给外层处理。")
add("raise", "自定义异常类", """
class ScoreError(Exception):
    pass

def check(score):
    if not 0 <= score <= 100:
        raise ScoreError(f'分数 {score} 超出范围')

try:
    check(120)
except ScoreError as e:
    print('自定义异常:', e)
""", "继承 Exception 就能定义自己的异常类型，让错误含义更清楚，也能被精确捕获。")

# ---------- 断言 ----------
add("assert", "assert 条件成立", """
x = 5
assert x > 0, 'x 必须为正数'
print('通过检查')
""", "assert 条件, 说明：条件为 True 时什么都不做，程序继续。")
add("assert", "assert 条件不成立", """
x = -2
assert x > 0, 'x 必须为正数'
print('通过检查')
""", "条件为 False 时抛出 AssertionError，逗号后面的说明成为错误信息。")
add("assert", "在函数中检查前提", """
def average(nums):
    assert len(nums) > 0, '列表不能为空'
    return sum(nums) / len(nums)

print(average([2, 4]))
print(average([]))
""", "assert 适合在开发时检查“按理说一定成立”的前提，帮助尽早发现程序自身的错误。")
add("assert", "捕获 AssertionError", """
def check_score(s):
    assert 0 <= s <= 100, f'分数 {s} 不合法'
    return s

for s in [88, 130]:
    try:
        print('有效', check_score(s))
    except AssertionError as e:
        print('无效:', e)
""", "AssertionError 也是异常，可以用 try / except 捕获。")
add("assert", "陷阱：assert 加括号永远成立", """
x = -1
assert (x > 0, 'x 必须为正数')
print('居然通过了')
""", "括号把条件和说明合成了一个非空元组，非空元组永远为 True，断言形同虚设。Python 编译时会给出 SyntaxWarning。")
add("assert", "python -O 会删除 assert", """
x = -2
assert x > 0, 'x 必须为正数'
print('assert 被跳过了')
""", "用 python -O 运行时，所有 assert 语句都被去掉。所以不能用 assert 检查用户输入或做安全校验，那些要用 if + raise。", optimize=1)
add("assert", "用户输入应该用 if + raise", """
def set_age(age):
    if not isinstance(age, int) or age < 0:
        raise ValueError('年龄必须是非负整数')
    return age

try:
    set_age('十二')
except ValueError as e:
    print(e)
""", "对外部数据的校验用 if + raise，不会被 -O 去掉；assert 留给检查程序内部的逻辑。")

data = {"python": platform.python_version(), "examples": examples}
Path(__file__).with_name("truth.json").write_text(json.dumps(data, ensure_ascii=False, indent=1))
print(f"wrote truth.json · Python {data['python']} · {len(examples)} examples")
for ex in examples:
    print(f"{ex['mode']:6} {len(ex['steps']):2} · {ex['title']} → out {ex['out']!r} · error {ex['error']}" + (f" · warn {ex['warnings']}" if ex["warnings"] else ""))
