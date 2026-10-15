import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const here = new URL('.', import.meta.url);
const DATA = JSON.parse(fs.readFileSync(new URL('truth.json', here), 'utf8'));
const live = fs.readFileSync(new URL('live.js', here), 'utf8');
const pure = live.slice(live.indexOf('function stepsOf'), live.indexOf('// ---------- drawing'));
const ctx = vm.createContext({});
vm.runInContext(pure + ';this.stepsOf=stepsOf;', ctx);
const r = (v) => JSON.stringify(v);
let n = 0;
for (const ex of DATA.examples) {
  const steps = ctx.stepsOf(ex);
  const end = steps[steps.length - 1];
  assert(steps.length > 0, ex.code);
  if (ex.mode === 'list') {
    assert.equal(r(end.src), r(ex.after.map(String)), 'rack after ' + ex.code);
    if (ex.kind === 'slice' || ex.kind === 'sorted') assert.equal(r(end.out), r(ex.output), 'out ' + ex.code);
    for (const s of steps) if (s.slot !== undefined) assert(s.slot >= 0 && s.slot < 9, 'slot range ' + ex.code);
  }
  if (ex.mode === 'comp') {
    assert.equal(r(end.out), r(ex.output), 'comp ' + ex.code);
    assert.equal(steps.length, ex.before.length + 1);
  }
  if (ex.mode === 'nest' && ex.output) assert.equal(r(end.out), r(ex.output), 'nest ' + ex.code);
  n++;
}
const by = (c) => DATA.examples.find((e) => e.code === c);
assert.equal(by('nums[10]').error, 'IndexError: list index out of range');
assert.equal(by('nums[4:100]').result, '[5, 9]');
assert.equal(by('nums.sort()').result, 'None');
assert.equal(r(by('sorted(nums)').after), r(DATA.nums));
assert.match(by('squares = [x * x for x in nums]\nx').error, /^NameError/);
assert.equal(by('g = [[0] * 3] * 3\ng[0][0] = 1\ng').result, '[[1, 0, 0], [1, 0, 0], [1, 0, 0]]');
assert.equal(by('g = [[0] * 3 for _ in range(3)]\ng[0][0] = 1\ng').result, '[[1, 0, 0], [0, 0, 0], [0, 0, 0]]');
const html = fs.readFileSync(new URL('../index.html', here), 'utf8');
assert(!/(?:src|href)=["']https?:/.test(html), 'offline');
const { parts, boxes } = JSON.parse(fs.readFileSync(new URL('geometry.json', here), 'utf8'));
assert(parts >= 40 && parts <= 80);
assert(boxes.every((b) => b.w > 0 && b.d > 0 && b.h > 0));
console.log(`PASS: ${n} examples animate to the real Python results; key facts checked; offline; ${parts} solids.`);
