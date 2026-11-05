// Little Worlds children: builds each picture of the boy or girl from Ladi's art, with the chosen
// hairstyle, accessory and colours. Used by the game (play.html) and the builder's preview.
// Needs kids-meta.js (window.KIDS_META), made by london-runner/characters/tools/export.py.
(function () {
  const META = window.KIDS_META; if (!META) return;
  const PAD = META.pad, PT = 130, PX = 70;   // room above and beside each frame so big hair isn't cut off
  const PARTS = { 1: 'tee', 2: 'bottom', 3: 'shoe', 4: 'skin', 5: 'hair' };
  let dir = 'kids/';
  const cache = {};
  function load(src) {
    return cache[src] || (cache[src] = new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = dir + src; }));
  }
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function rgb(v) {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
    return null;
  }
  // repaint each part in its new colour, keeping the shading. The part map's red says which part a pixel is, green how much
  // of it is that part, and blue what the rest is (another part, the black outline or white), so edges blend cleanly.
  const FIXED = { 6: [24, 20, 24], 7: [248, 246, 240] };
  const lumOf = c => .3 * c[0] + .59 * c[1] + .11 * c[2];
  function recolour(im, lab, cols, K, only, own) {
    const c = canvas(im.width, im.height), x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(im, 0, 0);
    if (!lab) return c;
    const base = own ? Object.assign({}, META.kids[K].base, own) : META.kids[K].base, orig = META.kids[K].rgb || {};   // (an outfit can bring its own shading, e.g. the winter coat)
    const l = canvas(lab.width, lab.height), lx = l.getContext('2d', { willReadFrequently: true }); lx.drawImage(lab, 0, 0);
    let d, L;
    try { d = x.getImageData(0, 0, c.width, c.height); L = lx.getImageData(0, 0, l.width, l.height).data; } catch (e) { return c; }
    const p = d.data, T = {}, O = {}, ink = [];
    for (const k in PARTS) { if ((!only || only.includes(+k)) && cols[PARTS[k]]) T[k] = cols[PARTS[k]]; O[k] = T[k] || orig[k]; }
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3] < 8) continue;
      const k = Math.round(L[i] / 40); if (!k) continue;
      const share = L[i + 1] / 255, n = Math.round(L[i + 2] / 25), lum = .3 * p[i] + .59 * p[i + 1] + .11 * p[i + 2];
      if (k === 6) { p[i] = p[i + 1] = p[i + 2] = lum; continue; }   // outline, white, grey: no colour
      if (!n) {   // all one part
        const t = T[k]; if (!t) continue;
        let f = lum / base[k]; if (f > 1) f = Math.min(1.5, 1 + (f - 1) * .5);   // highlights lighten gently, so light colours don't glare
        p[i] = Math.min(255, t[0] * f); p[i + 1] = Math.min(255, t[1] * f); p[i + 2] = Math.min(255, t[2] * f);
        continue;
      }
      const ck = O[k], cn = FIXED[n] || O[n];
      if (!ck || !cn || !(T[k] || T[n])) continue;
      if (n === 6 && T[k]) { ink.push(i); continue; }   // fading into the outline: coloured after, from its neighbours
      if ((k === 5 && n === 4) || (k === 4 && n === 5)) {   // hair fading into skin: hair at its usual brightness over the skin as shaded here
        const h = k === 5 ? share : 1 - share, ch = k === 5 ? ck : cn, cs = k === 5 ? cn : ck;
        const hf = META.kids[K].hf || .9, ss = h > .95 ? 1 : Math.max(.6, Math.min(1.15, (lum - h * base[5] * 1.05) / ((1 - h) * base[4])));
        for (let j = 0; j < 3; j++) p[i + j] = Math.min(255, h * ch[j] * hf + (1 - h) * cs[j] * ss);
        continue;
      }
      const ok = orig[k] || ck, on = FIXED[n] || orig[n] || cn;
      const was = share * lumOf(ok) + (1 - share) * lumOf(on), f = Math.max(.7, Math.min(1.05, was > 1 ? lum / was : 1));
      for (let j = 0; j < 3; j++) p[i + j] = Math.min(255, (share * ck[j] + (1 - share) * cn[j]) * f);
    }
    // a pixel fading into the black outline takes the colour of the part right beside it (its shading, a fade's mix),
    // so lines stay clean whatever the colours
    const W = c.width, H = c.height, B = FIXED[6];
    for (const i of ink) {
      const k = Math.round(L[i] / 40), share = L[i + 1] / 255, px = (i >> 2) % W, py = (i >> 2) / W | 0;
      let r = 0, g = 0, b = 0, w = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const X = px + dx, Y = py + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const j = (Y * W + X) * 4;
        if (p[j + 3] < 200 || Math.round(L[j] / 40) !== k || Math.round(L[j + 2] / 25) === 6) continue;
        const q = 1 / (1 + dx * dx + dy * dy); r += p[j] * q; g += p[j + 1] * q; b += p[j + 2] * q; w += q;
      }
      const t = T[k], f = w ? 0 : Math.max(.7, Math.min(1.05, base[k] > 1 ? (.3 * p[i] + .59 * p[i + 1] + .11 * p[i + 2] - (1 - share) * lumOf(B)) / (share * base[k]) : 1));
      const fc = w ? [r / w, g / w, b / w] : [t[0] * f, t[1] * f, t[2] * f];
      for (let j = 0; j < 3; j++) p[i + j] = Math.min(255, share * fc[j] + (1 - share) * B[j]);
    }
    x.putImageData(d, 0, 0);
    return c;
  }
  const kidOf = cfg => cfg && (cfg.kid === 'girl' ? 'G' : cfg.kid === 'boy' ? 'B' : null);
  function colours(cfg) { return { tee: rgb(cfg.tee), bottom: rgb(cfg.bottom), shoe: rgb(cfg.shoe), skin: rgb(cfg.skin), hair: rgb(cfg.hair) }; }
  const pieces = {};
  function hairPiece(K, cfg, cols, kind = 'hair') {
    const name = cfg.style, at = (META.kids[K].keys['_' + kind] || {})[name]; if (!at) return Promise.resolve(null);
    const id = K + kind + name + JSON.stringify([cols.skin, cols.hair]);
    return pieces[id] || (pieces[id] = Promise.all([load(`${K}_${kind}_${name}.webp`), load(`${K}_${kind}_${name}_lab.png`)]).then(([im, lab]) =>
      im && { c: recolour(im, lab, cols, K, [4, 5]), x: at[0] - PAD, y: at[1] - PAD }));
  }
  function accPiece(K, cfg, back) {
    const kind = back ? 'accb' : 'acc', name = cfg.acc, at = name && (META.kids[K].keys['_' + kind] || {})[name]; if (!at) return Promise.resolve(null);
    if (back) {   // the extras from behind were drawn on a big afro: squash them to the ear line to sit on this hairstyle
      const [sy0, dy, top] = back.fit[cfg.style] || [1, 0, at[1]];
      // headphones: the band rests on top of the hair; the crown moves to the top of the head; the rest squash to the ear line
      const sy = name === 'crown' ? 1 : name === 'headphones' ? (back.earY - top + 3) / (back.earY - at[1]) : sy0;
      return load(`${K}_accb_${name}.webp`).then(im => im && { c: im, x: at[0] - PAD, y: at[1] - PAD, sy, dy: name === 'crown' ? dy : 0, ey: back.earY - PAD });
    }
    const lift = name === 'crown' ? (META.kids[K].crownLift[cfg.style] || 0) : 0;
    return load(`${K}_acc_${name}.webp`).then(im => im && { c: im, x: at[0] - PAD, y: at[1] - PAD + lift });
  }
  const KidArt = {
    setDir(d) { dir = d; },
    styles: K => Object.keys(META.kids[K].keys._hair),
    accessories: K => Object.keys(META.kids[K].keys._acc),
    has(cfg, key) { const K = kidOf(cfg); return !!(K && META.kids[K].keys[key]); },
    info(cfg, key) { const K = kidOf(cfg); return K && META.kids[K].keys[key]; },
    // the finished picture for one of A's keys, or null when this child has no art for it
    async build(cfg, key) {
      const K = kidOf(cfg); if (!K) return null;
      const e = META.kids[K].keys[key]; if (!e) return null;
      const cols = colours(cfg);
      const [im, lab, front] = await Promise.all([load(`${K}_${key}.webp`), load(`${K}_${key}_lab.png`), e.front ? load(`${K}_${key}_front.png`) : null]);
      if (!im) return null;
      const body = recolour(im, lab, cols, K, e.parts, e.base);
      const head = e.head && cfg.style;
      const [hp, ap] = head ? await Promise.all([hairPiece(K, cfg, cols, e.back ? 'hairb' : 'hair'), accPiece(K, cfg, e.back)]) : [null, null];
      const n = e.n, fw = e.w / n, fh = e.h, pt = head ? PT : 0, px = head ? PX : 0, cw = fw + 2 * px;
      const out = canvas(n * cw, fh + pt), x = out.getContext('2d');
      let fr = null;
      if (front && head) { fr = canvas(body.width, body.height); const fx = fr.getContext('2d'); fx.drawImage(body, 0, 0); fx.globalCompositeOperation = 'destination-in'; fx.drawImage(front, 0, 0); }
      for (let i = 0; i < n; i++) {
        const ox = i * cw + px - i * fw;
        x.save(); x.beginPath(); x.rect(i * cw, 0, cw, fh + pt); x.clip();
        x.drawImage(body, i * fw, 0, fw, fh, i * cw + px, pt, fw, fh);
        if (head) {
          const m = e.head[i];
          for (const pc of [hp, ap]) {
            if (!pc) continue;
            x.setTransform(m[0], m[3], m[1], m[4], m[2] + ox, m[5] + pt);
            if (pc.sy) { x.translate(0, pc.ey + pc.dy); x.scale(1, pc.sy); x.translate(0, -pc.ey); }
            x.drawImage(pc.c, pc.x, pc.y);
          }
          x.setTransform(1, 0, 0, 1, 0, 0);
          if (fr) x.drawImage(fr, i * fw, 0, fw, fh, i * cw + px, pt, fw, fh);
        }
        x.restore();
      }
      out.lwPT = pt; out.lwPX = px; out.lwW = e.w; out.lwH = fh;
      return out;
    },
  };
  window.KidArt = KidArt;
})();
