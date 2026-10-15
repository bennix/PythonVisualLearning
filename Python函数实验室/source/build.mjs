import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as k from './iso-kit.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const truth = JSON.parse(fs.readFileSync(here + 'truth.json', 'utf8'));

// World layout (x along a row, y toward the viewer, z up), about 1 px per unit.
// Front row: the call's arguments. Back row: the function's parameter slots.
// Right: three trays that collect *args / **kwargs, and the return-value display.
const G = {
  pitch: 36, slots: 6, x0: -150,
  src: { y: 14, d: 24 }, out: { y: -42, d: 24 },
  bin: 32, padH: 3, chip: { w: 30, d: 15, h: 8 },
  rail: { y: 54, from: -172, to: 46 },
  car: { w: 20, d: 12, z: 6 },
  tray: { x: 74, w: 92, y0: -50, pitch: 26, d: 20 },
  rowRail: { x: 64 },
  screen: { x: 74, y: 44, w: 92, d: 22 },
};
G.slotX = (i) => G.x0 + G.pitch * i;
G.trayY = (r) => G.tray.y0 + G.tray.pitch * r;

const base = { x: -184, y: -72, w: 368, d: 146, r: 6 };
const W = 820, H = 470;
const P = k.fitProjection([...k.boxCorners(base, -14, 0), [-160, 54, 30], [170, -60, 20]], W, H, { pad: 36, azimuth: 58, elevation: 36 });
const at = (p) => k.iso(p, P);
const L = (d, tone = 'lo') => k.lineSvg(d, { tone });
const D = (pts, size = 0.5, tone = 'mid') => k.dotsSvg(pts.map(at), { size, tone });
const T = (xy, z, text, size, tone = 'mid', anchor = 'middle', id) => {
  const s = k.faceTextSvg(k.topMatrix(xy, z, P), text, { size, tone, anchor });
  return id ? s.replace('<text ', `<text id="${id}" `) : s;
};

let count = 0;
const boxes = [];
function slab(plan, z, h, { tone = 'mid', steps = 4, bevel = 0.4, lit = false } = {}) {
  count++;
  boxes.push({ ...plan, z, h });
  return k.solidSvg(k.slabOf(plan, z, h, P, steps, bevel), { tone, lit });
}
const screws = (plan, z, inset = 3) => D(k.corners(plan, inset).map(([x, y]) => [x, y, z]), 0.45);

// ---------- base ----------
let art = `<path class="iso-halo" d="${k.haloOf(base, -14, 8, P)}"/>`;
for (const [x, y] of k.corners(base, 20)) art += slab({ x: x - 7, y: y - 7, w: 14, d: 14, r: 3 }, -14, 5, { tone: 'lo' });
art += slab(base, -9, 9, { tone: 'lo', steps: 8, bevel: 1.2 });
art += L(k.planOutline(k.insetPlan(base, 5), 0, P), 'faint');
art += screws(base, 0, 10);
const plate = { x: -60, y: -71, w: 46, d: 7, r: 1.5 };
art += slab(plate, 0, 1, { tone: 'lo' });
art += T([plate.x + 23, plate.y + 5.2], 1, 'DEF·LAB', 3.6, 'mid');

// ---------- racks: a strip, six pads; the tag line in front of each pad is written live ----------
function rack(row, id) {
  let s = '';
  const strip = { x: G.slotX(0) - 20, y: row.y - 4, w: G.pitch * (G.slots - 1) + 40, d: row.d + 11, r: 2 };
  s += slab(strip, 0, 2, { tone: 'lo', bevel: 0.6 });
  for (let i = 0; i < G.slots; i++) {
    const pad = { x: G.slotX(i) - G.bin / 2, y: row.y, w: G.bin, d: row.d, r: 1.2 };
    s += slab(pad, 2, G.padH - 1, { tone: 'mid' });
    s += L(k.planOutline(k.insetPlan(pad, 2), G.padH + 1, P, 3), 'faint');
  }
  s += `<g id="${id}-tags"></g><g id="${id}"></g>`;
  return s;
}

// ---------- reader carriage on the front rail ----------
function railArt() {
  let s = '';
  const { y, from, to } = G.rail;
  for (const x of [from, to - 6]) s += slab({ x, y: y - 3, w: 6, d: 14, r: 1.2 }, 0, 8, { tone: 'mid' });
  for (const ry of [y - 1, y + 7]) s += slab({ x: from + 6, y: ry, w: to - from - 12, d: 3, r: 0.8 }, 3, 2.5, { tone: 'mid', bevel: 0 });
  return s;
}
function carriageArt() {
  const { w, d, z } = G.car;
  const cx = G.slotX(0) + 13, y = G.rail.y - 2;
  let s = '';
  const body = { x: cx - w / 2, y, w, d, r: 1.6 };
  s += slab(body, z - 0.5, 5, { tone: 'mid', bevel: 0.6 });
  s += screws(body, z + 4.5, 2.4);
  s += slab({ x: cx - 2, y: G.src.y + G.src.d + 8, w: 4, d: y - (G.src.y + G.src.d + 8), r: 0.8 }, z + 1, 2, { tone: 'hi', lit: true, bevel: 0 });
  for (const gx of [cx + 4, cx + 7.5]) s += slab({ x: gx, y: y + 7, w: 2, d: 2, r: 0.5 }, z + 4.5, 16, { tone: 'mid', bevel: 0 });
  s += `<g id="flag">` + slab({ x: cx - 6, y: y + 7.2, w: 9.8, d: 1.6, r: 0.4 }, z + 6, 6, { tone: 'hi', bevel: 0 }) + `</g>`;
  return `<g id="carriage">${s}</g>`;
}

// ---------- collection trays: *args tuple, **kwargs dict ----------
function trayArt() {
  let s = '';
  const t = G.tray;
  const bed = { x: t.x - 4, y: t.y0 - t.d / 2 - 4, w: t.w + 8, d: t.pitch * 2 + t.d + 8, r: 3 };
  s += slab(bed, 0, 2, { tone: 'lo', steps: 6, bevel: 0.8 });
  s += screws(bed, 2, 3);
  for (let r = 0; r < 3; r++) {
    const y = G.trayY(r) - t.d / 2;
    s += slab({ x: t.x, y, w: t.w, d: t.d, r: 1.4 }, 2, 1.5, { tone: 'mid', bevel: 0.3 });
    s += slab({ x: t.x, y: y + t.d - 2, w: t.w, d: 2, r: 0.6 }, 3.5, 3, { tone: 'mid', bevel: 0 });
  }
  const rr = G.rowRail.x;
  for (const yy of [t.y0 - 16, G.trayY(2) + 10]) s += slab({ x: rr - 4, y: yy, w: 8, d: 6, r: 1 }, 0, 7, { tone: 'mid' });
  s += slab({ x: rr - 1.5, y: t.y0 - 10, w: 3, d: t.pitch * 2 + 20, r: 0.8 }, 3, 2.5, { tone: 'mid', bevel: 0 });
  s += `<g id="rowcar">` + slab({ x: rr - 5, y: t.y0 - 5, w: 10, d: 10, r: 1.5 }, 5.5, 4, { tone: 'hi', lit: true }) + `</g>`;
  s += `<g id="tray-chips"></g>`;
  return s;
}

// ---------- return display ----------
function screenArt() {
  const s0 = G.screen;
  let s = '';
  const housing = { x: s0.x, y: s0.y, w: s0.w, d: s0.d, r: 2 };
  s += slab(housing, 0, 4, { tone: 'mid', bevel: 0.6 });
  s += slab({ x: s0.x + 3, y: s0.y + 3, w: s0.w - 6, d: s0.d - 6, r: 1 }, 4, 0.4, { tone: 'lo', bevel: 0 });
  s += screws(housing, 4, 1.6);
  s += T([s0.x + 6, s0.y + 8.6], 4.4, '', 4.2, 'mid', 'start', 'ret-label');
  s += T([s0.x + 6, s0.y + 17], 4.4, '', 6, 'hi', 'start', 'ret-value');
  return s;
}

const body = [art, rack(G.out, 'out-chips'), rack(G.src, 'src-chips'), railArt(), carriageArt(), trayArt(), screenArt()];
const PARTS = count;
const svg = k.figureSvg({
  width: W, height: H,
  label: 'Python 函数调用装配台：前排槽位放调用时传入的实参，后排槽位是函数定义的形参；每个实参按位置或名字落进对应的形参，多出来的位置实参收进 *args 元组托盘，多出来的关键字实参收进 **kwargs 字典托盘；右前方显示屏给出返回值。排序示例中，前排槽下方显示每个元素的 key 值，后排是排好序的结果。',
  body,
});

const template = fs.readFileSync(here + 'template.html', 'utf8');
const kit = fs.readFileSync(here + 'iso-kit.mjs', 'utf8').replace(/^export /gm, '');
const cfg = { P, G: { ...G, slotX: undefined, trayY: undefined }, PARTS };
const html = template
  .replace('/* KIT */', () => k.ISO_CSS)
  .replace('/* STYLE */', () => fs.readFileSync(here + 'style.css', 'utf8'))
  .replace('<!-- FIGURE -->', () => svg)
  .replace('/* SCRIPT */', () => `${kit}\nconst DATA=${JSON.stringify(truth)};\nconst CFG=${JSON.stringify(cfg)};\n${fs.readFileSync(here + 'live.js', 'utf8')}`.replace(/<\/(script)/gi, '<\\/$1'));
fs.writeFileSync(here + '../index.html', html);
fs.writeFileSync(here + 'geometry.json', JSON.stringify({ parts: PARTS, boxes, projection: P }, null, 1));
console.log(`Built index.html · ${PARTS} static Anatomy solids · ${truth.examples.length} Python examples`);
if (PARTS < 40 || PARTS > 80) throw Error('Figure part budget 40–80, got ' + PARTS);
