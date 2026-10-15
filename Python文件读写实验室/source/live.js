'use strict';
const $ = (s) => document.querySelector(s);
const { P, PARTS } = CFG, G = CFG.G;
const rowY = (r) => G.row0 + G.pitch * r;
const still = matchMedia('(prefers-reduced-motion: reduce)');
const stage = $('#stage'), readout = $('[data-readout]');
const svgEl = stage.querySelector('svg');
const vec = (d) => { const o = iso([0, 0, 0], P), p = iso(d, P); return [p[0] - o[0], p[1] - o[1]]; };
const AY = vec([0, 1, 0]), UP = vec([0, 0, 1]);
const MODES = { text: '文本文件', csv: 'CSV', json: 'JSON' };
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
  if (!step || step.next === step.line) return '';
  const from = step.line - 1, to = step.next ? step.next - 1 : G.rows;
  const y0 = rowY(from), y1 = to >= G.rows ? rowY(G.rows - 1) + 9 : rowY(to);
  const back = step.next !== null && step.next <= step.line;
  const lane = G.chanX + (back ? 16 : step.next === step.line + 1 ? 4 : 10);
  const z = 5.4;
  const pts = [[G.jackX, y0, z], [lane, y0, z], [lane, y1, z], [to >= G.rows ? lane : G.jackX, y1, z]].map((p) => iso(p, P));
  return wireSvg(pts[0], pts[pts.length - 1], { via: pts.slice(1, -1), tone: 'lit', ends: 'both', size: 1.4, dashed: step.event === 'exception' });
}
// Write buffer: a stack of plates whose height is the bytes written but not yet on disk.
function bufferArt(state) {
  const pend = Object.values(state.handles).reduce((a, h) => a + (h.closed ? 0 : h.pending || 0), 0);
  let s = text([G.buf.x + 7, G.buf.y + 25], 3.4, pend ? `缓冲区 · ${pend} 字节未写入磁盘` : '缓冲区 · 空', 4.6, pend ? 'hi' : 'mid', 'start');
  if (pend > 0) {
    const h = Math.min(10, 2 + pend / 8);
    s = solidSvg(slabOf({ x: G.buf.x + 8, y: G.buf.y + 4, w: G.buf.w - 16, d: 10, r: 1.2 }, 3, h, P, 3, 0.4), { tone: 'hi', lit: true }) + s;
  }

  return s;
}
// Disk plate: the file's real bytes on disk, decoded, one line per row.
function diskArt(state) {
  const names = Object.keys(state.disk);
  let s = '';
  if (!names.length) return text([G.disk.x + 7, G.disk.y + 12], 4.4, '磁盘 · （没有文件）', 4.6, 'mid', 'start');
  const name = names[names.length - 1], f = state.disk[name];
  s += text([G.disk.x + 7, G.disk.y + 12], 4.4, `${clip(name, 16)} · ${f.bytes} 字节`, 4.6, 'hi', 'start');
  const rows = f.text === null ? ['（不是 UTF-8 文本）', f.hex] : f.text === '' ? ['（空文件）'] : f.text.replace(/\r/g, '').split('\n');
  if (rows.length > 1 && rows[rows.length - 1] === '') rows.pop();
  rows.slice(0, G.disk.lines).forEach((r, i) => {
    s += text([G.disk.x + 8, G.disk.line0 + i * G.disk.pitch + 2], 4.6, clip(r.replace(/ /g, '·') || '↵', 28), 5.4, 'hi', 'start');
  });
  if (rows.length > G.disk.lines) s += text([G.disk.x + 8, G.disk.line0 + G.disk.lines * G.disk.pitch - 4], 4.6, `… 还有 ${rows.length - G.disk.lines} 行`, 4.2, 'mid', 'start');
  return s;
}
// Cursor slider row: which disk line the read position (tell) is at.
function cursorRow(state) {
  const h = Object.values(state.handles).find((x) => !x.closed && x.tell !== null && x.tell !== undefined);
  if (!h) return null;
  const f = state.disk[h.file];
  if (!f || f.text === null) return 0;
  const enc = new TextEncoder();
  let bytes = 0, row = 0;
  for (const line of f.text.split('\n')) { const n = enc.encode(line + '\n').length; if (bytes + n > h.tell) break; bytes += n; row++; }
  return Math.min(row, G.disk.lines - 1);
}

// ---------- state, motion ----------
let current = 0, ex = DATA.examples[0], stepIndex = 0, stepClock = 0;
const pos = { car: 0, flag: 8, cur: 0 }, goal = { car: 0, flag: 8, cur: 0 };
let frame = 0, last = 0, visible = false, playing = !still.matches, touring = !still.matches, idle = 0, hover = false, touchedAt = 0;
const STEP_TIME = 1.1, HOLD_TIME = 3.2;
const atEnd = () => stepIndex >= ex.steps.length;
const stepAt = () => (atEnd() ? null : ex.steps[stepIndex]);

function apply() {
  const step = stepAt();
  const shown = step ? step.after : ex.steps[ex.steps.length - 1].after;
  goal.car = step ? (step.line - 1) * G.pitch : (ex.code.length - 1) * G.pitch;
  goal.flag = (step && step.event === 'exception') || (!step && ex.error) ? 0 : 8;
  const row = cursorRow(shown);
  goal.cur = row === null ? goal.cur : row * G.disk.pitch;
  layer('cursor').style.opacity = row === null ? '0.35' : '1';
  layer('plates').innerHTML = plates(ex, step);
  layer('cord').innerHTML = cord(step);
  layer('buffer').innerHTML = bufferArt(shown);
  layer('disk-text').innerHTML = diskArt(shown);
  document.querySelectorAll('#code li').forEach((li, i) => li.setAttribute('aria-current', String(!!step && step.line === i + 1)));
  $('#step-count').textContent = step ? `第 ${stepIndex + 1} / ${ex.steps.length} 步` : `已结束 · 共 ${ex.steps.length} 步`;
  $('#detail').textContent = step ? `第 ${step.line} 行 · ${step.detail}` : ex.error ? `程序终止 · 未处理的 ${ex.error}` : '程序运行完毕';
  $('#detail').dataset.taken = step && step.event === 'exception' ? 'false' : '';
  const hs = Object.entries(shown.handles);
  $('#handle').innerHTML = hs.length ? hs.map(([n, h]) => `<div><code>${esc(n)}</code><output>${esc(h.file)} · '${esc(h.mode)}' · ${h.closed ? '已关闭' : (h.tell !== null && h.tell !== undefined ? '位置 ' + h.tell + ' 字节' : '写入中') + (h.pending ? ' · 缓冲 ' + h.pending + ' 字节' : '')}</output></div>`).join('') : '<p class="micro">还没有打开的文件对象</p>';
  const files = Object.entries(shown.disk);
  $('#disk').textContent = files.length ? files.map(([n, f]) => `── ${n}（${f.bytes} 字节）──\n` + (f.text === null ? '（无法按 UTF-8 解码）' : f.text === '' ? '（空文件）' : f.text.replace(/\r\n/g, '↵\n'))).join('\n') : '（文件夹里没有文件）';
  const vars = Object.entries(shown.vars).filter(([k]) => !shown.handles[k]);
  $('#vars').innerHTML = vars.length ? vars.map(([k, v]) => `<div><code>${esc(k)}</code><output>${esc(v)}</output></div>`).join('') : '<p class="micro">还没有变量</p>';
  $('#output').textContent = (shown.out || '（还没有输出）') + (!step && ex.error ? '\nTraceback …\n' + ex.error : '');
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
  layer('cursor').setAttribute('transform', t(AY, pos.cur));
}
const moving = () => Object.keys(pos).some((k) => Math.abs(pos[k] - goal[k]) > 0.02);
function say() {
  const step = stepAt();
  const txt = moving() ? '滑台移动中…' : step ? `第 ${step.line} 行 · ${step.event === 'exception' ? '⚠ 出错' : ({ with: 'with', open: '打开', close: '关闭', write: '写入', read: '读取', seek: '移动位置', flush: '刷新', convert: '转换', for: '遍历', import: '导入' })[step.kind] || '执行'}` : ex.error ? '程序终止 · ' + ex.error.split(':')[0] : '运行结束';
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
window.lab = { select, go, get ex() { return ex; }, examples: DATA.examples, get state() { return { current, stepIndex, steps: ex.steps.length, pos: { ...pos }, goal: { ...goal }, playing, touring }; } };
tourUI();
select(0);
