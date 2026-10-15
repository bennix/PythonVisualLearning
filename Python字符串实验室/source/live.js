'use strict';
const $ = (s) => document.querySelector(s);
const { P, PARTS } = CFG, G = CFG.G;
const slotX = (i) => G.x0 + G.pitch * i, mxX = (c) => G.mx.x0 + G.mx.pitch * c, mxY = (r) => G.mx.y0 + G.mx.pitch * r;
const still = matchMedia('(prefers-reduced-motion: reduce)');
const stage = $('#stage'), readout = $('[data-readout]');
const svgEl = stage.querySelector('svg');
const vec = (d) => { const o = iso([0, 0, 0], P), p = iso(d, P); return [p[0] - o[0], p[1] - o[1]]; };
const AX = vec([1, 0, 0]), AY = vec([0, 1, 0]), UP = vec([0, 0, 1]);
const CHIP_Z = G.padH + 1, LIFT = 5, SEAL_Z = CHIP_Z + LIFT + G.chip.h + 1.5;
const MODES = { basic: '字符串基础', method: '常用方法', split: '分割与连接' };

// ---------- drawing ----------
function chip(x, y, value, lit, w = G.chip.w) {
  const z0 = CHIP_Z + (lit ? LIFT : 0);
  const plan = { x: x - w / 2, y: y - G.chip.d / 2, w, d: G.chip.d, r: 1.2 };
  const text = String(value);
  const size = Math.min(6, (w - 3) / (0.62 * Math.max(1, text.length)));
  return (lit ? `<path class="iso-halo" d="${haloOf(plan, CHIP_Z, 0.1, P)}" style="filter:blur(3px)"/>` : '') +
    solidSvg(slabOf(plan, z0, G.chip.h, P, 3, 0.5), { tone: 'hi', lit, crease: 'lo' }) +
    faceTextSvg(topMatrix([x, y + 2], z0 + G.chip.h, P), text, { size, tone: lit ? 'lit' : 'hi', anchor: 'middle' });
}
const depth = (x, y) => depthOf([x, y, 0], P);
// A hold-down bar on two posts with a padlock: the tuple's "no writes" seal.
function seal(x0, x1, y, z, alarm) {
  const post = (x) => solidSvg(slabOf({ x: x - 1.5, y: y - 1.5, w: 3, d: 3, r: 0.6 }, 2, z - 2, P, 2, 0), { tone: 'mid' });
  const bar = solidSvg(slabOf({ x: x0 - 1.5, y: y - 1.5, w: x1 - x0 + 3, d: 3, r: 0.8 }, z, 2, P, 3, 0.3), { tone: alarm ? 'hi' : 'mid', lit: alarm });
  const lock = { x: x0 - 1.4, y: y + 1.5, w: 4.8, d: 2.4, r: 0.6 };
  const body = solidSvg(slabOf(lock, z - 4.5, 4.5, P, 2, 0), { tone: alarm ? 'hi' : 'mid', lit: alarm });
  return post(x0) + post(x1) + bar + body + dotsSvg([iso([x0 + 1, y + 3.9, z - 2.2], P)], { size: 0.45, tone: 'lo' });
}
function rack(values, row, lit, sealed, alarm) {
  const y = row.y + row.d / 2;
  const chips = values.map((v, i) => ({ x: slotX(i), y, s: chip(slotX(i), y, v, lit.includes(i)) }));
  chips.sort((a, b) => depth(a.x, a.y) - depth(b.x, b.y));
  let s = chips.map((c) => c.s).join('');
  if (sealed && values.length) s += seal(slotX(0) - 11, slotX(values.length - 1) + 11, row.y + 1.5, SEAL_Z, alarm);
  return s;
}
function negLabels(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += faceTextSvg(topMatrix([slotX(i), G.src.y + G.src.d + 6.2], 2, P), String(i - n), { size: 2.6, tone: 'mid', anchor: 'middle' });
  return s;
}
function grid(rows, seals, cells, alarm) {
  const hit = (r, c) => cells.some(([a, b]) => a === r && b === c);
  const order = rows.map((_, r) => r).sort((a, b) => depth(G.mx.x0, mxY(a)) - depth(G.mx.x0, mxY(b)));
  let s = '';
  for (const r of order) {
    const wide = rows[r].length === 1;
    const items = rows[r].map((v, c) => ({ x: mxX(c), s: wide ? chip(mxX(1), mxY(r), v, hit(r, c), G.mx.pitch * 2 + G.mx.cell) : chip(mxX(c), mxY(r), v, hit(r, c)) }));
    items.sort((a, b) => depth(a.x, mxY(r)) - depth(b.x, mxY(r)));
    s += items.map((i) => i.s).join('');
    if (seals[r]) s += seal(mxX(0) - 12, mxX(wide ? 2 : rows[r].length - 1) + 12, mxY(r) - G.mx.cell / 2 + 1.5, SEAL_Z, alarm && cells.some(([a]) => a === r));
  }
  return s;
}
const layer = (id) => svgEl.querySelector('#' + id);
const negG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
layer('src-chips').after(negG);
let drawn = '';
function render(step) {
  const key = JSON.stringify(step);
  if (key === drawn) return;
  drawn = key;
  layer('src-chips').innerHTML = rack(step.src, G.src, step.lit, step.seal, !step.ok);
  negG.innerHTML = negLabels(step.src.length);
  layer('out-chips').innerHTML = rack(step.out, G.out, step.outLit, step.outSeal, false);
  layer('mx-chips').innerHTML = grid(step.grid, step.rowSeal, step.cells, !step.ok);
}

// ---------- state, motion ----------
let current = 0, steps = [], stepIndex = 0, stepClock = 0;
const pos = { car: 0, flag: 8, row: 0, col: 0 }, goal = { ...pos };
let frame = 0, last = 0, visible = false, touring = !still.matches, idle = 0, hover = false, touchedAt = 0;
const STEP_TIME = 0.9, HOLD_TIME = 3.4;

function applyStep() {
  const step = steps[stepIndex];
  goal.car = step.slot * G.pitch;
  goal.flag = step.ok ? 8 : 0;
  goal.row = step.row * G.mx.pitch;
  goal.col = (step.grid.length && step.grid.every((r) => r.length === 1) ? 1 : step.col) * G.mx.pitch;
  render(step);
  stage.dataset.ok = String(step.ok);
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
  const text = moving() ? '滑台移动中…' : steps[stepIndex].say;
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
    if (stepIndex === steps.length - 1 && touring && !engaged) { idle += dt; if (idle > HOLD_TIME) select(current + 1); }
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
    const lines = ex.code.split('\n');
    b.textContent = lines.length > 2 ? lines[0] + ' …' : lines.join('; ');
    b.dataset.index = i;
    b.addEventListener('click', () => { touch(); select(i); });
    examplesBox.append(b);
  });
  examplesBox.dataset.mode = mode;
}
function select(i) {
  current = (i + DATA.examples.length) % DATA.examples.length;
  const ex = DATA.examples[current];
  tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.mode === ex.mode)));
  if (examplesBox.dataset.mode !== ex.mode) fillExamples(ex.mode);
  examplesBox.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.index === current)));
  $('#setup').textContent = ex.setup || '# 无需准备';
  $('#code').textContent = ex.code;
  $('#result').textContent = ex.error || ex.result || 'None';
  $('#result').dataset.error = String(!!ex.error);
  $('#note').textContent = ex.note;
  $('#loop-box').hidden = !ex.loop;
  $('#loop').textContent = ex.loop || '';
  $('#identity').textContent = ex.identity || '';
  stage.setAttribute('aria-label', `${MODES[ex.mode]}示例：${ex.code.replace(/\n/g, '；')}。结果 ${$('#result').textContent}。左右方向键切换示例，空格键重播。`);
  steps = ex.steps;
  stepIndex = still.matches ? steps.length - 1 : 0;
  stepClock = 0; idle = 0;
  applyStep();
  if (still.matches) { Object.assign(pos, goal); place(); say(); }
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
window.lab = { select, examples: DATA.examples, get state() { return { current, stepIndex, steps: steps.length, pos: { ...pos }, goal: { ...goal }, touring }; } };
tourUI();
select(0);
