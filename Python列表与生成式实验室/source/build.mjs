import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as k from './iso-kit.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const truth = JSON.parse(fs.readFileSync(here + 'truth.json', 'utf8'));

// World layout (x along the list, y toward the viewer, z up), about 1 px per unit.
const G = {
  pitch: 22, slots: 9, x0: -150,
  src: { y: 14, d: 24 }, out: { y: -42, d: 24 },
  bin: 18, padH: 3, chip: { w: 13, d: 15, h: 8 },
  rail: { y: 52, from: -168, to: 46 },
  car: { w: 20, d: 12, z: 6 },
  mx: { x0: 86, y0: -40, pitch: 27, cell: 21 },
  rowRail: { x: 62 }, colRail: { y: 48 },
};
G.slotX = (i) => G.x0 + G.pitch * i;
G.mxX = (c) => G.mx.x0 + G.mx.pitch * c;
G.mxY = (r) => G.mx.y0 + G.mx.pitch * r;

const base = { x: -182, y: -70, w: 364, d: 140, r: 6 };
const W = 820, H = 470;
const P = k.fitProjection([...k.boxCorners(base, -14, 0), [-160, 52, 30], [170, -60, 20]], W, H, { pad: 40, azimuth: 58, elevation: 36 });
const at = (p) => k.iso(p, P);
const L = (d, tone = 'lo', extra = {}) => k.lineSvg(d, { tone, ...extra });
const D = (pts, size = 0.5, tone = 'mid') => k.dotsSvg(pts.map(at), { size, tone });
const T = (xy, z, text, size, tone = 'mid', anchor = 'middle') => k.faceTextSvg(k.topMatrix(xy, z, P), text, { size, tone, anchor });

let count = 0;
const boxes = [];
function slab(plan, z, h, { tone = 'mid', steps = 4, bevel = 0.4, lit = false, crease } = {}) {
  count++;
  boxes.push({ ...plan, z, h });
  return k.solidSvg(k.slabOf(plan, z, h, P, steps, bevel), { tone, lit, ...(crease ? { crease } : {}) });
}
const screws = (plan, z, inset = 3) => D(k.corners(plan, inset).map(([x, y]) => [x, y, z]), 0.45);

// ---------- base ----------
function baseArt() {
  let s = `<path class="iso-halo" d="${k.haloOf(base, -14, 8, P)}"/>`;
  for (const [x, y] of k.corners(base, 20)) s += slab({ x: x - 7, y: y - 7, w: 14, d: 14, r: 3 }, -14, 5, { tone: 'lo' });
  s += slab(base, -9, 9, { tone: 'lo', steps: 8, bevel: 1.2 });
  s += L(k.planOutline(k.insetPlan(base, 5), 0, P), 'faint');
  s += screws(base, 0, 10);
  // Name plate with three engraved rule lines.
  const plate = { x: 98, y: -64, w: 40, d: 10, r: 1.5 };
  s += slab(plate, 0, 1, { tone: 'lo' });
  s += screws(plate, 1, 2.2);
  s += T([plate.x + 18, plate.y + 4.5], 1, "LIST·LAB", 3.2, 'mid');
  s += T([plate.x + 18, plate.y + 8.6], 1, 'Py ' + truth.python, 2.4, 'lo');
  return s;
}

// ---------- racks ----------
function rack(row, label, id) {
  let s = '';
  const strip = { x: G.slotX(0) - 13, y: row.y - 4, w: G.pitch * (G.slots - 1) + 26, d: row.d + (row === G.src ? 11 : 8), r: 2 };
  s += slab(strip, 0, 2, { tone: 'lo', steps: 4, bevel: 0.6 });
  for (let i = 0; i < G.slots; i++) {
    const pad = { x: G.slotX(i) - G.bin / 2, y: row.y, w: G.bin, d: row.d, r: 1.2 };
    s += slab(pad, 2, G.padH - 2 + 1, { tone: 'mid' });
    s += L(k.planOutline(k.insetPlan(pad, 2), G.padH + 1, P, 3), 'faint');
  }
  // Index ruler on the strip's front edge: positive indices engraved; negative ones written live.
  for (let i = 0; i < G.slots; i++) s += T([G.slotX(i), row.y + row.d + 2.6], 2, String(i), 3, 'mid');
  s += `<g id="${id}"></g>`;
  return s;
}

// ---------- picker carriage on the front rail ----------
function railArt() {
  let s = '';
  const { y, from, to } = G.rail;
  for (const x of [from, to - 6]) s += slab({ x, y: y - 3, w: 6, d: 14, r: 1.2 }, 0, 8, { tone: 'mid' });
  for (const ry of [y - 1, y + 7]) s += slab({ x: from + 6, y: ry, w: to - from - 12, d: 3, r: 0.8 }, 3, 2.5, { tone: 'mid', bevel: 0 });
  return s;
}
function carriageArt() {
  const { w, d, z } = G.car;
  const cx = G.slotX(0), y = G.rail.y - 2;
  let s = '';
  const body = { x: cx - w / 2, y, w, d, r: 1.6 };
  s += slab(body, z - 0.5, 5, { tone: 'mid', bevel: 0.6 });
  s += screws(body, z + 4.5, 2.4);
  // Pointer finger reaching toward the bin it reads.
  s += slab({ x: cx - 2, y: G.src.y + G.src.d + 3, w: 4, d: y - (G.src.y + G.src.d + 3), r: 0.8 }, z + 1, 2, { tone: 'hi', lit: true, bevel: 0 });
  // Filter gate: two guide posts and a flag that rises when the `if` passes.
  for (const gx of [cx + 4, cx + 7.5]) s += slab({ x: gx, y: y + 7, w: 2, d: 2, r: 0.5 }, z + 4.5, 16, { tone: 'mid', bevel: 0 });
  s += `<g id="flag">` + slab({ x: cx - 6, y: y + 7.2, w: 9.8, d: 1.6, r: 0.4 }, z + 6, 6, { tone: 'hi', bevel: 0 }) + `</g>`;
  return `<g id="carriage">${s}</g>`;
}

// ---------- matrix tray ----------
function matrixArt() {
  let s = '';
  const { x0, y0, pitch, cell } = G.mx;
  const tray = { x: x0 - 16, y: y0 - 14, w: pitch * 2 + 32, d: pitch * 2 + 30, r: 3 };
  s += slab(tray, 0, 2, { tone: 'lo', steps: 6, bevel: 0.8 });
  s += screws(tray, 2, 3.5);
  // Row selector rail on the left, column selector rail in front.
  const rr = G.rowRail.x;
  for (const yy of [y0 - 18, y0 + pitch * 2 + 12]) s += slab({ x: rr - 4, y: yy, w: 8, d: 6, r: 1 }, 0, 7, { tone: 'mid' });
  s += slab({ x: rr - 1.5, y: y0 - 12, w: 3, d: pitch * 2 + 24, r: 0.8 }, 3, 2.5, { tone: 'mid', bevel: 0 });
  s += `<g id="rowcar">` + slab({ x: rr - 5, y: y0 - 5, w: 10, d: 10, r: 1.5 }, 5.5, 4, { tone: 'hi', lit: true }) + `</g>`;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const pad = { x: G.mxX(c) - cell / 2, y: G.mxY(r) - cell / 2, w: cell, d: cell, r: 1.2 };
    s += `<g data-cell="${r}-${c}">` + slab(pad, 2, 1.5, { tone: 'mid', bevel: 0.3 }) + `</g>`;
  }
  for (let r = 0; r < 3; r++) s += T([rr - 9, G.mxY(r) + 1], 0, String(r), 3.2, 'mid');
  s += `<g id="mx-chips"></g>`;
  const cy = G.colRail.y;
  for (const xx of [x0 - 18, x0 + pitch * 2 + 12]) s += slab({ x: xx, y: cy - 3, w: 6, d: 8, r: 1 }, 0, 7, { tone: 'mid' });
  s += slab({ x: x0 - 12, y: cy - 0.5, w: pitch * 2 + 24, d: 3, r: 0.8 }, 3, 2.5, { tone: 'mid', bevel: 0 });
  for (let c = 0; c < 3; c++) s += T([G.mxX(c), cy + 7.5], 0, String(c), 3.2, 'mid');
  s += `<g id="colcar">` + slab({ x: x0 - 5, y: cy - 4, w: 10, d: 10, r: 1.5 }, 5.5, 4, { tone: 'hi', lit: true }) + `</g>`;
  return s;
}

const staticCount = () => count;
const body = [baseArt(), rack(G.out, 'NEW LIST', 'out-chips'), rack(G.src, 'nums', 'src-chips'), railArt(), carriageArt(), matrixArt()];
const PARTS = staticCount();
const svg = k.figureSvg({
  width: W, height: H,
  label: 'Python 列表分拣台：前排 9 个编号料槽是原列表，后排料槽是新列表；拾取滑台沿导轨移到被访问的槽位，滑台上的旗标表示 if 过滤是否通过；右侧 3×3 矩阵托盘用行、列两个选择滑台表示嵌套列表的 m[i][j]。',
  body,
});

const template = fs.readFileSync(here + 'template.html', 'utf8');
const kit = fs.readFileSync(here + 'iso-kit.mjs', 'utf8').replace(/^export /gm, '');
const cfg = { P, G: { ...G, slotX: undefined, mxX: undefined, mxY: undefined }, PARTS };
const html = template
  .replace('/* KIT */', () => k.ISO_CSS)
  .replace('/* STYLE */', () => fs.readFileSync(here + 'style.css', 'utf8'))
  .replace('<!-- FIGURE -->', () => svg)
  .replace('/* SCRIPT */', () => `${kit}\nconst DATA=${JSON.stringify(truth)};\nconst CFG=${JSON.stringify(cfg)};\n${fs.readFileSync(here + 'live.js', 'utf8')}`.replace(/<\/(script)/gi, '<\\/$1'));
fs.writeFileSync(here + '../index.html', html);
fs.writeFileSync(here + 'geometry.json', JSON.stringify({ parts: PARTS, boxes, projection: P }, null, 1));
console.log(`Built index.html · ${PARTS} static Anatomy solids · ${truth.examples.length} Python examples`);
if (PARTS < 40 || PARTS > 80) throw Error('Figure part budget 40–80, got ' + PARTS);
