import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as k from './iso-kit.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const truth = JSON.parse(fs.readFileSync(here + 'truth.json', 'utf8'));

// World layout (x = columns of the table, y = rows toward the viewer, z up).
// Left: the input DataFrame as a grid of cells with a column selector (back) and a row selector (left).
// Right: the result tray, which shows what the operation returns.
const G = {
  cols: 6, rows: 6, cellW: 26, cellD: 14, gap: 2, x0: -176, y0: -54,
  colRail: { y: -72 }, rowRail: { x: -194 },
  tray: { x: 30, y: -76, w: 150, d: 152 },
};
G.cx = (c) => G.x0 + c * (G.cellW + G.gap);
G.ry = (r) => G.y0 + r * (G.cellD + G.gap);

const base = { x: -212, y: -92, w: 410, d: 186, r: 7 };
const W = 840, H = 480;
const P = k.fitProjection([...k.boxCorners(base, -14, 0), [-190, -80, 24]], W, H, { pad: 30, azimuth: 60, elevation: 48 });
const at = (p) => k.iso(p, P);
const L = (d, tone = 'lo') => k.lineSvg(d, { tone });
const D = (pts, size = 0.5, tone = 'mid') => k.dotsSvg(pts.map(at), { size, tone });
const T = (xy, z, text, size, tone = 'mid', anchor = 'middle') => k.faceTextSvg(k.topMatrix(xy, z, P), text, { size, tone, anchor });

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

// ---------- table bed: header strip + 6×6 cell seats ----------
const tableW = G.cols * (G.cellW + G.gap) - G.gap, tableD = (G.rows + 1) * (G.cellD + G.gap) - G.gap;
const bed = { x: G.x0 - 6, y: G.y0 - G.cellD - G.gap - 6, w: tableW + 12, d: tableD + 12, r: 3 };
art += slab(bed, 0, 2, { tone: 'lo', steps: 6, bevel: 0.8 });
art += screws(bed, 2, 3);
art += slab({ x: G.x0, y: G.y0 - G.cellD - G.gap, w: tableW, d: G.cellD, r: 1.2 }, 2, 1, { tone: 'mid', bevel: 0 });
for (let r = 0; r < G.rows; r++) art += slab({ x: G.x0, y: G.ry(r), w: tableW, d: G.cellD, r: 1 }, 2, 0.5, { tone: 'lo', bevel: 0 });
// Column dividers: a thin rib between each pair of columns, from the header strip to the last row.
for (let c = 1; c < G.cols; c++) art += slab({ x: G.cx(c) - G.gap + 0.3, y: G.y0 - G.cellD - G.gap, w: G.gap - 0.6, d: tableD, r: 0.3 }, 2, 1.8, { tone: 'mid', bevel: 0 });
// Index pegs: a small seat on the left edge of each row.
for (let r = 0; r < G.rows; r++) art += slab({ x: G.x0 - 5, y: G.ry(r) + 3, w: 3, d: G.cellD - 6, r: 0.6 }, 2, 1.2, { tone: 'mid', bevel: 0 });
// Column selector: rail along the back, a carriage that slides over the selected columns.
for (const x of [G.x0 - 4, G.x0 + tableW]) art += slab({ x, y: G.colRail.y - 3, w: 4, d: 6, r: 1 }, 0, 6, { tone: 'mid' });
art += slab({ x: G.x0, y: G.colRail.y - 1, w: tableW, d: 2, r: 0.6 }, 3, 2, { tone: 'mid', bevel: 0 });
art += `<g id="colcar">` + slab({ x: G.x0, y: G.colRail.y - 3, w: G.cellW, d: 6, r: 1.2 }, 4.5, 3, { tone: 'hi', lit: true, bevel: 0.3 }) + `</g>`;
// Row selector on the left.
for (const y of [G.y0 - 4, G.ry(G.rows - 1) + G.cellD]) art += slab({ x: G.rowRail.x - 3, y, w: 6, d: 4, r: 1 }, 0, 6, { tone: 'mid' });
art += slab({ x: G.rowRail.x - 1, y: G.y0, w: 2, d: G.rows * (G.cellD + G.gap) - G.gap, r: 0.6 }, 3, 2, { tone: 'mid', bevel: 0 });
art += `<g id="rowcar">` + slab({ x: G.rowRail.x - 3, y: G.y0, w: 6, d: G.cellD, r: 1.2 }, 4.5, 3, { tone: 'hi', lit: true, bevel: 0.3 }) + `</g>`;

// ---------- result tray (right) ----------
const t = G.tray;
const tray = { x: t.x, y: t.y, w: t.w, d: t.d, r: 4 };
art += slab(tray, 0, 3, { tone: 'mid', steps: 6, bevel: 0.8 });
for (const [x, y, w, d] of [[t.x, t.y, t.w, 3], [t.x, t.y + t.d - 3, t.w, 3], [t.x, t.y + 3, 3, t.d - 6], [t.x + t.w - 3, t.y + 3, 3, t.d - 6]])
  art += slab({ x, y, w, d, r: 0.8 }, 3, 4, { tone: 'mid', bevel: 0 });
art += slab({ x: t.x + 5, y: t.y + 5, w: t.w - 10, d: 13, r: 1.2 }, 3, 0.5, { tone: 'lo', bevel: 0 });
art += screws(tray, 7, 1.4);
for (let i = 0; i < 4; i++) art += slab({ x: t.x + 5, y: t.y + 32 + i * 28, w: t.w - 10, d: 1.2, r: 0.4 }, 3, 0.6, { tone: 'lo', bevel: 0 });
// Chute from the table bed into the tray.
art += slab({ x: G.x0 + tableW + 6, y: -6, w: t.x - (G.x0 + tableW + 6), d: 12, r: 1 }, 1, 1.5, { tone: 'mid', bevel: 0 });
for (const y of [-7, 5]) art += slab({ x: G.x0 + tableW + 6, y, w: t.x - (G.x0 + tableW + 6), d: 2, r: 0.5 }, 2.5, 2.5, { tone: 'mid', bevel: 0 });

const plate = { x: -110, y: 74, w: 54, d: 8, r: 1.2 };
art += slab(plate, 0, 0.8, { tone: 'lo', bevel: 0 });
art += T([plate.x + 27, plate.y + 5.6], 0.8, 'PANDAS·LAB', 3.6, 'mid');

art += `<g id="cells"></g><g id="heads"></g><g id="result"></g>`;
const PARTS = count;
const svg = k.figureSvg({
  width: W, height: H,
  label: 'Pandas 数据分拣台：左侧是读入的成绩表，每个格子是一个单元格，第一排是列名；后方滑块指出被选中的列，左侧滑块指出被选中的行，当前操作用到的单元格会抬起高亮；右侧托盘显示操作返回的结果表或数值。作图示例在下方显示 Matplotlib 实际画出的图。',
  body: [art],
});

const template = fs.readFileSync(here + 'template.html', 'utf8');
const kit = fs.readFileSync(here + 'iso-kit.mjs', 'utf8').replace(/^export /gm, '');
const cfg = { P, G: { ...G, cx: undefined, ry: undefined }, PARTS };
const html = template
  .replace('/* KIT */', () => k.ISO_CSS)
  .replace('/* STYLE */', () => fs.readFileSync(here + 'style.css', 'utf8'))
  .replace('<!-- FIGURE -->', () => svg)
  .replace('/* SCRIPT */', () => `${kit}\nconst DATA=${JSON.stringify(truth)};\nconst CFG=${JSON.stringify(cfg)};\n${fs.readFileSync(here + 'live.js', 'utf8')}`.replace(/<\/(script)/gi, '<\\/$1'));
fs.writeFileSync(here + '../index.html', html);
fs.writeFileSync(here + 'geometry.json', JSON.stringify({ parts: PARTS, boxes, projection: P }, null, 1));
console.log(`Built index.html · ${PARTS} static Anatomy solids · ${truth.examples.length} examples`);
if (PARTS < 40 || PARTS > 80) throw Error('Figure part budget 40–80, got ' + PARTS);
