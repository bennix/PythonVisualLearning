import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as k from './iso-kit.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const truth = JSON.parse(fs.readFileSync(here + 'truth.json', 'utf8'));

// World layout: x runs along a code line, y runs down the program (line 1 at the back), z up.
const G = {
  rows: 8, row0: -76, pitch: 19, plateD: 15,
  plateX: -126, plateW: 150, jackX: 32, chanX: 40,
  railX: -158, carW: 14,
  buf: { x: 78, y: -84, w: 96, d: 30 },
  disk: { x: 78, y: -42, w: 96, d: 126, line0: -15, pitch: 12.4, lines: 8 },
  cur: { x: 70 },
};
G.rowY = (r) => G.row0 + G.pitch * r;

const base = { x: -176, y: -92, w: 350, d: 184, r: 7 };
const W = 820, H = 500;
const P = k.fitProjection([...k.boxCorners(base, -14, 0), [-160, -80, 30]], W, H, { pad: 34, azimuth: 58, elevation: 42 });
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

// ---------- program board: ten numbered line seats, each with a jack at its right end ----------
const board = { x: G.plateX - 8, y: G.row0 - 9, w: G.jackX - G.plateX + 20, d: G.pitch * G.rows + 5, r: 3 };
art += slab(board, 0, 2, { tone: 'lo', steps: 6, bevel: 0.8 });
art += screws(board, 2, 3.5);
for (let r = 0; r < G.rows; r++) {
  const y = G.rowY(r) - G.plateD / 2;
  art += slab({ x: G.plateX, y, w: G.plateW, d: G.plateD, r: 1 }, 2, 0.6, { tone: 'lo', bevel: 0 });
  art += T([G.plateX - 5, G.rowY(r) + 1.8], 2, String(r + 1), 5, 'mid');
  art += slab({ x: G.jackX - 3, y: G.rowY(r) - 3, w: 6, d: 6, r: 1.4 }, 2, 3, { tone: 'mid' });
}
// Cord channel: two guide rails the patch cord lies between.
for (const x of [G.chanX - 2, G.chanX + 24]) art += slab({ x, y: G.row0 - 6, w: 2, d: G.pitch * (G.rows - 1) + 12, r: 0.6 }, 2, 1.6, { tone: 'mid', bevel: 0 });

// ---------- reader rail and carriage (left side, runs along y) ----------
for (const y of [G.row0 - 12, G.rowY(G.rows - 1) + 6]) art += slab({ x: G.railX - 6, y, w: 12, d: 6, r: 1 }, 0, 8, { tone: 'mid' });
for (const dx of [-4, 2]) art += slab({ x: G.railX + dx, y: G.row0 - 6, w: 2.5, d: G.pitch * (G.rows - 1) + 12, r: 0.6 }, 3, 2.5, { tone: 'mid', bevel: 0 });
let car = slab({ x: G.railX - 7, y: G.row0 - 6, w: G.carW, d: 12, r: 1.6 }, 5.5, 5, { tone: 'mid', bevel: 0.6 });
car += screws({ x: G.railX - 7, y: G.row0 - 6, w: G.carW, d: 12, r: 1.6 }, 10.5, 2.3);
car += slab({ x: G.railX + 7, y: G.row0 - 1.5, w: G.plateX - G.railX - 9, d: 3, r: 0.8 }, 6.5, 2, { tone: 'hi', lit: true, bevel: 0 });
for (const dx of [-5, -1.5]) car += slab({ x: G.railX + dx, y: G.row0 + 4, w: 2, d: 2, r: 0.5 }, 10.5, 16, { tone: 'mid', bevel: 0 });
car += `<g id="flag">` + slab({ x: G.railX - 5.2, y: G.row0 + 4.2, w: 1.6, d: 9, r: 0.4 }, 12, 6, { tone: 'hi', bevel: 0 }) + `</g>`;
art += `<g id="carriage">${car}</g>`;

// ---------- write buffer tray and disk plate (right side) ----------
const buf = { x: G.buf.x, y: G.buf.y, w: G.buf.w, d: G.buf.d, r: 2 };
art += slab(buf, 0, 3, { tone: 'mid', bevel: 0.6 });
for (const x of [G.buf.x + 4, G.buf.x + G.buf.w - 6]) art += slab({ x, y: G.buf.y + 3, w: 2, d: 12, r: 0.5 }, 3, 2.5, { tone: 'mid', bevel: 0 });
art += slab({ x: G.buf.x + 4, y: G.buf.y + 18, w: G.buf.w - 8, d: 9, r: 1 }, 3, 0.4, { tone: 'lo', bevel: 0 });
art += screws(buf, 3, 1.6);
const disk = { x: G.disk.x, y: G.disk.y, w: G.disk.w, d: G.disk.d, r: 3 };
art += slab(disk, 0, 4, { tone: 'mid', steps: 6, bevel: 0.8 });
art += slab({ x: G.disk.x + 4, y: G.disk.y + 4, w: G.disk.w - 8, d: 11, r: 1 }, 4, 0.4, { tone: 'lo', bevel: 0 });
art += slab({ x: G.disk.x + 4, y: G.disk.y + 18, w: G.disk.w - 8, d: G.disk.d - 22, r: 1.5 }, 4, 0.6, { tone: 'hi', bevel: 0 });
art += screws(disk, 4, 2);
// Cursor rail beside the disk plate; the slider marks the file position (tell).
for (const y of [G.disk.y + 14, G.disk.y + G.disk.d - 4]) art += slab({ x: G.cur.x - 3, y, w: 6, d: 4, r: 1 }, 0, 7, { tone: 'mid' });
art += slab({ x: G.cur.x - 1.2, y: G.disk.y + 18, w: 2.4, d: G.disk.d - 22, r: 0.6 }, 3, 2.5, { tone: 'mid', bevel: 0 });
art += `<g id="cursor">` + slab({ x: G.cur.x - 4, y: G.disk.line0 - 4, w: 8, d: 7, r: 1.4 }, 5.5, 3.5, { tone: 'hi', lit: true, bevel: 0.3 }) + `</g>`;

// Name plate.
const plate = { x: -120, y: 74, w: 48, d: 8, r: 1.2 };
art += slab(plate, 0, 0.8, { tone: 'lo', bevel: 0 });
art += T([plate.x + 24, plate.y + 5.6], 0.8, 'FILE·LAB', 3.6, 'mid');

art += `<g id="plates"></g><g id="cord"></g><g id="buffer"></g><g id="disk-text"></g>`;
const PARTS = count;
const svg = k.figureSvg({
  width: W, height: H,
  label: 'Python 文件读写台：左侧代码行板按行号排列，读码滑台指向正在执行的行，跳线连到下一步要执行的行；右上是写缓冲托盘，write() 写入的内容先堆在这里，高度表示还没写到磁盘的字节数；右下是磁盘板，逐行显示文件在磁盘上的真实内容，旁边的光标滑块标出当前读写位置 tell()。',
  body: [art],
});

const template = fs.readFileSync(here + 'template.html', 'utf8');
const kit = fs.readFileSync(here + 'iso-kit.mjs', 'utf8').replace(/^export /gm, '');
const cfg = { P, G: { ...G, rowY: undefined }, PARTS };
const html = template
  .replace('/* KIT */', () => k.ISO_CSS)
  .replace('/* STYLE */', () => fs.readFileSync(here + 'style.css', 'utf8'))
  .replace('<!-- FIGURE -->', () => svg)
  .replace('/* SCRIPT */', () => `${kit}\nconst DATA=${JSON.stringify(truth)};\nconst CFG=${JSON.stringify(cfg)};\n${fs.readFileSync(here + 'live.js', 'utf8')}`.replace(/<\/(script)/gi, '<\\/$1'));
fs.writeFileSync(here + '../index.html', html);
fs.writeFileSync(here + 'geometry.json', JSON.stringify({ parts: PARTS, boxes, projection: P }, null, 1));
console.log(`Built index.html · ${PARTS} static Anatomy solids · ${truth.examples.length} Python examples`);
if (PARTS < 40 || PARTS > 80) throw Error('Figure part budget 40–80, got ' + PARTS);
