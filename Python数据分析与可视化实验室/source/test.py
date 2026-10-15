"""Independent check (run with /usr/bin/python3): re-run each example with pandas, without truth.py,
and compare every result cell; check plots are real Matplotlib SVG with the expected text."""
import contextlib, io, json, os, tempfile, warnings
from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("svg")
import matplotlib.pyplot as plt

d = json.loads((Path(__file__).parent / "truth.json").read_text())
by = {e["title"]: e for e in d["examples"]}

def fmt(v):
    if v is None or (isinstance(v, float) and np.isnan(v)): return "NaN"
    if isinstance(v, (float, np.floating)): return f"{v:.2f}".rstrip("0").rstrip(".") if v != int(v) else f"{v:.1f}"
    return str(v)

checked = 0
for e in d["examples"]:
    with tempfile.TemporaryDirectory() as root:
        here = os.getcwd(); os.chdir(root)
        Path("scores.csv").write_text(d["csv"], encoding="utf-8")
        Path("sales.csv").write_text(d["salesCsv"], encoding="utf-8")
        ns, out = {}, io.StringIO()
        with contextlib.redirect_stdout(out), warnings.catch_warnings():
            warnings.simplefilter("ignore")
            exec(e["setup"], ns)
            lines = e["code"].split("\n")
            exec("\n".join(lines[:-1]), ns)
            try:
                v = eval(lines[-1], ns)
            except SyntaxError:
                exec(lines[-1], ns); v = None
        os.chdir(here)
    r = e["result"]
    assert out.getvalue() == e["printed"], e["title"]
    if r["type"] == "DataFrame":
        assert isinstance(v, pd.DataFrame) and list(v.shape) == r["shape"], e["title"]
        assert [[fmt(x) for x in row] for row in v.itertuples(index=False)] == r["rows"], e["title"]
        assert [str(i) for i in v.index] == r["index"], e["title"]
    elif r["type"] == "Series":
        assert isinstance(v, pd.Series), e["title"]
        assert [fmt(x) for x in v.values] == r["values"] and [str(i) for i in v.index] == r["index"], e["title"]
    elif r["type"] == "plot":
        fig = plt.gcf()
        n_axes = len(fig.axes)
        plt.close("all")
        assert e["svg"].startswith("<svg") and e["svg"].rstrip().endswith("</svg>"), e["title"]
        assert e["svg"].count('id="axes_') == n_axes, (e["title"], n_axes)
        for word in [w.split("'")[1] for w in e["code"].split("set_title(")[1:]]:
            assert word in e["svg"], (e["title"], word)
    # Every input cell the page highlights must exist in the table.
    cols = e["input"]["columns"]
    assert all(c in cols for c in e["usedCols"]) and all(0 <= i < len(e["input"]["rows"]) for i in e["usedRows"]), e["title"]
    checked += 1

# Facts a learner should see, computed here directly.
df = pd.read_csv(io.StringIO(d["csv"]))
assert by["groupby 分组平均"]["result"]["values"] == [fmt(x) for x in df.groupby("班级")["数学"].mean()]
assert by["isna 找缺失值"]["result"]["values"][-1] == "1", "one missing English score"
assert by["describe() 统计概览"]["result"]["rows"][0] == ["6.0", "6.0", "5.0"], "count shows the missing value"
assert by["shape 与 dtypes"]["printed"] == "(6, 6)\n" and by["shape 与 dtypes"]["result"]["values"][-1] == "float64", "NaN makes the int column float"
assert by["条件筛选"]["result"]["index"] == ["0", "2"] and by["条件筛选"]["usedRows"] == [0, 2]
assert by["多个条件 & |"]["usedRows"] == [int(i) for i in by["多个条件 & |"]["result"]["index"]]
assert by["loc 按标签取行列"]["result"]["index"] == ["1", "2", "3"], "loc slice includes the end label"
assert by["sort_values 排序"]["result"]["index"][0] == "2", "row labels travel with the rows"
assert by["fillna 填补缺失"]["result"]["values"][4] == fmt(df["英语"].mean())
assert all("中" not in e["svg"] or "font-family" in e["svg"] for e in d["examples"] if e["result"]["type"] == "plot")
print(f"PASS: {checked} examples re-run with pandas {pd.__version__}; every table cell, index and print matches; {sum(e['result']['type']=='plot' for e in d['examples'])} plots are real Matplotlib SVG with the right axes and titles; 10 data facts hold.")
