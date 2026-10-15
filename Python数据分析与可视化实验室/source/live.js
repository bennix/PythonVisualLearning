'use strict';
const $ = (s) => document.querySelector(s);
const { P, PARTS } = CFG, G = CFG.G;
const cx = (c) => G.x0 + c * (G.cellW + G.gap), ry = (r) => G.y0 + r * (G.cellD + G.gap);
const still = matchMedia('(prefers-reduced-motion: reduce)');
const stage = $('#stage'), readout = $('[data-readout]');
const svgEl = stage.querySelector('svg');
const vec = (d) => { const o = iso([0, 0, 0], P), p = iso(d, P); return [p[0] - o[0], p[1] - o[1]]; };
const AX = vec([1, 0, 0]), AY = vec([0, 1, 0]);
const MODES = { look: '读取与查看', filter: '筛选与排序', stats: '统计与分组', plot: 'Matplotlib 作图' };
const layer = (id) => svgEl.querySelector('#' + id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const text = (xy, z, s, size, tone, anchor = 'middle', room) => {
  const t = faceTextSvg(topMatrix(xy, z, P), s, { size, tone, anchor });
  return room ? t.replace('<text ', `<text data-room="${room}" `) : t;
};
// Trim face text to the room it has (in world units) by measuring the rendered string.
function fitAll(root) {
  root.querySelectorAll('[data-room]').forEach((el) => {
    const room = +el.dataset.room, full = el.textContent;
    if (el.getComputedTextLength() <= room) return;
    const chars = [...full];
    let lo = 0, hi = chars.length;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; el.textContent = chars.slice(0, mid).join('') + '…'; if (el.getComputedTextLength() <= room) lo = mid; else hi = mid - 1; }
    el.textContent = chars.slice(0, lo).join('') + '…';
  });
}

// ---------- pure: steps of one example ----------
function resultSay(ex) {
  const r = ex.result;
  if (r.type === 'DataFrame') return `得到 DataFrame · ${r.shape[0]} 行 × ${r.shape[1]} 列`;
  if (r.type === 'Series') return `得到 Series · ${r.values.length} 个值`;
  if (r.type === 'plot') return 'Matplotlib 画好了图 · 见下方';
  return `得到 ${r.repr}`;
}
function stepsOf(ex) {
  const inp = ex.input, nR = inp.rows.length, nC = inp.columns.length;
  const all = (n) => [...Array(n).keys()];
  const cols = ex.usedCols.map((c) => inp.columns.indexOf(c)).filter((i) => i >= 0);
  const rows = ex.usedRows;
  const steps = [{ say: `读入数据 · ${nR} 行 × ${nC} 列`, cells: [], col: null, row: null, result: false }];
  if (cols.length) steps.push({ say: `选中列：${ex.usedCols.join('、')}`, cells: cols.flatMap((c) => all(nR).map((r) => [r, c])), col: cols[0], row: null, result: false });
  if (rows.length) steps.push({ say: `留下的行：索引 ${rows.join('、')}`, cells: rows.flatMap((r) => all(nC).map((c) => [r, c])), col: cols.length ? cols[0] : null, row: rows[0], result: false });
  const fin = rows.length && cols.length ? rows.flatMap((r) => cols.map((c) => [r, c]))
    : rows.length ? rows.flatMap((r) => all(nC).map((c) => [r, c]))
    : cols.length ? cols.flatMap((c) => all(nR).map((r) => [r, c])) : [];
  steps.push({ say: resultSay(ex), cells: fin, col: cols.length ? cols[0] : null, row: rows.length ? rows[0] : null, result: true });
  return steps;
}

// ---------- drawing ----------
function cellsArt(ex, step) {
  const inp = ex.input;
  const lit = new Set(step.cells.map(([r, c]) => r + ',' + c));
  let s = '';
  inp.columns.slice(0, G.cols).forEach((c, i) => { s += text([cx(i) + G.cellW / 2, ry(-1) + G.cellD / 2 + 1.6], 3, c, 4.8, 'hi', 'middle', G.cellW - 3); });
  inp.index.slice(0, G.rows).forEach((v, r) => { s += text([G.x0 - 5, ry(r) + G.cellD / 2 + 1.5], 2.5, v, 4, 'mid'); });
  const items = [];
  for (let r = 0; r < Math.min(G.rows, inp.rows.length); r++) for (let c = 0; c < Math.min(G.cols, inp.columns.length); c++) items.push({ r, c, d: depthOf([cx(c) + G.cellW / 2, ry(r) + G.cellD / 2, 0], P) });
  items.sort((a, b) => a.d - b.d);
  for (const { r, c } of items) {
    const on = lit.has(r + ',' + c), v = inp.rows[r][c];
    const z = 2.5, h = on ? 4 : 1.2;
    const plan = { x: cx(c) + 1, y: ry(r) + 1, w: G.cellW - 2, d: G.cellD - 2, r: 1 };
    s += solidSvg(slabOf(plan, z, h, P, 3, 0.3), { tone: on ? 'hi' : 'mid', lit: on, crease: 'lo' });
    s += text([cx(c) + G.cellW / 2, ry(r) + G.cellD / 2 + 1.7], z + h, v, 4.6, on ? 'lit' : v === 'NaN' ? 'mid' : 'hi', 'middle', G.cellW - 4);
  }
  return s;
}
function resultArt(ex, step) {
  const t = G.tray, r = ex.result;
  const head = (s) => text([t.x + 9, t.y + 14], 3.5, s, 5, 'hi', 'start', t.w - 18);
  if (!step.result) return head('结果托盘 · 等待运行');
  if (r.type === 'plot') {
    let s = head('图像 · Matplotlib 输出');
    s += solidSvg(slabOf({ x: t.x + 20, y: t.y + 34, w: t.w - 40, d: t.d - 58, r: 1.5 }, 3, 1.2, P, 3, 0.4), { tone: 'hi', lit: true });
    s += text([t.x + t.w / 2, t.y + t.d / 2 + 6], 4.2, '图在页面下方', 6, 'lit', 'middle', t.w - 50);
    return s;
  }
  if (r.type === 'value') return head('结果') + text([t.x + t.w / 2, t.y + t.d / 2], 3.5, r.repr, 9, 'hi', 'middle', t.w - 20);
  let cols, rows;
  if (r.type === 'Series') {
    cols = [r.indexName || '', r.name || '值'];
    rows = r.index.map((i, k) => [i, r.values[k]]);
  } else {
    cols = [r.indexName || '', ...r.columns];
    rows = r.rows.map((row, k) => [r.index[k], ...row]);
  }
  const nc = Math.min(cols.length, 7), nr = Math.min(rows.length, 8);
  const inner = t.w - 12, firstW = r.type === 'Series' ? inner * 0.45 : Math.min(18, inner / nc);
  const restW = (inner - firstW) / Math.max(1, nc - 1);
  const colX = (c) => t.x + 6 + (c === 0 ? 0 : firstW + (c - 1) * restW);
  const colW = (c) => (c === 0 ? firstW : restW);
  const pitch = Math.min(13, (t.d - 30) / (nr + 1));
  const y0 = t.y + 28;
  let s = head(r.type === 'Series' ? `Series · ${r.values.length} 个值 · ${r.dtype}` : `DataFrame · ${r.shape[0]} 行 × ${r.shape[1]} 列`);
  s += solidSvg(slabOf({ x: t.x + 5, y: y0 - pitch / 2 - 1, w: t.w - 10, d: pitch, r: 1 }, 3, 0.8, P, 3, 0), { tone: 'mid', crease: 'none' });
  for (let c = 0; c < nc; c++) s += text([colX(c) + colW(c) / 2, y0 + 1.6], 3.8, cols[c], 4.4, 'hi', 'middle', colW(c) - 2);
  for (let k = 0; k < nr; k++) for (let c = 0; c < nc; c++) {
    s += text([colX(c) + colW(c) / 2, y0 + pitch * (k + 1) + 1.6], 3, rows[k][c], 4.6, c === 0 ? 'mid' : 'hi', 'middle', colW(c) - 2);
  }
  if (rows.length > nr || cols.length > nc) s += text([t.x + t.w - 9, t.y + t.d - 6], 3, '…完整结果见右侧', 3.8, 'mid', 'end');
  return s;
}

// ---------- state, motion ----------
let current = 0, ex = DATA.examples[0], steps = [], stepIndex = 0, stepClock = 0;
const pos = { col: 0, row: 0 }, goal = { col: 0, row: 0 };
let frame = 0, last = 0, visible = false, playing = !still.matches, touring = !still.matches, idle = 0, hover = false, touchedAt = 0;
const STEP_TIME = 1.4, HOLD_TIME = 3.6;
const atEnd = () => stepIndex >= steps.length - 1;

function tableHtml(r) {
  if (r.type === 'value') return `<p class="big">${esc(r.repr)}</p>`;
  if (r.type === 'plot') return '';
  const cols = r.type === 'Series' ? [r.indexName || '', r.name || ''] : [r.indexName || '', ...r.columns];
  const rows = r.type === 'Series' ? r.index.map((i, k) => [i, r.values[k]]) : r.rows.map((row, k) => [r.index[k], ...row]);
  return `<table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((v, i) => i ? `<td${v === 'NaN' ? ' class="nan"' : ''}>${esc(v)}</td>` : `<th>${esc(v)}</th>`).join('')}</tr>`).join('')}</tbody></table>` +
    `<p class="micro">${r.type === 'Series' ? `Series · ${r.values.length} 个值 · dtype: ${esc(r.dtype)}` : `DataFrame · ${r.shape[0]} 行 × ${r.shape[1]} 列`}</p>`;
}
function apply() {
  const step = steps[stepIndex];
  if (step.col !== null) goal.col = step.col * (G.cellW + G.gap);
  if (step.row !== null) goal.row = step.row * (G.cellD + G.gap);
  layer('colcar').style.opacity = step.col === null ? '0.35' : '1';
  layer('rowcar').style.opacity = step.row === null ? '0.35' : '1';
  layer('cells').innerHTML = cellsArt(ex, step);
  layer('result').innerHTML = resultArt(ex, step);
  fitAll(svgEl);
  $('#step-count').textContent = `第 ${stepIndex + 1} / ${steps.length} 步`;
  $('#detail').textContent = step.say;
  const done = step.result;
  $('#result-box').innerHTML = done ? tableHtml(ex.result) || '<p class="micro">这个示例的结果是一张图，见下方。</p>' : '<p class="micro">运行到最后一步时显示结果。</p>';
  $('#printed-row').hidden = !(done && ex.printed);
  $('#printed').textContent = ex.printed;
  $('#chart-card').hidden = ex.result.type !== 'plot';
  $('#chart').innerHTML = ex.result.type === 'plot' ? (done ? ex.svg : '<p class="micro">运行到最后一步时显示 Matplotlib 画出的图。</p>') : '';
  $('#prev').disabled = stepIndex === 0;
  $('#next').disabled = atEnd();
  $('#play').textContent = playing ? '暂停' : atEnd() ? '从头播放' : '播放';
  stage.setAttribute('aria-valuetext', step.say);
}
function place() {
  const t = (v, k) => `translate(${(v[0] * k).toFixed(2)} ${(v[1] * k).toFixed(2)})`;
  layer('colcar').setAttribute('transform', t(AX, pos.col));
  layer('rowcar').setAttribute('transform', t(AY, pos.row));
}
const moving = () => Object.keys(pos).some((k) => Math.abs(pos[k] - goal[k]) > 0.02);
function say() {
  const txt = moving() ? '选择滑块移动中…' : steps[stepIndex].say;
  if (readout.textContent !== txt) readout.textContent = txt;
}
function tick(now) {
  frame = 0;
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  const a = 1 - Math.exp(-dt / 0.18);
  for (const k of Object.keys(pos)) { pos[k] = calm ? goal[k] : pos[k] + (goal[k] - pos[k]) * a; if (Math.abs(pos[k] - goal[k]) < 0.01) pos[k] = goal[k]; }
  if (playing && !calm) {
    stepClock += dt;
    if (!atEnd() && stepClock > STEP_TIME) { stepIndex++; stepClock = 0; if (atEnd()) playing = false; apply(); }
  }
  const engaged = hover || stage.closest('.workspace').contains(document.activeElement) || now - touchedAt < 3600;
  if (atEnd() && touring && !calm && !engaged) { idle += dt; if (idle > HOLD_TIME) { select(current + 1); playing = true; } }
  place(); say();
  const busy = moving() || (!calm && (playing || touring));
  if (busy && visible && !document.hidden) frame = requestAnimationFrame(tick);
}
function run() { if (!frame && visible && !document.hidden) { last = 0; frame = requestAnimationFrame(tick); } }
function touch() { touchedAt = performance.now(); idle = 0; }
function go(i) { stepIndex = Math.max(0, Math.min(steps.length - 1, i)); stepClock = 0; apply(); if (still.matches) { Object.assign(pos, goal); place(); say(); } run(); }

// ---------- UI ----------
const examplesBox = $('#examples');
const tabs = [...document.querySelectorAll('[data-mode]')];
function fillExamples(mode) {
  examplesBox.innerHTML = '';
  DATA.examples.forEach((e, i) => {
    if (e.mode !== mode) return;
    const b = document.createElement('button');
    b.textContent = e.title;
    b.dataset.index = i;
    b.addEventListener('click', () => { touch(); playing = !still.matches; select(i); });
    examplesBox.append(b);
  });
  examplesBox.dataset.mode = mode;
}
function select(i) {
  current = (i + DATA.examples.length) % DATA.examples.length;
  ex = DATA.examples[current];
  tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.mode === ex.mode)));
  if (examplesBox.dataset.mode !== ex.mode) fillExamples(ex.mode);
  examplesBox.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.index === current)));
  $('#title').textContent = ex.title;
  $('#setup').textContent = ex.setup;
  $('#code').textContent = ex.code;
  $('#note').textContent = ex.note;
  stage.setAttribute('aria-label', `${MODES[ex.mode]}示例：${ex.title}。左右方向键单步，空格播放或暂停，PageDown 下一个示例。`);
  steps = stepsOf(ex);
  go(still.matches ? steps.length - 1 : 0);
}
tabs.forEach((t) => t.addEventListener('click', () => { touch(); playing = !still.matches; select(DATA.examples.findIndex((e) => e.mode === t.dataset.mode)); }));
$('#prev').addEventListener('click', () => { touch(); playing = false; go(stepIndex - 1); });
$('#next').addEventListener('click', () => { touch(); playing = false; go(stepIndex + 1); });
$('#play').addEventListener('click', () => {
  touch();
  if (still.matches) { go(stepIndex + 1); return; }
  if (atEnd()) go(0);
  playing = !playing; stepClock = 0; apply(); run();
});
$('#replay').addEventListener('click', () => { touch(); playing = !still.matches; go(0); });
function tourUI() {
  $('#tour').setAttribute('aria-pressed', String(touring));
  $('#tour').textContent = touring ? '停止巡览' : '自动巡览';
  $('#tour-status').textContent = still.matches ? '已遵循系统“减少动态效果”设置 · 用按钮单步' : touring ? '运行结束后自动切换下一个示例' : '巡览已停止';
}
$('#tour').addEventListener('click', () => { touch(); touring = still.matches ? false : !touring; tourUI(); run(); });
$('#theme').addEventListener('click', () => {
  const dark = document.body.dataset.theme !== 'dark';
  document.body.dataset.theme = dark ? 'dark' : 'light';
  $('#theme').textContent = dark ? '浅色模式' : '深色模式';
  $('#theme').setAttribute('aria-label', dark ? '切换至浅色主题' : '切换至深色主题');
});
const ws = $('.workspace');
ws.addEventListener('pointerenter', () => { hover = true; touch(); });
ws.addEventListener('pointerleave', () => { hover = false; touch(); run(); });
ws.addEventListener('focusin', touch);
stage.addEventListener('keydown', (e) => {
  const keys = { ArrowRight: () => $('#next').click(), ArrowDown: () => $('#next').click(), ArrowLeft: () => $('#prev').click(), ArrowUp: () => $('#prev').click(),
    ' ': () => $('#play').click(), Enter: () => $('#play').click(), Home: () => { playing = false; go(0); }, End: () => { playing = false; go(steps.length - 1); },
    PageDown: () => { playing = false; select(current + 1); }, PageUp: () => { playing = false; select(current - 1); } };
  if (!keys[e.key]) return;
  e.preventDefault(); touch(); keys[e.key]();
});
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); else { cancelAnimationFrame(frame); frame = 0; } }, { rootMargin: '120px 0px' }).observe(stage);
document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else run(); });
still.addEventListener('change', () => { if (still.matches) { touring = false; playing = false; } tourUI(); select(current); });
$('#version').textContent = `Python ${DATA.python} · pandas ${DATA.pandas} · Matplotlib ${DATA.matplotlib} · ${DATA.examples.length} 个预设示例 · ${PARTS} 个静态实体零件`;
$('#csv').textContent = DATA.csv;
$('#sales-csv').textContent = DATA.salesCsv;
window.lab = { select, go, stepsOf, examples: DATA.examples, get state() { return { current, stepIndex, steps: steps.length, pos: { ...pos }, goal: { ...goal }, playing, touring }; } };
tourUI();
select(0);
