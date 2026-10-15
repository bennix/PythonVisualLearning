'use strict';
const $ = (s) => document.querySelector(s);
const { P, PARTS } = CFG, G = CFG.G;
const rowY = (r) => G.row0 + G.pitch * r;
const still = matchMedia('(prefers-reduced-motion: reduce)');
const stage = $('#stage'), readout = $('[data-readout]');
const svgEl = stage.querySelector('svg');
const vec = (d) => { const o = iso([0, 0, 0], P), p = iso(d, P); return [p[0] - o[0], p[1] - o[1]]; };
const AY = vec([0, 1, 0]), UP = vec([0, 0, 1]);
const MODES = { branch: '条件判断', loop: '循环', jump: 'break / continue', combo: '综合应用' };
const layer = (id) => svgEl.querySelector('#' + id);
const width = (ch) => (/[\x00-\x7f]/.test(ch) ? 1 : 2);
const clip = (t, n) => { let out = '', w = 0; for (const ch of t) { if (w + width(ch) > n - 1) return out + '…'; out += ch; w += width(ch); } return out; };
const text = (xy, z, s, size, tone, anchor = 'start') => faceTextSvg(topMatrix(xy, z, P), s, { size, tone, anchor });

// ---------- drawing ----------
// Each code line is a type block on its seat; deeper indentation sits further right, so blocks read as Python's own structure.
function plates(ex, step) {
  let s = '';
  ex.code.forEach((src, r) => {
    const indent = (src.length - src.trimStart().length) / 4;
    const x0 = G.plateX + 4 + indent * 12;
    const cur = step && step.line === r + 1;
    const plan = { x: x0, y: rowY(r) - 5, w: G.plateW - 8 - indent * 12, d: 10, r: 1 };
    const z = 2.6 + (cur ? 2 : 0);
    const size = 5.6, room = Math.floor((plan.w - 5) / (0.62 * size));
    s += solidSvg(slabOf(plan, z, 2, P, 3, 0.3), { tone: cur ? 'hi' : 'mid', lit: cur, crease: 'lo' });
    s += text([x0 + 2.5, rowY(r) + 2], z + 2, clip(src.trim(), room), size, cur ? 'lit' : 'hi');
  });
  return s;
}
// Patch cord from the current line's jack to the next line's jack, routed through the channel on the right.
function cord(step) {
  if (!step) return '';
  const from = step.line - 1, to = step.next ? step.next - 1 : G.rows;
  const y0 = rowY(from), y1 = to >= G.rows ? rowY(G.rows - 1) + 9 : rowY(to);
  const back = step.next !== null && step.next <= step.line;
  const lane = G.chanX + (back ? 16 : step.next === step.line + 1 ? 4 : 10);
  const z = 5.4;
  const pts = [[G.jackX, y0, z], [lane, y0, z], [lane, y1, z], [to >= G.rows ? lane : G.jackX, y1, z]].map((p) => iso(p, P));
  return wireSvg(pts[0], pts[pts.length - 1], { via: pts.slice(1, -1), tone: 'lit', ends: 'both', size: 1.4 });
}
function regs(step) {
  const vars = Object.entries(step ? step.vars : {}).slice(-3);
  let s = '';
  for (let i = 0; i < 3; i++) {
    const y = G.reg.y0 + i * (G.reg.d + G.reg.gap);
    const v = vars[i];
    if (!v) continue;
    s += text([G.reg.x + 6, y + 9.5], 5.4, clip(v[0], 16), 4.6, 'mid');
    s += text([G.reg.x + 6, y + 18.5], 5.4, clip(v[1], 19), 6.6, 'hi');
  }
  return s;
}
function tape(step) {
  const lines = (step ? step.out : '').split('\n').filter((l, i, a) => i < a.length - 1);
  const shown = lines.slice(-4);
  return shown.map((l, i) => text([G.tape.x + 7, G.tape.y + 14 + i * 10.5], 3.4, clip(l, 24), 6, 'hi')).join('');
}

// ---------- state, motion ----------
let current = 0, ex = DATA.examples[0], stepIndex = 0, stepClock = 0;
const pos = { car: 0, flag: 8 }, goal = { car: 0, flag: 8 };
let frame = 0, last = 0, visible = false, playing = !still.matches, touring = !still.matches, idle = 0, hover = false, touchedAt = 0;
const STEP_TIME = 1.1, HOLD_TIME = 3.2;
const atEnd = () => stepIndex >= ex.steps.length;
const stepAt = () => (atEnd() ? null : ex.steps[stepIndex]);

function apply() {
  const step = stepAt();
  const shown = step || ex.final;
  goal.car = step ? (step.line - 1) * G.pitch : (ex.code.length - 1) * G.pitch;
  goal.flag = step && step.taken === false ? 0 : 8;
  layer('plates').innerHTML = plates(ex, step);
  layer('cord').innerHTML = cord(step);
  layer('regs').innerHTML = regs(shown);
  layer('tape-text').innerHTML = tape(shown);
  document.querySelectorAll('#code li').forEach((li, i) => li.setAttribute('aria-current', String(!!step && step.line === i + 1)));
  $('#step-count').textContent = step ? `第 ${stepIndex + 1} / ${ex.steps.length} 步` : `已结束 · 共 ${ex.steps.length} 步`;
  $('#detail').textContent = step ? `第 ${step.line} 行 · ${step.detail}` : '程序运行完毕';
  $('#detail').dataset.taken = step && step.taken !== null ? String(step.taken) : '';
  const vars = Object.entries(shown.vars);
  $('#vars').innerHTML = vars.length ? vars.map(([k, v]) => `<div><code>${esc(k)}</code><output>${esc(v)}</output></div>`).join('') : '<p class="micro">还没有变量</p>';
  $('#output').textContent = shown.out || '（还没有输出）';
  $('#prev').disabled = stepIndex === 0;
  $('#next').disabled = atEnd();
  $('#play').textContent = playing ? '暂停' : atEnd() ? '从头播放' : '播放';
  stage.setAttribute('aria-valuetext', $('#detail').textContent);
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function place() {
  const t = (v, k) => `translate(${(v[0] * k).toFixed(2)} ${(v[1] * k).toFixed(2)})`;
  layer('carriage').setAttribute('transform', t(AY, pos.car));
  layer('flag').setAttribute('transform', t(UP, pos.flag));
}
const moving = () => Object.keys(pos).some((k) => Math.abs(pos[k] - goal[k]) > 0.02);
function say() {
  const step = stepAt();
  const txt = moving() ? '读码滑台移动中…' : step ? `第 ${step.line} 行 · ${step.kind === 'stmt' ? '执行' : step.kind}${step.taken === true ? ' · 成立' : step.taken === false ? ' · 不成立' : ''}` : '运行结束';
  if (readout.textContent !== txt) readout.textContent = txt;
}
function tick(now) {
  frame = 0;
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  const a = 1 - Math.exp(-dt / 0.16);
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
function go(i) { stepIndex = Math.max(0, Math.min(ex.steps.length, i)); stepClock = 0; apply(); if (still.matches) { Object.assign(pos, goal); place(); say(); } run(); }

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
  $('#note').textContent = ex.note;
  $('#code').innerHTML = ex.code.map((l) => `<li>${esc(l) || ' '}</li>`).join('');
  stage.setAttribute('aria-label', `${MODES[ex.mode]}示例：${ex.title}。左右方向键单步，空格播放或暂停，Home 回到开头，End 跳到结束，PageDown 下一个示例。`);
  go(still.matches ? ex.steps.length : 0);
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
    ' ': () => $('#play').click(), Enter: () => $('#play').click(), Home: () => { playing = false; go(0); }, End: () => { playing = false; go(ex.steps.length); },
    PageDown: () => { playing = false; select(current + 1); }, PageUp: () => { playing = false; select(current - 1); } };
  if (!keys[e.key]) return;
  e.preventDefault(); touch(); keys[e.key]();
});
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); else { cancelAnimationFrame(frame); frame = 0; } }, { rootMargin: '120px 0px' }).observe(stage);
document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else run(); });
still.addEventListener('change', () => { if (still.matches) { touring = false; playing = false; } tourUI(); select(current); });
$('#version').textContent = `Python ${DATA.python} · ${DATA.examples.length} 个预设程序 · ${PARTS} 个静态实体零件`;
window.lab = { select, go, examples: DATA.examples, get state() { return { current, stepIndex, steps: ex.steps.length, pos: { ...pos }, goal: { ...goal }, playing, touring }; } };
tourUI();
select(0);
