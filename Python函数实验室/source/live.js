'use strict';
const $ = (s) => document.querySelector(s);
const { P, PARTS } = CFG, G = CFG.G;
const slotX = (i) => G.x0 + G.pitch * i, trayY = (r) => G.tray.y0 + G.tray.pitch * r;
const still = matchMedia('(prefers-reduced-motion: reduce)');
const stage = $('#stage'), readout = $('[data-readout]');
const svgEl = stage.querySelector('svg');
const vec = (d) => { const o = iso([0, 0, 0], P), p = iso(d, P); return [p[0] - o[0], p[1] - o[1]]; };
const AX = vec([1, 0, 0]), AY = vec([0, 1, 0]), UP = vec([0, 0, 1]);
const CHIP_Z = G.padH + 1, LIFT = 5, SEAL_Z = CHIP_Z + LIFT + G.chip.h + 1.5;
const MODES = { define: '定义与调用', params: '参数形式', lambda: '匿名函数', sort: '排序中的 lambda' };
const width = (ch) => (/[\x00-\x7f]/.test(ch) ? 1 : 2);
const clip = (t, n) => { if ([...t].reduce((a, ch) => a + width(ch), 0) <= n) return t; let out = '', w = 0; for (const ch of t) { if (w + width(ch) > n - 1) return out + '…'; out += ch; w += width(ch); } return out; };
const units = (t) => [...t].reduce((a, ch) => a + width(ch), 0);
const text = (xy, z, s, size, tone, anchor = 'middle') => faceTextSvg(topMatrix(xy, z, P), s, { size, tone, anchor });
const layer = (id) => svgEl.querySelector('#' + id);
// Fit face text to a width in world units by measuring the rendered string, trimming with … when needed.
function fit(el, full, room) {
  el.textContent = full;
  if (!full || el.getComputedTextLength() <= room) return;
  const chars = [...full];
  let lo = 0, hi = chars.length;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; el.textContent = chars.slice(0, mid).join('') + '…'; if (el.getComputedTextLength() <= room) lo = mid; else hi = mid - 1; }
  el.textContent = chars.slice(0, lo).join('') + '…';
}

// ---------- drawing ----------
function chip(x, y, value, lit, w = G.chip.w) {
  const z0 = CHIP_Z + (lit ? LIFT : 0);
  const plan = { x: x - w / 2, y: y - G.chip.d / 2, w, d: G.chip.d, r: 1.2 };
  const room = w - 4, t = String(value);
  const size = Math.max(3.2, Math.min(6, room / (0.6 * Math.max(1, units(t)))));
  const shown = clip(t, Math.floor(room / (0.6 * size)));
  return (lit ? `<path class="iso-halo" d="${haloOf(plan, CHIP_Z, 0.1, P)}" style="filter:blur(3px)"/>` : '') +
    solidSvg(slabOf(plan, z0, G.chip.h, P, 3, 0.5), { tone: 'hi', lit, crease: 'lo' }) +
    faceTextSvg(topMatrix([x, y + size * 0.35], z0 + G.chip.h, P), shown, { size, tone: lit ? 'lit' : 'hi', anchor: 'middle' });
}
const depth = (x, y) => depthOf([x, y, 0], P);
function seal(x0, x1, y, z) {
  const post = (x) => solidSvg(slabOf({ x: x - 1.5, y: y - 1.5, w: 3, d: 3, r: 0.6 }, 2, z - 2, P, 2, 0), { tone: 'mid' });
  const bar = solidSvg(slabOf({ x: x0 - 1.5, y: y - 1.5, w: x1 - x0 + 3, d: 3, r: 0.8 }, z, 2, P, 3, 0.3), { tone: 'mid' });
  return post(x0) + post(x1) + bar;
}
function rack(values, row, lit, sealed) {
  const y = row.y + row.d / 2;
  const chips = values.slice(0, G.slots).map((v, i) => ({ x: slotX(i), s: chip(slotX(i), y, v, lit.includes(i)) }));
  chips.sort((a, b) => depth(a.x, y) - depth(b.x, y));
  let s = chips.map((c) => c.s).join('');
  if (sealed && values.length) s = seal(slotX(0) - 19, slotX(Math.min(values.length, G.slots) - 1) + 19, row.y - 1, SEAL_Z) + s;
  return s;
}
function tags(list, row) {
  return list.slice(0, G.slots).map((t, i) => t ? text([slotX(i), row.y + row.d + 6.4], 2, clip(t, 11), 5.2, 'mid') : '').join('');
}
function trays(step) {
  let s = '';
  step.grid.forEach((items, r) => {
    const y = trayY(r);
    s += text([G.tray.x + 2, y - G.tray.d / 2 - 1.6], 3.5, step.rowTag[r] || '', 5, 'mid', 'start').replace('<text ', '<text data-label="tray" ');
    const n = Math.max(1, items.length), w = Math.min(n === 1 ? 44 : 30, (G.tray.w - 4) / n - 2);
    items.forEach((v, c) => {
      const x = G.tray.x + 2 + (w + 2) * c + w / 2;
      s += chip(x, y - 1, v, step.cells.some(([a, b]) => a === r && b === c), w);
    });
    if (step.rowSeal[r]) s += seal(G.tray.x + 3, G.tray.x + G.tray.w - 3, y - G.tray.d / 2 + 1.5, SEAL_Z);
  });
  return s;
}

// ---------- state, motion ----------
let current = 0, ex = DATA.examples[0], steps = [], stepIndex = 0, stepClock = 0;
const pos = { car: 0, flag: 8, row: 0 }, goal = { ...pos };
let frame = 0, last = 0, visible = false, touring = !still.matches, idle = 0, hover = false, touchedAt = 0;
const STEP_TIME = 1.25, HOLD_TIME = 3.4;

function apply() {
  const step = steps[stepIndex];
  goal.car = step.slot * G.pitch;
  goal.flag = step.ok ? 8 : 0;
  goal.row = step.row * G.tray.pitch;
  layer('src-chips').innerHTML = rack(step.src, G.src, step.lit, step.seal);
  layer('src-chips-tags').innerHTML = tags(step.srcTag, G.src);
  layer('out-chips').innerHTML = rack(step.out, G.out, step.outLit, step.outSeal);
  layer('out-chips-tags').innerHTML = tags(step.outTag, G.out);
  layer('tray-chips').innerHTML = trays(step);
  const last = stepIndex === steps.length - 1;
  const desc = ex.code.includes('reverse=True');
  const sortKeys = ex.mode === 'sort' && last && step.outTag.length ? 'key: ' + step.outTag.join(desc ? ' ≥ ' : ' ≤ ') : '';
  const ret = !last ? '' : ex.error ? ex.error : sortKeys || (ex.result !== null ? ex.result : 'None');
  $('#ret-label').textContent = !last ? '执行中…' : ex.error ? '出错 · 完整信息见右侧' : sortKeys ? (desc ? '按 key 降序 · 结果在后排' : '按 key 升序 · 结果在后排') : '返回值 · 完整内容见右侧';
  fit($('#ret-value'), ret, G.screen.w - 12);
  fit($('#ret-label'), $('#ret-label').textContent, G.screen.w - 12);
  $('#ret-value').dataset.tone = ex.error && last ? 'lit' : 'hi';
  stage.dataset.ok = String(step.ok);
  $('#step').textContent = `第 ${stepIndex + 1} / ${steps.length} 步 · ${step.say}`;
  $('#step').dataset.ok = String(step.ok);
}
function place() {
  const t = (v, k) => `translate(${(v[0] * k).toFixed(2)} ${(v[1] * k).toFixed(2)})`;
  layer('carriage').setAttribute('transform', t(AX, pos.car));
  layer('flag').setAttribute('transform', t(UP, pos.flag));
  layer('rowcar').setAttribute('transform', t(AY, pos.row));
}
const moving = () => Object.keys(pos).some((k) => Math.abs(pos[k] - goal[k]) > 0.02);
function say() {
  const txt = moving() ? '滑台移动中…' : clip(steps[stepIndex].say, 40);
  if (readout.textContent !== txt) readout.textContent = txt;
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
    if (stepIndex < steps.length - 1 && stepClock > STEP_TIME) { stepIndex++; stepClock = 0; apply(); }
    const engaged = hover || stage.closest('.workspace').contains(document.activeElement) || now - touchedAt < 3600;
    if (stepIndex === steps.length - 1 && touring && !engaged) { idle += dt; if (idle > HOLD_TIME) select(current + 1); }
  }
  place(); say();
  const busy = moving() || (!calm && (stepIndex < steps.length - 1 || touring));
  if (busy && visible && !document.hidden) frame = requestAnimationFrame(tick);
}
function run() { if (!frame && visible && !document.hidden) { last = 0; frame = requestAnimationFrame(tick); } }
function touch() { touchedAt = performance.now(); idle = 0; }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

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
    b.addEventListener('click', () => { touch(); select(i); });
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
  $('#code').textContent = ex.code;
  $('#result').textContent = ex.error || (ex.result !== null ? ex.result : 'None');
  $('#result').dataset.error = String(!!ex.error);
  $('#printed-row').hidden = !ex.printed;
  $('#printed').textContent = ex.printed;
  $('#note').textContent = ex.note;
  stage.setAttribute('aria-label', `${MODES[ex.mode]}示例：${ex.title}。结果 ${$('#result').textContent}。左右方向键切换示例，空格键重播。`);
  steps = ex.steps;
  stepIndex = still.matches ? steps.length - 1 : 0;
  stepClock = 0; idle = 0;
  apply();
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
window.lab = { select, show(k) { stepIndex = Math.max(0, Math.min(steps.length - 1, k)); stepClock = 0; apply(); Object.assign(pos, goal); place(); say(); }, examples: DATA.examples, get state() { return { current, stepIndex, steps: steps.length, pos: { ...pos }, goal: { ...goal }, touring }; } };
tourUI();
select(0);
