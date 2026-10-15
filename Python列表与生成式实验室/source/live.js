'use strict';
const $ = (s) => document.querySelector(s);
const NS = 'http://www.w3.org/2000/svg';
const { P, PARTS } = CFG, G = CFG.G;
const slotX = (i) => G.x0 + G.pitch * i, mxX = (c) => G.mx.x0 + G.mx.pitch * c, mxY = (r) => G.mx.y0 + G.mx.pitch * r;
const still = matchMedia('(prefers-reduced-motion: reduce)');
const stage = $('#stage'), readout = $('[data-readout]');
const svgEl = stage.querySelector('svg');
const vec = (d) => { const o = iso([0, 0, 0], P), p = iso(d, P); return [p[0] - o[0], p[1] - o[1]]; };
const AX = vec([1, 0, 0]), AY = vec([0, 1, 0]), UP = vec([0, 0, 1]);
const CHIP_Z = G.padH + 1;
const MODES = { list: '列表', comp: '列表生成式', nest: '嵌套列表' };
const SETUP = { list: 'nums = [3, 1, 4, 1, 5, 9]', comp: 'nums = [3, 1, 4, 1, 5, 9]', nest: 'm = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]' };

// ---------- pure: turn one truth example into animation steps ----------
function stepsOf(ex) {
  const steps = [];
  if (ex.mode === 'list') {
    const before = ex.before.map(String), after = ex.after.map(String);
    if (ex.kind === 'index') {
      const i = ex.visit[0];
      steps.push({ slot: i, lit: [i], src: before, out: [], say: ex.error ? `索引 ${ex.code.slice(5, -1)} 超出范围 · IndexError` : `读取槽位 ${i} · 得到 ${ex.result}` });
    } else if (ex.kind === 'slice' || ex.kind === 'sorted') {
      const out = [];
      ex.visit.forEach((i, n) => {
        if (ex.kind === 'slice') out.push(before[i]);
        steps.push({ slot: i, lit: [i], src: before, out: [...out], say: ex.kind === 'slice' ? `复制槽位 ${i} → 新列表第 ${n} 位` : `扫描槽位 ${i}` });
      });
      if (ex.kind === 'sorted') steps.push({ slot: ex.visit[ex.visit.length - 1], lit: [], src: before, out: ex.output, say: '新列表已排序 · 原列表不变' });
      else steps.push({ slot: ex.visit[ex.visit.length - 1], lit: [], src: before, out: ex.output, say: `切片完成 · 新列表 ${ex.output.length} 个元素` });
    } else {
      const sweep = ex.code.includes('sort') ? ex.visit : [ex.visit[0]];
      for (const i of sweep) steps.push({ slot: i, lit: [i], src: before, out: [], say: `定位槽位 ${i}` });
      const out = [];
      const last = sweep[sweep.length - 1];
      steps.push({ slot: last, lit: ex.code.includes('pop') || ex.code.includes('remove') ? [] : [Math.min(last, after.length - 1)], src: after, out, say: `原地修改 · 现在 ${after.length} 个元素` + ` · 返回 ${ex.result}` });
    }
  } else if (ex.mode === 'comp') {
    const before = ex.before.map(String), out = [];
    let emitted = 0;
    ex.visit.forEach((i, n) => {
      const pass = ex.pass[n];
      if (pass) out.push(ex.output[emitted++]);
      steps.push({ slot: i, lit: [i], pass, src: before, out: [...out], say: `x = ${before[i]}` + (ex.filtered ? (pass ? ' · 通过 if' : ' · 被过滤') : '') + (pass ? ` → ${out[out.length - 1]}` : '') });
    });
    steps.push({ slot: ex.visit[ex.visit.length - 1], lit: [], pass: true, src: before, out: [...out], say: ex.error ? '列表已生成 · 外部访问 x → NameError' : `完成 · 新列表 ${out.length} 个元素` });
  } else {
    const grid = ex.matrix.map((r) => r.map(String));
    if (ex.kind === 'shared') {
      const zeros = grid.map((r) => r.map(() => '0'));
      steps.push({ row: 0, col: 0, cells: [], grid: zeros, out: [], say: '创建 3×3 的 0' });
      steps.push({ row: 0, col: 0, cells: ex.cells, grid, out: [], say: ex.shared ? '改 g[0][0] · 三行一起变' : '改 g[0][0] · 只有这一格变' });
    } else if (ex.output) {
      const out = [];
      ex.cells.forEach(([r, c]) => { out.push(grid[r][c]); steps.push({ row: r, col: c, cells: [[r, c]], grid, out: [...out], say: `row = ${r} · 取 m[${r}][${c}] = ${grid[r][c]}` }); });
      steps.push({ row: ex.cells[ex.cells.length - 1][0], col: ex.cells[ex.cells.length - 1][1], cells: [], grid, out: [...out], say: `完成 · ${out.length} 个元素` });
    } else {
      const col = ex.col === null ? 1 : ex.col;
      steps.push({ row: ex.row, col, cells: ex.cells, grid, out: [], say: ex.col === null ? `选第 ${ex.row} 行 · 得到 ${ex.result}` : `第 ${ex.row} 行第 ${col} 列 · 得到 ${ex.result}`, wholeRow: ex.col === null });
    }
  }
  return steps;
}

// ---------- drawing ----------
function chip(x, y, value, { lit = false, tone = 'hi', dim = false } = {}) {
  const z0 = CHIP_Z + (lit ? 6 : 0);
  const plan = { x: x - G.chip.w / 2, y: y - G.chip.d / 2, w: G.chip.w, d: G.chip.d, r: 1.2 };
  const text = String(value);
  const size = text.length <= 1 ? 6 : text.length === 2 ? 5 : text.length === 3 ? 3.8 : 3;
  return `<g class="chip"${dim ? ' data-dim' : ''}>` + (lit ? `<path class="iso-halo" d="${haloOf(plan, CHIP_Z, 0.1, P)}" style="filter:blur(3px)"/>` : '') + solidSvg(slabOf(plan, z0, G.chip.h, P, 3, 0.5), { tone, lit, crease: 'lo' }) +
    faceTextSvg(topMatrix([x, y + 2], z0 + G.chip.h, P), text, { size, tone: lit ? 'lit' : 'hi', anchor: 'middle' }) + '</g>';
}
const byDepth = (items) => items.sort((a, b) => depthOf([a.x, a.y, 0], P) - depthOf([b.x, b.y, 0], P));
function rackChips(values, row, lit = []) {
  const y = row.y + row.d / 2;
  return byDepth(values.map((v, i) => ({ v, i, x: slotX(i), y }))).map((c) => chip(c.x, c.y, c.v, { lit: lit.includes(c.i) })).join('');
}
function negLabels(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += faceTextSvg(topMatrix([slotX(i), G.src.y + G.src.d + 6.2], 2, P), String(i - n), { size: 2.6, tone: 'mid', anchor: 'middle' });
  return s;
}
function gridChips(grid, cells, wholeRow) {
  const hit = (r, c) => cells.some(([a, b]) => a === r && b === c);
  const items = [];
  grid.forEach((row, r) => row.forEach((v, c) => items.push({ v, r, c, x: mxX(c), y: mxY(r) })));
  return byDepth(items).map((it) => chip(it.x, it.y, it.v, { lit: hit(it.r, it.c) })).join('');
}
const layer = (id) => svgEl.querySelector('#' + id);
const negG = document.createElementNS(NS, 'g');
negG.id = 'neg';
layer('src-chips').after(negG);
let drawn = '';
function render(step) {
  const key = JSON.stringify(step);
  if (key === drawn) return;
  drawn = key;
  const ex = DATA.examples[current];
  layer('src-chips').innerHTML = rackChips(step.src || DATA.nums.map(String), G.src, step.lit || []);
  negG.innerHTML = negLabels((step.src || DATA.nums).length);
  const active = ex.mode === 'nest' ? (step.cells || []).length : (step.lit || []).length;
  layer('out-chips').innerHTML = rackChips(step.out || [], G.out, active && step.out && step.out.length ? [step.out.length - 1] : []);
  layer('mx-chips').innerHTML = gridChips(step.grid || DATA.m.map((r) => r.map(String)), step.cells || [], step.wholeRow);
  stage.dataset.mode = ex.mode;
}

// ---------- state, motion ----------
let current = 0, steps = [], stepIndex = 0, stepClock = 0;
const pos = { car: 0, flag: 0, row: 0, col: 0 }, goal = { car: 0, flag: 0, row: 0, col: 0 };
let frame = 0, last = 0, visible = false, touring = !still.matches, idle = 0, hover = false, touchedAt = 0;
const STEP_TIME = 0.8, HOLD_TIME = 3.2;

function applyStep() {
  const step = steps[stepIndex];
  const ex = DATA.examples[current];
  goal.car = step.slot !== undefined ? step.slot * G.pitch : 0;
  goal.flag = ex.mode === 'comp' ? (step.pass ? 8 : 0) : ex.mode === 'nest' || ex.error ? 0 : 8;
  if (step.row !== undefined) { goal.row = step.row * G.mx.pitch; goal.col = step.col * G.mx.pitch; }
  render(step);
  $('#step').textContent = `第 ${stepIndex + 1} / ${steps.length} 步 · ${step.say}`;
}
function place() {
  const t = (v, k) => `translate(${(v[0] * k).toFixed(2)} ${(v[1] * k).toFixed(2)})`;
  layer('carriage').setAttribute('transform', t(AX, pos.car));
  layer('flag').setAttribute('transform', t(UP, pos.flag));
  layer('rowcar').setAttribute('transform', t(AY, pos.row));
  layer('colcar').setAttribute('transform', t(AX, pos.col));
}
const moving = () => Object.keys(pos).some((k) => Math.abs(pos[k] - goal[k]) > 0.02);
function say() {
  const step = steps[stepIndex];
  const text = moving() ? '滑台移动中…' : step.say;
  if (readout.textContent !== text) readout.textContent = text;
}
function tick(now) {
  frame = 0;
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  const a = 1 - Math.exp(-dt / 0.16);
  for (const k of Object.keys(pos)) { pos[k] = calm ? goal[k] : pos[k] + (goal[k] - pos[k]) * a; if (Math.abs(pos[k] - goal[k]) < 0.01) pos[k] = goal[k]; }
  if (!calm) {
    stepClock += dt;
    if (stepIndex < steps.length - 1 && stepClock > STEP_TIME) { stepIndex++; stepClock = 0; applyStep(); }
    const engaged = hover || stage.closest('.workspace').contains(document.activeElement) || now - touchedAt < 3600;
    if (stepIndex === steps.length - 1 && touring && !engaged) { idle += dt; if (idle > HOLD_TIME) select((current + 1) % DATA.examples.length, false); }
  }
  place(); say();
  const busy = moving() || (!calm && (stepIndex < steps.length - 1 || touring));
  if (busy && visible && !document.hidden) frame = requestAnimationFrame(tick);
}
function run() { if (!frame && visible && !document.hidden) { last = 0; frame = requestAnimationFrame(tick); } }
function touch() { touchedAt = performance.now(); idle = 0; }

// ---------- UI ----------
const examplesBox = $('#examples');
const tabs = [...document.querySelectorAll('[data-mode]')];
function fillExamples(mode) {
  examplesBox.innerHTML = '';
  DATA.examples.forEach((ex, i) => {
    if (ex.mode !== mode) return;
    const b = document.createElement('button');
    b.textContent = ex.code.split('\n').length > 1 && ex.kind !== 'assign' ? ex.code.split('\n')[0] + ' …' : ex.code.replace('\n', '; ');
    b.dataset.index = i;
    b.setAttribute('aria-pressed', String(i === current));
    b.addEventListener('click', () => { touch(); select(i); });
    examplesBox.append(b);
  });
}
function select(i, user = true) {
  current = (i + DATA.examples.length) % DATA.examples.length;
  const ex = DATA.examples[current];
  tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.mode === ex.mode)));
  if (examplesBox.dataset.mode !== ex.mode) { fillExamples(ex.mode); examplesBox.dataset.mode = ex.mode; }
  examplesBox.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.index === current)));
  $('#setup').textContent = SETUP[ex.mode];
  $('#code').textContent = ex.code;
  $('#result').textContent = ex.error || (ex.result === null ? 'None' : ex.result);
  $('#result').dataset.error = String(!!ex.error);
  const showAfter = ex.mode === 'list';
  $('#after-row').hidden = !showAfter;
  if (showAfter) $('#after').textContent = '[' + ex.after.join(', ') + ']' + (ex.mutated ? '  · 已被修改' : '  · 未改变');
  $('#note').textContent = ex.note;
  $('#loop-box').hidden = !ex.loop;
  $('#loop').textContent = ex.loop || '';
  $('#identity').textContent = ex.identity || '';
  stage.setAttribute('aria-label', `${MODES[ex.mode]}示例：${ex.code.replace(/\n/g, '；')}。结果 ${$('#result').textContent}。左右方向键切换示例，空格键重播。`);
  steps = stepsOf(ex);
  stepIndex = still.matches ? steps.length - 1 : 0;
  stepClock = 0; idle = 0;
  applyStep();
  if (still.matches) Object.assign(pos, goal), place(), say();
  run();
}
tabs.forEach((t) => t.addEventListener('click', () => { touch(); select(DATA.examples.findIndex((e) => e.mode === t.dataset.mode)); }));
$('#replay').addEventListener('click', () => { touch(); select(current); });
function tourUI() {
  $('#tour').setAttribute('aria-pressed', String(touring));
  $('#tour').textContent = touring ? '暂停巡览' : '自动巡览';
  $('#tour-status').textContent = still.matches ? '已遵循系统“减少动态效果”设置' : touring ? '空闲时自动浏览示例' : '巡览已暂停 · 可手动切换';
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
  let next = null;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = current + 1;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = current - 1;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = DATA.examples.length - 1;
  else if (e.key === ' ' || e.key === 'Enter') next = current;
  if (next === null) return;
  e.preventDefault(); touch(); select(next);
});
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); else { cancelAnimationFrame(frame); frame = 0; } }, { rootMargin: '120px 0px' }).observe(stage);
document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else run(); });
still.addEventListener('change', () => { if (still.matches) touring = false; tourUI(); select(current); });
$('#version').textContent = `Python ${DATA.python} · ${DATA.examples.length} 个预设示例 · ${PARTS} 个静态实体零件`;
window.lab = { stepsOf, select, examples: DATA.examples, get state() { return { current, stepIndex, steps: steps.length, pos: { ...pos }, goal: { ...goal }, touring }; } };
tourUI();
select(0);
