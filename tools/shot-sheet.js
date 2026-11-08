// Screenshot sheet for a level (part of the level kit, kit/README.md): what Ladi looks at before anything merges.
// Shoots each spot at tablet (590x540) and phone sideways (844x390) size, then lays them out on one sheet
// with the gold-standard references (Marina and Greenwich, kit/reference/) along the top for a side-by-side look.
// usage: node tools/shot-sheet.js <level id> '[["name", x, y], ...]' [out folder]
//   x, y = where A stands (world units). Writes <out>/<name>_<size>.png and <out>/sheet_<size>.png
// Needs Playwright (preinstalled in Claude's cloud sessions). Serves the repo itself, no server needed.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const [id, spotsJson, outArg] = process.argv.slice(2);
if (!id || !spotsJson) { console.log("usage: node tools/shot-sheet.js <level id> '[[\"name\", x, y], ...]' [out]"); process.exit(2); }
const spots = JSON.parse(spotsJson), OUT = path.resolve(outArg || 'shots-' + id);
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
const SIZES = [[590, 540], [844, 390]];
(async () => {
  await new Promise(res => server.listen(0, res));
  const base = `http://localhost:${server.address().port}/`;
  const br = await chromium.launch(), errs = [];
  for (const [VW, VH] of SIZES) {
    const pg = await br.newPage({ viewport: { width: VW, height: VH } });
    pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(base + 'play.html'); await pg.waitForTimeout(2500);
    const li = await pg.evaluate(id => ARun.LEVELS.findIndex(l => l.id === id), id);
    if (li < 0) { console.log('no level', id); process.exit(2); }
    for (const [name, x, y] of spots) {
      await pg.evaluate(l => __arun.start(l), li); await pg.waitForTimeout(5000);   // past the Go! sign
      await pg.evaluate(([x, y]) => __arun.place(x, y), [x, y]); await pg.waitForTimeout(700);
      await pg.evaluate(([x, y]) => __arun.place(x, y), [x, y]); await pg.waitForTimeout(150);
      await pg.screenshot({ path: path.join(OUT, `${name}_${VW}x${VH}.png`) });
    }
    // the sheet: references on top, this level's spots below, two across
    const refs = ['marina/02_walk_towers', 'marina/07_jbr_walk', 'greenwich/03_tower_climb', 'greenwich/05_market']
      .map(r => [r, `kit/reference/${r}_${VW}x${VH}.webp`]).filter(([, f]) => fs.existsSync(path.join(ROOT, f)));
    const mine = spots.map(([n]) => [n, 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, `${n}_${VW}x${VH}.png`)).toString('base64')]);
    const sheet = await br.newPage({ viewport: { width: 1200, height: 800 } });
    await sheet.goto(base + 'play.html');   // same origin, so the reference pictures load
    const png = await sheet.evaluate(async ([refs, mine, VW, VH, id, base]) => {
      const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
      const cw = 560, ch = Math.round(cw * VH / VW), lab = 26, cols = 2;
      const rowsR = Math.ceil(refs.length / cols), rowsM = Math.ceil(mine.length / cols);
      const c = document.createElement('canvas'); c.width = cols * cw + 30; c.height = 60 + rowsR * (ch + lab) + 50 + rowsM * (ch + lab) + 20;
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#222';
      x.font = 'bold 22px sans-serif'; x.fillText(`Gold standard (Marina, Greenwich) at ${VW}x${VH}`, 12, 34);
      let y0 = 50;
      const grid = async (list, src) => { for (let i = 0; i < list.length; i++) {
        const [n, s] = list[i], im = await load(src(s)), X = 10 + (i % cols) * (cw + 10), Y = y0 + Math.floor(i / cols) * (ch + lab);
        x.font = '15px sans-serif'; x.fillStyle = '#222'; x.fillText(n, X, Y + 18); if (im) x.drawImage(im, X, Y + lab - 4, cw, ch);
      } y0 += Math.ceil(list.length / cols) * (ch + lab); };
      await grid(refs, s => base + s);
      y0 += 10; x.font = 'bold 22px sans-serif'; x.fillStyle = '#222'; x.fillText(`${id}: check every picture against the level rules`, 12, y0 + 24); y0 += 36;
      await grid(mine, s => s);
      return c.toDataURL('image/png');
    }, [refs, mine, VW, VH, id, base]);
    fs.writeFileSync(path.join(OUT, `sheet_${VW}x${VH}.png`), Buffer.from(png.split(',')[1], 'base64'));
    await sheet.close(); await pg.close();
  }
  await br.close(); server.close();
  console.log('wrote', OUT, errs.length ? 'PAGE ERRORS: ' + JSON.stringify(errs) : 'no page errors');
})();
