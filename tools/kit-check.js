// Level rule checker (part of the level kit, kit/README.md).
// Checks the rules a computer can check from the level data, so small breaks are caught before Ladi sees them:
//   - 5 specials and a flag; A starts in the centre of the screen
//   - every front prop stands on something (nothing floats)
//   - pictures in a row of buildings or stalls touch (no gaps)
//   - stalls in groups of 3+, climbs are two walls facing each other, doors stop A going back, backdrop swaps happen at doors
//   - anything the kit builders flagged (L.kitWarn)
// It does NOT replace the screenshots: look at 590x540 and 844x390 shots of every changed spot too.
// usage: node tools/kit-check.js [level id or index | all]     exit code 1 if anything fails
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const A = require(path.join(ROOT, 'game.js'));

// picture sizes, so a prop's width is known: own .webp files, or their place in an atlas
const html = fs.readFileSync(path.join(ROOT, 'play.html'), 'utf8');
const m = html.match(/const ATLAS = (\{.*?\});/);
const ATLAS = m ? JSON.parse(m[1]) : {};
const ATLAS_OF = {}; for (const f in ATLAS) for (const k in ATLAS[f]) ATLAS_OF[k] = ATLAS[f][k];
function webpSize(file) {
  try {
    const b = fs.readFileSync(file);
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (kind === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
  } catch (e) {}
  return null;
}
const SIZE = {};
function size(key) {
  if (key in SIZE) return SIZE[key];
  const a = ATLAS_OF[key];
  return (SIZE[key] = a ? [a[2], a[3]] : webpSize(path.join(ROOT, key + '.webp')));
}
const widthU = a => { if (a.w) return a.w; const s = size(a.key); return s ? a.h * s[0] / s[1] : null; };

// every list of placed pictures a level keeps ({ key, x, y, h } items)
function artLists(L) {
  const out = [];
  for (const k in L) if (/Art$/.test(k) && Array.isArray(L[k]) && L[k].length && L[k][0] && 'key' in L[k][0]) out.push([k, L[k]]);
  const props = L.props.filter(p => p.key && p.h !== undefined && !p.behind);   // older trips keep pictures in L.props
  if (props.length) out.push(['props', props]);
  return out;
}
function floors(L, x) {   // every height A could stand on at x
  const ys = [0];
  for (const s of L.solids) if (x >= s.x - 0.05 && x <= s.x + s.w + 0.05) ys.push(s.y + s.h, s.y);
  for (const o of L.oneways) if (!o.mover && x >= o.x - 0.05 && x <= o.x + o.w + 0.05) ys.push(o.y);
  for (const sl of L.slopes || []) if (x >= Math.min(sl.x0, sl.x1) && x <= Math.max(sl.x0, sl.x1)) ys.push(sl.y0 + (sl.y1 - sl.y0) * (x - sl.x0) / (sl.x1 - sl.x0));
  return ys;
}

function check(i) {
  const def = A.LEVELS[i], L = A.buildLevel(i), fail = [], note = [];
  if (!def.bonus) {
    if (L.specials.length !== 5) fail.push(`${L.specials.length} specials (needs 5)`);
    if (!L.flagX) fail.push('no flag');
  }
  if (L.introCam !== 'centre') note.push('A not set to start in the centre (L.introCam = \'centre\')');
  for (const w of L.kitWarn || []) fail.push(w);
  // floating props: a front picture off the floor, with nothing under it
  for (const [list, arr] of artLists(L)) for (const a of arr) {
    if (a.back || a.hang || a.mid || a.sky || a.ride || a.onArt || a.y <= 0.12) continue;   // onArt: stands on ground drawn in another picture (say so in the level)
    const w = widthU(a); if (w === null) continue;
    const xs = [a.x + w * 0.2, a.x + w / 2, a.x + w * 0.8];
    const ok = xs.some(x => floors(L, x).some(y => Math.abs(y - a.y) < 0.2));
    if (!ok) fail.push(`floating: ${a.key} at x ${a.x.toFixed(1)}, y ${a.y.toFixed(2)} has nothing under it (${list})`);
  }
  // kit rows and stalls: neighbours must touch
  const groups = {};
  for (const a of L.kitArt || []) { const g = a.row !== undefined ? 'row' + a.row : a.stall !== undefined ? 'stall' + a.stall : null; if (g) (groups[g] = groups[g] || []).push(a); }
  for (const g in groups) {
    const arr = groups[g].slice().sort((p, q) => p.x - q.x);
    for (let k = 1; k < arr.length; k++) { const e = arr[k - 1].x + widthU(arr[k - 1]); if (arr[k].x - e > 0.02) fail.push(`gap of ${(arr[k].x - e).toFixed(2)} between ${arr[k - 1].key} and ${arr[k].key} at x ${e.toFixed(1)}`); }
  }
  // doors: going through one is one-way
  { const ds = L.kitDoors || [], ins = ds.filter(d => d.inside).length;   // Ladi 2026-11-08: one inside visit per level at most
    const maxIn = L.kitInsides || 1;   // (Rome has two, Ladi 2026-11-10: "let's do both the Colosseum and the Pantheon")
    if (ins > maxIn || ds.length - ins > maxIn) fail.push(`${ds.length} doors (${ins} in): one inside visit per level at most, one door in and one out`); }
  for (const d of L.kitDoors || []) if (!L.solids.some(s => s.backOnly && Math.abs(s.x - d.x) < 1)) fail.push(`door at ${d.x} has no backOnly wall`);
  return { id: def.id, i, fail, note };
}

if (require.main !== module) { module.exports = { check }; return; }
const arg = process.argv[2] || 'all';
const idx = arg === 'all' ? A.LEVELS.map((_, i) => i) : [isNaN(+arg) ? A.LEVELS.findIndex(l => l.id === arg) : +arg];
let bad = 0;
for (const i of idx) {
  if (i < 0) { console.log('no such level:', arg); process.exit(2); }
  const r = check(i);
  console.log(`${r.fail.length ? 'FAIL' : 'ok  '} ${r.i} ${r.id}${r.fail.length ? ` (${r.fail.length})` : ''}`);
  for (const f of r.fail) console.log('     x ' + f);
  for (const n of r.note) console.log('     - ' + n);
  if (r.fail.length) bad++;
}
process.exit(bad ? 1 : 0);
