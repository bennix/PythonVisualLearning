import assert from 'node:assert/strict';
import fs from 'node:fs';
const here = new URL('.', import.meta.url);
const DATA = JSON.parse(fs.readFileSync(new URL('truth.json', here), 'utf8'));
const text = (blocks) => blocks.join('').replaceAll('␣', ' ');
const pyStr = (t) => (t.includes("'") && !t.includes('"') ? `"${t}"` : `'${t.replaceAll("'", "\\'")}'`);
let checked = 0;
for (const ex of DATA.examples) {
  const steps = ex.steps, end = steps[steps.length - 1];
  assert(steps.length > 0, ex.code);
  for (const s of steps) {
    assert(s.slot >= 0 && s.slot < 9 && s.src.length <= 9 && s.out.length <= 9, 'rack range ' + ex.code);
    assert(s.lit.every((i) => i < s.src.length) && s.outLit.every((i) => i < s.out.length), 'lit range ' + ex.code);
    assert(s.grid.length <= 3 && s.cells.every(([r, c]) => r < s.grid.length && c < s.grid[r].length), 'grid range ' + ex.code);
    assert(s.say.length > 0);
  }
  assert.equal(end.ok, !ex.error, 'flag down exactly when Python raises · ' + ex.code);
  // The rack named by `check` ends holding exactly the value Python returned.
  if (ex.check === 'out') { assert.equal(pyStr(text(end.out)), ex.result, ex.code); assert(end.outSeal, 'new string sealed ' + ex.code); checked++; }
  if (ex.check === 'src') { assert.equal(pyStr(text(end.src)), ex.result, ex.code); assert(end.seal); checked++; }
  if (ex.check === 'grid') { assert.equal('[' + end.grid.map((r) => r[0]).join(', ') + ']', ex.result, ex.code); checked++; }
  // A method never touches the front row unless the example builds a new string there.
  if (ex.mode === 'method') assert.equal(text(end.src), text(steps[0].src), 'original unchanged ' + ex.code);
}
const by = (c) => DATA.examples.find((e) => e.code === c);
assert.equal(by("s.find('z')").result, '-1');
assert.match(by("s.index('z')").error, /^ValueError: substring not found/);
assert.match(by("s[0] = 'h'").error, /^TypeError: 'str' object does not support item assignment/);
assert.match(by("'42' + 1").error, /^TypeError/);
assert.match(by("'-'.join(['a', 1])").error, /^TypeError: sequence item 1/);
assert.equal(by('len(s)').result, '9');
assert.equal(by('s.isalpha()').result, 'False');
const html = fs.readFileSync(new URL('../index.html', here), 'utf8');
assert(!/(?:src|href)=["']https?:/.test(html), 'offline');
const { parts } = JSON.parse(fs.readFileSync(new URL('geometry.json', here), 'utf8'));
assert(parts >= 40 && parts <= 80);
console.log(`PASS: ${DATA.examples.length} examples; ${checked} animations end holding exactly Python's result; flags match errors; methods never change the original; offline; ${parts} solids.`);
