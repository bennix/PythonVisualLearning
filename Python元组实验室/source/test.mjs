import assert from 'node:assert/strict';
import fs from 'node:fs';
const here = new URL('.', import.meta.url);
const DATA = JSON.parse(fs.readFileSync(new URL('truth.json', here), 'utf8'));
const by = (c) => DATA.examples.find((e) => e.code === c);
const end = (c) => { const s = by(c).steps; return s[s.length - 1]; };
const tupleRepr = (xs) => '(' + xs.join(', ') + (xs.length === 1 ? ',' : '') + ')';
const listRepr = (xs) => '[' + xs.join(', ') + ']';
for (const ex of DATA.examples) {
  assert(ex.steps.length > 0, ex.code);
  for (const s of ex.steps) {
    assert(s.slot >= 0 && s.slot < 9 && s.src.length <= 9 && s.out.length <= 9, 'rack range ' + ex.code);
    assert(s.lit.every((i) => i < s.src.length) && s.outLit.every((i) => i < s.out.length), 'lit range ' + ex.code);
    assert(s.row < 3 && s.cells.every(([r, c]) => r < s.grid.length && c < s.grid[r].length), 'grid range ' + ex.code);
    assert(typeof s.say === 'string' && s.say.length);
  }
  // A rejected write shows the alarm on its last frame; an accepted one never does.
  assert.equal(ex.steps[ex.steps.length - 1].ok, !ex.error, 'alarm matches error ' + ex.code);
}
// The racks end in the state Python reports.
assert.equal(tupleRepr(end('t[1:4]').lit.map((i) => end('t[1:4]').src[i])), by('t[1:4]').result);
assert.equal(listRepr(end('list(t)').out), by('list(t)').result);
assert.equal(tupleRepr(end('tuple(lst)').src), by('tuple(lst)').result);
assert.equal(listRepr(end('sorted(t)').out), by('sorted(t)').result);
assert.equal(tupleRepr(end('t + (9, 2)').src), by('t + (9, 2)').result);
assert.equal(tupleRepr(end("tuple('abc')").src), by("tuple('abc')").result);
assert.equal(tupleRepr(end('tuple(range(4))').src), by('tuple(range(4))').result);
assert.equal(tupleRepr(end('tuple(x for p in n for x in p)').src), by('tuple(x for p in n for x in p)').result);
const conv = 'lst = list(t)\nlst.append(9)\nlst[0] = 0\nt2 = tuple(lst)\nt2';
assert.equal(tupleRepr(end(conv).src), by(conv).result);
assert.equal(end('tuple(lst)').seal, true);
assert.equal(end("tuple('abc')").seal, true);
// Key facts.
assert.equal(by('type((5))').result, "<class 'int'>");
assert.equal(by('type((5,))').result, "<class 'tuple'>");
assert.match(by('t[0] = 9').error, /^TypeError: 'tuple' object does not support item assignment/);
assert.match(by('t.append(2)').error, /^AttributeError/);
assert.equal(by('box[1].append(4)\nbox').result, '(1, [2, 3, 4])');
assert.match(by('hash((1, [2, 3]))').error, /unhashable type: 'list'/);
assert.equal(by('a, b, *rest = t\n(a, b, rest)').result, '(3, 1, [4, 1, 5])');
assert.equal(by('list(n)').result, '[(1, 2), (3, 4), (5, 6)]');
const html = fs.readFileSync(new URL('../index.html', here), 'utf8');
assert(!/(?:src|href)=["']https?:/.test(html), 'offline');
const { parts } = JSON.parse(fs.readFileSync(new URL('geometry.json', here), 'utf8'));
assert(parts >= 40 && parts <= 80);
console.log(`PASS: ${DATA.examples.length} examples; every animation ends in the state real Python reports; alarms match errors; offline; ${parts} solids.`);
