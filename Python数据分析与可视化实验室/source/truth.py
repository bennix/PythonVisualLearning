"""Run every preset with real pandas and matplotlib and write truth.json.

Run with the system Python that has working pandas:  /usr/bin/python3 truth.py
Each example stores: the code, the input table, the result (as a table, a series or a scalar,
exactly as pandas returns it), which rows/columns of the input were used, and for plots
the SVG that matplotlib itself drew.
"""
import contextlib
import io
import json
import platform
import re
import warnings
from pathlib import Path

import matplotlib

matplotlib.use("svg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

plt.rcParams["font.sans-serif"] = ["PingFang HK", "Hiragino Sans GB", "Arial Unicode MS", "DejaVu Sans"]
plt.rcParams["axes.unicode_minus"] = False
plt.rcParams["svg.fonttype"] = "none"
plt.rcParams["svg.hashsalt"] = "lab"

CSV = """姓名,班级,性别,语文,数学,英语
小明,一班,男,88,95,79
小红,一班,女,92,81,94
小刚,二班,男,75,98,68
小丽,二班,女,85,77,90
小强,一班,男,62,70,
小芳,二班,女,96,89,85
"""
SALES = """月份,销售额,成本
1月,120,80
2月,135,90
3月,128,85
4月,160,100
5月,175,110
6月,190,118
"""
SETUP = "import pandas as pd\ndf = pd.read_csv('scores.csv')"
SETUP_S = "import pandas as pd\nimport matplotlib.pyplot as plt\nsales = pd.read_csv('sales.csv')"


def cell(v):
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return "NaN"
    if isinstance(v, (np.floating, float)):
        return f"{v:.2f}".rstrip("0").rstrip(".") if v != int(v) else f"{v:.1f}"
    return str(v)


def as_table(obj):
    if isinstance(obj, pd.DataFrame):
        idx_name = obj.index.name or ""
        cols = [" ".join(map(str, c)) if isinstance(c, tuple) else str(c) for c in obj.columns]
        return {"type": "DataFrame", "columns": cols, "index": [str(i) for i in obj.index],
                "indexName": idx_name, "rows": [[cell(v) for v in row] for row in obj.itertuples(index=False)],
                "dtypes": {(" ".join(map(str, c)) if isinstance(c, tuple) else str(c)): str(t) for c, t in obj.dtypes.items()}, "shape": list(obj.shape)}
    if isinstance(obj, pd.Series):
        return {"type": "Series", "name": None if obj.name is None else str(obj.name), "index": [str(i) for i in obj.index],
                "values": [cell(v) for v in obj.values], "dtype": str(obj.dtype), "indexName": obj.index.name or ""}
    if isinstance(obj, (tuple, list)):
        return {"type": "value", "repr": repr(tuple(int(x) for x in obj)) if all(isinstance(x, (int, np.integer)) for x in obj) else repr(obj)}
    if isinstance(obj, (np.floating, float)):
        return {"type": "value", "repr": cell(obj)}
    return {"type": "value", "repr": str(obj)}


def run(setup, code, files):
    ns = {}
    out = io.StringIO()
    import os
    import tempfile
    with tempfile.TemporaryDirectory() as root:
        here = os.getcwd()
        os.chdir(root)
        for name, text in files.items():
            Path(name).write_text(text, encoding="utf-8")
        with contextlib.redirect_stdout(out), warnings.catch_warnings():
            warnings.simplefilter("ignore")
            exec(setup, ns)
            base = ns.get("df", ns.get("sales")).copy()
            lines = code.strip().split("\n")
            exec("\n".join(lines[:-1]), ns)
            last = lines[-1]
            try:
                value = eval(compile(last, "<demo>", "eval"), ns)
            except SyntaxError:
                exec(last, ns)
                value = None
        os.chdir(here)
    return ns, base, value, out.getvalue()


def svg_of(fig):
    buf = io.StringIO()
    fig.savefig(buf, format="svg", bbox_inches="tight")
    plt.close(fig)
    s = buf.getvalue()
    s = s[s.index("<svg"):]
    s = re.sub(r'\s(width|height)="[\d.]+pt"', "", s, count=2)
    s = re.sub(r"<metadata>.*?</metadata>", "", s, flags=re.S)
    return s


examples = []


def add(mode, title, code, note, used_cols=None, used_rows=None, setup=SETUP, files=None, plot=False):
    files = files or {"scores.csv": CSV, "sales.csv": SALES}
    ns, base, value, printed = run(setup, code, files)
    ex = {"mode": mode, "title": title, "setup": setup, "code": code.strip(), "note": note, "printed": printed,
          "input": as_table(base), "usedCols": used_cols or [], "usedRows": used_rows if used_rows is not None else []}
    if plot:
        fig = plt.gcf()
        ex["svg"] = svg_of(fig)
        ex["result"] = {"type": "plot"}
    else:
        ex["result"] = as_table(value)
    examples.append(ex)


# ---------- 读取与查看 ----------
add("look", "read_csv 读入表格", "df", "pd.read_csv 读入 CSV，得到 DataFrame：有行索引（左边 0、1、2…）和列名。缺失的值显示为 NaN。")
add("look", "head() 看前几行", "df.head(3)", "head(n) 返回前 n 行（默认 5 行），先看一眼数据长什么样。tail(n) 看最后几行。", used_rows=[0, 1, 2])
add("look", "shape 与 dtypes", "print(df.shape)\ndf.dtypes", "shape 是 (行数, 列数)。dtypes 给出每列的类型：数字列是 int64 / float64，文字列是 object。有缺失值的整数列会变成 float64。")
add("look", "describe() 统计概览", "df.describe()", "describe() 对数字列计算个数、平均值、标准差、最小值、四分位数和最大值。count 少于行数说明有缺失值。",
    used_cols=["语文", "数学", "英语"])
add("look", "取一列：df['数学']", "df['数学']", "用列名取一列，得到 Series（一维，带索引）。", used_cols=["数学"])
add("look", "取多列", "df[['姓名', '数学']]", "传入列名列表（注意两层方括号），得到只含这几列的新 DataFrame。", used_cols=["姓名", "数学"])

# ---------- 筛选与排序 ----------
add("filter", "条件筛选", "df[df['数学'] >= 90]", "df['数学'] >= 90 得到一列 True/False，放进 df[...] 里只保留 True 的行。",
    used_cols=["数学"], used_rows=[0, 2])
add("filter", "多个条件 & |", "df[(df['班级'] == '一班') & (df['语文'] > 80)]", "多个条件用 &（且）、|（或）连接，每个条件都要加括号。不能用 and / or。",
    used_cols=["班级", "语文"], used_rows=[0, 1])
add("filter", "loc 按标签取行列", "df.loc[1:3, ['姓名', '英语']]", "loc[行标签, 列名]：按标签选择，切片 1:3 包含 3。iloc 按位置选择，切片不含结尾。",
    used_cols=["姓名", "英语"], used_rows=[1, 2, 3])
add("filter", "sort_values 排序", "df.sort_values('数学', ascending=False)", "按某列排序，ascending=False 为降序。返回新表，原表不变；行索引跟着行一起走。",
    used_cols=["数学"])
add("filter", "新增计算列", "df['总分'] = df['语文'] + df['数学']\ndf[['姓名', '总分']]", "列之间可以直接做加减乘除，结果按行对齐。给新列名赋值就添加了一列。",
    used_cols=["语文", "数学"])

# ---------- 统计与分组 ----------
add("stats", "mean / max 列统计", "df[['语文', '数学', '英语']].mean()", "mean() 按列求平均，结果是 Series。sum()、max()、min()、median() 用法相同。缺失值会被自动跳过。",
    used_cols=["语文", "数学", "英语"])
add("stats", "value_counts 计数", "df['班级'].value_counts()", "value_counts() 统计每个值出现了几次，按次数从多到少排列。", used_cols=["班级"])
add("stats", "groupby 分组平均", "df.groupby('班级')['数学'].mean()", "groupby('班级') 把行按班级分成几组，再对每组的数学求平均。分组 → 计算 → 合并，是数据分析最常用的操作。",
    used_cols=["班级", "数学"])
add("stats", "groupby 多列多统计", "df.groupby('性别')[['语文', '英语']].agg(['mean', 'max'])", "agg 一次计算多种统计，结果的列分两层：科目、统计方法。",
    used_cols=["性别", "语文", "英语"])
add("stats", "isna 找缺失值", "df.isna().sum()", "isna() 把缺失位置标为 True，再 sum() 就是每列缺了几个。", used_cols=[])
add("stats", "fillna 填补缺失", "df['英语'].fillna(df['英语'].mean())", "fillna 用指定值填补缺失，这里用英语的平均分。dropna() 则直接删掉含缺失值的行。",
    used_cols=["英语"], used_rows=[4])

# ---------- Matplotlib ----------
add("plot", "折线图 plot", """
fig, ax = plt.subplots(figsize=(6, 3.4))
ax.plot(sales['月份'], sales['销售额'], marker='o')
ax.set_title('上半年销售额')
ax.set_xlabel('月份')
ax.set_ylabel('万元')
""", "折线图适合看随时间变化的趋势。plt.subplots() 得到画布 fig 和坐标轴 ax，在 ax 上画图、加标题和坐标轴标签。",
    setup=SETUP_S, plot=True, used_cols=["月份", "销售额"])
add("plot", "两条线与图例", """
fig, ax = plt.subplots(figsize=(6, 3.4))
ax.plot(sales['月份'], sales['销售额'], marker='o', label='销售额')
ax.plot(sales['月份'], sales['成本'], marker='s', linestyle='--', label='成本')
ax.set_title('销售额与成本')
ax.legend()
""", "同一个 ax 上画多条线，用 label 命名，再调用 legend() 显示图例。linestyle='--' 是虚线。",
    setup=SETUP_S, plot=True, used_cols=["月份", "销售额", "成本"])
add("plot", "柱状图 bar", """
avg = df.groupby('班级')['数学'].mean()
fig, ax = plt.subplots(figsize=(6, 3.4))
ax.bar(avg.index, avg.values, color=['#5b8c6a', '#c08a3e'])
ax.set_title('各班数学平均分')
ax.set_ylim(0, 100)
""", "柱状图适合比较不同类别的数值。常见流程：先用 pandas 分组统计，再把结果交给 Matplotlib 画图。",
    setup=SETUP + "\nimport matplotlib.pyplot as plt", plot=True, used_cols=["班级", "数学"])
add("plot", "散点图 scatter", """
fig, ax = plt.subplots(figsize=(6, 3.4))
ax.scatter(df['语文'], df['数学'], s=60)
for _, r in df.iterrows():
    ax.annotate(r['姓名'], (r['语文'], r['数学']), xytext=(4, 4), textcoords='offset points')
ax.set_xlabel('语文')
ax.set_ylabel('数学')
""", "散点图看两个变量之间有没有关系：每个点是一个学生，横坐标语文、纵坐标数学。annotate 给点加文字标注。",
    setup=SETUP + "\nimport matplotlib.pyplot as plt", plot=True, used_cols=["姓名", "语文", "数学"])
add("plot", "饼图 pie", """
counts = df['性别'].value_counts()
fig, ax = plt.subplots(figsize=(6, 3.4))
ax.pie(counts.values, labels=counts.index, autopct='%1.0f%%')
ax.set_title('男女比例')
""", "饼图显示各部分占整体的比例，autopct 在扇形上写百分比。类别很多时不宜用饼图。",
    setup=SETUP + "\nimport matplotlib.pyplot as plt", plot=True, used_cols=["性别"])
add("plot", "直方图 hist", """
fig, ax = plt.subplots(figsize=(6, 3.4))
ax.hist(df['语文'], bins=[60, 70, 80, 90, 100], edgecolor='white')
ax.set_title('语文成绩分布')
ax.set_xlabel('分数段')
ax.set_ylabel('人数')
""", "直方图把数值分成若干区间（bins），统计每个区间有几个数据，用来看分布。",
    setup=SETUP + "\nimport matplotlib.pyplot as plt", plot=True, used_cols=["语文"])
add("plot", "pandas 直接画图", """
ax = df.set_index('姓名')[['语文', '数学', '英语']].plot(kind='bar', figsize=(6, 3.4))
ax.set_title('每人各科成绩')
ax.set_ylabel('分数')
""", "DataFrame.plot() 内部调用 Matplotlib，一行就能画出分组柱状图；返回的 ax 可以继续设置标题等。",
    setup=SETUP + "\nimport matplotlib.pyplot as plt", plot=True, used_cols=["姓名", "语文", "数学", "英语"])
add("plot", "子图 subplots", """
fig, (a1, a2) = plt.subplots(1, 2, figsize=(6.4, 3.2))
a1.bar(sales['月份'], sales['销售额'])
a1.set_title('销售额')
a2.plot(sales['月份'], sales['销售额'] - sales['成本'], marker='o', color='green')
a2.set_title('利润')
fig.tight_layout()
""", "plt.subplots(1, 2) 在一张画布上并排放两个坐标轴，分别画图。tight_layout() 自动调整间距避免重叠。",
    setup=SETUP_S, plot=True, used_cols=["月份", "销售额", "成本"])

for ex in examples:
    if ex["result"]["type"] == "plot":
        assert "<svg" in ex["svg"] and "</svg>" in ex["svg"], ex["title"]

data = {"python": platform.python_version(), "pandas": pd.__version__, "matplotlib": matplotlib.__version__,
        "csv": CSV, "salesCsv": SALES, "examples": examples}
Path(__file__).with_name("truth.json").write_text(json.dumps(data, ensure_ascii=False, indent=1))
print(f"wrote truth.json · Python {data['python']} · pandas {data['pandas']} · matplotlib {data['matplotlib']} · {len(examples)} examples")
for ex in examples:
    r = ex["result"]
    desc = r["type"] + (f" {r.get('shape') or len(r.get('values', []))}" if r["type"] in ("DataFrame", "Series") else f" {r.get('repr', '')}" if r["type"] == "value" else f" svg {len(ex['svg'])}")
    print(f"{ex['mode']:6} · {ex['title']} → {desc}")
