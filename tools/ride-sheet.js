// Ride sheet (level kit): a row of frames from one ride or moving moment, so Ladi can see how it moves without a video.
// Puts A at (x, y), lets him run hands-off (or tapping, with --tap), and grabs a frame at each time given (seconds).
// usage: node tools/ride-sheet.js <level id> <name> <x> <y> <t1,t2,...> [--tap] [--ride=N] [--kid=JSON] [out folder]
//   --kid=JSON: play as a child (a Little Worlds config, e.g. '{"name":"Zoe","kid":"girl","style":"braids","skin":"#8d5524"}').
//   --ride=N: the ride A should board next (L.rides index), when you place him just before a later ride.
// Writes <out>/<name>_<i>_844x390.png per frame and <out>/<name>_sheet.png (frames in a row, phone sideways size).
// Barcelona round 3-5 (2026-11-09): every ride change went to Ladi as one of these.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2), flags = args.filter(a => a.startsWith('--')), pos = args.filter(a => !a.startsWith('--'));
const [id, name, X, Y, TS, outArg] = pos;
if (!id || !name || X === undefined || Y === undefined || !TS) { console.log('usage: node tools/ride-sheet.js <level id> <name> <x> <y> <t1,t2,...> [--tap] [--ride=N] [out]'); process.exit(2); }
const tap = flags.includes('--tap'), rf = flags.find(f => f.startsWith('--ride=')), rideN = rf ? +rf.slice(7) : null;
const OUT = path.resolve(outArg || 'rides-' + id), times = TS.split(',').map(Number);
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
(async () => {
  await new Promise(res => server.listen(0, res));
  const base = `http://localhost:${server.address().port}/`;
  const br = await chromium.launch(), VW = 844, VH = 390, errs = [];
  const pg = await br.newPage({ viewport: { width: VW, height: VH } });
  pg.on('pageerror', e => errs.push(e.message));
  const kf = flags.find(f => f.startsWith('--kid='));
  await pg.addInitScript(c => { try { if (c) localStorage.setItem('lw.config', c); else localStorage.removeItem('lw.config'); } catch (e) {} }, kf ? kf.slice(6) : null);
  await pg.goto(base + 'play.html'); await pg.waitForTimeout(2500);
  const li = await pg.evaluate(id => ARun.LEVELS.findIndex(l => l.id === id), id);
  if (li < 0) { console.log('no level', id); process.exit(2); }
  await pg.evaluate(l => __arun.start(l), li); await pg.waitForTimeout(5000);   // past the Go! sign
  await pg.evaluate(([x, y, n]) => { if (n !== null) __arun.G.p.rideN = n; __arun.place(x, y); }, [+X, +Y, rideN]);
  const t0 = Date.now(), files = [];
  for (let k = 0; k < times.length;) {
    const el = (Date.now() - t0) / 1000;
    if (tap && Math.floor(el * 3) % 2 === 0) { await pg.keyboard.down('Space'); await pg.waitForTimeout(60); await pg.keyboard.up('Space'); }
    if (el >= times[k]) {
      const f = path.join(OUT, `${name}_${k}_${VW}x${VH}.png`);
      await pg.screenshot({ path: f }); files.push(f);
      const s = await pg.evaluate(() => { const p = __arun.G.p; return `x ${p.x.toFixed(1)} y ${p.y.toFixed(1)}${p.ride ? ' riding' : ''}`; });
      console.log(`${times[k]}s: ${s}`); k++;
    }
    await pg.waitForTimeout(40);
  }
  // the sheet: frames side by side at half size, with their times
  const imgs = files.map(f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'));
  const html = `<body style="margin:0;background:#fff;font:bold 16px sans-serif"><div style="display:flex;flex-wrap:wrap;gap:8px;padding:8px;width:${2 * (VW / 2 + 8) + 8}px">` +
    imgs.map((s, i) => `<div><div>${times[i]}s</div><img src="${s}" width="${VW / 2}"></div>`).join('') + '</div></body>';
  const sp = await br.newPage({ viewport: { width: 2 * (VW / 2 + 8) + 16, height: 200 } });
  await sp.setContent(html); await sp.screenshot({ path: path.join(OUT, `${name}_sheet.png`), fullPage: true });
  await br.close(); server.close();
  console.log('wrote', OUT, errs.length ? 'PAGE ERRORS: ' + errs.join(' | ') : 'no page errors');
})();
