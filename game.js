/* A Runs London: game rules, physics and levels. No drawing here, so it also runs headless for testing. */
(function (root) {
'use strict';

/* ---------- jump feel (tunable from the Feel panel) ---------- */
const DEFAULT_TUNE = {
  speed: 6.2,        // run speed, units per second (1 unit ≈ 1 metre; A is 1.45 tall)
  jumpHeight: 4.3,   // peak when jump is held
  tapHeight: 2.0,    // height of a quick tap
  fallGravity: 52,   // how fast A comes down
  wallJump: 3.1,     // height gained by a wall-jump
  wallSlide: 2.6,    // slide speed down a wall
};
function physics(t) {
  // hold = full jumpHeight; letting go early switches to heavier gravity so a quick tap peaks near tapHeight
  const gUp = 38, jumpH = Math.max(1, t.jumpHeight), tapH = Math.min(jumpH, Math.max(0.6, t.tapHeight));
  return {
    speed: t.speed, gUp, jumpV: Math.sqrt(2 * gUp * jumpH), gCut: gUp * jumpH / tapH,
    gFall: t.fallGravity, maxFall: 19,
    wallJumpV: Math.sqrt(2 * gUp * t.wallJump), wallSlide: t.wallSlide,
    bounceV: 12,
    coyote: 0.1, buffer: 0.14, vaultMax: 1.25,
  };
}

const PW = 0.78, PH = 1.45;          // A's hit box
const STEP = 1 / 120;
let FIXED_PH = false;   // bots that record a run for a video set this so the replay matches

/* ---------- level builder ---------- */
function makeBuilder(area) {
  const L = { area, solids: [], oneways: [], coins: [], specials: [], enemies: [], props: [], flagX: 0, startX: 1, endX: 0 };
  const b = {
    L,
    ground(x0, x1) { L.solids.push({ kind: 'ground', x: x0, y: -40, w: x1 - x0, h: 40 }); },
    block(x, w, top, style) { L.solids.push({ kind: 'block', x, y: 0, w, h: top, style: style || area }); },
    // floating block given by bottom and top
    slab(x, w, bottom, top, style) { L.solids.push({ kind: 'block', x, y: bottom, w, h: top - bottom, style: style || area }); },
    wall(x, w, h) { L.solids.push({ kind: 'block', x, y: 0, w, h, style: area, edge: true }); },
    phone(x) { L.solids.push({ kind: 'phone', x, y: 0, w: 1.19, h: 2.9 }); },
    bin(x) { L.solids.push({ kind: 'bin', x, y: 0, w: 0.56, h: 1.1 }); },
    // Greenwich riverside props
    bench(x) { L.solids.push({ kind: 'bench', x, y: 0, w: 2.2, h: 1.0 }); },
    planter(x) { L.solids.push({ kind: 'planter', x, y: 0, w: 3.4, h: 0.83 }); },
    planterTall(x) { L.solids.push({ kind: 'planter_tall', x, y: 0, w: 1.6, h: 2.1 }); },
    kiosk(x) { L.solids.push({ kind: 'kiosk', x, y: 0, w: 1.1, h: 2.9 }); },
    pavilion(x) { L.props.push({ kind: 'pavilion', x, y: 0 }); L.oneways.push({ kind: 'shelter', x: x + 0.15, y: 2.78, w: 4.55 }); },
    // stone stairs: steps of 0.8 that A climbs on his own
    stairs(x, n, down) { for (let i = 0; i < n; i++) L.solids.push({ kind: 'block', x: x + i, y: 0, w: 1, h: 0.8 * (down ? n - i : i + 1), style: 'stair' }); },
    // stone arch bridge over a river gap: deck from x to x+w at height top, stairs at both ends
    bridge(x, w, top) {
      const n = Math.round(top / 0.8);
      b.stairs(x - n, n, false);
      L.solids.push({ kind: 'block', x, y: top - 0.5, w, h: 0.5, style: 'bridge' });
      L.props.push({ kind: 'bridge', x, w, top });
      b.stairs(x + w, n - 1, true);
    },
    // Greenwich Market entrance: four shops with the arch between the 2nd and 3rd.
    // Scenery you run past; awnings, a window-box ledge, the arch and the rooftops are ledges.
    market(x) {
      // coffee, books | tan shop, flower shop, ARCH, green shop, barber | bakery, vintage
      // art widths at 80px/unit; shops packed so their walls touch (B = left/right wall columns in the art)
      const W = [4.92, 4.45, 4.03, 3.76, 5.16, 4.01, 3.85, 4.75, 4.88], xs = []; let cx = x;
      const B = [[24, 375], [12, 346], [10, 314], [8, 292], [10, 403], [9, 311], [8, 297], [22, 360], [16, 370]];
      for (const [l, r] of B) { xs.push(cx - l / 80); cx += (r - l + 1) / 80; }
      L.props.push({ kind: 'market', x, xs });
      const ledge = (x0, y, w) => L.oneways.push({ kind: 'ledge', x: x0, y, w });
      ledge(xs[2] + 0.2, 2.74, 3.6);                 // tan awning
      ledge(xs[3] + 0.3, 3.4, 3.2);                  // window boxes
      ledge(xs[4] + 1.1, 5.55, 3.0);                 // top of the arch
      ledge(xs[5] + 0.15, 2.85, 3.7);                // green awning
      [0, 1, 7, 8].forEach(i => {                    // newer shops: canopy, two window boxes
        ledge(xs[i] + 0.35, 3.37, W[i] - 0.7);
        ledge(xs[i] + W[i] * 0.2, 4.6, W[i] * 0.28); ledge(xs[i] + W[i] * 0.56, 4.6, W[i] * 0.28);
      });
      [0, 1, 2, 3, 5, 6, 7, 8].forEach(i => ledge(xs[i] + 0.3, i < 2 || i > 6 ? 7.75 : 7.6, W[i] - 0.6));   // roof ridges
      return cx;
    },
    // modern riverside apartments (90px per unit): lobby canopy, two balcony floors and the roof are ledges
    apartments(x) {
      L.props.push({ kind: 'apartments', x });
      const ledge = (x0, y, w) => L.oneways.push({ kind: 'ledge', x: x + x0, y, w });
      ledge(1.7, 3.6, 12.4);                         // lobby canopy
      ledge(2.0, 4.34, 5.47); ledge(8.33, 4.34, 5.45);  // first-floor balconies
      ledge(2.0, 7.74, 5.47); ledge(8.33, 7.74, 5.45);  // second-floor balconies
      ledge(0.1, 11.09, 15.6);                       // roof
    },
    // Ladi's shop with flats above (76px/u, 15.4 x 12): canopy, a stack of balconies on the right, flat roof
    gwShop(x) {
      const P = 76, ledge = (x0, y, w) => L.oneways.push({ kind: 'ledge', x: x + x0, y, w });
      L.props.push({ kind: 'gwshop', x, x1: x + 1170 / P, P });
      ledge(0.1, (914 - 650) / P, 15.2);                         // shop canopy
      for (const y of [612, 512, 412, 314, 216]) ledge(809 / P, (914 - y) / P, 160 / P);   // balconies
      ledge(97 / P, 914 / P, 975 / P);                           // roof
    },
    // riverside pub: scenery you run past, with a balcony and a roof ridge you can land on
    pub(x) {
      L.props.push({ kind: 'pub', x });
      L.oneways.push({ kind: 'ledge', x: x + 4.0, y: 3.48, w: 3.0 });
      L.oneways.push({ kind: 'ledge', x: x + 0.7, y: 7.28, w: 10.0 });
    },
    shelter(x) { L.props.push({ kind: 'shelter', x, y: 0 }); L.oneways.push({ kind: 'shelter', x: x + 0.3, y: 2.78, w: 5.6 }); },
    awning(x, y, w) { L.oneways.push({ kind: 'awning', x, y, w }); },
    plank(x, y, w) { L.oneways.push({ kind: 'plank', x, y, w }); },
    coins(x, y, n, dx = 1, dy = 0) { for (let i = 0; i < n; i++) L.coins.push({ x: x + i * dx, y: y + i * dy }); },
    arc(x, y, n, w, h) { for (let i = 0; i < n; i++) { const t = n === 1 ? 0.5 : i / (n - 1); L.coins.push({ x: x + t * w, y: y + 4 * h * t * (1 - t) }); } },
    special(x, y) { L.specials.push({ x, y }); },
    pigeon(x, y = 0) { L.enemies.push({ kind: 'pigeon', x, y, w: 0.75, h: 0.62, speed: 1.1 }); },
    fox(x, x0, x1, y = 0) { L.enemies.push({ kind: 'fox', x, y, w: 1.3, h: 0.85, speed: 2.8, x0, x1 }); },
    gull(x, y, range = 1.5) { L.enemies.push({ kind: 'gull', x, y, w: 1.0, h: 0.6, range }); },
    lamp(x) { L.props.push({ kind: 'lamp', x }); },
    tree(x, young) { L.props.push({ kind: young ? 'tree_young' : 'tree', x }); },
    /* ---------- Woolwich ---------- */
    groundAt(x0, x1, top) { L.solids.push({ kind: 'ground', x: x0, y: top - 40, w: x1 - x0, h: 40 }); },
    zone(x, bg) { (L.zones = L.zones || []).push({ x, bg }); },
    // escalator: a slope A rides from (x0, y0) to (x1, y1)
    escalator(x0, y0, x1, y1) {
      const sl = { slope: true, x: x0, x0, y0, x1, y1, w: x1 - x0 };
      (L.slopes = L.slopes || []).push(sl); L.props.push({ kind: 'escalator', x: x0, x0, y0, x1, y1 });
    },
    // rundown estate block: ground floor, n deck-access floors, flat roof (87px per unit)
    estate(x, n) {
      L.props.push({ kind: 'estate', x, n });
      // refurbished kit at 100px per unit, 1.2x wide (12.6 units): ground 3.59, floors 3.31, walkway 0.29 up, roof coping 1.14 up
      const ledge = (y) => L.oneways.push({ kind: 'ledge', x: x + 0.3, y, w: 12.0 });
      for (let i = 0; i < n; i++) ledge(3.59 + 3.31 * i + 0.29);
      ledge(3.59 + 3.31 * n + 1.14);
    },
    // a row of five terraced houses (Ladi's picture, 17.5 units wide, roof 5.5 up); upstairs window sills and the roof are ledges
    terrace(x) {
      L.props.push({ kind: 'wwterrace', x, w: 17.5 });
      const P = 95.4, sill = 3.27;   // art pixels per unit
      for (const [a, c] of [[70, 185], [235, 325], [428, 512], [552, 650], [722, 815], [850, 940], [1045, 1135], [1180, 1280], [1365, 1450], [1485, 1610]])
        L.oneways.push({ kind: 'ledge', x: x + a / P, y: sill, w: (c - a) / P });
      L.oneways.push({ kind: 'ledge', x: x + 0.1, y: 5.45, w: 17.3 });
    },
    // Powis Street parade; fascia signs and roofs are ledges
    powis(x) {
      const W = [4.02, 3.84, 4.24, 3.88, 4.15, 4.59, 5.34, 4.79, 6.14], xs = []; let cx = x;
      for (const w of W) { xs.push(cx); cx += w; }
      L.props.push({ kind: 'powis', x, xs });
      xs.forEach((sx, i) => {
        L.oneways.push({ kind: 'ledge', x: sx + 0.15, y: 3.95, w: W[i] - 0.3 });
        L.oneways.push({ kind: 'ledge', x: sx + 0.35, y: 7.0, w: W[i] - 0.7 });
      });
      return cx;
    },
    stalls(x) { for (let i = 0; i < 3; i++) { L.props.push({ kind: 'wwstall', x: x + i * 3.32, i }); L.oneways.push({ kind: 'ledge', x: x + i * 3.32 + 0.35, y: 2.8, w: 2.6 }); } },
    busStop(x) { L.props.push({ kind: 'busstop', x }); L.oneways.push({ kind: 'ledge', x: x + 0.15, y: 2.4, w: 3.9 }); },
    bus(x) { L.props.push({ kind: 'bus', x }); },
    station(x) { L.props.push({ kind: 'station', x }); L.oneways.push({ kind: 'ledge', x: x + 0.2, y: 4.45, w: 12.2 }); },
    train(x, cars, y) { L.props.push({ kind: 'train', x, cars, y }); L.oneways.push({ kind: 'ledge', x: x + 0.3, y: y + 2.6, w: cars * 7.98 + 7.6 - 0.6 }); },
    /* ---------- Greenwich extras ---------- */
    // Cutty Sark in its glass dry dock, 41 art px per unit: canopy and deck are ledges, the bowsprit is a ramp
    cutty(x) {
      L.props.push({ kind: 'cutty', x });
      L.oneways.push({ kind: 'ledge', x: x + 4.7, y: 3.78, w: 39 });
      L.oneways.push({ kind: 'ledge', x: x + 4.4, y: 5.56, w: 39.2 });
      const sl = { slope: true, x: x + 43.4, x0: x + 43.4, y0: 5.56, x1: x + 49.8, y1: 7.6, w: 6.4 };
      (L.slopes = L.slopes || []).push(sl);
    },
    // Cutty Sark Gardens, 100 art px per unit: fountain basin is a low solid, the kiosk roof a ledge
    square(x) {
      L.props.push({ kind: 'gwsquare', x });
      L.solids.push({ kind: 'fountain', x: x + 6.3, y: 0, w: 4.9, h: 0.68 });
      L.oneways.push({ kind: 'ledge', x: x + 17.4, y: 2.9, w: 3.7 });
    },
    // Greenwich Foot Tunnel: drop down the entry shaft, run under the river, climb the landings out
    footTunnel(xa, xb) {
      const SW = 4.4, F = -10, R = -5.6;
      L.gwTunnel = { x0: xa, x1: xb, sw: SW, floor: F, roof: R };
      b.groundAt(xa, xb, F);
      b.ceiling(xa + SW, xb - SW, R);
      for (const y of [-7, -4, -1]) L.oneways.push({ kind: 'landing', x: xb - SW, y, w: SW });
      L.props.push({ kind: 'gwdome', x: xa + SW / 2 });
      L.props.push({ kind: 'gwdome', x: xb - SW / 2, flip: true });
    },
    // Union Wharf style towers (76px per unit): tall one's right face at xa, short one's left face at xb.
    // A runs in front of the tall tower's lobby, then wall-jumps the gap between them.
    gwTowers(xa, xb) {
      const P = 76;
      L.props.push({ kind: 'gwtowers', xa: xa - 422 / P, xb: xb - 12 / P, P });
      L.solids.push({ kind: 'block', x: xa - 407 / P, y: 2.5, w: 407 / P, h: 916 / P - 2.5, style: 'gwtower' });
      L.solids.push({ kind: 'block', x: xb, y: 0, w: 429 / P, h: 617 / P, style: 'gwtower', edge: true });
    },
    ceiling(x0, x1, bottom) { L.solids.push({ kind: 'block', x: x0, y: bottom, w: x1 - x0, h: 40, style: 'ceiling' }); },
    // new riverside tower: ground floor, n floors with balconies, roof terrace (82.5px per unit)
    tower(x, n, simple) {                           // simple: only the floor slabs and roof (a drop goes straight to the street)
      L.props.push({ kind: 'tower', x, n });
      const ledge = (x0, y, w) => L.oneways.push({ kind: 'ledge', x: x + x0, y, w });
      if (!simple) ledge(8.7, 3.1, 6.0);           // coffee shop canopy
      ledge(0.2, 3.6, 16.1);                       // first-floor slab
      if (!simple) for (let i = 0; i < n; i++) { const y = 3.6 + 3.6 * i + 0.57; ledge(2.3, y, 5.5); ledge(8.6, y, 5.5); }
      ledge(0.3, 3.6 + 3.6 * n + 0.64, 15.9);       // roof terrace
    },
    dialArch(x) {
      L.props.push({ kind: 'dialarch', x });
      const ledge = (x0, y, w) => L.oneways.push({ kind: 'ledge', x: x + x0, y, w });
      ledge(0.3, 2.5, 2.3); ledge(2.9, 2.5, 2.4); ledge(13.8, 2.5, 2.4);   // parasols
      ledge(2.0, 4.2, 1.3); ledge(3.9, 4.2, 1.3); ledge(11.3, 4.2, 1.3); ledge(13.3, 4.2, 1.3);   // window boxes
      ledge(6.5, 5.8, 3.6);                         // over the archway
      ledge(1.2, 7.45, 4.4); ledge(11.0, 7.45, 4.4); // roof parapets
      ledge(6.9, 8.7, 2.8);                         // top of the pediment
    },
    binStore(x) { L.solids.push({ kind: 'binstore', x, y: 0, w: 3.2, h: 1.54 }); },
    clothesBank(x) { L.solids.push({ kind: 'clothesbank', x, y: 0, w: 1.75, h: 2.3 }); },
    mattress(x) { L.solids.push({ kind: 'mattress', x, y: 0, w: 1.5, h: 1.7 }); },
    seat(x) { L.solids.push({ kind: 'esbench', x, y: 0, w: 2.6, h: 0.91 }); },

    /* ---------- Tower Bridge ---------- */
    groundTop(x0, x1, top, style) { L.solids.push({ kind: 'ground', x: x0, y: top - 40, w: x1 - x0, h: 40, style }); },
    hidden(x, w, h) { L.solids.push({ kind: 'block', x, y: 0, w, h, style: 'hidden', edge: true }); },
    // Shad Thames warehouse: Ladi's kit, modules 3.5 wide and floors 3.3 high; each floor's sill and the roof are ledges
    warehouse(x, cols, floors) {
      L.props.push({ kind: 'tbwh', x, cols, floors });
      for (let i = 1; i <= floors; i++) L.oneways.push({ kind: 'ledge', x: x + 0.15, y: 3.3 * i, w: cols * 3.5 - 0.3 });
    },
    // iron footbridge between warehouses; the plank floor is a ledge
    footbridge(x, y, size) { L.oneways.push({ kind: 'tbfoot', x, y, w: { s: 6.44, m: 10.58, l: 14.76 }[size], size }); },
    tbStairs(x, n, down, base = 0) {
      for (let i = 0; i < n; i++) L.solids.push({ kind: 'block', x: x + i, y: base, w: 1, h: 0.8 * (down ? n - i : i + 1), style: 'tbstair' });
      L.props.push({ kind: 'tbstair', x, n, down, base });
    },
    // the blue suspension chain: a slope A can run along
    chain(x0, y0, x1, y1) {
      (L.slopes = L.slopes || []).push({ slope: true, x: x0, x0, y0, x1, y1, w: x1 - x0 });
      L.props.push({ kind: 'tbchain', x: Math.min(x0, x1), x0, y0, x1, y1 });
    },
    tbTower(x) { L.props.push({ kind: 'tbtower', x }); },
    // the two road leaves between the towers: they lift once A gets close (worked out each tick from g.liftAt)
    bascules(xa, xb, len, y, trig) { L.bascule = { xa, xb, len, y, trig, maxA: 0.62, dur: 1.8 }; },
    // high walkway between the tower tops: glass floor and a roof A bumps into
    walkway(x0, x1, y, r0, r1) {
      L.oneways.push({ kind: 'tbglass', x: x0, y, w: x1 - x0 });
      L.solids.push({ kind: 'block', x: x0, y: y + 3.0, w: x1 - x0, h: 6, style: 'hidden' });
      L.tbWalk = { x0: r0, x1: r1, y };
    },
    car(kind, x, y = 0) {   // parked black cab or red bus: solid, roof to land on
      const d = { cab: [4.0, 1.65], bus: [11.2, 4.3] }[kind];
      L.solids.push({ kind: 'tb' + kind, x, y, w: d[0], h: d[1] });
    },
    // grassy moat bank: a slope up onto the castle wall
    moat(x, w, h) {
      (L.slopes = L.slopes || []).push({ slope: true, x, x0: x, y0: 0.05, x1: x + w, y1: h, w });
      L.props.push({ kind: 'tbmoat', x, w, h });
    },
    castleWall(x, w, h) { L.solids.push({ kind: 'block', x, y: 0, w, h, style: 'tbwall' }); },
    turret(x) { L.solids.push({ kind: 'block', x, y: 0, w: 4.0, h: 6.1, style: 'tbturret' }); },
    gatehouse(x) {
      L.props.push({ kind: 'tbgate', x });
      const ledge = (x0, y, w) => L.oneways.push({ kind: 'ledge', x: x + x0, y, w });
      ledge(0.15, 6.15, 1.75); ledge(4.95, 6.15, 1.75); ledge(1.9, 4.1, 3.0);
    },
    raven(x, y = 0, shy = true) { L.enemies.push({ kind: 'raven', x, y, w: 0.9, h: 0.78, speed: 0.9, shy }); },
    // City office block (105px per unit): lobby canopy, each floor, the roof terrace and its pergola are ledges
    office(x, floors, cols = 3) {
      L.props.push({ kind: 'tboffice', x, floors, cols });
      const ledge = (y, x0, w) => L.oneways.push({ kind: 'ledge', x: x + x0, y, w });
      for (let i = 1; i <= floors; i++) ledge(3.3 * i, 0.2, cols * 4.9 - 0.4);
      ledge(3.3 * floors + 1.45, (cols - 1) * 4.9 + 0.4, 4.2);   // pergola on the roof terrace, last module
    },
    phoneTb(x) { L.solids.push({ kind: "tbphone", x, y: 0, w: 1.55, h: 2.5 }); },
    // Leadenhall Market: entrance, n bays of shopfronts, exit; a glass roof keeps A inside
    leadenhall(x, n) {
      const G = 6.76, B = 6.6, x1 = x + G + n * B;
      L.props.push({ kind: 'tbmarket', x, n, x1: x1 + G });
      L.solids.push({ kind: 'block', x: x - 0.5, y: 10.2, w: x1 + G - x + 1, h: 3, style: 'hidden' });
      L.tbMarket = { x0: x, x1: x1 + G };
      for (let i = 0; i < n; i++) {
        const bx = x + G + i * B, ledge = (x0, y, w) => L.oneways.push({ kind: 'ledge', x: bx + x0, y, w });
        ledge(0.75, 4.05, 5.1); ledge(2.9, 5.35, 0.8); ledge(0.35, 7.1, 5.9);
      }
      return x1 + G;
    },
    /* ---------- Canary Wharf (art px per unit noted on each piece) ---------- */
    slope(x0, y0, x1, y1) { (L.slopes = L.slopes || []).push({ slope: true, x: Math.min(x0, x1), x0, y0, x1, y1, w: Math.abs(x1 - x0) }); },
    ledge(x, y, w) { L.oneways.push({ kind: 'ledge', x, y, w }); },
    // a prop you can bump into and stand on: art key, width, height; roof = optional ledge height for a canopy
    cwSolid(key, x, w, h, roof, y0 = 0) {
      L.solids.push({ kind: 'cwsolid', key, x, y: y0, w, h: roof ? Math.min(h, 1.2) : h });
      if (roof) L.oneways.push({ kind: 'ledge', x: x + 0.1, y: roof, w: w - 0.2 });
    },
    // low office pavilion (100px/u): end, lobby with canopy, two plain bays, end; 4.5 tall
    cwOffice(x) {
      const W = [2.48, 5.61, 3.90, 4.46, 2.62], x1 = x + W.reduce((a, c) => a + c, 0);
      L.props.push({ kind: 'cwoffice', x, x1, W });
      b.ledge(x + W[0], 3.95, W[1]);                      // lobby canopy
      b.ledge(x + W[0] + W[1] + 0.1, 2.25, W[2] + W[3] - 0.2);   // first-floor sills
      b.ledge(x + 0.1, 4.5, x1 - x - 0.2);                 // roof
      return x1;
    },
    // office tower (100px/u): lobby floor 3.36, then floors of 2.83, cap 0.53; three bays between end columns
    cwTower(x, floors) {
      const EL = 1.38, ER = 1.34, C = 3.82, n = 3, x1 = x + EL + n * C + ER, top = 3.36 + 2.83 * floors;
      L.props.push({ kind: 'cwtower', x, x1, floors, EL, ER, C, n });
      for (let i = 0; i <= floors; i++) b.ledge(x + EL, 3.36 + 2.83 * i, n * C);
      b.ledge(x + 0.05, top + 0.53, x1 - x - 0.1);
      return x1;
    },
    cwFountain(x) { L.solids.push({ kind: 'cwsolid', key: 'cw_fountain', x, y: 0, w: 6, h: 1.0 }); },
    // shopping centre: glass doors at each end (127px/u), shop rows of 3.35 (135px/u) under a glass roof
    cwMall(x0, x1) {
      L.cwMall = { x0, x1, door: 10.93, top: 6.7 };
      L.props.push({ kind: 'cwmall', x0, x1 });
      L.solids.push({ kind: 'block', x: x0 + 1.9, y: 7.0, w: x1 - x0 - 3.8, h: 4, style: 'hidden' });   // roof keeps A inside
    },
    cwShops(x, bays) {
      const C = 1.14, B = 4.8, x1 = x + (bays + 1) * C + bays * B;
      L.props.push({ kind: 'cwshops', x, x1, bays, C, B });
      b.ledge(x + 0.1, 3.72, x1 - x - 0.2);              // the gallery walkway
      return x1;
    },
    // short escalator up to the gallery (107.5px/u): 14.25 wide incl. landings
    cwMallEsc(x) {
      L.props.push({ kind: 'cwmesc', x });
      b.slope(x + 1.86, 0, x + 11.35, 3.72);
      b.ledge(x + 11.35, 3.72, 2.7);
      return x + 13.95;
    },
    // posh shopping centre: 4-floor fronts at each end (74.3px/u), a 4-floor cut-away between them.
    // Floors at 0, 3.6, 7.2, 10.8; an atrium gap in the middle with an escalator (115.6px/u) up to floor 1.
    cwMall2(x0, x1) {
      const FW = 1062 / 74.3, xa = x0 + FW, xb = x1 - FW, TOP = 14.4, vA = xa + 21, vB = vA + 2101 / 115.6;
      L.cwMall = { x0, x1, xa, xb, vA, vB, top: TOP, FW };
      L.props.push({ kind: 'cwmall2', x0, x1 });
      for (const x of [x0, xb]) { b.ledge(x + 0.3, 7.2, FW - 0.6); b.ledge(x + 0.3, 10.75, FW - 0.6); }   // the fronts' stone bands
      b.ledge(xa - 0.3, 3.6, vA - xa + 0.3); b.ledge(xa - 0.3, 7.2, vA - xa + 0.3);    // floors 1 and 2, before the atrium
      b.ledge(vA + 14.9, 3.6, xb - vA - 14.9 + 0.3); b.ledge(vB, 7.2, xb - vB + 0.3);  // and after it
      b.ledge(xa - 0.3, 10.8, xb - xa + 0.6);                                        // floor 3 bridges the atrium
      b.slope(vA + 6.36, 0, vA + 14.9, 3.6);                                         // escalator
      L.solids.push({ kind: 'block', x: xa, y: TOP, w: xb - xa, h: 4, style: 'hidden' });   // glass roof keeps A inside
      return { xa, xb, vA, vB };
    },
    // tall towers for the climb, stacked from the ground: type a (7.5 wide, pyramid crown) or b (8 wide, flat or crane crown)
    cwTall(x, type, floors, crown) {
      const T = CW_TALL[type], top = T.lobby + floors * T.floor + T.crown;
      L.props.push({ kind: 'cwtall', x, x1: x + T.W, type, floors, crown, top });
      L.solids.push({ kind: 'block', x, y: 0, w: T.W, h: top, style: 'hidden' });
      return { x1: x + T.W, top };
    },
    // window-cleaner cradle (219px/u, 4.49 wide) hanging beside a tower face: a ledge that rides between y0 and y1
    // up = seconds to travel, d0/d1 = seconds it waits at the bottom/top, ph = time offset
    cwCradle(face, y0, y1, up, d0, d1, ph = 0) {
      const m = { kind: 'cradle', mover: true, x: face - 4.4, w: 4.38, y: y0, y0, y1, up, d0, d1, ph, face };
      (L.movers = L.movers || []).push(m); L.oneways.push(m);
      return m;
    },
    // glass sky bridge between two towers (134px/u): end, n middles, end; a solid deck so A can't drop through
    cwSkyBridge(x0, y, n) {
      const E = 645 / 134, M = 648 / 134, x1 = x0 + 2 * E + n * M;
      L.props.push({ kind: 'cwskybridge', x0, x1, y, n, E, M });
      L.solids.push({ kind: 'block', x: x0, y: y - 0.5, w: x1 - x0, h: 0.5, style: 'hidden' });
      return x1;
    },
    // colourful footbridge: stairs up to a deck at 2.3 (end piece 84.6px/u, mirrored at the far end), striped tunnel between (92px/u)
    cwBridge(x0) {
      const E = 1230 / 84.6, M = (1084 - 45) / 92, x1 = x0 + 2 * E + M, D = 2.3, sa = 0.4, sb = 6.3;
      L.props.push({ kind: 'cwbridge', x0, x1, E, M, D });
      b.slope(x0 + sa, 0, x0 + sb, D); b.ledge(x0 + sb, D, x1 - x0 - 2 * sb); b.slope(x1 - sb, D, x1 - sa, 0);
      b.ceiling(x0 + 5.6, x1 - 5.6, D + 2.6);   // low tunnel roof: only little hops in here
      return x1;
    },
    // DLR: stairs up (80px/u) to a deck at 4, track on pillars, stairs down
    cwViaduct(xa, xb) {
      L.cwVia = { xa, xb, y: 4 };
      b.slope(xa + 0.12, 0, xa + 4.69, 4);
      b.ledge(xa + 4.69, 4, xb - 4.69 - (xa + 4.69) + 0.01 + 0);
      b.slope(xb - 4.69, 4, xb - 0.12, 0);
      L.props.push({ kind: 'cwvia', xa, xb });
    },
    cwDlr(x) {   // parked DLR train (103px/u): 21.1 long, roof at 7.35
      L.solids.push({ kind: 'cwdlr', x, y: 4, w: 21.09, h: 3.35 });
    },
    cwCanopy(x) {   // DLR station canopy (70px/u): 30.44 long, top at 7.95
      L.props.push({ kind: 'cwcanopy', x });
      b.ledge(x + 2.4, 7.95, 25.6);
    },
    // Crossrail Place roof garden: timber lattice (61.4px/u) on a stone deck; the curved roof is a path
    cwLattice(x, mids) {
      const D = 0.86, WL = 9.66, WM = 13.5, x1 = x + 2 * WL + mids * WM;
      L.props.push({ kind: 'cwlattice', x, x1, mids });
      L.solids.push({ kind: 'cwdeck', x: x + 0.25, y: 0, w: x1 - x - 0.5, h: D });
      const H = [2.33, 4.09, 5.13, 5.81, 6.24, 6.53, 6.74, 6.84, 6.9, 6.95];
      for (let i = 1; i < H.length; i++) {
        b.slope(x + i * 0.966, D + H[i - 1], x + (i + 1) * 0.966, D + H[i]);
        b.slope(x1 - i * 0.966, D + H[i - 1], x1 - (i + 1) * 0.966, D + H[i]);
      }
      b.ledge(x + WL, D + 6.95, mids * WM);
      L.cwGarden = { x0: x, x1 };
      return x1;
    },
    // Elizabeth line: glass entrance (130px/u), escalator down to the platform at -7, platform screen doors
    cwStation(xe, x1) {
      const top = xe + 1.54, bot = xe + 18.38;
      L.cwStation = { xe, x0: top, bot, x1, floor: -7 };
      L.props.push({ kind: 'cwesc', x: xe });
      b.slope(top, 0, bot, -7);
      b.groundAt(bot - 0.01, x1, -7);
      b.ceiling(bot + 0.6, x1, -0.8);
    },
    /* ---------- Brixton ---------- */
    // scenery art standing at (x, y), h units tall; layer 'back' (behind A) by default
    bxProp(key, x, y, h, o = {}) { L.props.push(Object.assign({ kind: 'bx', key, x, y, h }, o)); },
    // a prop you bump into and stand on; art drawn h tall from (ax, y0), the box is w x bh
    bxSolid(key, x, w, bh, o = {}) {
      const s = Object.assign({ kind: 'bxsolid', key, x, y: o.y0 || 0, w, h: bh }, o);
      L.solids.push(s); return s;
    },
    /* ---------- Old Dubai ---------- */
    // an Al Fahidi house front: scenery, with its flat roofs as ledges; returns its right edge
    dxHouse(key, x) {
      const d = DX_HOUSE[key]; L.props.push({ kind: 'bx', key, x, y: 0, h: d.h });
      for (const [a, c, y] of d.ledges) L.oneways.push({ kind: 'ledge', x: x + a, y, w: c - a });
      return x + d.w;
    },
    // an abra shuttling between x0 and x1 (its left end), hull bottom at y; A can stand on its roof and its deck
    dxAbra(key, x0, x1, y, d0, up, d1, ph) {
      const B = { key, x0, x1, y, d0, up, d1, ph, h: 2.65 }; (L.dxBoats = L.dxBoats || []).push(B);
      for (const [a, c, dy] of [[0.55, 4.9, 2.62], [0.35, 5.45, 0.95]]) {
        const m = { kind: 'boat', mover: true, ax: 'x', x0, x1, off: a, w: c - a, y: y + dy, d0, up, d1, ph, boat: B };
        m.x = x0 + a; (L.movers = L.movers || []).push(m); L.oneways.push(m);
      }
    },
    // a solid prop drawn from art: the box is (x + a .. x + c) by h, drawn ah tall from x
    dxSolid(key, x, ah, boxes, o = {}) {
      L.props.push(Object.assign({ kind: 'bx', key, x, y: o.y0 || 0, h: ah }, o.front ? { front: true } : {}));
      for (const [a, c, h, y0] of boxes) L.solids.push({ kind: 'block', x: x + a, y: (o.y0 || 0) + (y0 || 0), w: c - a, h, style: 'hidden' });
    },
    // the Palm: a rubber ring drifting to and fro on the lazy river, its top at y; A rides on it
    pmRing(key, x0, x1, y, w, d0, up, d1, ph) {
      const B = { key, x0, x1, y, d0, up, d1, ph }; (L.pmRings = L.pmRings || []).push(B);
      const m = { kind: 'boat', mover: true, ax: 'x', x0, x1, off: 0.25, w: w - 0.5, y, d0, up, d1, ph, boat: B };
      m.x = x0 + 0.25; (L.movers = L.movers || []).push(m); L.oneways.push(m);
    },
    swim(x0, x1) { L.solids.push({ kind: 'ground', x: x0, y: -40.9, w: x1 - x0, h: 40, style: 'swim', swim: true, belt: -1.6 }); },   // water A swims through (no ground drawn)
    crab(x, x0, x1) { L.enemies.push({ kind: 'fox', skin: 'crab', x, y: 0, w: 0.95, h: 0.7, speed: 1.8, x0, x1 }); },
    cat(x, x0, x1) { L.enemies.push({ kind: 'fox', skin: 'cat', x, y: 0, w: 1.0, h: 0.75, speed: 2.2, x0, x1 }); },
    crow(x, y = 0) { L.enemies.push({ kind: 'raven', skin: 'crow', x, y, w: 0.9, h: 0.75, speed: 0.9, shy: true }); },
    flag(x) { L.flagX = x; },
    end(x) { L.endX = x; },

    /* ===== LEVEL KIT START =====
       Shared pieces for every new trip (kit/README.md). Each one places the picture AND what A
       stands on together, so the level rules hold by default: props stand on the floor, rows of
       buildings touch and have end pieces, stalls come in 3+, every climb is two walls facing
       each other, every building switch is a door A can't go back through.
       A broken rule is written to L.kitWarn; tools/kit-check.js fails on it. */
    // the top of whatever A would stand on at x (ground, solid or ledge), at or below y
    kitFloor(x, y = 99) {
      let top = -99;
      for (const s of L.solids) if (x >= s.x && x <= s.x + s.w && s.y + s.h <= y + 0.01 && s.style !== 'ceiling') top = Math.max(top, s.y + s.h);
      for (const o of L.oneways) if (!o.mover && x >= o.x && x <= o.x + o.w && o.y <= y + 0.01) top = Math.max(top, o.y);
      return top;
    },
    kitWarn(msg) { (L.kitWarn = L.kitWarn || []).push(msg); },
    // a picture standing at (x, y), h units tall. o: back (behind A), front (in front of A), flip, hang (allowed off the floor)
    kitArt(key, x, y, h, o = {}) { const a = Object.assign({ key, x, y, h }, o); (L.kitArt = L.kitArt || []).push(a); return a; },
    // a prop: w = its width in units (from the picture), grounded on the floor under its middle unless o.y is given.
    // o.solid = [dx, w, h] something to bump into / hop; o.ledge = [dx, y, w] somewhere to land (y above the prop's base)
    kitProp(key, x, w, h, o = {}) {
      const y = o.y !== undefined ? o.y : Math.max(0, b.kitFloor(x + w / 2));
      const a = b.kitArt(key, x, y, h, Object.assign({ w, grounded: true }, o));
      if (o.solid) L.solids.push({ kind: 'block', x: x + o.solid[0], y, w: o.solid[1], h: o.solid[2], style: 'hidden' });
      if (o.ledge) b.ledge(x + o.ledge[0], y + o.ledge[1], o.ledge[2]);
      return a;
    },
    // a row of buildings standing wall to wall (no gaps), with an end piece at each side (no abrupt stops).
    // pieces: [{ key, w, h, ledges: [[dx, y, w], ...], floors }]; o.capL / o.capR: the end pieces, same shape. Returns the row's right edge.
    kitRow(x, pieces, o = {}) {
      const LAP = 0.05;   // each piece overlaps the one before a touch, so no sky shows between them
      if (!o.capL || !o.capR) b.kitWarn(`kitRow at ${x}: needs an end piece at both ends (capL and capR)`);
      const hs = pieces.map(p => p.h + (p.floors || 0));
      if (pieces.length >= 3 && new Set(hs.map(h => Math.round(h * 4))).size < 2) b.kitWarn(`kitRow at ${x}: front buildings all the same height (vary them, Marina)`);
      let cx = x;
      for (const p of [o.capL, ...pieces, o.capR]) {
        if (!p) continue;
        b.kitArt(p.key, cx, 0, p.h, { w: p.w, back: true, floors: p.floors, row: x });
        for (const [dx, y, w] of p.ledges || []) b.ledge(cx + dx, y, w);
        cx += p.w - LAP;
      }
      return cx + LAP;
    },
    // market stalls side by side, never fewer than 3 (Ladi 2026-10-22). stalls: [{ key, w, h, top }] (top = awning A can land on)
    kitStalls(x, stalls) {
      if (stalls.length < 3) b.kitWarn(`kitStalls at ${x}: only ${stalls.length} stalls (3 or more)`);
      let cx = x;
      for (const s of stalls) { b.kitArt(s.key, cx, 0, s.h, { w: s.w, back: true, stall: x }); if (s.top) b.ledge(cx + 0.1, s.top, s.w - 0.2); cx += s.w - 0.05; }
      return cx + 0.05;
    },
    // a climb: two solid walls facing each other, A wall-jumps up between them (Greenwich towers, Westminster piers).
    // o: { gap (between the walls, 1.4-2.2), hL, hR (wall heights), wL, wR (wall widths), keyL, keyR (pictures, drawn wall-height),
    //      special: true puts a special above the higher wall, prize visible from the bottom }
    kitClimb(x, o) {
      const gap = o.gap || 1.8, wL = o.wL || 2.2, wR = o.wR || 2.2, hL = o.hL || 8, hR = o.hR || 6;
      if (gap < 1.2 || gap > 2.6) b.kitWarn(`kitClimb at ${x}: gap ${gap} (keep 1.2-2.6 so the wall-jump reads)`);
      const xr = x + wL + gap;
      L.solids.push({ kind: 'block', x, y: 0, w: wL, h: hL, style: 'hidden' });
      L.solids.push({ kind: 'block', x: xr, y: 0, w: wR, h: hR, style: 'hidden' });
      if (o.keyL) b.kitArt(o.keyL, x, 0, hL, { w: wL, climb: x });
      if (o.keyR) b.kitArt(o.keyR, xr, 0, hR, { w: wR, climb: x });
      const top = Math.max(hL, hR);
      for (let i = 0, y = 1.4; y < top - 0.4; i++, y += 1.5) L.coins.push({ x: x + wL + (i % 2 ? gap - 0.55 : 0.15), y });   // zigzag between the walls
      if (o.special) b.special(hL >= hR ? x + wL / 2 : xr + wR / 2, top + 1.6);
      (L.kitClimbs = L.kitClimbs || []).push({ x, xr, gap, hL, hR });
      return xr + wR;
    },
    // a doorway A goes through: the doorway wipe plays here (drawKitDoor in play.html), and a backOnly wall stops him going back.
    // o: { inside: true going in, false coming out; key, w, h: the door picture; front: x where the door's far side is redrawn over A }
    kitDoor(x, o = {}) {
      (L.kitDoors = L.kitDoors || []).push({ x, inside: !!o.inside });
      L.solids.push({ kind: 'block', x: x + 0.3, y: 0, w: 0.2, h: 40, style: 'hidden', backOnly: true, noGrab: true });
      if (o.key) b.kitArt(o.key, x - (o.w || 2) / 2, 0, o.h || 3.2, { w: o.w, back: true, door: true });
      return x;
    },
    // where a backdrop changes: only at a door (or a cutaway); anything else is a visible switch (rule 8)
    kitSwap(x, to) {
      const near = (L.kitDoors || []).some(d => Math.abs(d.x - x) < 1.5);
      if (!near) b.kitWarn(`kitSwap at ${x}: backdrop change isn't at a door`);
      (L.kitSwaps = L.kitSwaps || []).push({ x, to });
    },
    /* ===== LEVEL KIT END ===== */
  };
  return b;
}

/* ---------- the three levels ---------- */
// tall tower sections, in units: lobby, one floor, crown body (the walkable roof is on top of the crown body)
const CW_TALL = {
  a: { W: 7.5, lobby: 520 * 7.5 / 465, floor: 520 * 7.5 / 441, crown: 518 * 7.5 / 470 },
  b: { W: 8, lobby: 555 * 8 / 608, floor: 555 * 8 / 578, crown: 429 * 8 / 613 },
};
// height of a moving platform at time t: wait at the bottom, ease up, wait at the top, ease down
// Old Dubai house fronts: size in units and their flat roofs [from, to, height]
const DX_HOUSE = {
  dx_h_tower1: { w: 5.656, h: 8.953, ledges: [[0.4, 1.0, 5.8], [1.15, 4.5, 8.95], [4.65, 5.3, 5.8]] },
  dx_h_small: { w: 5.75, h: 4.109, ledges: [[0.35, 5.55, 3.87]] },
  dx_h_arch: { w: 6.781, h: 3.344, ledges: [[0.25, 2.1, 2.42], [2.3, 4.5, 3.18], [4.75, 6.6, 2.42]] },
  dx_h_balcony: { w: 6.203, h: 6.719, ledges: [[0.45, 5.9, 6.47]] },
  dx_h_tower2: { w: 6.188, h: 10.438, ledges: [[0.75, 1.3, 9.77], [1.45, 4.8, 10.42], [4.95, 5.55, 9.78]] },
};
// left end of a boat (or any slider) at time t: wait at x0, ease across to x1, wait, ease back
function moverX(m, t) {
  const T = m.d0 + m.up + m.d1 + m.up, e = k => 0.5 - 0.5 * Math.cos(Math.PI * k);
  let s = ((t + m.ph) % T + T) % T;
  if (s < m.d0) return m.x0; s -= m.d0;
  if (s < m.up) return m.x0 + (m.x1 - m.x0) * e(s / m.up); s -= m.up;
  if (s < m.d1) return m.x1; s -= m.d1;
  return m.x1 - (m.x1 - m.x0) * e(s / m.up);
}
function mistOn(m, t) { return ((t + m.ph) % (m.on + m.off)) < m.on; }
function moverY(m, t) {
  if (m.trig) {   // a lift that waits until A steps in, then makes one trip (m.trigT: when it set off, from the game being stepped)
    const s = m.trigT === undefined ? 0 : Math.min(1, Math.max(0, (t - m.trigT) / m.up)), e = 0.5 - 0.5 * Math.cos(Math.PI * s);
    return m.y0 + (m.y1 - m.y0) * e;
  }
  const T = m.d0 + m.up + m.d1 + m.up, e = k => 0.5 - 0.5 * Math.cos(Math.PI * k);
  let s = ((t + m.ph) % T + T) % T;
  if (s < m.d0) return m.y0; s -= m.d0;
  if (s < m.up) return m.y0 + (m.y1 - m.y0) * e(s / m.up); s -= m.up;
  if (s < m.d1) return m.y1; s -= m.d1;
  return m.y1 - (m.y1 - m.y0) * e(s / m.up);
}

const ALL_LEVELS = [
{
  // the practice street: a short, easy run along the new riverside to learn the moves (every child gets it, even before joining)
  id: 'practice', name: 'Practice street', plate: 'Practice', area: 'woolwich', practice: true,
  build(b) {
    const L = b.L;
    L.killY = -15; L.startX = 249;
    b.zone(-10, 'new');
    b.ground(236.24, 486);
    L.noFg = true;                          // (no half-cut foreground props along the bottom edge)
    // hop: small things need no tap
    b.planter(252);
    // tap to jump, then two more to practise, in front of the riverside block (it hides where the square's picture ends)
    b.tower(258, 3);
    b.planterTall(261.5);
    b.coins(261.7, 3.2, 2, 0.8);
    b.planterTall(267);
    b.cwSolid('cw_sq_bin', 272.3, 0.97, 1.6);
    b.cwSolid('cw_sq_bin', 282, 0.97, 1.6);
    // hold to jump higher: the first floor of a smaller block, then swipe down to drop back to the street
    b.tower(286, 1, true);                  // (no canopy or balcony ledges: swipe down lands on the street)
    b.coins(287, 4.6, 6, 1.4);
    b.special(290.4, 5.2);                  // 1: on the first floor
    b.special(300.0, 0.9);                  // 2: under the end of the floor, for a child who drops down
    b.coins(297.2, 0.9, 2, 1.2);
    b.planterTall(305.5);
    b.coins(305.7, 3.2, 2, 0.8);
    // land on a pigeon, then another, then dodge a fox
    b.pigeon(318);
    b.coins(317.6, 2.6, 2, 0.8);
    b.pigeon(325);
    b.fox(332, 327, 337);
    b.planter(339);
    b.special(340.6, 3.6);                  // 3: jump from the planter
    // more to jump: planters and a bin
    b.lamp(347);
    b.planterTall(351);
    b.coins(351.2, 3.2, 2, 0.8);
    b.cwSolid('cw_sq_bin', 357.5, 0.97, 1.6);
    b.planterTall(363);
    b.special(363.8, 4.9);                  // 4: high over the tall planter
    b.planterTall(370);
    // climb the ledges
    b.dialArch(378);
    b.coins(378.6, 3.3, 5, 1.0); b.coins(380, 5.1, 2, 2.0);
    b.special(386.3, 7.0);                  // 5: over the archway
    b.coins(383.5, 0.9, 6);
    b.planter(399);
    b.cwSolid('cw_sq_bin', 405.5, 0.97, 1.6);
    b.pigeon(411);
    b.planter(416.5);
    b.flag(425);
    b.L.scooterEnd = 429.5;
    b.wall(484, 4, 22);                     // (far past where the scooter ride ends, so it never shows)
    b.end(486);
    // tips: pause ones stop the game until the child taps; y: only when A is at least that high
    L.tips = [
      { x: 249.5, until: 252, text: 'Small things? You hop them' },
      { x: 255.5, until: 261.5, text: 'Tap to jump', pause: true },
      { x: 276.5, until: 286, text: 'Hold to jump higher', pause: true },
      { x: 292.5, until: 299.5, text: 'Swipe down to drop', y: 3, pause: true },
      { x: 308, until: 318, text: 'Land on the pigeon', pause: true },
      { x: 357.8, until: 363, text: 'Hold for the high coin' },
      { x: 371.5, until: 378, text: 'Climb up for the last coin', pause: true },
      { x: 417.5, until: 424.5, text: 'Jump high at the flag', pause: true },
    ];
  },
},
{
  id: 'woolwich', name: 'Woolwich', area: 'woolwich',
  build(b) {
    b.L.killY = -15;
    b.zone(-10, 'old'); b.zone(156, 'station'); b.zone(236.3, 'new');
    b.wall(-4, 4, 22);
    // old Woolwich: estates
    b.ground(0, 58);
    b.lamp(3);
    b.binStore(8);
    b.coins(8.4, 2.4, 3);
    b.estate(15, 1);
    b.coins(16.5, 4.7, 5, 1.2); b.coins(19, 8.9, 6, 1.2);
    b.gull(23.5, 8.34, 1.4);              // a gull on the estate roof
    b.fox(36, 31, 39);
    b.arc(35.6, 1.4, 5, 3.4, 2.2);
    b.terrace(40);                         // Ladi's row of five houses (the middle one has the brown door)
    b.coins(41.2, 4.3, 3, 1.2); b.coins(47.6, 4.3, 3, 1.2); b.coins(43, 6.5, 5, 1.2);
    b.special(51.5, 7.4);                  // on top of the houses' roof
    b.arc(56.2, 1.4, 4, 4.4, 2.4);       // jump the gap
    b.ground(61.5, 158.6);
    b.fox(66, 62, 72);
    b.clothesBank(73);
    b.tree(76);
    // Powis Street
    b.powis(80);
    b.coins(80.6, 4.8, 3); b.coins(84.5, 4.8, 3); b.coins(92, 7.9, 6, 1.2); b.coins(104, 4.9, 4, 1.2); b.coins(110, 7.9, 6, 1.2);
    b.special(82, 8.7);                  // above the chicken shop roof
    b.fox(100, 95, 106);                 // a fox on Powis Street
    b.gull(104, 7.3, 2.0);               // and a gull on the shop roofs
    b.gull(113, 4.25, 1.4);              // and one on the shop signs
    b.seat(122.2);
    b.stalls(126);
    b.coins(126.6, 3.6, 9, 1.05);
    b.cwSolid('cw_sq_bin', 137.0, 0.97, 1.6);
    b.busStop(139); b.bus(133);
    b.coins(139.6, 3.2, 4);
    b.pigeon(144);
    // into the station
    b.station(146);
    b.cwSolid('cw_st_gatel', 152.0, 0.69, 1.37); b.cwSolid('cw_st_gater', 153.4, 0.72, 1.37);   // ticket gates in the hall
    b.coins(149, 0.9, 7);
    b.escalator(158.6, 0, 166.84, -7);
    b.coins(159.5, -0.2, 6, 1.2, -1.02);
    b.groundAt(166.84, 228, -7);
    b.ceiling(167.5, 227.5, -0.8);
    b.train(178, 3, -7);
    b.coins(168, -6.1, 8);
    b.coins(181, -3.5, 10, 1.6);
    b.special(201, -2.2);                // on top of the train
    b.pigeon(172, -7);                   // (no pigeon by the up escalator: Ladi)
    b.cwSolid('cw_st_pillar', 186.0, 0.82, 2.18, 0, -7);   // a wayfinding totem: jump it
    b.cwSolid('cw_st_ext', 212.0, 0.88, 1.45, 0, -7);
    b.coins(214, -6.1, 10);
    b.escalator(228, -7, 236.24, 0);
    b.coins(229.2, -5.9, 6, 1.2, 1.02);
    // new Woolwich
    b.ground(236.24, 300);
    b.lamp(240);
    b.planterTall(244);
    b.coins(244.3, 3.0, 2);
    b.planter(251);
    b.tower(258, 3);
    b.coins(259, 4.4, 6, 1.4); b.coins(260.6, 5.0, 4); b.coins(267, 5.0, 4); b.coins(260.6, 8.6, 4); b.coins(267, 8.6, 4); b.coins(260, 15.9, 10, 1.4);
    b.special(266.2, 16.6);              // top of the new tower
    b.fox(271, 266, 277);
    b.planter(279);
    b.lamp(286);
    b.cwSolid('cw_sq_bin', 288.6, 0.97, 1.6);
    b.pigeon(292);
    b.arc(299.2, 1.4, 4, 4.4, 2.6);
    b.ground(304, 368);
    b.lamp(309);
    b.planterTall(313);
    b.dialArch(318);
    b.coins(318.6, 3.3, 5, 1.0); b.coins(325, 6.6, 3); b.coins(320, 8.3, 4); b.coins(329.5, 8.3, 4);
    b.special(326.3, 10.4);              // above Dial Arch
    b.coins(323.5, 0.9, 6);              // or run through the arch
    b.flag(345);
    b.L.scooterEnd = 349.5;              // after the flag A rides off on an e-scooter
    b.wall(366, 4, 22);
    b.end(368);
  },
},
{
  id: 'brixton', name: 'Brixton', area: 'brixton',
  build(b) {
    const L = b.L;
    L.killY = -8; L.startX = 5; L.scooterPark = 2.6;     // A arrives home on his e-scooter
    b.hidden(-18, 2, 24);
    // 1. Home street: a terrace of houses, A's house in the middle of the row
    b.groundTop(-18, 52.8, 0, 'bxpave');
    const HW = 400 / (717 / 7.25), R0 = 1.6 - 3 * HW, NH = 15, R1 = R0 + NH * HW;
    L.bxRow = { x0: R0, n: NH, w: HW, i61: 3 };
    for (let i = 0; i < NH; i++) { const x = R0 + i * HW; b.ledge(x + 0.45, 3.22, 2.13); b.ledge(x + 2.71, 2.99, 1.22); }
    b.ledge(R0 + 0.35, 6.35, R1 - R0 - 0.7);              // along the roof ridges
    b.gull(37.5, 6.35, 1.6);                              // a gull on the rooftops
    b.coins(7, 0.9, 4, 1.0);
    b.bxSolid('bx_bins', 9.5, 1.96, 1.16);
    b.bxSolid('bx_car1', 14, 3.53, 1.45, { ah: 1.62 });
    b.coins(14.4, 2.4, 3, 1.1);
    b.coins(15.8, 4.2, 4, 1.0); b.coins(4, 7.3, 30, 1.45);
    b.fox(22, 19.4, 26.4);
    b.bxSolid('bx_car2', 27, 3.88, 1.5, { ah: 1.57 });
    b.coins(27.5, 2.4, 3, 1.1);
    b.bxSolid('bx_wall', 34, 3.16, 0.86, { ah: 0.89 });
    b.arc(33.6, 1.4, 4, 3.8, 1.4);
    b.bxSolid('bx_van', 41.5, 3.73, 1.72, { ah: 1.75 });
    b.coins(41.9, 2.6, 3, 1.1);
    b.bxSolid('bx_bins', 47.5, 1.96, 1.16);
    // 2. the park opposite: swings, slide and climbing frame
    b.groundTop(52.8, 106, 0, 'bxgrass');
    L.bxPark = { x0: 53.5, x1: 104.5, play0: 58, play1: 88 };
    b.fox(56.5, 53.6, 59.4);
    b.coins(56, 0.9, 4, 1.0);
    // the swing: run onto the seat and it flings A up
    L.bxSwing = { x: 59.8 };
    b.bxSolid('bx_seat', 62.4, 1.3, 0.3, { y0: 0.42, bounce: 4.6, swing: true });
    b.arc(62.6, 2.0, 7, 7.0, 4.6);
    // the slide: up the ladder, onto the platform, whoosh down the chute
    const SL = 70;
    b.bxProp('bx_slide', SL, 0, 5.46);
    b.slope(SL + 0.17, 0, SL + 1.0, 2.73); b.ledge(SL + 0.85, 2.73, 1.6); b.slope(SL + 2.45, 2.73, SL + 5.35, 0.8);
    b.coins(SL + 0.5, 1.5, 2, 0.5, 1.0); b.coins(SL + 2.8, 3.1, 5, 0.65, -0.48);
    // the climbing frame: two decks and the little roof; a special on top
    const CF = 80;
    b.bxProp('bx_climb', CF, 0, 5.12);
    b.L.solids.push({ kind: 'block', x: CF + 0.19, y: 0, w: 2.3, h: 2.18, style: 'hidden', edge: true });   // the rope nets under the low deck: climb over
    b.ledge(CF + 2.54, 2.38, 2.0); b.ledge(CF + 3.05, 4.6, 1.1);
    b.coins(CF + 0.5, 2.9, 3, 0.9); b.coins(CF + 2.9, 3.1, 2, 0.9);
    b.special(CF + 3.6, 6.4);
    b.fox(91, 87.5, 97);
    b.coins(89, 0.9, 6, 1.2);
    b.pigeon(101);
    // 3. Brixton Hill: the windmill in its garden, a bus stop and a parked bus
    b.groundTop(106, 160, 0, 'bxpave');
    const MILL = 110.5;
    L.bxMill = { x: MILL };
    b.bxSolid('bx_wall', 107.2, 3.16, 0.86, { ah: 0.89 });
    b.ledge(MILL + 0.47, 3.9, 6.28);                       // the gallery
    b.coins(MILL + 0.8, 4.7, 5, 1.2);
    b.special(MILL + 3.6, 6.3);
    b.coins(119, 0.9, 6, 1.1);
    b.pigeon(124);
    b.bxProp('ww_shelter', 128, 0, 2.41); b.ledge(128.15, 2.4, 3.9);
    b.coins(128.5, 3.2, 3, 1.1);
    b.car('bus', 133.5);                                   // 133.5 to 144.7, roof 4.3
    b.coins(134.5, 5.1, 9, 1.2);
    b.fox(152, 147.5, 157.5);
    b.coins(147, 0.9, 5, 1.2);
    // 4. the Town Hall, the square and the Glitzy
    b.groundTop(160, 222, 0, 'bxpave');
    const TH = 158.5;
    b.bxProp('bx_townhall', TH, 0, 13.67);
    b.ledge(TH + 8.3, 3.67, 4.5); b.ledge(TH + 3.3, 6.63, 15.9);
    b.bxSolid('bx_bins', 163, 1.96, 1.16);
    b.coins(TH + 8.6, 4.4, 4, 1.0); b.coins(TH + 4, 7.4, 12, 1.2);
    b.pigeon(172.5);
    b.bxProp('bx_sqtree', 178.6, 0, 4.79);
    b.bxSolid('bx_seatwall', 180.4, 4.31, 0.77);
    b.coins(180.8, 1.6, 4, 1.0);
    b.bxProp('bx_library', 184.6, 0, 6.07); b.ledge(185.0, 3.5, 6.5);
    b.coins(185.6, 4.3, 5, 1.1);
    b.bxProp('bx_bca', 192.2, 0, 5.59);
    b.fox(196.5, 192.5, 199);
    const RZ = 200.4;
    b.bxProp('bx_ritzy', RZ, 0, 9.15);
    b.ledge(RZ + 3.55, 2.96, 10.75); b.ledge(RZ + 0.3, 6.9, 4.4); b.ledge(RZ + 5.4, 6.46, 7.0); b.ledge(RZ + 13.0, 6.9, 4.4);
    b.coins(RZ + 3.9, 3.8, 7, 1.3); b.coins(RZ + 6, 7.3, 5, 1.2);
    b.special(RZ + 8.9, 8.9);                               // between the gables
    b.pigeon(220);
    // 5. Brixton Village (covered market), then Electric Avenue
    b.groundTop(222, 300, 0, 'bxmarket');
    const BV = 223, BVW = 23.1;
    L.bxVillage = { x0: BV, x1: BV + BVW };
    b.L.solids.push({ kind: 'block', x: BV + 0.6, y: 5.3, w: BVW - 1.2, h: 0.42, style: 'hidden' });   // glass roof keeps A inside
    b.gull(BV + 12, 5.72, 3);                             // a gull on the glass roof
    b.fox(BV + 13.5, BV + 10.5, BV + 15.8);               // a fox under the stalls
    [['bx_st_veg', 4.67], ['bx_st_spice', 4.51], ['bx_st_jerk', 4.49]].reduce((x, [k, w]) => { b.bxProp(k, x, 0, 2.83, { front: true }); b.ledge(x + 0.3, 2.83, w - 0.6); return x + w + 0.1; }, BV + 1.6);
    b.coins(BV + 2.2, 3.6, 12, 1.1);
    b.coins(BV + 16.6, 0.9, 5, 1.1);
    const EA = 247;
    L.bxEA = { x0: EA, n: 4, w: 10.7 };
    for (let i = 0; i < 12; i++) b.ledge(EA + i * 3.567 + 0.3, 3.74, 2.97);
    b.ledge(EA + 0.1, 6.2, 4 * 10.7 - 0.2);
    const stalls = (x) => [['bx_st_fabric', 3.04], ['bx_st_fruit', 3.25], ['bx_st_phones', 3.19]].reduce((xx, [k, w]) => { b.bxProp(k, xx, 0, 2.73, { front: true }); b.ledge(xx + 0.25, 2.72, w - 0.5); return xx + w; }, x);
    b.fox(248.2, 246.3, 249.8);
    stalls(250);
    b.coins(250.4, 3.5, 8, 1.1);
    const SG = 258.5;
    b.bxProp('bx_easign', SG, 0, 4.62);
    b.ledge(SG + 2.6, 4.45, 11.0);
    b.coins(SG + 3, 5.2, 9, 1.2);
    b.special(SG + 8.1, 6.7);                               // on the Electric Avenue sign
    b.gull(SG + 11.5, 4.45, 1.2);                          // a gull on the sign
    b.gull(266.5, 3.74, 1.2); b.gull(271, 6.2, 2.0);      // and on the shop awnings and roofs
    b.pigeon(262);
    b.fox(273, 271, 277.5);
    stalls(278);
    b.coins(278.4, 3.5, 8, 1.1);
    b.bxProp('ww_shelter', 289.8, 0, 2.41); b.ledge(289.95, 2.4, 3.9);
    b.coins(290.3, 3.2, 3, 1.1);
    // 6. Brixton Road: bus roof, the railway bridge, Monkeys
    b.groundTop(300, 363.5, 0, 'bxpave');
    b.car('bus', 295.3);                                   // to 306.5, roof 4.3
    b.coins(296, 5.1, 8, 1.2);
    const BR = 306;
    L.bxBridge = { x: BR };
    b.L.solids.push({ kind: 'block', x: BR, y: 4.48, w: 31.6, h: 2.05, style: 'hidden', edge: true });   // the iron girder; its top is the track bed
    b.coins(BR + 3, 7.3, 18, 1.4);
    b.special(BR + 15.8, 8.7);                             // on top of the bridge
    b.gull(BR + 21, 6.53, 2.0); b.gull(BR + 29.3, 6.53, 0.8);                           // a gull on the track bed
    b.pigeon(BR + 9); b.bxSolid('bx_bins', BR + 16, 1.96, 1.16);
    b.fox(BR + 24, BR + 20, BR + 29);
    b.coins(BR + 4, 0.9, 5, 1.2); b.coins(BR + 18, 0.9, 5, 1.2);
    const MO = 341.5, MW = [8.35, 8.6, 9.17], DOOR = MO + MW[0] + MW[1] + 4.58;
    L.bxMorleys = { x: MO, W: MW, door: DOOR };
    b.ledge(MO + 0.3, 3.22, DOOR - MO - 1.0);              // the fascia sign over the shop windows
    b.ledge(MO + 0.3, 5.25, MW[0] + MW[1] - 0.6);          // the first-floor cornice
    b.ledge(MO + 0.3, 8.4, MW[0] + MW[1] - 0.6);           // the roof
    b.coins(MO + 1, 4.0, 10, 1.4); b.coins(MO + 2, 6.0, 8, 1.6);
    b.fox(MO - 1.5, BR + 32, MO + 4.5);
    b.bxSolid('bx_bins', MO + 6.5, 1.96, 1.16);
    b.pigeon(MO + 13);
    // 7. Monkeys toy floor: a cut-away of the shop, two floors, the escalator between them
    const X0 = DOOR, X1 = X0 + 63.6, UP = 3.1;
    b.groundTop(363.5, X1, 0, 'bxfloor'); b.groundTop(X1, X1 + 40, 0, 'bxpave');
    L.bxShop = { x0: X0, x1: X1, up: UP, ua: X0 + 30, ub: X0 + 52, top: 10 };
    b.L.solids.push({ kind: 'block', x: X0 - 0.4, y: 10, w: X1 - X0 + 0.8, h: 40, style: 'hidden' });
    b.bxSolid('bx_shelf2', X0 + 3, 2.6, 3.57, { ah: 3.76 });
    b.bxSolid('bx_shelf', X0 + 5.8, 3.26, 4.87, { ah: 5.07 });
    b.coins(X0 + 3.3, 4.3, 2, 1.0); b.coins(X0 + 6.1, 5.6, 3, 1.1);
    b.arc(X0 + 9.4, 4.4, 5, 3.4, 1.2);
    b.bxSolid('bx_table', X0 + 12, 2.54, 2.3, { ah: 2.53 });
    b.bxSolid('bx_ted1', X0 + 16, 2.13, 2.6, { ah: 2.79, bounce: 3.6 });
    b.coins(X0 + 16.6, 5.0, 3, 0.8, 1.2);
    b.bxSolid('bx_boxes', X0 + 20.6, 2.03, 2.78, { ah: 2.8 });
    b.coins(X0 + 13, 3.2, 3, 1.0);
    b.bxProp('bx_esc', X0 + 24.4, 0, 4.09);
    b.slope(X0 + 25.6, 0, X0 + 30, UP); b.ledge(X0 + 30, UP, 22);
    b.coins(X0 + 26, 1.2, 4, 1.1, 0.75);
    b.bxSolid('bx_shelf2', X0 + 34, 2.6, 3.57, { ah: 3.76, y0: UP });
    b.coins(X0 + 34.3, UP + 4.3, 2, 1.0);
    b.bxSolid('bx_ted2', X0 + 40, 3.02, 3.6, { ah: 3.86, y0: UP, bounce: 2.4 });
    b.coins(X0 + 40.4, UP + 4.6, 3, 1.0);
    b.bxSolid('bx_toypile', X0 + 46, 5.42, 2.3, { ah: 3.12, y0: UP, bounce: 2.6 });
    b.coins(X0 + 46.5, UP + 3.4, 4, 1.2);
    b.bxSolid('bx_till', X0 + 36, 2.85, 2.0, { ah: 2.42 });     // downstairs, under the upper floor
    b.bxSolid('bx_table', X0 + 45, 2.54, 2.3, { ah: 2.53 });
    b.coins(X0 + 52.5, 2.0, 4, 1.0, -0.4);
    b.bxSolid('bx_toypile', X0 + 54.2, 5.42, 1.6, { ah: 3.12, bounce: 3.0, flip: true });
    b.coins(X0 + 54.8, 4.4, 4, 1.2);
    b.flag(X0 + 60.5);
    L.busEnd = X1 + 1.6;                                   // out through the doors and onto a red bus
    b.end(X1 + 30);
    b.hidden(X1 + 30, 4, 24);
  },
},
{
  id: 'greenwich', name: 'Greenwich', area: 'greenwich',
  build(b) {
    b.wall(-4, 4, 22);
    b.ground(0, 50);
    b.lamp(4); b.tree(9);
    b.coins(6, 0.9, 5);
    b.bench(13);
    b.coins(16, 0.9, 3);
    b.block(21, 4, 1.6);                 // tap up
    b.coins(21.6, 2.4, 4);
    b.planterTall(28);                         // hold up
    b.arc(26.6, 2.6, 5, 4, 1.6);
    b.lamp(33);
    b.pigeon(37); b.pigeon(43);
    b.arc(48.6, 1.4, 5, 5.5, 2.4);       // over the first gap
    b.ground(53.5, 139);
    b.pavilion(57);
    b.coins(58, 3.6, 5);
    b.special(60.6, 7.6);                // jump from the shelter roof
    // market stalls, three side by side, stepping up
    b.awning(65, 3.0, 3); b.awning(68.3, 3.8, 3); b.awning(71.6, 4.6, 3);
    b.coins(65.7, 3.8, 2); b.coins(69, 4.6, 2); b.coins(72.3, 5.4, 2);
    b.plank(76, 6.2, 4);
    b.coins(76.5, 7.0, 4);
    b.tree(80, true);
    b.block(88, 6, 2.4);
    b.pigeon(91, 2.4);
    b.coins(88.6, 3.2, 5);
    b.block(95.5, 3, 1.2);              // little step: auto-vault
    // first wall-jump: bridge pier overhead, tall wall ahead
    b.gwTowers(105.4, 108.9);            // tall tower left, short tower right: wall-jump the gap
    b.coins(107.15, 3.2, 4, 0, 1.5);
    b.special(107.15, 9.5);
    b.coins(109.8, 8.9, 4);
    b.gwShop(117);                       // shop + flats, 117 to 132.4
    b.coins(119, 12.8, 9, 1.2);                       // along the roof
    b.coins(118.5, 4.3, 7, 1.2);                      // along the shop canopy
    b.coins(128.2, 4.8, 1); b.coins(128.7, 6.1, 1); b.coins(129.2, 7.4, 1);   // up the balconies
    b.bridge(137, 10, 2.4);              // stairs up, over the river, stairs down
    b.coins(137.6, 3.3, 9);
    b.gull(141.5, 2.7, 2.0);             // a gull on the bridge
    b.L.killY = -16;
    b.L.startX = 5; b.L.scooterPark = 2.6;   // A arrives on his e-scooter and hops off here
    b.ground(145, 278.6);
    b.lamp(151);
    b.fox(155, 149, 162);
    b.market(160);
    b.planterTall(172.3);
    b.gull(177.4, 3.9, 1.2);             // a gull on the shop canopies
    b.gull(183.5, 8.6, 1.8);             // a gull on the market roofs
    b.planterTall(197.0);                       // 160-169.4 new shops, 169.4-190.2 old four + arch, 190.2-199.8 new shops
    b.coins(160.7, 4.2, 3); b.coins(164.83, 5.4, 3);   // coffee canopy, book shop window boxes
    b.coins(169.29, 3.5, 3);              // along the tan awning
    b.coins(172.9, 4.2, 3);                // window boxes
    b.arc(176.68, 6.4, 4, 3.4, 0.8);        // over the arch
    b.coins(181.4, 8.3, 7);                // rooftops
    b.coins(176.38, 0.9, 4);              // or run under the arch
    b.special(186.85, 9.6);               // above the barber's roof
    b.coins(188.85, 4.2, 3); b.coins(192.91, 8.5, 3);   // bakery canopy, vintage roof
    // Cutty Sark Gardens: fountain to hop, kiosk roof to stand on
    b.square(203.4);
    b.arc(209.2, 1.6, 5, 5.4, 1.6);      // over the fountain
    b.coins(221.1, 3.7, 3);
    b.planterTall(217.3);
    // Cutty Sark: up the glass canopy, along the deck, off the end of the bowsprit
    b.cutty(224);
    b.arc(226.4, 1.4, 4, 3.0, 3.0);
    b.coins(231, 4.6, 6, 1.4);
    b.pigeon(240, 5.56);
    b.coins(242, 6.4, 8, 1.4);
    b.coins(268, 6.5, 4, 1.4, 0.45);    // up the bowsprit
    b.special(276.4, 10.8);              // leap off the bowsprit
    b.fox(248, 241, 258);
    b.gull(248, 5.86, 2.0);              // gulls on the Cutty Sark's decks
    b.gull(259, 4.08, 1.5);
    b.coins(248, 0.9, 6, 1.6);           // or run under the canopy
    // Greenwich Foot Tunnel
    b.footTunnel(278.6, 322.6);
    b.coins(279.9, -3, 3, 0.9, -2);     // down the shaft
    b.coins(285, -9.1, 6, 1.2);
    b.pigeon(296, -10);
    b.arc(293.6, -8.6, 5, 4.8, 2.0);
    b.coins(301, -9.1, 6, 1.2);
    b.pigeon(310, -10);
    b.fox(288, 284.5, 292, -10);         // a fox in the foot tunnel
    b.arc(307.6, -8.6, 5, 4.8, 2.0);
    b.coins(320, -6.1, 1); b.coins(320.6, -3.1, 1); b.coins(321.2, -0.1, 1);   // up the landings
    b.ground(322.6, 416.6);
    b.block(338.6, 4, 1.5);
    b.block(342.6, 4, 3.0);
    b.block(346.6, 4, 4.5);
    b.coins(339.1, 2.3, 3); b.coins(343.1, 3.8, 3); b.coins(347.1, 5.3, 3);
    b.fox(356.6, 352.6, 366.6);
    b.lamp(369.6);
    // second wall-jump: special coin up the chimney
    b.slab(372.6, 3, 2.5, 11.5);
    b.wall(379.1, 4, 7.2);
    b.coins(377.35, 3.2, 3, 0, 1.6);
    b.special(377.35, 9.9);
    b.coins(379.6, 8.0, 3);
    b.pub(385.6);
    b.arc(387.1, 1.4, 4, 4.5, 2.6);
    b.coins(390.2, 4.2, 3);
    b.coins(387.6, 8.0, 8);
    b.flag(404.6);
    b.L.boatEnd = 416.6;                 // after the flag A hops onto the river bus to Tower Bridge
    b.end(424.6);
  },
},
{
  id: 'towerbridge', name: 'Tower Bridge', area: 'towerbridge',
  build(b) {
    const L = b.L;
    L.killY = -6; L.startX = 2.2; L.camMin = -9; L.boatStart = -8.2;   // A arrives on the river bus and hops onto the pier
    b.zone(-20, 'river'); b.zone(214, 'city');
    b.hidden(-12, 2, 22);
    // 1. Butler's Wharf and Shad Thames
    b.groundTop(0, 65, 0, 'cobble');
    b.coins(3.6, 0.9, 3);
    b.warehouse(7, 2, 3);                   // 7 to 14
    b.coins(7.6, 4.1, 5, 1.2); b.coins(8, 7.4, 4, 1.4);
    b.footbridge(14, 6.6, 's');             // 14 to 20.44
    b.coins(15, 7.4, 5, 1.1);
    b.pigeon(17);
    b.warehouse(20.44, 3, 4);               // 20.44 to 30.94
    b.coins(21.6, 10.7, 6, 1.4); b.coins(26, 4.1, 4, 1.2);
    b.footbridge(30.94, 13.2, 'm');         // highest walkway, 30.94 to 41.52
    b.coins(31.8, 14.0, 3, 1.2); b.coins(38.4, 14.0, 3, 1.2);
    b.special(36.2, 14.8);
    b.coins(32, 0.9, 6, 1.4);               // or stay down on the cobbles
    b.warehouse(41.52, 2, 3);               // 41.52 to 48.52
    b.pigeon(45);
    b.footbridge(48.52, 6.6, 'l');          // 48.52 to 63.28, over the bridge stairs
    b.coins(50, 7.4, 8, 1.5);
    // 2. Tower Bridge
    b.tbStairs(60, 5);                      // up to the road at 4
    b.groundTop(65, 85.24, 4, 'deck');
    b.car('cab', 66.4, 4);                  // hop the cab, then jump for the chain
    b.coins(66.8, 6.4, 3, 1.2);
    b.chain(64.5, 5.4, 78, 14.6);
    b.coins(70.5, 9.5, 5, 1.4, 0.95);       // up the chain
    b.tbTower(78);                          // 78 to 85.24
    b.tbTower(101.54);                      // 101.54 to 108.78
    b.bascules(85.24, 101.54, 8, 4, 76);
    b.arc(90.4, 9.6, 4, 6.4, 1.6);          // over the gap
    b.walkway(78, 108.78, 14.6, 85.24, 101.54);
    b.coins(86.4, 15.4, 4, 1.4); b.coins(96, 15.4, 4, 1.4);
    b.special(93.4, 15.9);                  // glass walkway, over the open gap
    b.chain(108.78, 14.6, 122.3, 5.4);
    b.groundTop(101.54, 126, 4, 'deck');
    b.coins(110, 4.9, 6, 1.4);
    b.tbStairs(126, 5, true);
    // 3. Tower of London
    b.groundTop(126, 214, 0, 'castle');
    b.coins(131.6, 0.9, 3);
    b.moat(134, 4.9, 3.0);
    b.castleWall(138.9, 12, 3.0);           // 138.9 to 150.9
    b.coins(139.6, 3.9, 6, 1.5);
    b.raven(146.5, 3.0, false);
    b.gatehouse(152.6);                     // 152.6 to 159.4
    b.coins(152.9, 7.0, 2, 1.0); b.coins(154.9, 4.9, 3, 1.0); b.coins(157.7, 7.0, 2, 1.0);
    b.coins(154.6, 0.9, 4);                 // or through the gate
    b.raven(161.5);
    b.castleWall(164, 10, 3.0);             // 164 to 174
    b.coins(164.6, 3.9, 4, 1.4);
    b.turret(174);                          // 174 to 178, top 6.1
    b.special(176, 8.0);                    // top of the turret
    b.castleWall(178, 8, 3.0);              // 178 to 186
    b.coins(178.8, 3.9, 4, 1.4);
    b.raven(183, 3.0);
    b.coins(188, 0.9, 5, 1.2);
    b.raven(193); b.raven(199, 0, false);
    b.arc(203, 1.4, 5, 5, 2.0);
    // 4. City streets
    b.groundTop(214, 276, 0, 'pave');
    b.phoneTb(218.5);
    b.coins(218.6, 3.3, 1);
    b.car('cab', 224);
    b.car('bus', 229);                      // 229 to 240.2
    b.coins(224.4, 2.5, 3, 1.2); b.coins(230, 5.1, 8, 1.3);
    b.pigeon(244);
    b.office(242, 4);                       // 242 to 256.7
    b.coins(243, 7.4, 6, 1.4); b.coins(246, 10.7, 6, 1.4); b.coins(250, 14.0, 4, 1.2);
    b.special(254.6, 16.3);                 // above the pergola on the roof terrace
    b.coins(258, 0.9, 6, 1.4);
    b.pigeon(265);
    b.arc(268, 1.4, 4, 4.4, 2.2);
    // 5. Leadenhall Market
    b.groundTop(276, 352, 0, 'pave');
    const mEnd = b.leadenhall(277, 9);      // 277 to 350
    b.coins(285, 4.85, 4, 1.2); b.coins(291.6, 6.15, 1); b.coins(297.6, 7.9, 4, 1.2);
    b.coins(311, 4.85, 4, 1.2); b.coins(317.6, 6.15, 1); b.coins(324, 7.9, 4, 1.2);
    b.special(319.3, 8.9);                  // up among the roof lanterns
    b.coins(330, 0.9, 8, 1.3);
    b.pigeon(303); b.pigeon(336);
    // 6. St Paul's and the flag
    b.groundTop(352, 424, 0, 'pave');
    b.coins(355, 0.9, 5);
    b.block(366, 4, 1.5, 'tbstep'); b.block(370, 4, 3.0, 'tbstep');
    b.coins(366.5, 2.3, 3); b.coins(370.5, 3.8, 3);
    b.arc(374.6, 3.8, 4, 4.4, 1.2);
    b.pigeon(382);
    b.coins(384, 0.9, 6, 1.1);
    b.flag(394);
    L.busEnd = 399.4;                       // after the flag A hops on the back of a red bus
    b.hidden(422, 4, 22);
    b.end(424);
  },
},
{
  id: 'canarywharf', name: 'Canary Wharf', area: 'canarywharf',
  build(b) {
    const L = b.L;
    L.killY = -12; L.startX = -7.2; L.camMin = -11; L.busStart = -6.0;   // the red bus from Tower Bridge drops A off
    b.hidden(-14, 2, 24);
    // 1. Canada Square and Cabot Square
    b.groundTop(-14, 66, 0, 'cwpave');
    b.cwSolid('cw_sq_bench', 2.0, 3.41, 0.9);
    b.coins(-3, 0.9, 4); b.coins(2.6, 1.9, 3, 1.0);
    b.cwOffice(8);                          // 8 to 27.07
    b.cwSolid('cwt_ac', 19.4, 2.6, 1.45, 0, 4.5);   // air-con on the office roof
    b.coins(10.9, 4.8, 5, 1.2); b.coins(16.6, 3.1, 7, 1.2); b.coins(9, 5.4, 15, 1.2);
    b.pigeon(20);
    b.cwSolid('cw_sq_flowers', 26.6, 2.01, 1.5);   // hop the flower bed
    b.cwFountain(30);                       // 30 to 36
    b.arc(29.6, 1.6, 5, 6.8, 2.2);
    b.cwSolid('cw_sq_kiosk', 39, 3.83, 3.05, 3.05);
    b.coins(39.5, 3.9, 3, 1.2);
    b.cwTower(45, 3);                       // 45 to 59.18, roof cap at 12.38
    b.coins(46.8, 4.2, 9, 1.2); b.coins(47.4, 7.0, 8, 1.3); b.coins(46.8, 9.9, 9, 1.2);
    b.special(52.1, 13.6);                  // on the tower roof
    b.coins(47, 0.9, 10, 1.1);
    b.cwSolid('cw_sq_bin', 45.9, 0.97, 1.6);
    b.fox(61, 59.5, 64.5);
    // 2. The tower climb: ride the window cleaners' cradles up, cross the sky bridge, drop down the rooftops
    b.groundTop(66, 145, 0, 'cwpave');
    const T1 = b.cwTall(68.9, 'a', 0, 'pyr');                   // roof 16.65
    b.cwCradle(68.9, 0, T1.top + 0.03, 2.2, 1.0, 0.6);
    b.coins(65.4, 1.0, 3, 1.2); b.coins(66.7, 4, 5, 0, 2.6);      // up the first ride
    b.coins(69.6, T1.top + 0.9, 5, 1.3);
    b.cwSolid('cwt_ac', 71.6, 2.6, 1.45, 0, T1.top);           // a big air-con unit to hop on the first roof
    const bx = b.cwSkyBridge(T1.x1, T1.top, 1);                 // to 90.87
    b.arc(T1.x1 + 1.2, T1.top + 0.9, 7, 11.5, 3.2);
    b.special(T1.x1 + 7.2, T1.top + 4.6);                       // jump for it over the middle of the bridge
    b.gull(T1.x1 + 7.2, T1.top + 0.3, 2.6);                     // a gull hanging about on the bridge
    const T2 = b.cwTall(bx, 'b', 2, 'flat');                    // roof 28.26
    b.cwCradle(bx, T1.top, T2.top + 0.03, 1.8, 1.6, 0.8, 0.4);   // same 6s cycle as the first, timed so it's waiting when A gets there
    b.coins(bx - 2.2, T1.top + 3.4, 4, 0, 2.4);                // up the second ride
    b.coins(bx + 0.8, T2.top + 0.9, 6, 1.2);
    b.cwSolid('cwt_tank', bx + 2.5, 2.04, 2.4, 0, T2.top);     // water tank: a big jump
    const T3 = b.cwTall(T2.x1, 'b', 1, 'crane');                // roof 20.58
    b.cwSolid('cwt_ac', T3.x1 - 3.8, 2.6, 1.45, 0, T3.top);
    b.arc(T2.x1 - 0.6, T3.top + 1.0, 5, 3.6, 2.0); b.coins(T2.x1 + 3.4, T3.top + 2.4, 3, 1.0);
    const T4 = b.cwTall(T3.x1, 'b', 0, 'flat');                 // roof 12.9
    b.cwSolid('cwt_heli', T3.x1 + 0.4, 3.0, 0.62, 0, T4.top);
    b.cwSolid('cwt_ac', T3.x1 + 5.2, 2.6, 1.45, 0, T4.top);
    b.arc(T3.x1 - 0.6, T4.top + 1.0, 5, 3.4, 2.0); b.coins(T3.x1 + 2.6, T4.top + 1.6, 3, 1.0);
    const ox1 = b.cwOffice(116.5);                              // 116.5 to 135.57, roof 4.5
    b.arc(T4.x1 + 0.2, 5.4, 6, 5.5, 2.5); b.coins(122.5, 5.4, 9, 1.2);
    b.coins(ox1 + 1.2, 0.9, 8, 1.2);
    b.cwSolid('cw_sq_bin', 140.6, 0.97, 1.6);
    b.pigeon(144);
    // 3. DLR
    b.groundTop(145, 236.5, 0, 'cwpave');
    b.cwViaduct(150, 226.4);                // stairs 150-154.7 up to 4, down 221.7-226.3
    b.coins(151, 1.1, 4, 0.9, 0.85);
    b.cwDlr(160);                           // 160 to 181.1, roof 7.35
    b.coins(156.5, 4.9, 3); b.coins(161.6, 8.2, 14, 1.3);
    b.coins(161, 0.9, 12, 1.5);             // or run under the viaduct
    b.cwSolid('cw_sq_bin', 176.2, 0.97, 1.6); b.cwSolid('cw_sq_bin', 206.2, 0.97, 1.6);
    b.pigeon(172);
    b.cwCanopy(186);                        // 186 to 216.4
    b.coins(189, 8.8, 18, 1.4);
    b.special(201.2, 9.9);                  // on top of the station canopy
    b.coins(188, 4.9, 6, 1.6); b.coins(205, 4.9, 6, 1.6);
    b.fox(192, 187.5, 199, 4);              // a fox on the DLR platform
    b.gull(208.5, 8.25, 2.0);              // and a gull on the canopy roof
    b.cwSolid('cw_sq_bin', 229.4, 0.97, 1.6);
    b.pigeon(232);
    // 4. Crossrail Place roof garden
    b.cwLattice(236.5, 2);                  // 236.5 to 282.82, top at 7.81
    b.cwSolid('cwg_planter', 240.4, 2.72, 1.2);
    b.coins(238.4, 4.4, 4, 0.8, 0.9); b.coins(247, 8.6, 10, 1.4); b.coins(262.5, 8.6, 10, 1.4);
    b.special(259.65, 9.6);                 // up on the lattice roof
    b.coins(244, 1.7, 12, 1.6);
    b.cwSolid('cwg_planter', 268.5, 2.72, 1.2);
    b.fox(253, 248, 258, 0.86);             // a fox among the plants
    b.gull(252.5, 8.1, 1.5);               // a gull on the lattice roof
    // 5. The colourful footbridge, then the Elizabeth line
    const SH = 40;                           // the bridge pushes the station along
    b.groundTop(282, 299.6 + SH, 0, 'cwpave');
    const bx1 = b.cwBridge(286.5);           // 286.5 to 326.87, deck 2.3
    b.coins(287.5, 1.0, 5, 1.0, 0.38); b.coins(293.6, 3.1, 22, 1.3); b.coins(bx1 - 5.6, 2.8, 5, 1.0, -0.38);
    b.cwSolid('cw_sq_bin', 284.6, 0.97, 1.6);
    b.fox(306, 300, 313, 2.3);              // a fox in the tunnel
    b.cwSolid('cw_f_scoot', 328.0, 2.08, 1.4);   // a dropped e-scooter
    b.pigeon(334);
    b.cwStation(298 + SH, 424 + SH);        // escalator down to -7
    b.coins(300.6 + SH, -0.5, 13, 1.25, -0.52);
    b.cwSolid('cw_st_gatel', 357.0, 0.69, 1.37, 0, -7); b.cwSolid('cw_st_gater', 358.4, 0.72, 1.37, 0, -7);   // ticket gates
    b.cwSolid('cw_st_bench', 326 + SH, 2.59, 1.0, 0, -7);
    b.coins(326.4 + SH, -5.6, 3, 0.9);
    b.cwSolid('cw_st_pillar', 343.5 + SH, 0.82, 2.18, 0, -7);
    b.special(343.9 + SH, -2.3);            // up off the wayfinding pillar
    b.coins(334 + SH, -6.1, 8, 1.2); b.coins(346 + SH, -4.0, 5, 1.2);
    b.cwSolid('cw_st_bench', 360 + SH, 2.59, 1.0, 0, -7);
    b.cwSolid('cw_st_ext', 392.6, 0.88, 1.45, 0, -7); b.cwSolid('cw_st_bin', 412.2, 0.65, 1.37, 0, -7);
    b.arc(358.5 + SH, -5.6, 5, 5.4, 1.8);
    b.coins(368 + SH, -6.1, 10, 1.2);
    b.cwSolid('cw_st_bench', 380 + SH, 2.59, 1.0, 0, -7);
    b.coins(380.4 + SH, -5.6, 3, 0.9);
    b.flag(392 + SH); L.flagY = -7;
    L.trainEnd = 398.6 + SH;                // A steps through the open doors and the train pulls away
    b.hidden(424 + SH, 4, 24);
    b.end(424 + SH);
  },
},
{
  id: 'westend', name: 'West End', plate: 'West End', area: 'westend',
  build(b) {
    const L = b.L;
    // The West End at Christmas, drawn from Ladi's art (src/westend/cut.py; sizes in src/westend/pieces.json).
    // Bond Street Elizabeth line exit -> Oxford Street lights -> Elfridges (hall, toy shop, Santa's grotto, present chute)
    // -> Regent Street angels -> Carnaby Street -> Piccadilly Circus screens -> Covent Garden piazza + market hall -> Trafalgar Square ice slide -> tree lights.
    L.killY = -12; L.startX = 2.0; L.camMin = -6; L.snow = true;
    const art = (key, x, y, h, o = {}) => (L.weArt = L.weArt || []).push(Object.assign({ key, x, y, h }, o));   // a picture standing at (x, y), h units tall
    const solid = (x, w, h, y = 0, o = {}) => { L.solids.push(Object.assign({ kind: 'block', x, y, w, h, style: 'hidden' }, o)); };
    const ledge = (x, y, w) => b.ledge(x, y, w);
    const ground = (x0, x1, style, y = 0) => L.solids.push({ kind: 'ground', x: x0, y: y - 40, w: x1 - x0, h: 40, style });
    const drift = (x) => { art('we_drift', x, 0, 0.45); solid(x + 0.1, 0.67, 0.4); };                    // knee high: A hops it
    const driftL = (x) => { art('we_drift_long', x, 0, 0.5); solid(x + 0.15, 1.6, 0.45); };
    const snowman = (x) => { art('we_snowman', x, 0, 1.05); solid(x + 0.08, 0.52, 0.95); };                // needs a tap
    const bigman = (x) => { art('we_snowman_big', x, 0, 2.3); solid(x + 0.45, 0.75, 2.25); ledge(x + 0.4, 2.25, 0.85); };   // lean, then jump up onto his hat
    const bench = (x) => { art('we_bench', x, 0, 1.0); solid(x + 0.1, 1.55, 0.55); };
    const grit = (x) => { art('we_gritbin', x, 0, 0.85); solid(x + 0.05, 0.98, 0.8); };
    const xtree = (x) => { art('we_xtree', x, 0, 2.2, { back: true }); };
    const lamp = (x) => art('we_lamp', x, 0, 4.6, { back: true });
    // ---------- 1. Bond Street exit and Oxford Street ----------
    b.wall(-6.5, 1, 22);
    ground(-12, 72, 'wepave');
    art('we_stn', -5.0, 0, 4.6, { back: true }); art('we_stn_end', 4.25, 0, 4.6, { back: true });
    L.weStn = { x: -5.0 };
    L.outfit = 'win';   // the children wear their winter coat and scarf here (A has no winter pictures, so he keeps his clothes)
    // shop fronts wall to wall, tall upper floors above, piers between: x from 6 to 70
    L.weBus = 36.5; L.weCab = 52.0; L.weStreet = [['tb_c_post', 12.6, 1.6], ['tb_c_phone', 182.0, 2.6]];
    L.weRows = L.weRows || [];
    L.weRows.push({ kind: 'oxford', x0: 6.0, x1: 70.2 });
    const SHOPS = [];
    for (let x = 6.0, i = 0; x < 66; i++) { const k = i % 2 ? 'we_of_shop2' : 'we_of_shop1', w = i % 2 ? 4.991 : 5.109; SHOPS.push([k, x, w]); x += w + 0.81; }
    L.weShops = SHOPS;
    for (const [, x, w] of SHOPS) ledge(x + 0.35, 2.82, w - 0.7);   // the shop canopies
    // hanging lights across the street: snowflakes and stars, their top bars are ledges
    const flake = (x, y, star) => { art(star ? 'we_star' : 'we_flake', x, y, star ? 3.2 : 3.4, { hang: true }); ledge(x + 0.3, y + (star ? 3.05 : 3.25), (star ? 4.187 : 3.647) - 0.6); };
    L.weStrings = [[6, 70, 7.6], [171, 219, 7.7], [221, 261, 7.4], [308, 335, 7.8]];
    lamp(8.2); drift(10.5); b.coins(9.8, 1.2, 3, 0.8);
    snowman(15.2); b.coins(14.8, 2.2, 3, 0.7);
    flake(18.5, 3.4); b.coins(19.2, 7.4, 3, 0.9);
    b.pigeon(23.5);
    bench(27.0); b.coins(27.2, 1.6, 3, 0.7);
    flake(31.0, 3.6);                                         // (Ladi 2026-11-07: no big star; a snowflake instead)
    bigman(33.6); b.coins(33.7, 3.2, 2, 0.6);
    b.special(32.9, 8.0);                                     // 1: above the snowflake, from the snowman's hat
    lamp(38.0); grit(40.0);
    b.coins(42.0, 1.1, 4, 0.8);
    flake(45.0, 3.4); drift(46.0); b.coins(45.6, 7.4, 3, 0.9);
    b.pigeon(50.5);
    snowman(54.0); xtree(56.5);
    driftL(59.5); b.arc(58.8, 1.2, 5, 3.2, 1.3);
    lamp(63.5); bigman(65.5);
    // ---------- 2. Elfridges ----------
    const EF = 70.2;
    art('we_ef_endl', EF, 0, 4.4, { back: true }); art('we_ef_windows', EF + 2.0, 0, 4.4, { back: true });
    const ENT = EF + 19.5;                                    // the grand entrance with the yellow sign
    art('we_ef_entr', ENT, 0, 4.75, { back: true });
    L.weEf = { x0: EF, x1: ENT + 8.76, ent: ENT, sign: [ENT + 1.05, 4.05, 6.6, 0.66] };
    for (let x = EF + 2.6; x < EF + 19; x += 3.55) ledge(x, 3.55, 2.6);   // the yellow window canopies
    grit(EF + 3.2); b.coins(EF + 3.0, 4.6, 12, 1.2);
    bigman(EF + 9.0); b.pigeon(EF + 15.0);
    // inside: a cut-away box from IN to OUT, ground floor and first floor (toy shop + grotto), ceiling at 8.6
    const IN = ENT + 4.4, OUT = IN + 76, UP = 4.2, CEIL = 8.6;
    L.weInside = { x0: IN, x1: OUT, up: UP, ceil: CEIL };
    const BX = ENT + 8.6; L.weEf.box = BX;
    ground(72, BX, 'wepave'); ground(BX, OUT, 'wemarble');
    solid(IN, OUT - IN, 40, CEIL);                            // the ceiling (the roof is never reached)
    // ground floor hall: counters, giant baubles, escalator up to the first floor
    const counter = (x) => { art('we_eg_counter', x, 0, 1.45); solid(x + 0.15, 8.0, 1.38); ledge(x + 0.1, 1.42, 8.1); };   // too tall to vault: a tap
    counter(IN + 5.5); b.coins(IN + 6.1, 2.0, 6, 0.9);
    art('we_eg_bauble_r', IN + 12.0, CEIL - 2.5, 2.0, { hang: true }); art('we_eg_bauble_g', IN + 14.6, CEIL - 2.2, 2.0, { hang: true });
    const ESC = IN + 15.5;
    b.escalator(ESC + 0.9, 0, ESC + 10.3, UP);
    L.weEsc = { x: ESC, y: 0 };
    // first floor from the top of the escalator to the chute; the ground floor carries on underneath with counters
    L.oneways.push({ kind: 'ledge', x: ESC + 10.3, y: UP, w: OUT - 6 - ESC - 10.3 });
    L.weFloor = { x0: ESC + 10.3, x1: OUT - 6, y: UP };
    counter(ESC + 12.0); counter(ESC + 22.0); b.coins(ESC + 12.5, 2.0, 6, 0.9); b.coins(ESC + 22.5, 2.0, 6, 0.9);
    b.pigeon(ESC + 30.0); counter(ESC + 40.0); b.coins(ESC + 40.5, 2.0, 6, 0.9); b.pigeon(ESC + 50.0);
    // toy shop (first floor)
    const TS = ESC + 10.3;
    L.weToys = { x0: TS, x1: TS + 20 };
    const shelf = (x) => { art('we_ts_shelf', x, UP, 3.3); solid(x + 0.1, 1.5, 0.3, UP); ledge(x + 0.15, UP + 1.15, 1.4); ledge(x + 0.15, UP + 2.25, 1.4); ledge(x + 0.1, UP + 3.25, 1.5); };
    art('we_ts_gifts3', TS + 1.5, UP, 1.3); solid(TS + 1.55, 0.58, 1.25, UP);
    art('we_ts_track', TS + 3.4, UP, 0.7); art('we_ts_track', TS + 4.95, UP, 0.7); art('we_ts_track', TS + 6.5, UP, 0.7); solid(TS + 3.5, 4.5, 0.65, UP);
    // the toy train runs to and fro along its table: ride it to the top shelf
    L.movers = L.movers || [];
    const train = { kind: 'wetrain', mover: true, ax: 'x', x: TS + 3.5, x0: TS + 3.5, x1: TS + 6.0, off: 0, w: 2.0, y: UP + 0.65, up: 1.6, d0: 0.5, d1: 0.5, ph: 0 };
    L.weTrain = train;
    L.oneways.push(train); L.movers.push(train);
    shelf(TS + 8.4); b.special(TS + 9.2, UP + 4.2);          // 2: on top of the toy shelf
    b.coins(TS + 3.8, UP + 1.6, 3, 0.8);
    art('we_ts_horse', TS + 10.5, UP, 1.2);
    b.L.enemies.push({ kind: 'fox', skin: 'soldier', x: TS + 13.0, y: UP, w: 0.55, h: 0.9, speed: 1.4, x0: TS + 11.0, x1: TS + 15.6 });
    art('we_ts_nut', TS + 16.4, UP, 2.7); solid(TS + 16.5, 0.6, 2.6, UP); ledge(TS + 16.45, UP + 2.6, 0.7);
    art('we_ts_gifts5', TS + 18.0, UP, 1.75); solid(TS + 18.05, 0.78, 1.7, UP);
    b.coins(TS + 11.4, UP + 1.2, 4, 0.9);
    // Santa's grotto: arch, conveyor belts carrying A along, elves, Santa waving, then the present chute down to the side door
    const GR = TS + 20.5;
    L.weGrotto = { x0: GR, x1: OUT - 6 };
    art('we_gr_arch', GR, UP, 4.2, { back: true });
    const belt = (x, w) => { solid(x, w, 0.62, UP, { belt: 3.0 }); (L.weBelts = L.weBelts || []).push({ x, w, y: UP }); };
    belt(GR + 6.6, 9.0); b.coins(GR + 7.0, UP + 1.6, 8, 1.0);
    art('we_gr_bench', GR + 16.0, UP, 1.6); solid(GR + 16.1, 2.0, 1.4, UP); ledge(GR + 16.1, UP + 1.45, 2.0);
    art('we_gr_sleigh', GR + 19.0, UP, 1.4); solid(GR + 19.2, 1.7, 1.05, UP); ledge(GR + 19.25, UP + 1.3, 1.6);
    b.coins(GR + 16.4, UP + 2.2, 5, 0.9);
    L.weElves = [['we_elf1', GR + 8.5], ['we_elf2', GR + 12.0], ['we_elf3', GR + 3.0]];
    L.weSanta = { x: GR + 21.4, y: UP };
    // the chute: from the first floor down to the ground floor, then out of the side door onto Regent Street
    const CH = OUT - 6;
    b.slope(CH, UP, CH + 4.6, 0.25); L.slopes[L.slopes.length - 1].belt = 4;
    L.weChute = { x: CH - 0.3, y: 0 };
    b.coins(CH + 0.5, UP + 0.6, 4, 1.1, -0.95);
    // ---------- 3. Regent Street ----------
    const RG = OUT;
    L.weDoorOut = { x: RG - 0.6 };
    ground(RG, 220, 'wepave');
    L.weRows.push({ kind: 'regent', x0: RG + 1.0, x1: 219.0 });
    const angel = (x, y) => { art('we_angel', x, y, 1.5, { hang: true }); ledge(x + 2.6, y + 1.05, 2.2); };
    b.coins(RG + 2, 1.1, 4, 0.9);
    drift(RG + 6.0); bigman(RG + 9.0);
    angel(RG + 9.5, 4.9); b.coins(RG + 12.4, 7.0, 2, 0.9);
    b.pigeon(RG + 16.0);
    angel(RG + 17.5, 5.6); b.special(RG + 21.1, 7.9);           // 3: above the middle angel
    bench(RG + 21.0); b.coins(RG + 21.3, 1.6, 3, 0.7);
    bigman(RG + 27.0); xtree(RG + 29.5);
    angel(RG + 31.0, 4.9); b.coins(RG + 33.8, 7.0, 2, 0.9);
    grit(RG + 34.5); lamp(RG + 37.5);
    b.pigeon(RG + 40.0); bigman(RG + 44.5);
    // ---------- 4. Carnaby Street ----------
    const CB = 221.0;
    ground(220, 261, 'wecobble');
    L.weCbSwap = CB - 3.0; L.weRows.push({ kind: 'carnaby', x0: CB + 0.5, x1: 260.5 });
    art('we_cb_arch', CB + 1.0, 0, 4.2, { mid: true }); ledge(CB + 1.2, 4.05, 5.5);
    L.weArch = { x: CB + 1.0 };
    bigman(CB - 1.6); b.coins(CB + 1.6, 4.9, 5, 0.8);         // along the top of the Carnaby arch
    [['we_cb_ball', CB + 10, 5.9], ['we_cb_cane', CB + 17, 5.6], ['we_cb_gift', CB + 24, 6.0], ['we_cb_ball', CB + 31, 5.8], ['we_cb_cane', CB + 37, 5.6]]
      .forEach(([k, x, y]) => art(k, x, y, k === 'we_cb_cane' ? 1.8 : k === 'we_cb_gift' ? 1.5 : 1.6, { hang: true }));
    snowman(CB + 11.0); b.coins(CB + 10.6, 2.2, 3, 0.7);
    b.pigeon(CB + 16.0);
    bigman(CB + 20.0); bench(CB + 25.0); b.coins(CB + 25.2, 1.6, 3, 0.7);
    b.pigeon(CB + 29.0); grit(CB + 34.0); b.coins(CB + 33.8, 1.9, 3, 0.7);
    // ---------- 5. Piccadilly Circus: the fountain, then the giant screens: climb the gantry, ride the cradle down ----------
    const PC = 261.0;
    ground(261, 307, 'wepave');
    // the fountain with the winged archer: three round steps to hop up and over
    const FX = PC + 2.6, FW = 4.833;
    art('we_pc_fountain', FX, 0, 5.6, { back: true });
    solid(FX + FW * 0.02, FW * 0.96, 0.5); solid(FX + FW * 0.1, FW * 0.8, 0.8); solid(FX + FW * 0.18, FW * 0.64, 1.05);
    b.arc(FX + 0.6, 1.4, 5, 3.2, 1.0);
    art('we_pc_sign', PC + 8.4, 0, 2.6, { back: true });
    art('we_pc_flowers', PC + 9.6, 0, 1.6); solid(PC + 9.7, 1.2, 1.5); ledge(PC + 9.65, 1.55, 1.3);
    art('we_pc_barrier', PC + 12.4, 0, 0.75); solid(PC + 12.45, 1.2, 0.7);
    b.coins(PC + 9.9, 2.4, 2, 0.6);
    // the screens building: its two side buildings and the curved front covered in screens (adverts change in draw.js)
    const S0 = PC + 14.0, BM = S0 + 5.7, S1 = BM + 19.914;
    L.wePc = { x0: S0, bm: BM, x1: S1, swap: [PC - 3.0, S1 + 2.8] };
    // the gantry across the screens: three walkways, each a tap above the last, hung on brackets; ladders between (just for looks)
    const walk = (x, y, parts) => {
      let xx = x; const pcs = [];
      for (const k of parts) { const w = { we_gw_l: 3.067, we_gw_m: 7.959, we_gw_r: 3.076 }[k]; pcs.push([k, xx]); xx += w - 0.02; }
      (L.weGw = L.weGw || []).push({ y, pcs, x0: x, x1: xx });
      ledge(x + 0.15, y, xx - x - 0.3);
      return xx;
    };
    const W1 = 2.5, W2 = 4.7, W3 = 6.9;
    walk(BM + 0.4, W1, ['we_gw_l', 'we_gw_r']);
    walk(BM + 5.2, W2, ['we_gw_l', 'we_gw_r']);
    const w3 = walk(BM + 9.6, W3, ['we_gw_l', 'we_gw_m']);
    L.weLadders = [[BM + 1.2, 0], [BM + 5.6, W1], [BM + 10.0, W2]];
    b.coins(BM + 1.0, W1 + 0.9, 5, 1.0); b.coins(BM + 5.8, W2 + 0.9, 5, 1.0); b.coins(BM + 10.2, W3 + 0.9, 4, 1.0);
    b.special(BM + 16.6, W3 + 1.6);                            // 5: at the top of the gantry, by the biggest screen
    // the window cleaners' cradle at the end of the top walkway: it waits for A, then lowers him to the street
    const cr = { kind: 'lift', mover: true, trig: 'weCradle', x: w3 - 0.1, w: 4.38, y: W3, y0: W3, y1: 0, up: 3.4, d0: 0.45 };
    (L.movers = L.movers || []).push(cr); L.oneways.push(cr); L.weCradle = cr;
    L.solids.push({ kind: 'block', x: cr.x + cr.w - 0.2, y: 2.0, w: 0.4, h: 20, style: 'hidden', noGrab: true });   // the cradle's far rail: he rides it down and walks out at the bottom
    // down on the street: under the gantry for those who stay low
    b.coins(S0 + 1.0, 1.1, 4, 0.9); b.pigeon(BM + 3.5); drift(BM + 7.5); b.coins(BM + 9.0, 1.1, 4, 0.9);
    bigman(BM + 13.0);                                          // (no pigeon near the cradle: A can't hop while it lowers him)
    b.coins(S1 + 1.0, 1.1, 4, 0.9);
    // ---------- 6. Covent Garden: piazza, then through the old market hall ----------
    const CG = 307.0;
    ground(307, 390, 'wecobble');
    art('we_chalets', CG + 1.5, 0, 3.0, { back: true }); ledge(CG + 1.7, 2.75, 10.6);
    b.coins(CG + 2.2, 3.6, 9, 1.1); bigman(CG + 11.6);   // (no pigeon here: it would walk into the cradle while A rides it down)
    art('we_cg_tree', CG + 13.5, 0, 7.5, { back: true });
    art('we_reindeer', CG + 18.5, 0, 2.6, { back: true });
    art('we_chestnut', CG + 21.0, 0, 1.5); solid(CG + 21.2, 1.6, 1.4);
    b.pigeon(CG + 25.0);
    const MH = CG + 28.0;                                      // the market hall: in through the arch, two floors inside
    const HI = MH + 8.0, HO = HI + 34;                          // inside, from HI to HO
    L.weHall = { x0: HI, x1: HO, up: 3.6, roof: 7.2, out: MH };
    solid(HI, HO - HI, 40, 7.6);
    L.oneways.push({ kind: 'ledge', x: HI + 4.0, y: 3.6, w: HO - HI - 8.0 });
    L.weHall.box = HI + 2.0;
    bigman(HI + 3.2);
    bench(HI + 6.0); b.coins(HI + 6.2, 1.6, 3, 0.7);
    b.coins(HI + 6.0, 4.4, 12, 1.1);
    art('we_mh_ball_r', HI + 13.0, 5.1, 1.3, { hang: true, hall: true }); ledge(HI + 13.1, 6.35, 1.0); b.special(HI + 13.6, 7.0);   // 4: on top of the giant red bauble
    art('we_mh_ball_s', HI + 21.0, 5.1, 1.3, { hang: true, hall: true }); ledge(HI + 21.1, 6.35, 1.0);
    b.pigeon(HI + 18.0); b.pigeon(HI + 20.0, 3.6);
    bigman(HI + 25.0); b.coins(HI + 25.0, 3.4, 2, 0.6);
    b.pigeon(HI + 30.5);
    L.weHallOut = { x: HO - 0.6 };
    bigman(HO + 4.5);
    // ---------- 7. Trafalgar Square: the frozen fountains ----------
    const TF = 390.0;
    ground(390, 460, 'wegranite');
    art('we_tf_lion', TF + 0.5, 0, 2.6, { back: true });
    // ice ramp up onto the first basin, slide across, hop the rim, slide across the second one: belts, nothing that hurts
    const ICE = 1.0;
    const R0 = TF + 6.0;
    art('we_tf_ramp', R0, 0, 1.6);           // climb up on the left, slide down to the right
    solid(R0, 1.0, 1.55);
    b.slope(R0 + 1.0, 1.55, R0 + 5.4, ICE); L.slopes[L.slopes.length - 1].belt = 3.5;
    const basin = (x, w) => { (L.weBasins = L.weBasins || []).push({ x, w }); solid(x, w, ICE, 0, { belt: 3.6, ice: true }); };
    basin(R0 + 5.4, 9.0);
    b.coins(R0 + 1.6, 2.6, 4, 1.0, -0.25); b.coins(R0 + 6.2, 2.0, 8, 1.0);
    solid(R0 + 14.4, 0.6, 1.5);                               // the rim between the two fountains: hop it
    basin(R0 + 15.0, 9.0); b.coins(R0 + 15.6, 2.0, 8, 1.0);
    L.weIce = [R0 + 0.8, R0 + 24.2]; L.weNg = TF + 11.0;
    L.weFountains = [R0 + 9.9 - 1.5, R0 + 19.5 - 1.5];
    art('we_tf_column', TF + 30.0, 0, 4.2, { back: true });
    const TREE = TF + 40.0;
    L.weTree = { x: TREE - 1.4, y: 0 };
    b.flag(TREE - 6.0);
    L.finale = TREE - 0.6;
    L.weFinale = true;
    b.wall(TF + 52, 1, 22);
    b.end(TF + 50);
  },
},
{
  id: 'heathrow', name: 'Airport Rush', area: 'heathrow', bonus: true,
  build(b) {
    const L = b.L;
    // bonus round: 20 seconds from the departure hall to the gate. Boarding passes add time.
    L.timed = 20; L.passBonus = 2; L.noFlag = true; L.killY = -8;
    L.passes = [];
    const pass = (x, y) => L.passes.push({ x, y });
    const S0 = 3.6; L.startX = S0; L.sleepStart = S0;
    b.hidden(-6, 2, 24);
    // 1. departure hall: A asleep on the seats, the board above shows FINAL CALL
    b.groundTop(-30, 33.2, 0, 'hwgrey');
    b.bxProp('hw_plant', -2.7, 0, 2.4);
    b.bxProp('hw_seats', S0 - 3.75, 0, 1.2);
    b.bxProp('hw_board', 6.2, 0, 3.7);
    b.bxSolid('hw_bin', 9.6, 1.05, 1.15, { ah: 1.25 });
    b.coins(5.4, 0.9, 3, 0.9); b.arc(9.2, 1.7, 4, 2.2, 1.0);
    // 2. security: two queue barriers, the scanner and the arch, trays to jump
    b.bxSolid('hw_barrier', 13.0, 1.1, 0.95, { ah: 1.0 });
    b.bxSolid('hw_barrier', 16.0, 1.1, 0.95, { ah: 1.0 });
    b.coins(13.1, 2.1, 2, 0.6); b.coins(16.1, 2.1, 2, 0.6);
    b.bxProp('hw_scanner', 18.6, 0, 2.3);
    L.hwArch = { x: 23.9, w: 1.55, h: 2.95 };
    b.bxSolid('hw_rollers', 27.4, 1.62, 1.6, { ah: 1.6 });
    pass(28.2, 3.7);
    b.coins(25.6, 0.9, 2, 0.9);
    b.bxSolid('hw_trays', 31.0, 0.88, 0.82, { ah: 0.85 });
    b.coins(31.1, 1.9, 1, 1);
    // 3. duty free: shop fronts, a stepped perfume display, the perfume spray, a glass counter
    b.groundTop(33.2, 58.0, 0, 'hwcream');
    L.hwShops = { x: 33.6, keys: ['hw_shop_perf', 'hw_shop_sweet', 'hw_shop_fash', 'hw_shop_perf'], h: 3.6 };
    const T = 36.0;   // stepped display: each tier is a little step A climbs on his own
    b.bxProp('hw_tower', T, 0, 2.0, { front: true });
    for (const [a, c, h] of [[0.05, 3.63, 0.41], [0.47, 3.23, 0.95], [1.0, 2.7, 1.49], [1.3, 2.45, 2.0]]) b.L.solids.push({ kind: 'block', x: T + a, y: 0, w: c - a, h, style: 'hidden' });
    b.coins(T + 1.4, 2.9, 3, 0.6);
    b.bxProp('hw_p_perf', 42.4, 0, 2.5);
    L.mists = [{ x0: 43.6, x1: 45.8, top: 2.4, on: 1.2, off: 1.1, ph: 0, slow: 0.45, src: 43.65 }];
    b.coins(43.8, 3.0, 3, 0.8);
    b.bxSolid('hw_counter', 49.4, 4.4, 1.3, { ah: 1.3 });
    b.coins(49.8, 2.3, 4, 1.0);
    pass(52.6, 3.6);
    b.bxSolid('hw_wet', 55.6, 0.66, 0.85, { ah: 0.9 });
    // 4. travelators: two wrong-way belts on the floor with a landing between, a long fast walkway above
    b.groundTop(58.0, 200, 0, 'hwgrey');
    b.bxSolid('hw_trolley', 58.4, 2.4, 0.38, { ah: 0.9 });
    const BV = -1.9, FV = 3.6, BT = 0.6, TW = 2.03 * 2 + 7.0 * 2, TL1 = 61.4, TL2 = TL1 + TW + 2.6;
    L.hwBelts = [];
    for (const tl of [TL1, TL2]) {
      L.hwBelts.push({ x: tl, caps: 2.03, mid: 7.0, mids: 2, h: 1.4, v: BV });
      L.solids.push({ kind: 'block', x: tl + 1.1, y: 0, w: TW - 2.2, h: BT, style: 'hidden', belt: BV });
    }
    const WH = 3.9 * 297 / 194, PXU = 297 / WH, NM = 3, WX = TL1 + 0.9, WW2 = (829 + NM * 372) / PXU, UB = 3.9 + BT;
    L.hwWalks = [{ x: WX, w: WW2, top: 3.9, hh: WH, nm: NM, belt: { x: WX + 0.2, caps: 2.03, mid: 7.0, w: WW2 - 0.4, h: 1.4, v: FV } }];
    L.oneways.push({ kind: 'ledge', x: WX + 0.6, y: UB, w: WW2 - 1.2, belt: FV });
    // downstairs: four travellers to hop; a cleaning cart on the landing is a second way up
    b.coins(TL1 + 2.4, 1.6, 3, 0.9);
    [[TL1 + 6.6, 'hw_p_dad', 0.95, 2.35], [TL1 + 13.2, 'hw_p_biz', 0.85, 2.3], [TL2 + 5.4, 'hw_p_biz', 0.85, 2.3], [TL2 + 12.4, 'hw_p_dad', 0.95, 2.35]].forEach(([x, k, w, ah]) => {
      b.bxSolid(k, x, w, 2.15, { y0: BT, ah }); b.coins(x, 3.3, 2, 0.8);
    });
    b.bxSolid('hw_cart', TL1 + TW + 0.8, 0.95, 1.45, { ah: 1.6 });
    pass(TL1 + TW + 1.3, 3.1);
    // upstairs: the fast belt, two backpackers
    b.coins(WX + 2.0, UB + 0.9, 4, 1.4);
    b.bxSolid('hw_p_pack', WX + 9.0, 0.95, 2.1, { y0: UB, ah: 2.3 });
    b.arc(WX + 7.8, UB + 1.3, 5, 3.6, 1.8);
    b.coins(WX + 14, UB + 0.9, 5, 1.4);
    b.bxSolid('hw_p_pack', WX + 26.0, 0.95, 2.1, { y0: UB, ah: 2.3 });
    b.arc(WX + 24.8, UB + 1.3, 5, 3.6, 1.8);
    pass(WX + 33.0, UB + 1.2);
    // 5. the gate: seats, the desk, the agent, the doors to the plane
    const GX = Math.max(TL2 + TW, WX + WW2) + 1.6;
    b.bxProp('hw_gseats', GX, 0, 1.1);
    b.bxSolid('hw_cart', GX + 4.4, 0.95, 1.45, { ah: 1.6 });
    b.coins(GX + 4.4, 2.6, 2, 0.7);
    b.bxProp('hw_desk', GX + 7.6, 0, 2.9);
    b.bxProp('hw_p_agent', GX + 9.4, 0, 2.5);
    const DOOR = GX + 12.4;
    L.hwGate = { x: DOOR, doorW: 3.06, h: 3.0, end: DOOR + 60 };
    b.flag(DOOR + 0.6);
    L.gateEnd = DOOR + 1.95;   // walks in through the open door and on behind the closed one
    b.L.solids.push({ kind: 'block', x: DOOR + 3.6, y: 0, w: 2, h: 24, style: 'hidden', edge: true });
    b.end(DOOR + 7);
  },
},
{
  id: 'olddubai', name: 'Old Dubai', area: 'olddubai', city: 'Dubai',
  build(b) {
    const L = b.L;
    // Old Dubai: Al Fahidi lanes, the abra crossing on the creek, the Deira wharf, the Spice Souk and the Gold Souk
    L.outfit = 'dxb'; L.killY = -5; L.startX = 3.6; L.camMin = -9; L.jeepStop = 0.9;   // the plane lands, then a Jeep drops A at the Al Fahidi gate
    L.water = { x0: 86, x1: 152, y: -1.25 };
    b.hidden(-10, 1.5, 30);
    b.zone(-30, 'fahidi'); b.zone(86, 'creek'); b.zone(148, 'wharf'); b.zone(199, 'spice'); b.zone(249, 'gold'); b.zone(302, 'street');
    // 1. Al Fahidi: a street of sand-coloured houses and wind towers; the roofs are a high road
    b.groundTop(-30, 88, 0, 'dxstreet');
    let x = -16.2;
    for (const k of ['dx_h_tower2', 'dx_h_small', 'dx_h_arch', 'dx_h_balcony', 'dx_h_small', 'dx_h_tower1', 'dx_h_small', 'dx_h_balcony', 'dx_h_tower2',
      'dx_h_arch', 'dx_h_small', 'dx_h_tower1', 'dx_h_balcony', 'dx_h_small', 'dx_h_tower2', 'dx_h_arch']) x = b.dxHouse(k, x) + 0.2;
    L.dxHousesEnd = x;
    b.bxProp('dx_lamp', 6.4, 0, 3.55);
    b.dxSolid('dx_bench', 9, 1.44, [[0.15, 2.45, 1.2]]);
    b.coins(9.4, 2.2, 3);
    b.dxSolid('dx_palm', 14.2, 3.72, [[0.46, 1.63, 1.0]]);
    b.dxSolid('dx_cart', 19.6, 1.5, [[0.1, 2.0, 1.42]]);
    b.arc(20.6, 2.4, 4, 3.4, 2.0);                               // up off the cart onto the roofs
    b.coins(24.6, 5.0, 4, 1.2); b.coins(30.6, 7.6, 4, 1.2);
    b.coins(37.4, 11.3, 3, 1.0);
    b.special(39.4, 11.9);                                        // 1: top of the tall wind tower
    b.bxProp('dx_dallah', 27.2, 0, 1.78);
    b.dxSolid('dx_bougain', 31.6, 2.43, [[0.63, 1.67, 0.92]]);
    b.cat(42, 39, 47);
    b.coins(40, 1.2, 5);
    b.bxProp('dx_lamp', 48.2, 0, 3.55);
    b.dxSolid('dx_bench', 52.5, 1.44, [[0.15, 2.45, 1.2]]);
    b.dxSolid('dx_cart', 58.6, 1.5, [[0.1, 2.0, 1.42]]);
    b.arc(59.2, 2.3, 4, 3.0, 1.8);
    b.dxSolid('dx_palm', 64.2, 3.72, [[0.46, 1.63, 1.0]]);
    b.crow(69.5);
    b.coins(66.5, 4.9, 5, 1.1);
    b.dxSolid('dx_bougain', 73.4, 2.43, [[0.63, 1.67, 0.92]]);
    b.bxProp('dx_p_tourist', 78.4, 0, 2.18);
    b.dxSolid('dx_bench', 80.6, 1.44, [[0.15, 2.45, 1.2]]);
    b.bxProp('dx_palm', 84.2, 0, 3.72);
    // 2. the abra station: the jetty, then across the creek boat to boat (falling in costs a bubble)
    b.groundTop(88, 108.6, 0, 'dxjetty');
    L.dxJetty = { x: 88, end: 104.3 };
    b.bxProp('dx_shelter', 93.2, -0.95, 4.2);
    b.ledge(93.8, 3.2, 4.9);
    b.coins(94.2, 4.3, 4, 1.1);
    b.bxProp('dx_p_abra', 100.4, 0, 2.28);
    b.coins(101.5, 1.0, 5);
    // the abras rock to and fro in the current: A can't stop, so he picks his moment to jump
    b.dxAbra('dx_abra1', 109.6, 111.2, -1.85, 0.6, 1.6, 0.6, 0);
    b.dxAbra('dx_abra2', 116.2, 117.8, -1.85, 0.6, 1.6, 0.6, 2.2);
    b.coins(110.8, 1.8, 4); b.coins(117.4, 1.8, 4);
    b.special(124.2, 4.9);                                        // 2: out over the creek
    const DH = 123.6, DB = -2.55;                                 // the big dhow, tied up mid-creek
    L.props.push({ kind: 'bx', key: 'dx_dhow', x: DH, y: DB, h: 4.613 });
    b.ledge(DH + 0.4, DB + 3.68, 2.2); b.ledge(DH + 2.9, DB + 2.05, 7.6); b.ledge(DH + 10.6, DB + 3.4, 0.9);
    b.coins(DH + 3.4, 0.4, 6, 1.1);
    b.dxAbra('dx_abra2', 136.0, 137.6, -1.85, 0.6, 1.6, 0.6, 1.0);
    b.dxAbra('dx_abra1', 143.2, 144.8, -1.85, 0.6, 1.6, 0.6, 3.2);
    b.coins(137.6, 1.8, 4); b.coins(144.6, 1.8, 4);
    // 3. Deira: the dhow wharf, stacked with cargo
    b.groundTop(151.4, 200, 0, 'dxstreet');
    L.props.push({ kind: 'bx', key: 'dx_steps', x: 148.2, y: -2.42, h: 2.424, flip: true });
    L.props.push({ kind: 'bx', key: 'dx_dhow', x: 171, y: -0.8, h: 4.613, behind: true });
    b.dxSolid('dx_crates', 157.4, 2.77, [[0, 2.25, 1.25], [0.2, 2.05, 2.08], [0.55, 1.7, 2.76]]);
    b.coins(157.6, 3.8, 3, 0.9);
    b.crow(162.4);
    b.dxSolid('dx_tyres', 165.2, 2.11, [[0.05, 1.32, 2.1]]);
    b.dxSolid('dx_pallet', 168.3, 2.13, [[0, 2.27, 2.13]]);
    b.dxSolid('dx_crates', 171.2, 2.77, [[0, 2.25, 1.25], [0.2, 2.05, 2.08], [0.55, 1.7, 2.76]]);
    b.dxSolid('dx_crates', 171.2, 2.77, [[0, 2.25, 1.25], [0.2, 2.05, 2.08], [0.55, 1.7, 2.76]], { y0: 2.76 });
    b.coins(169, 3.3, 2, 0.9); b.coins(172.0, 6.8, 3, 0.4);
    b.special(172.3, 8.1);                                        // 3: top of the crate tower
    b.cat(178, 175.5, 182);
    b.dxSolid('dx_fridge', 183.2, 2.79, [[0.05, 1.28, 2.79]]);
    b.bxProp('dx_p_porter', 185.6, 0, 2.12);
    b.dxSolid('dx_forklift', 189.6, 2.9, [[0.15, 2.95, 1.5]]);
    b.ledge(190.2, 2.78, 1.8);
    b.coins(190.4, 3.9, 3, 0.7);
    b.dxSolid('dx_sacks', 195.6, 1.86, [[0.05, 2.1, 1.8]]);
    // 4. the Spice Souk: stalls with roofs to run on, sacks to hop and a spice cloud that makes A sneeze
    b.groundTop(200, 305, 0, 'dxsouk');
    b.dxHouse('dx_h_arch', 199.3);
    for (const [k, xs] of [['dx_st_spice', 207.4], ['dx_st_flowers', 211.5], ['dx_st_lamps', 215.5], ['dx_st_spice', 236.6], ['dx_st_lamps', 240.7], ['dx_st_flowers', 244.8]]) {
      L.props.push({ kind: 'bx', key: k, x: xs, y: 0, h: 3.869 }); b.ledge(xs + 0.2, 3.87, 3.65);
    }
    b.coins(208.2, 4.9, 10, 1.1);
    b.bxProp('dx_p_spice', 220.2, 0, 2.26);
    L.mists = [{ x0: 220.6, x1: 224.4, top: 2.6, on: 1.3, off: 1.2, ph: 0, slow: 0.45, src: 220.9, spice: true }];
    b.dxSolid('dx_spsacks', 225.6, 1.6, [[0.15, 6.35, 1.3]]);
    b.arc(225.8, 2.6, 6, 6.0, 2.4);
    b.special(228.9, 5.7);                                        // 4: above the spice sacks
    b.cat(234, 232.5, 236);
    b.dxSolid('dx_awning', 232.2, 1.74, []); b.ledge(232.5, 1.74, 4.5);
    b.coins(237.4, 4.9, 9, 1.1);
    // 5. the Gold Souk: a covered souk two floors high. Gold shops below, a gallery of carved arches above,
    //    a wooden ceiling with lanterns, and the giant gold ring standing in a light well in the middle
    L.dxSouk = { x0: 255.5, x1: 299.4, ceil: 10.2, well: [273.9, 280.5] };
    L.dxGarch = [248.4, 298.7];
    L.solids.push({ kind: 'block', x: 255.5, y: 10.2, w: 43.6, h: 20, style: 'hidden' });   // the ceiling: solid, so A can't jump out
    b.ledge(248.9, 6.1, 6.4); b.ledge(299.2, 6.1, 6.4);          // tops of the entrance arches
    for (let i = 0; i < 7; i++) L.props.push({ kind: 'bx', key: ['dx_gold1', 'dx_gold2', 'dx_gold3'][i % 3], x: 256.0 + i * 6.25, y: 0, h: 4.3 });
    // the upper gallery: a walkway along the shop tops with carved arches behind, open above the ring
    L.dxArcade = [[256.0, 4.4], [263.39, 4.4], [280.6, 4.4], [287.99, 4.4]];
    b.ledge(256.0, 4.4, 17.9); b.ledge(280.6, 4.4, 18.0);
    for (const [x] of L.dxArcade) b.ledge(x + 0.1, 7.85, 7.2);   // the tops of the arches: the high road
    // ground floor
    b.coins(253.5, 1.0, 4);
    b.dxSolid('dx_cart', 258.6, 1.5, [[0.1, 2.0, 1.42]]);
    b.arc(259.2, 2.3, 4, 3.4, 2.6);                                // up off the cart onto the gallery
    b.coins(263.5, 5.5, 8, 1.1);
    b.bxProp('dx_p_gold', 265.6, 0, 2.27);
    b.coins(266.5, 1.0, 5);
    b.crow(270.2);
    b.coins(264.6, 8.9, 5, 1.1);                                  // along the high road
    b.dxSolid('dx_ring', 275.1, 4.2, [[0.15, 4.05, 4.2]]);       // the giant ring in its case
    b.coins(275.6, 5.2, 3, 0.9);
    b.special(277.2, 7.4);                                        // 5: up in the light well, above the ring
    b.bxProp('dx_p_tourist', 283.6, 0, 2.18);
    b.coins(281.5, 5.5, 8, 1.1);
    b.crow(286.4, 4.4);
    b.dxSolid('dx_cart', 290.2, 1.5, [[0.1, 2.0, 1.42]]);
    b.coins(289.6, 8.9, 5, 1.1);
    b.coins(293.5, 1.0, 4);
    // out to the street: the flag, then a taxi to Downtown
    b.groundTop(305, 345, 0, 'dxstreet');
    b.coins(304.5, 1.0, 3);
    b.flag(308);
    L.taxiEnd = 311.2;
    b.end(340);
    b.hidden(344, 2, 30);
  },
},
{
  id: 'downtown', name: 'Downtown', plate: 'Downtown', area: 'downtown', city: 'Dubai',
  build(b) {
    const L = b.L;
    // Downtown Dubai at dusk: One Za'abeel and The Link, the peace hand and the Museum of the Future, DIFC,
    // the Metro Link bridge, Dubai Mall (waterfall, aquarium, shops) and the Burj Lake, where A stops to watch the fireworks
    L.outfit = 'dxb'; L.killY = -6; L.startX = 3.6; L.camMin = -9;
    L.jeepStop = 0.6; L.jeepKey = 'dx_taxi'; L.jeepH = 2.3; L.jeepDoor = 2.4; L.landT = 0;   // the taxi from Old Dubai drops A off
    b.hidden(-10, 1.5, 30);
    // 1. One Za'abeel: a glass lift up the first tower, across The Link (pool deck on the roof), drop past the second tower
    b.groundTop(-30, 168, 0, 'dtstreet');
    L.dtTraffic = { x1: 167, cars: [['dt_gw', 2.65], ['dt_urus', 2.15], ['dt_911', 1.75], ['dt_car', 1.5]] };   // cars driving along the road (pictures: [key, height])
    b.bxProp('dt_lamp', 7.0, 0, 4.142);
    b.dxSolid('dt_olive', 9.4, 2.362, [[0.25, 1.07, 0.95]]);
    const T1 = 12.6, D = 12;
    L.props.push({ kind: 'bx', key: 'dt_t1', x: T1, y: 0, h: 18.836, behind: true });
    const face = T1 + 2.27;
    b.hidden(face, T1 + 10.2 - face, D);                       // the tower is solid up to The Link
    L.dtLift = { face, top: D };
    const lift = { kind: 'lift', mover: true, x: face - 1.45, w: 1.42, y: 0, y0: 0, y1: D, up: 2.0, d0: 1.2, d1: 0.8, ph: 0 };
    (L.movers = L.movers || []).push(lift); L.oneways.push(lift);
    L.dtLiftM = lift;
    b.coins(5.6, 1.0, 4, 1.0);
    b.coins(face - 0.7, 3.0, 4, 0, 2.4);                        // up the lift shaft
    const LK = 18.6; L.dtLink = { x: LK, y: D - 4.455 };
    L.props.push({ kind: 'bx', key: 'dt_t2', x: 38.6, y: 0, h: 16.591, behind: true });
    L.solids.push({ kind: 'block', x: LK, y: D - 0.5, w: 28.445, h: 0.5, style: 'hidden' });
    b.coins(T1 + 10.6, D + 0.9, 5, 1.2);
    b.crow(29.5, D);
    b.arc(28.2, D + 1.2, 5, 3.4, 1.8);
    b.coins(33.0, D + 0.9, 8, 1.2);
    b.arc(41.4, D + 1.0, 4, 3.0, 1.6);
    b.dxSolid('dt_olive', 38.4, 2.362, [[0.25, 1.07, 1.45]], { y0: D });   // a potted olive on the pool deck
    b.special(46.0, D + 1.8);                                   // 1: far end of The Link
    b.coins(48.2, D - 1.4, 5, 0.75, -2.2);                      // the drop
    // 2. the peace hand and the Museum of the Future, with the Dubai Frame standing big in the distance
    L.dtFrame = 56;
    b.dxSolid('dt_olive', 41.6, 2.362, [[0.25, 1.07, 1.45]]);
    b.dxSolid('dt_grass', 52.6, 0.769, [[0.05, 1.13, 0.75]]);
    b.bxProp('dt_lamp', 57.0, 0, 4.142);
    b.dxSolid('dt_olive', 61.2, 2.362, [[0.25, 1.07, 0.95]]);
    b.coins(55.0, 1.0, 4, 1.1);
    const MX = 67.4, M = 0.021145;
    const HX = MX - 1.0, HY = 0.5;                              // the peace hand sits on the first grass of the museum's hill
    L.props.push({ kind: 'bx', key: 'dt_hand', x: HX, y: HY, h: 4.746, onArt: true });   // onArt: its grass is in the museum picture
    for (const [a, c, h] of [[0.15, 3.55, 2.4], [3.55, 4.36, 4.7], [4.36, 6.9, 2.5], [6.9, 8.6, 2.2]]) L.solids.push({ kind: 'block', x: HX + a, y: 0, w: c - a, h: h + HY, style: 'hidden' });
    b.slope(HX + 1.9, 2.42 + HY, HX + 3.55, 3.35 + HY);         // up the palm to the thumb
    b.slope(HX + 4.36, 2.75 + HY, HX + 7.95, 4.07 + HY);        // up the two fingers
    b.coins(HX + 0.6, 3.8, 2, 0.8); b.coins(HX + 3.95, 6.1, 1); b.coins(HX + 5.2, 4.4, 3, 0.9, 0.34);
    b.special(HX + 8.1, 5.7);                                   // 2: on the fingertips
    L.props.push({ kind: 'bx', key: 'dt_museum', x: MX, y: 0, h: 13.829, behind: true });
    const hill = [[0.6, 0], [6.3, 2.0], [20.5, 2.55], [35.5, 2.0], [41.1, 0]];
    for (let i = 1; i < hill.length; i++) b.slope(MX + hill[i - 1][0], hill[i - 1][1], MX + hill[i][0], hill[i][1]);
    // the hole through the ring: its curved bottom edge is a path
    const bowl = [[607, 340], [620, 309], [680, 269], [740, 248], [800, 233], [860, 222], [920, 216], [980, 214], [1040, 216], [1100, 222], [1160, 234], [1220, 262], [1255, 330]];
    for (let i = 1; i < bowl.length; i++) b.slope(MX + bowl[i - 1][0] * M, bowl[i - 1][1] * M, MX + bowl[i][0] * M, bowl[i][1] * M);
    b.coins(MX + 3.0, 1.9, 4, 1.1, 0.35);
    b.arc(MX + 9.6, 4.0, 5, 4.4, 2.2);
    b.coins(MX + 15.4, 5.9, 3, 1.1, -0.3); b.coins(MX + 22.6, 5.6, 3, 1.1, 0.3);
    b.special(MX + 20.7, 7.4);                                  // 3: floating in the hole through the ring
    b.dxSolid('dt_olive', MX + 12.2, 2.362, [[0.25, 1.07, 1.45]], { y0: 2.22 });   // landscaping on the hill
    b.coins(MX + 28.5, 3.4, 6, 1.2, -0.12);
    b.cat(MX + 32, MX + 30, MX + 37);
    b.dxSolid('dx_palm', 110.4, 3.72, [[0.46, 1.63, 1.0]]);
    b.dxSolid('dx_palm', 115.0, 3.72, [[0.46, 1.63, 1.45]]);
    b.coins(111.4, 2.3, 4, 1.15);
    // 3. DIFC: under The Gate and along Gate Avenue's cafés; the parasols are a high road
    L.dtGateBack = 119.2;   // office towers stand close behind The Gate
    L.props.push({ kind: 'bx', key: 'dt_gate', x: 119.2, y: 0, h: 12.91, behind: true });
    const cafes = xs => { for (const x of xs) { b.dxSolid('dt_cafe', x + 0.6, 0.962, [[0.1, 1.83, 0.9]]); L.props.push({ kind: 'bx', key: 'dt_parasol', x, y: 0, h: 2.946 }); b.ledge(x + 0.25, 2.7, 2.6); } };
    cafes([121.6, 125.6, 129.6]);
    b.coins(122.2, 3.8, 10, 1.1);
    b.dxSolid('dt_olive', 134.2, 2.362, [[0.25, 1.07, 0.95]]);
    b.dxSolid('dt_car', 137.4, 1.3, [[0.25, 5.75, 1.25]]);
    b.arc(137.2, 2.4, 5, 4.4, 1.6);
    b.bxProp('dt_lamp', 143.4, 0, 4.142);
    cafes([146.2, 150.2, 154.2]);
    b.coins(146.8, 3.8, 10, 1.1);
    b.crow(152.4, 2.7);
    b.dxSolid('dt_grass', 158.6, 0.769, [[0.05, 1.13, 0.75]]);
    b.cat(161.5, 159.9, 165);
    b.dxSolid('dt_olive', 165.2, 2.362, [[0.25, 1.07, 1.45]]);
    // 4. the Metro Link: a short glass bridge into the mall with a fast travelator; Metro trains pass on the line behind
    b.groundTop(168, 194, 0, 'dtbridge');
    L.dtBridge = { x: 168, end: 181.21, cut: true };
    b.ceiling(169.4, 193.6, 3.81);
    L.dtBelts = [[171, 186]];
    for (const [a, c] of L.dtBelts) L.solids.push({ kind: 'block', x: a, y: 0, w: c - a, h: 0.16, style: 'hidden', belt: 3.2 });
    L.dtTrain = { y: 6.2, x0: 129, x1: 194 };
    b.coins(172, 1.0, 5, 1.6);
    b.bxSolid('hw_wet', 181.4, 0.66, 0.85, { y0: 0.16, ah: 0.9 });
    b.coins(181.4, 2.4, 3, 0.7);
    b.coins(186.5, 1.0, 3, 1.4);
    // 5. Dubai Mall: up the waterfall's steps to the upper floor, along the aquarium, past the shops, down the escalator
    b.groundTop(194, 326, 0, 'dtmall');
    L.dtMall = { x0: 193.6, x1: 326, ceil: 10.6, up: 4.6 };
    L.solids.push({ kind: 'block', x: 193.6, y: 10.6, w: 326 - 193.6, h: 20, style: 'hidden' });
    const WF = 196.2;
    L.props.push({ kind: 'bx', key: 'dt_waterfall', x: WF, y: 0, h: 9.924 });
    for (const [a, c, h] of [[0, 4.2, 1.35], [4.2, 8.03, 2.0], [8.03, 12.23, 2.7]]) L.solids.push({ kind: 'block', x: WF + a, y: 0, w: c - a, h, style: 'hidden' });
    b.coins(WF + 1.2, 2.4, 2, 1.0); b.coins(WF + 5.0, 3.1, 2, 1.0); b.coins(WF + 8.8, 3.8, 3, 1.0);
    const AQ = 209.6; L.dtAquarium = { x: AQ, w: 28.99 };
    b.ledge(WF + 12.0, 4.6, 267.4 - WF - 12.0);                 // the upper floor
    L.dtShopsUp = { x0: 209, x1: 321 };   // the second floor's shops carry on above the escalator
    L.dtShopsDown = [{ x0: 238.8, x1: 260 }, { x0: 265.6, x1: 287 }, { x0: 296, x1: 321 }];
    L.dtBalcony = [238.6];
    L.dtColumns = [194, 259.6, 324.4];
    b.coins(212.4, 5.6, 6, 1.2);
    b.special(224.6, 6.6);                                      // 4: up on the aquarium roof
    b.coins(227.5, 5.6, 8, 1.2);
    b.coins(211, 0.9, 5, 1.4); b.coins(223, 1.9, 4, 1.4); b.coins(231, 0.9, 5, 1.4);   // or along the glass
    b.cat(219, 214, 226);
    b.dxSolid('dt_grass', 242.2, 0.769, [[0.05, 1.13, 0.75]]);
    b.coins(243.8, 2.3, 4, 1.2);
    b.crow(249.5, 4.6);
    b.coins(241, 5.6, 6, 1.4); b.arc(248, 5.8, 5, 4.0, 2.0);
    b.dxSolid('dt_olive', 252.6, 2.362, [[0.25, 1.07, 1.45]]);
    b.dxSolid('dt_olive', 236.2, 2.362, [[0.25, 1.07, 1.45]], { y0: 4.6 });   // upstairs
    b.dxSolid('dt_olive', 262.4, 2.362, [[0.25, 1.07, 1.45]], { y0: 4.6 });
    b.dxSolid('dt_olive', 271.0, 2.362, [[0.25, 1.07, 1.45]]);
    L.dtEsc = { x: 259.4 };                                     // down escalator, mirrored: upper landing 259.4-267.6
    b.slope(267.6, 4.6, 282.07, 0);
    b.coins(268.6, 5.4, 8, 1.6, -0.51);
    b.coins(262, 0.9, 6, 1.6);
    L.dtDoors = 322.2;
    b.bxProp('dt_grass', 279.6, 0, 0.769); b.bxProp('dt_olive', 284.6, 0, 2.362);
    // the atrium: an ice cream bar, then the Diplodocus skeleton behind a velvet rope; A can run up its tail and along its back
    const IB = 288.6;
    b.dxSolid('dt_icebar', IB, 4.169, [[0.3, 6.3, 1.35]]);   // the counter is too tall to vault
    b.ledge(IB + 0.3, 3.1, 6.0);                                // the striped canopy
    b.arc(IB + 0.6, 1.8, 5, 4.6, 1.4);
    b.coins(IB + 1.2, 4.0, 4, 1.3);
    const DX = 296.6;
    L.props.push({ kind: 'bx', key: 'dt_dino', x: DX, y: 0, h: 7.949 });
    L.solids.push({ kind: 'block', x: DX + 6.9, y: 0, w: 12.1, h: 1.0, style: 'hidden' });   // the plinth
    const spine = [[0.2, 1.75], [3.4, 2.2], [6.6, 3.35], [9.8, 4.7], [12.6, 5.4], [15, 5.1], [18.8, 5.2]];
    for (let i = 1; i < spine.length; i++) b.slope(DX + spine[i - 1][0], spine[i - 1][1], DX + spine[i][0], spine[i][1]);
    for (let x = DX + 6.5; x < DX + 19.2; x += 1.354) L.props.push({ kind: 'bx', key: 'dt_rope', x, y: 0, h: 0.931 });
    b.coins(DX + 1.4, 2.6, 5, 1.5, 0.42);
    b.coins(DX + 10.6, 5.9, 5, 1.5, 0.05);
    b.coins(DX + 8.4, 1.9, 6, 1.4);                             // or along the plinth
    b.dxSolid('dt_olive', 319.6, 2.362, [[0.25, 1.07, 1.45]]);
    // 6. Burj Lake: the promenade, a little boardwalk over an inlet, lamp posts and palms
    b.groundTop(326, 345.4, 0, 'dtprom');
    L.dtWater = [[345.4, 348.9]];
    b.ledge(345.2, 0, 3.9);                                     // the boardwalk
    L.props.push({ kind: 'bx', key: 'dt_board', x: 345, y: -0.78, h: 1.75 });
    b.groundTop(348.9, 447, 0, 'dtprom');
    L.dtOutside = 326;                                          // the mall's outside wall steps down to the lake
    b.dxSolid('dt_ppalm', 329.2, 4.92, [[0.35, 2.2, 1.45]]);
    b.coins(327.6, 2.3, 5, 1.0);
    b.dxSolid('dt_pbench', 335.2, 1.364, [[0.1, 2.37, 0.8]]);
    b.crow(340.4);
    b.coins(337.4, 1.0, 5, 1.1);
    b.bxProp('dt_plamp', 348.2, 0, 4.782); b.ledge(348.15, 4.7, 0.9);
    b.coins(346, 2.2, 2, 1.0);
    b.special(348.6, 5.6);                                      // 5: by the boardwalk's lamp post
    b.dxSolid('dt_pbench', 352.4, 1.364, [[0.1, 2.37, 0.8]]);
    b.dxSolid('dt_ppalm', 356.6, 4.92, [[0.35, 2.2, 1.45]]);
    b.coins(353, 2.0, 6, 1.0);
    // the fountain show: the jets in the lake dance in patterns all along the last stretch
    L.dtShow = [359, 419];
    b.arc(360.4, 1.4, 6, 4.6, 2.4);
    b.dxSolid('dt_pbench', 366, 1.364, [[0.1, 2.37, 0.8]]);
    b.arc(366.4, 2.0, 6, 4.8, 2.6);
    b.dxSolid('dt_ppalm', 373.4, 4.92, [[0.35, 2.2, 1.45]]);
    b.coins(374, 2.3, 3, 0.8);
    b.arc(376.8, 1.2, 7, 6.0, 2.8);
    b.crow(381.2);
    b.dxSolid('dt_pbench', 386.4, 1.364, [[0.1, 2.37, 0.8]]);
    b.arc(386.8, 2.0, 6, 4.8, 2.6);
    b.dxSolid('dt_ppalm', 393.2, 4.92, [[0.35, 2.2, 1.45]]);
    b.coins(393.8, 2.3, 3, 0.8);
    b.coins(397, 1.0, 3, 1.0);
    b.flag(401);
    L.finale = 405.5;                                           // A walks to the railing, turns to face the Burj Khalifa, and the fireworks start
    L.dtBurj = 405.5;
    b.end(439);
    b.hidden(445, 2, 30);
  },
},
{
  id: 'palm', name: 'The Palm', plate: 'The Palm', area: 'palm', city: 'Dubai',
  build(b) {
    const L = b.L;
    // The Palm: the monorail station and beam, the Palm trunk beach, The View at the top of the Palm Tower, Atlantis and its lobby,
    // the water park (A changes into his wetsuit), the Leap of Faith slide through the shark lagoon, then a speedboat to the Marina
    L.outfit = 'dxb'; L.killY = -9; L.startX = 4.0; L.startY = 4.0; L.camMin = -9;
    L.jeepStop = 0; L.landT = 0;                                // the monorail pulls in and A steps out (drawn by the Palm renderer)
    const slide = (pts, v, x0 = 0, id) => { for (let i = 1; i < pts.length; i++) { b.slope(x0 + pts[i - 1][0], pts[i - 1][1], x0 + pts[i][0], pts[i][1]); const sl = L.slopes[L.slopes.length - 1]; if (v) sl.belt = v; if (id) sl.id = id; } };
    const lifeguard = x => { L.props.push({ kind: 'bx', key: 'pm_lifeguard', x, y: 0, h: 3.546 }); b.ledge(x + 0.15, 1.72, 2.05); b.ledge(x + 0.05, 3.45, 2.4); };
    const cabana = (x, key = 'pm_cabana', h = 2.941) => { L.props.push({ kind: 'bx', key, x, y: 0, h }); b.ledge(x + 0.25, h - 0.05, bxw(key, h) - 0.5); L.solids.push({ kind: 'block', x: x + 0.35, y: 0, w: bxw(key, h) - 0.7, h: 0.75, style: 'hidden' }); };
    const bxw = (key, h) => ({ pm_cabana: 3.286 / 2.941, pm_scabana: 3.4 / 3.65 })[key] * h;
    const lounger = x => b.dxSolid('pm_lounger', x, 1.361, [[0.1, 2.4, 0.85]]);
    const thatch = x => { L.props.push({ kind: 'bx', key: 'pm_thatch', x, y: 0, h: 3.084 }); b.ledge(x + 0.4, 2.6, 2.1); };
    const parasol = x => { L.props.push({ kind: 'bx', key: 'pm_parasol', x, y: 0, h: 2.807 }); b.ledge(x + 0.35, 2.35, 2.0); };
    const surf = x => b.dxSolid('pm_surf', x, 2.328, [[0.15, 1.9, 2.3]]);
    const planter = (x, y0 = 0) => b.dxSolid('pm_planter', x, 4.35, [[0.45, 2.75, 1.45]], { y0 });
    b.hidden(-10, 1.5, 30);
    // 1. Gateway station: A steps off the monorail onto the platform; the canopy roof is a high road
    b.groundTop(-30, 66.4, 0, 'pmroad');
    const S0 = -14.0, P = 4.0;
    L.pmStation = { x: S0, y: P - 1.12, train: -8.5, ty: P - 0.3 };
    L.solids.push({ kind: 'block', x: S0 + 0.6, y: P - 1.1, w: 37.1, h: 1.1, style: 'hidden' });   // the platform
    b.ledge(S0 + 1.6, 7.9, 35.0);                              // the canopy roof
    b.coins(8.0, 5.0, 4, 1.1);
    b.dxSolid('dt_olive', 14.6, 2.362, [[0.25, 1.07, 1.45]], { y0: P });
    b.arc(6.4, 8.6, 6, 6.0, 0.6);
    b.special(13.4, 8.9);                                      // 1: on the station roof
    b.coins(16.6, 9.0, 4, 1.1);
    // the monorail beam: the high road on its pillars; the street below is the low road
    L.pmBeam = { x0: S0 + 37.4, x1: 60.84, y: P };
    b.ledge(S0 + 37.5, P, 60.6 - (S0 + 37.5));
    L.props.push({ kind: 'bx', key: 'pm_stairs', x: 58.0, y: -0.05, h: 5.274, flip: true });
    b.ledge(58.0, P, 2.7);
    b.slope(60.7, P, 66.6, 0.2);                               // the station stairs down to the beach
    b.coins(25.0, 5.0, 5, 1.2);
    b.gull(33, 4.75, 1.2);
    b.arc(35.2, 4.8, 5, 4.0, 1.6);
    b.coins(41.0, 5.0, 4, 1.2);
    b.gull(46.5, 4.75, 1.4);
    b.arc(48.4, 4.8, 5, 4.0, 1.6);
    b.coins(53.6, 5.0, 4, 1.2);
    // down on the street
    b.bxProp('pm_palm', 26.4, 0, 3.454);
    planter(29.6);
    b.coins(32.6, 1.0, 5, 1.1);
    surf(39.4);
    b.coins(39.8, 3.2, 3, 0.6);
    b.bxProp('pm_palm', 44.0, 0, 3.454);
    b.crab(48, 45.5, 53);
    planter(54.0);
    b.coins(56.6, 1.0, 4, 1.1);
    // 2. the Palm trunk: beach clubs, lifeguard towers and loungers; The Palm Tower's terrace is the high spot
    const TXB = 109;
    b.groundTop(66.4, TXB, 0, 'pmsand');
    b.bxProp('pm_palm', 67.6, 0, 3.454);
    surf(70.6);
    b.coins(71.0, 3.3, 3, 0.6);
    lifeguard(74.2);
    b.coins(74.8, 4.5, 3, 0.8);
    cabana(78.4);
    b.coins(79.0, 3.9, 4, 0.8);
    lifeguard(87.4);
    b.arc(88.0, 4.4, 4, 3.0, 1.6);
    surf(92.0);
    b.crab(96, 95, 99.5);
    thatch(100.2); parasol(103.4); thatch(106.4);
    b.coins(100.8, 3.6, 8, 1.0);
    // 3. The View: a glass lift up the outside of the Palm Tower, the open-air sky deck at level 52 with the whole Palm
    //    spread out below (Atlantis in the middle), the window cleaners' cradle, then a glass lift back down to the beach
    const LX = 116, CW = 7.462, D = 14, WALL = LX + CW * 0.905;
    const DK0 = WALL, DX = WALL + 34, WALL2 = DX + CW * 0.905, TX1 = WALL2 + 2.2;
    const MD = TX1 + 21.6, MX = MD + 6.2;                       // Nakheel Mall: in at the foot of the lift tower, out through its glass doors at MD
    L.pv = { tower: LX, lx: LX, dx: DX, cw: CW, d: D, dk0: DK0, x1: TX1, seam: TX1, mall: TX1, md: MD, mx: MX, trunk: 225.6 };   // the Palm view until the mall, then the Palm trunk from the beach until Atlantis
    L.camFloor = [[LX, WALL2, D]];
    b.groundTop(TXB, TX1, 0, 'pmsand');
    const up = { kind: 'lift', mover: true, trig: 'pvUp', x: LX, w: CW, y: 0, y0: 0, y1: D, up: 3.0, d0: 0.45 };
    const down = { kind: 'lift', mover: true, trig: 'pvDown', x: DX, w: CW, y: D, y0: D, y1: 0, up: 2.8, d0: 0.45 };
    (L.movers = L.movers || []).push(up, down); L.oneways.push(up, down);
    L.pvUp = up; L.pvDown = down;
    L.solids.push({ kind: 'block', x: WALL, y: 0, w: 0.4, h: D - 1.0, style: 'hidden', noGrab: true });           // the lift's far side, all the way up
    L.solids.push({ kind: 'block', x: WALL, y: D - 1.0, w: DX - WALL, h: 1.0, style: 'hidden', noGrab: true });   // the sky deck slab
    L.solids.push({ kind: 'block', x: DX - 0.4, y: 0, w: 0.4, h: D - 1.0, style: 'hidden', noGrab: true });
    L.solids.push({ kind: 'block', x: LX - 0.4, y: 3.6, w: 0.4, h: 40, style: 'hidden', noGrab: true });        // the tower beside the up lift
    L.solids.push({ kind: 'block', x: WALL2, y: 3.6, w: TX1 - WALL2, h: 40, style: 'hidden', noGrab: true });   // the lift tower beside the down lift
    b.coins(TXB - 3.0, 1.0, 3, 1.0);
    b.coins(LX + 1.6, 1.4, 6, 0, 2.2);                        // up the lift
    // the sky deck
    const sol = (key, x, h, box) => b.dxSolid(key, x, h, [box], { y0: D });
    b.coins(DK0 + 0.8, D + 1.0, 3, 1.0);
    sol('pv_bench', DK0 + 3.6, 0.631, [0.1, 2.4, 0.6]);
    b.coins(DK0 + 4.0, D + 1.7, 3, 0.9);
    sol('pv_scope', DK0 + 8.0, 1.269, [0.15, 0.5, 1.2]);
    b.arc(DK0 + 7.0, D + 1.4, 4, 2.6, 1.2);
    L.props.push({ kind: 'bx', key: 'pv_canopy', x: DK0 + 10.6, y: D, h: 3.629 }); b.ledge(DK0 + 10.6, D + 3.45, 4.9);
    b.coins(DK0 + 11.0, D + 4.3, 4, 1.1);
    b.special(DK0 + 13.0, D + 6.6);                           // 2: high over the shade canopy
    sol('pv_lounger', DK0 + 16.6, 1.483, [0.15, 2.7, 0.75]);
    b.coins(DK0 + 17.0, D + 1.9, 3, 0.9);
    sol('pv_palm', DK0 + 20.6, 3.708, [0.55, 1.2, 1.5]);
    const cr = { kind: 'pvcradle', mover: true, x: DK0 + 23.4, w: 6.0, y: D + 2.2, y0: D + 2.2, y1: D + 7.0, up: 1.8, d0: 1.1, d1: 0.9, ph: 0 };
    L.movers.push(cr); L.oneways.push(cr); L.pvCradle = cr;
    b.coins(DK0 + 23.8, D + 1.0, 4, 1.1);
    b.special(DK0 + 26.4, D + 9.0);                           // 3: ride the window cleaners' cradle up
    sol('pv_olive', DK0 + 30.2, 1.815, [0.1, 1.1, 0.6]);
    b.coins(DX + 1.0, D + 1.0, 3, 1.0);
    b.coins(DX + 3.4, D - 1.6, 5, 0, -2.4);                   // down the lift
    // out at the bottom, through Nakheel Mall (the shops at the foot of the tower) and out of its glass doors onto the beach
    b.groundTop(TX1, MX, 0, 'pvmall');
    b.coins(TX1 + 0.4, 1.0, 3, 1.0);
    b.dxSolid('pv_mbench', TX1 + 4.6, 0.569, [[0.1, 2.07, 0.55]]);
    b.coins(TX1 + 4.8, 1.6, 3, 0.8);
    b.coins(TX1 + 8.4, 1.0, 3, 1.0);
    b.dxSolid('pv_mpalm', TX1 + 10.6, 2.928, [[0.5, 1.25, 1.5]]);   // potted palms: too tall to hop by himself
    b.arc(TX1 + 9.8, 1.8, 4, 2.8, 1.5);
    b.dxSolid('pv_mbench', TX1 + 14.0, 0.569, [[0.1, 2.07, 0.55]]);
    b.coins(TX1 + 14.2, 1.6, 3, 0.8);
    b.dxSolid('pv_mpalm', TX1 + 18.0, 2.928, [[0.5, 1.25, 1.5]]);
    b.arc(TX1 + 17.2, 1.8, 4, 2.8, 1.5);
    b.coins(MD + 1.0, 1.0, 4, 1.1);                          // out through the doors
    b.groundTop(MX, 225, 0, 'pmsand');
    b.coins(MX + 0.6, 1.0, 3, 1.0);
    b.coins(TX1 + 29.0, 1.0, 3, 1.0);
    cabana(TX1 + 32.0);
    b.coins(TX1 + 32.6, 3.9, 4, 0.8);
    lounger(TX1 + 36.4);
    b.coins(TX1 + 36.8, 2.0, 3, 1.0);
    parasol(TX1 + 40.0); thatch(TX1 + 43.0); parasol(TX1 + 46.2);
    b.coins(TX1 + 40.4, 3.4, 8, 1.0);
    b.crab(TX1 + 44, TX1 + 42.5, TX1 + 48);
    b.gull(TX1 + 47.6, 2.3, 1.2);
    surf(TX1 + 52.6);
    b.coins(TX1 + 53.0, 3.3, 3, 0.6);
    b.bxProp('pm_palm', 226.0, 0, 3.454);
    // 4. Atlantis: the hotel stands at the end of the Palm; A runs along its forecourt past the fountains, to the Aquaventure gate
    L.pmAtlantis = 252.0;
    b.groundTop(225, 286, 0, 'pmmarble');
    planter(228.0);
    b.coins(230.8, 1.0, 4, 1.1);
    const FT = 234.0;
    b.dxSolid('pm_fountain', FT, 3.641, [[0.25, 5.2, 1.5]]);
    b.ledge(FT + 1.9, 3.5, 1.8);
    b.arc(FT + 0.2, 2.3, 6, 5.2, 2.2);
    b.dxSolid('dt_olive', 242.0, 2.362, [[0.25, 1.07, 1.45]]);
    b.coins(242.2, 3.0, 3, 0.6);
    b.crab(246, 244.5, 249.5);
    b.bxProp('pm_palm', 249.6, 0, 3.454);
    planter(252.4);
    b.coins(252.8, 2.6, 2, 1.0);
    b.coins(255.4, 1.0, 4, 1.1);
    const FT2 = 259.6;
    b.dxSolid('pm_fountain', FT2, 3.641, [[0.25, 5.2, 1.5]]);
    b.ledge(FT2 + 1.9, 3.5, 1.8);
    b.arc(FT2 + 0.2, 2.3, 6, 5.2, 2.2);
    b.dxSolid('dt_olive', 267.4, 2.362, [[0.25, 1.07, 1.45]]);
    b.coins(267.6, 3.0, 3, 0.6);
    b.crab(272, 270.5, 275.5);
    planter(274.8);
    b.bxProp('pm_palm', 278.0, 0, 3.454);
    b.coins(278.4, 1.0, 4, 1.1);
    L.pmGate = 282.6;                                          // the Aquaventure gate: A runs in under its arch
    b.dxSolid('dt_olive', 281.0, 2.362, [[0.25, 1.07, 1.45]]);
    // 5. Aquaventure: A changes into his wetsuit in the beach hut, then rings on the lazy river, water jets, slides and the tipping bucket
    b.groundTop(286, 300, 0, 'pmboard');
    L.pmHut = 288.6; L.wetAt = 290.1;
    b.coins(286, 1.0, 2, 1.0);
    b.coins(292.4, 1.0, 3, 1.0);
    b.dxSolid('pm_towels', 294.2, 1.63, [[0.1, 1.65, 1.2]]);
    planter(297.0);
    b.coins(297.4, 2.6, 2, 1.0);
    // the lazy river: A swims across (a tap makes him leap out of the water like a dolphin)
    L.pmRiver = [[300, 313.6], [360, 370]];
    L.wetKill = [];
    b.swim(300, 313.6); b.swim(360, 370);
    b.slope(312.2, -0.9, 313.8, 0.0); b.slope(368.6, -0.9, 370.2, 0.0);   // A wades out up the far bank by himself
    b.coins(301.6, -1.9, 4, 0.9);                              // coins under the water: swipe down to dive for them
    b.special(306.2, -1.9);                                    // 5: on the bottom of the lazy river
    b.coins(308.0, -1.9, 4, 0.9);
    b.groundTop(313.6, 360, 0, 'pmboard');
    planter(316.2);
    b.coins(316.6, 2.6, 2, 1.0);
    planter(334.6);
    const JT1 = 322.4;
    L.solids.push({ kind: 'block', x: JT1, y: 0, w: 1.0, h: 0.12, style: 'hidden', bounce: 8.6, pmJet: true });
    b.coins(JT1 + 0.2, 2.6, 3, 0, 1.4);
    const ST = 324.2;
    L.props.push({ kind: 'bx', key: 'pm_stower', x: ST, y: 0, h: 7.887, behind: true });
    b.ledge(ST + 3.2, 3.05, 2.0); b.ledge(ST + 3.2, 6.95, 2.0); b.ledge(ST + 0.15, 4.95, 1.05);
    b.special(ST + 4.2, 7.9);                                  // 4: top of the slide tower, from the water jet
    const SL = 329.5;
    L.props.push({ kind: 'bx', key: 'pm_slide', x: SL, y: 0, h: 6.581 });
    slide([[0.55, 5.6], [10.0, 1.0]], 4, SL, 'slide1');
    b.coins(SL + 1.6, 5.9, 5, 1.7, -0.82);
    b.coins(ST + 1.0, 1.0, 6, 1.1);
    const PS = 341.4;
    L.props.push({ kind: 'bx', key: 'pm_play', x: PS, y: 0, h: 7.889 });
    b.ledge(PS + 2.2, 2.6, 2.6); b.ledge(PS + 1.4, 5.45, 3.9);
    L.mists = [{ x0: PS + 1.4, x1: PS + 5.6, top: 2.9, on: 1.2, off: 2.4, ph: 0.6, slow: 0.4, src: PS + 3.5, bucket: true }];
    b.coins(PS + 2.4, 3.6, 3, 0.9); b.coins(PS + 1.8, 6.4, 4, 1.0);
    const FS = 351.0;
    L.props.push({ kind: 'bx', key: 'pm_flatslide', x: FS, y: 0, h: 1.544 });
    L.solids.push({ kind: 'block', x: FS + 0.2, y: 0, w: 6.0, h: 1.3, style: 'hidden', belt: 6 });   // a speed slide: hop in and it flings A along
    b.coins(FS + 1.0, 2.3, 5, 1.2);
    b.coins(361.4, -1.9, 6, 0.9);
    b.groundTop(370, 402.6, 0, 'pmboard');
    b.bxProp('pm_lchair', 372.6, 0, 3.525);
    planter(375.4);
    b.coins(375.8, 2.6, 2, 1.0);
    planter(379.2);
    b.coins(379.6, 2.6, 2, 1.0);
    // 6. the Leap of Faith: up the temple steps, over the lip, down the slide and through the tube under the shark lagoon
    const LT = 382.0;
    L.pmLeap = LT;
    L.solids.push({ kind: 'block', x: LT + 0.2, y: 0, w: 2.2, h: 1.0, style: 'hidden' });
    b.slope(LT + 2.4, 1.0, LT + 10.2, 11.0);
    L.solids.push({ kind: 'block', x: LT + 10.2, y: 0, w: 3.6, h: 11.0, style: 'hidden' });
    b.slope(LT + 10.2, 11.0, LT + 13.8, 12.45);               // up onto the top of the Ziggurat: no step to jump, straight into the slide
    L.solids.push({ kind: 'block', x: LT + 13.8, y: 0, w: 0.8, h: 12.45, style: 'hidden' });
    b.coins(LT + 3.6, 3.2, 6, 1.2, 1.55);
    b.coins(LT + 11.0, 12.0, 2, 1.0);
    slide([[14.6, 12.45], [14.9, 12.3], [15.3, 10.6], [15.8, 8.5], [16.3, 6.5], [16.9, 4.5], [17.6, 2.8], [18.5, 1.6], [19.6, 0.9], [21.2, 0.6]], 3, LT, 'leap');
    const TD = LT + 20.6, TS = TD + 9.0, TU = TS + 10.7;
    L.pmTube = { d: TD, s: TS, u: TU, y: -4.85 };
    slide([[LT + 21.2, 0.6], [TD + 1.3, -0.6], [TD + 1.9, -1.8], [TD + 2.6, -2.6], [TD + 3.6, -3.0]], 3, 0, 'leap');
    L.solids.push({ kind: 'ground', x: TD + 3.6, y: -43, w: TU + 2.4 - TD - 3.6, h: 40, style: 'pmtube', belt: 4 });
    L.solids.push({ kind: 'block', x: TD + 3.8, y: -1.2, w: TU + 2.2 - TD - 3.8, h: 0.3, style: 'hidden', swim: true, belt: -1.6 });   // the tube roof: jump too far and A just swims over the top
    slide([[TU + 2.4, -3.0], [TU + 3.6, -2.6], [TU + 4.6, -1.8], [TU + 5.3, -0.9], [TU + 5.9, 0.0], [TU + 6.3, 0.6]], 4, 0, 'leap');
    b.coins(TD + 4.4, -2.2, 12, 1.4);
    b.coins(TS + 6.0, -2.2, 5, 1.4);
    // out of the splash pool, the flag, then along the jetty to the speedboat
    b.groundTop(TU + 6.2, TU + 18.7, 0, 'pmboard');
    b.coins(TU + 7.0, 1.0, 2, 0.9);
    b.flag(TU + 8.6);
    const JY = TU + 10.3;
    L.pmJetty = JY;
    L.taxiEnd = JY + 6.4;                                      // A hops into the speedboat waiting at the jetty end
    b.end(JY + 34);
    b.hidden(JY + 18.8, 2, 30);
  },
},
{
  id: 'marina', name: 'Marina', plate: 'Marina', area: 'marina', city: 'Dubai',
  build(b) {
    const L = b.L;
    // Dubai Marina, JBR and Bluewaters (art laid out from Ladi's pictures, src/marina/pieces.json has each piece's size in units)
    // speedboat in -> Marina Walk with yachts -> Marina Mall (two floors) -> glass lift up a tower -> XLine zip line across the marina
    // -> JBR The Walk -> JBR beach -> Bluewaters Bridge -> Ain Dubai plaza, flag, black Mercedes taxi
    L.outfit = 'dxb'; L.killY = -9; L.startX = 1.2; L.camMin = -11; L.landT = 0;
    L.jeepStop = -7.6; L.jeepKey = 'pm_boat'; L.jeepH = 1.93; L.jeepY = -0.75; L.jeepDoor = 6.0; L.introCam = 'centre'; L.jeepStay = true;   // the Palm's speedboat drops A at the Marina Walk
    L.taxiKey = 'ma_taxi'; L.taxiH = 1.42; L.taxiDoor = [0.35, 0.43, 0.64];
    const art = (key, x, y, h, o = {}) => (L.maArt = L.maArt || []).push(Object.assign({ key, x, y, h }, o));   // a picture standing at (x, y), h units tall
    const solid = (x, w, h, y = 0) => { L.solids.push({ kind: 'block', x, y, w, h, style: 'hidden' }); };
    const water = (x0, x1, y = -0.45) => (L.maWater = L.maWater || []).push([x0, x1, y]);
    // pieces with their solid parts (sizes from the art at its own scale)
    const palm = (x, y = 0) => { art('ma_palm', x, y, 6.5); solid(x + 1.16, 1.74, 1.38, y); };          // planter too tall to vault: needs a tap
    const cafe = (x) => { for (let i = 0; i < 3; i++) { const cx = x + i * 2.83; art('ma_cafe' + (i + 1), cx, 0, 2.984); solid(cx + 0.45, 1.9, 0.9); b.ledge(cx + 0.1, 2.12, 2.6); } };
    const bench = (x, y = 0) => { art('ma_bench', x, y, 0.984); solid(x + 0.1, 2.36, 0.6, y); };
    const lamp = (x) => art('ma_lamp', x, 0, 3.248, { back: true });
    // ---------- 1. the speedboat drop-off and Marina Walk ----------
    // the Marina towers close behind the walk (drawn at parallax 0.8; t = where the tower's top piece starts)
    const TWW = [4.615, 4.942, 4.558, 5.404, 4.481];
    L.maTowers = [];
    [[1, 1.0, 6.5], [4, 7.4, 9.5], [2, 13.6, 5.2], [5, 19.8, 10.5], [3, 26.4, 7.0], [1, 33.0, 8.8], [4, 39.6, 5.6], [2, 46.0, 9.8], [5, 52.6, 6.4]]
      .forEach(([k, x, t]) => L.maTowers.push({ k, x, t }));
    [[3, 88.0, 7.2], [1, 94.4, 9.6], [4, 100.6, 5.4], [2, 107.0, 10.2], [5, 113.2, 6.6]].forEach(([k, x, t]) => L.maTowers.push({ k, x, t }));
    // round Pier 7 they stand shoulder to shoulder and run off the top of the screen: the backdrop changes behind them
    for (let x = 118.6, i = 0; x < 144; i++) { const k = [1, 4, 2, 5, 3][i % 5]; L.maTowers.push({ k, x, t: 16 + (i * 3) % 4 }); x += TWW[k - 1] - 0.15; }
    water(-40, 0);
    L.solids.push({ kind: 'ground', x: -40, y: -40.9, w: 40, h: 40, style: 'none' });
    b.groundTop(0, 62, 0, 'mawalk');
    art('ma_pod_l', 0.4, 0, 7.282, { back: true });
    [2, 0, 3, 1, 2].forEach((f, i) => art('ma_pod', 6.1 + i * 10, 0, 6.885, { back: true, floors: f }));   // extra floors: the blocks are different heights
    art('ma_pod_r', 56.1, 0, 7.295, { back: true });
    [5.0, 21.0, 34.6, 52.0].forEach(lamp);
    b.coins(3, 1.0, 4, 1.0);
    cafe(10); b.coins(10.4, 3.0, 8, 1.0);
    palm(23.2); b.coins(23.6, 2.3, 3, 0.8);
    bench(29.6); b.coins(29.8, 1.5, 3, 0.8);
    palm(35.6); b.arc(35.2, 1.9, 5, 3.2, 1.3);
    cafe(41.6); b.coins(42, 3.0, 8, 1.0);
    palm(53.2);
    art('ma_bollard', 58.0, 0, 0.776); art('ma_buoy', 60.4, 0, 2.024, { back: true });
    // ---------- 2. the yachts: hop across three moored yachts (the water is safe: A swims to the steps) ----------
    b.swim(62, 85.3); water(62, 85.3);
    L.solids.push({ kind: 'block', x: 61.9, y: -0.9, w: 23.5, h: 1.3, style: 'hidden' });   // the yachts touch: no way down into the water
    const YS = 61.6, YB = 67.2, YM = 77.7;
    art('ma_yacht_s', YS, -0.65, 2.6); solid(YS + 0.9, 5.0, 1.4, -0.9); solid(YS + 1.8, 2.6, 0.75, 0.5);
    b.coins(YS + 0.6, 1.6, 3, 1.0);
    art('ma_yacht_b', YB, -0.65, 4.267); solid(YB + 0.9, 9.5, 1.8, -0.9); solid(YB + 1.6, 5.4, 0.9, 0.9); solid(YB + 7.0, 3.3, 0.4, 0.9);
    b.ledge(YB + 2.9, 2.7, 3.1);                               // the flybridge hardtop
    b.special(YB + 4.5, 4.7);                                  // 1: on top of the superyacht's flybridge
    b.coins(YB + 1.8, 2.9, 4, 1.0); b.coins(YB + 7.4, 2.3, 3, 1.0);
    art('ma_yacht_m', YM, -0.7, 2.791); solid(YM + 0.9, 6.3, 1.55, -0.9); solid(YM + 2.0, 3.2, 0.65, 0.65);
    b.coins(YM + 0.8, 2.1, 4, 1.0);
    // ---------- Marina Walk, second stretch, up to the mall doors ----------
    art('ma_bollard', 90.2, 0, 0.776); art('ma_buoy', 92.6, 0, 2.024, { back: true });
    art('ma_pod_l', 87.4, 0, 7.282, { back: true });
    [1, 3, 0].forEach((f, i) => art('ma_pod', 93.1 + i * 10, 0, 6.885, { back: true, floors: f }));
    [91.0, 100.5, 116.0].forEach(lamp);
    palm(86.4); b.coins(86.8, 2.3, 3, 0.8);
    b.coins(98, 1.0, 3, 1.0);
    cafe(101.6); b.coins(102, 3.0, 8, 1.0);
    palm(112.4); b.coins(112.8, 2.3, 3, 0.8);
    palm(118.6);
    // ---------- 3. Pier 7: in through the front door, a glass lift up the middle of the round tower to the roof lounge ----------
    const TX = 124.5, PL = TX + 5.45, PW7 = 2.46, PR = PL + PW7, TOP = 17.9, TW = TX + 11.9;   // tower picture's left edge, the lift shaft, the roof, the roof's right edge
    L.maPier7 = { x: TX, lift: PL, top: TOP, ys: [3.75, 6.6, 9.4, 12.25, 15.05] };
    const p7 = { kind: 'lift', mover: true, trig: 'p7Up', x: PL, w: PW7, y: 0, y0: 0, y1: TOP, up: 3.6, d0: 0.45 };
    (L.movers = L.movers || []).push(p7); L.oneways.push(p7); L.maP7Lift = p7;
    L.solids.push({ kind: 'block', x: PR, y: 0, w: 0.4, h: TOP, style: 'hidden', noGrab: true });            // the shaft's far side, open at the roof
    L.solids.push({ kind: 'block', x: PL - 0.4, y: 3.6, w: 0.4, h: 40, style: 'hidden', noGrab: true });     // above the lift door
    L.solids.push({ kind: 'block', x: PR, y: TOP - 0.6, w: TW - PR, h: 0.6, style: 'hidden', noGrab: true }); // the roof
    b.coins(PR - 0.55, 1.4, 6, 0, 2.6);                         // up the right side of the car, where A stands
    b.coins(TX + 2.0, 1.0, 3, 1.0);
    b.coins(PR + 0.8, TOP + 1.0, 3, 1.0);
    b.special(TX + 10.2, TOP + 3.2);                            // 2: above the roof lounge, jump before the bridge
    L.maSwap = PL + PW7 / 2;                                    // the backdrop changes while Pier 7 and the towers round it fill the screen
    // ---------- 4. a glass sky bridge to the XLine tower, the lift up to the launch deck, then the zip line across the marina to JBR ----------
    const LX = TW + 6.0, CW = 2.46, D = 28, WALL = LX + CW, BY = TOP;
    b.groundTop(85.1, WALL + 1.0, 0, 'mawalk');
    L.solids.push({ kind: 'block', x: TW, y: BY - 0.6, w: LX - TW, h: 0.6, style: 'hidden', noGrab: true });   // the bridge floor
    L.maSky = { x0: TW, x1: LX, y: BY };
    const up = { kind: 'lift', mover: true, trig: 'mUp', x: LX, w: CW, y: BY, y0: BY, y1: D, up: 3.6, d0: 0.45 };
    (L.movers = L.movers || []).push(up); L.oneways.push(up); L.maLift = up;
    L.solids.push({ kind: 'block', x: WALL, y: 0, w: 0.4, h: D - 1.0, style: 'hidden', noGrab: true });
    L.solids.push({ kind: 'block', x: WALL, y: D - 1.0, w: 9.0, h: 1.0, style: 'hidden', noGrab: true });
    L.solids.push({ kind: 'block', x: LX - 0.4, y: BY + 3.6, w: 0.4, h: 40, style: 'hidden', noGrab: true });
    L.maTower = { x: LX - 1.6, lx: LX, wall: WALL, d: D };
    b.coins(WALL - 0.55, BY + 1.4, 5, 0, 1.9);                 // up the right side of the car, where A stands
    b.coins(WALL + 1.0, D + 1.0, 4, 1.0);
    const Z0 = WALL + 9.0, ZL = Z0 + 44.44, LAND = 4.95, Z1 = ZL + 1.5, HANG = 2.2;
    L.zip = { x0: Z0, y0: D + HANG, x1: Z1, y1: LAND + HANG, hang: HANG, v: 10, land: LAND, px: WALL + 4.8, py: D - 1.6 + 4.25 };
    water(WALL + 1.0, ZL + 9);
    art('ma_yacht_m', Z0 + 6, -0.7, 2.791, { back: true }); art('ma_yacht_b', Z0 + 16.4, -0.65, 4.267, { back: true }); art('ma_yacht_s', Z0 + 32, -0.65, 2.6, { back: true });
    // coins along the ride: a tap lifts A, a swipe down drops him
    const zy = (x) => L.zip.y0 + (L.zip.y1 - L.zip.y0) * (x - Z0) / (Z1 - Z0) - HANG;
    for (let i = 0; i < 18; i++) {
      const x = Z0 + 3 + i * 2.3, off = [0, 0, 0, 1, 1, 1, 0, 0, -1, -1, -1, 0, 0, 1, 1, 0, 0, 0][i];
      L.coins.push({ x, y: zy(x) + 0.8 + off * 1.0 });
    }
    b.special(Z0 + 24, zy(Z0 + 24) + 2.2);                      // 3: on the zip line (tap to lift up to it)
    // the landing deck on the JBR side and its stairs down
    art('ma_land', ZL, -0.35, 7.8, { back: true });
    L.maLand = { x: ZL, y: LAND, x2: ZL + 15.4 };              // its rails are drawn again in front of A, solid
    b.groundTop(ZL + 0.3, ZL + 6.8, LAND, 'none');
    b.slope(ZL + 6.8, LAND, ZL + 15.4, 0);
    const J0 = ZL + 15.4;                                      // 281.9
    // ---------- 5. JBR The Walk: restaurants under the JBR towers, supercars at the kerb ----------
    const RW = [4.262, 3.984, 4.238, 4.262], RH = [4.107, 4.098, 4.107, 4.123];
    const block = (x, order) => {                              // a JBR building: end, four restaurants (awnings are ledges), end
      art('ma_jbr_l', x, 0, 8.0, { back: true }); let cx = x + 4.33;
      const r0 = cx;
      for (let tx = x; tx < x + 25.3; tx += 4.19) art('ma_jbr', tx, 3.6, 7.409, { back: true, under: true });
      for (const k of order) { art('ma_rest' + k, cx, 0, RH[k - 1], { back: true }); b.ledge(cx + 0.15, 2.9, RW[k - 1] - 0.3); cx += RW[k - 1]; }
      art('ma_jbr_r', cx, 0, 8.0, { back: true });
      return cx + 4.36;
    };
    const car = (key, x, h, top) => { art(key, x, 0, h); solid(x + 0.3, 3.8, top); b.coins(x + 0.6, top + 0.7, 3, 1.0); };
    const B1 = block(J0 + 1, [1, 2, 3, 4]);
    b.coins(J0 + 5.6, 3.8, 14, 1.15);
    car('ma_lambo', J0 + 9.2, 1.11, 1.15);
    car('ma_sl', J0 + 19.4, 1.24, 1.25);
    const B2x = B1 - 0.05, B2 = block(B2x, [3, 1, 4, 2]);      // the blocks stand wall to wall
    b.special(B2x + 4.33 + 8.6, 5.2);                           // 4: above the restaurant awnings
    b.coins(B2x + 4.6, 3.8, 6, 1.1); b.coins(B2x + 12.4, 3.8, 4, 1.1);
    car('dt_urus', B2x + 3.0, 1.45, 1.35);
    car('dt_911', B2x + 14.6, 1.36, 1.2);
    const B3x = B2 - 0.05, B3 = block(B3x, [2, 4, 1, 3]);
    b.coins(B3x + 5.6, 3.8, 14, 1.15);
    car('dt_gw', B3x + 5.0, 1.75, 1.65);
    car('bx_car1', B3x + 16.6, 1.6, 1.35);
    b.gull(B3 - 2.5, 2.2, 1.4);
    art('ma_jbr_arch', B3 + 0.4, 0, 5.204, { back: true });    // the stone arch through to the beach
    const J1 = B3 + 5.4;
    b.groundTop(ZL + 6.8, J1, 0, 'majbr');
    // ---------- 6. JBR beach ----------
    const K = J1 + 2.5, UM = K + 9.2, BX = UM + 29.0, DY = 2.95;
    b.groundTop(J1, BX + 2.3, 0, 'masand');
    art('ma_kiosk', K, 0, 3.37, { back: true }); solid(K + 1.25, 5.0, 2.15); b.ledge(K + 1.2, 2.2, 5.1);
    b.coins(K + 1.6, 3.2, 5, 1.0);
    art('ma_umbs', UM, 0, 2.861, { back: true }); b.ledge(UM + 0.05, 2.0, 6.45);
    b.coins(UM + 0.4, 3.0, 6, 1.1);
    b.crab(UM + 9.5, UM + 8.0, UM + 12.5);
    art('ma_shower', UM + 13.2, 0, 2.31, { back: true });
    art('ma_jetski', UM + 15.4, 0, 1.47); solid(UM + 15.6, 2.6, 1.05);
    b.coins(UM + 15.6, 2.2, 3, 1.0);
    art('pm_lounger', UM + 20.0, 0, 0.85, { back: true });
    palm(UM + 23.2);
    art('ma_dune', UM + 27.0, 0, 1.85, { back: true });
    // ---------- 7. Bluewaters Bridge: up the ramp, across, down; special on the arch ----------
    L.maBridge = { x: BX, dy: DY };
    water(BX + 2.0, BX + 51.6, -0.6);
    L.solids.push({ kind: 'ground', x: BX + 2.3, y: -40.9, w: 49, h: 40, style: 'none' });
    b.slope(BX + 2.3, 0, BX + 13.0, DY);
    b.groundTop(BX + 13.0, BX + 40.9, DY, 'none');
    b.slope(BX + 40.9, DY, BX + 51.6, 0);
    const AX = BX + 14.6 + 2.35;
    const bwp = (x) => { art('ma_bwpalm', x, DY, 5.9); solid(x + 0.45, 3.2, 1.35, DY); };   // planters on the bridge deck
    bwp(BX + 13.4); bwp(BX + 35.6);
    b.coins(BX + 13.7, DY + 2.6, 4, 0.9); b.coins(BX + 35.9, DY + 2.6, 4, 0.9);
    b.ledge(AX + 3.2, DY + 2.15, 2.2);                          // the arch's shoulder
    b.ledge(AX + 7.0, DY + 3.4, 6.0);                           // the top of the arch
    b.special(AX + 10.0, DY + 4.9);                             // 5: on top of the bridge arch
    b.coins(BX + 4, 1.0, 4, 1.4, 0.4); b.coins(AX + 7.4, DY + 4.3, 6, 1.0);
    b.coins(BX + 42, 2.4, 4, 1.4, -0.55);
    // ---------- 8. Bluewaters: the Ain Dubai plaza, the flag, the black Mercedes ----------
    const P0 = BX + 51.6;
    b.groundTop(P0, P0 + 60, 0, 'maplaza');
    L.maWheel = P0 + 24;
    art('ma_bwshops', P0 + 1.5, 0, 4.64, { back: true }); art('ma_bwshops', P0 + 23.8, 0, 4.64, { back: true });
    art('ma_bwpalm', P0 + 3.0, 0, 5.9); solid(P0 + 3.45, 3.2, 1.35);
    b.coins(P0 + 3.2, 2.6, 4, 0.9);
    art('ma_bwbench', P0 + 9.0, 0, 0.9); solid(P0 + 9.1, 2.2, 0.62);
    b.coins(P0 + 9.2, 1.7, 3, 0.8);
    b.flag(P0 + 15.0);
    L.taxiEnd = P0 + 18.4; L.buggyEnd = true;   // A's lime green buggy is parked here: he hops in and drives off to the desert race
    art('ma_bwpalm', P0 + 26.5, 0, 5.9, { back: true });
    b.end(P0 + 50);
    b.hidden(P0 + 53, 2, 30);
  },
},
{
  id: 'desert', name: 'Desert Race', plate: 'Desert<br>Race', area: 'desert', bonus: true,
  build(b) {
    const L = b.L;
    // bonus round: A in his lime green buggy races his uncle's grey Jeep across the dunes. Taps fire a boost.
    // The ground is a height line (no blocks): flat start, rolling dunes, a dry riverbed with a rock ramp, a sandstorm, the sprint.
    const S = 14, FIN = 420;
    L.outfit = 'dxb'; L.noFlag = true; L.startX = S - 1.1; L.camMin = -4;
    const pts = [   // x, height, ground under this stretch (up to the next point)
      [-40, 0, 'flat'], [32, 0, 'dune'], [44, 3.0, 'dune'], [50, 0.6, 'dune'], [60, 1.2, 'dune'], [70, 5.5, 'dune'], [75, 1.6, 'dune'], [84, 0.4, 'dune'],
      [95, 3.8, 'dune'], [101, 1.0, 'dune'], [108, 1.6, 'dune'], [120, 6.0, 'dune'], [125.5, 1.8, 'dune'], [135, 0, 'flat'],
      [150, 0, 'river'], [155, -1.4, 'river'], [166, -1.4, 'river'],
      [172.2, 0.41, 'river', 'lin'], [175.3, 0.41, 'river', 'lin'], [175.31, -1.4, 'river', 'lin'], [190, -1.4, 'river'], [197, 0, 'dune'],
      [207, 2.2, 'dune'], [214, 0.5, 'dune'], [226, 4.8, 'dune'], [231, 1.2, 'dune'], [240, 0.8, 'dune'], [252, 6.5, 'dune'], [258, 1.5, 'dune'],
      [266, 0.2, 'dune'], [276, 3.2, 'dune'], [283, 0.6, 'dune'], [290, 0, 'flat'], [302, 0.9, 'flat'], [312, 0, 'flat'], [324, 1.2, 'flat'], [336, 0, 'flat'], [345, 0, 'storm'],
      [354, 1.6, 'storm'], [361, 0.4, 'storm'], [371, 2.6, 'storm'], [378, 0.3, 'storm'], [385, 0, 'flat'], [560, 0, 'flat'],
    ];
    L.race = { S, FIN, pts, ramp: { x: 166, y: -1.4, w: 9.962, h: 1.815 }, storm: [345, 385], camp: FIN + 4 };
    const H = x => raceH(L, x);
    // scenery, sitting on the sand (lowest point under its middle, so nothing floats): key, left x, width (from the art), layer
    const PIECE = { ds_start: [9.429, 5.129], ds_finish: [9.4, 5.129], ds_tent: [20.5, 5.214], ds_flags: [6.171, 3.271], ds_lanterns: [2.25, 1.89], ds_frond: [6.986, 2.571],
      ds_fire: [2.967, 1.689], ds_tree: [7.143, 4.886], ds_rocks: [4.2, 2.07], ds_boulder: [4.85, 1.7], ds_shrub: [1.754, 1.069], ds_branch: [3.146, 1.085], ds_fence: [4.246, 0.808] };
    L.race.props = [];
    const prop = (key, x, front) => { const [w, h] = PIECE[key]; let y = 1e9; for (let u = 0.2; u <= 0.8; u += 0.1) y = Math.min(y, H(x + w * u)); L.race.props.push({ key, x, y: y - 0.06, w, h, front: !!front }); };
    for (let x = S - 22; x < S - 4; x += 4.246) prop('ds_fence', x);
    prop('ds_flags', S - 14.5); prop('ds_start', S - 7.8);
    for (let x = S + 3.4; x < 30; x += 4.246) prop('ds_fence', x);
    prop('ds_shrub', 36.5, true); prop('ds_tree', 52.6); prop('ds_shrub', 79.5); prop('ds_rocks', 85.2); prop('ds_shrub', 103.6, true); prop('ds_tree', 128.4);
    prop('ds_boulder', 139.2); prop('ds_branch', 146.0, true); prop('ds_shrub', 159.6); prop('ds_rocks', 183.5); prop('ds_branch', 191.0, true);
    prop('ds_shrub', 210.5, true); prop('ds_tree', 233.2); prop('ds_rocks', 260.4); prop('ds_shrub', 268.5); prop('ds_branch', 284.2, true); prop('ds_boulder', 292.0);
    prop('ds_shrub', 298.0); prop('ds_tree', 309.5); prop('ds_branch', 318.0, true); prop('ds_rocks', 331.0); prop('ds_shrub', 340.0, true);
    prop('ds_tree', 357.6); prop('ds_shrub', 374.5); prop('ds_rocks', 379.8);
    for (let x = 388; x < FIN - 5; x += 4.246) prop('ds_fence', x);
    prop('ds_flags', FIN - 13.5); prop('ds_finish', FIN - 4.7);
    prop('ds_tent', FIN + 7.5); prop('ds_frond', FIN + 1.6); prop('ds_fire', FIN + 13.2); prop('ds_lanterns', FIN + 22.5); prop('ds_frond', FIN + 28.6); prop('ds_flags', FIN + 34);
    // coins along the way, at the height the buggy drives through; a high arc over the ramp only a boost reaches
    const line = (x0, n, dx) => { for (let i = 0; i < n; i++) { const x = x0 + i * dx; L.coins.push({ x, y: H(x) + 0.9 }); } };
    line(24, 4, 1.6); line(41, 4, 1.4); line(66, 4, 1.4); line(90, 5, 1.5); line(116, 4, 1.4); line(140, 5, 1.6);
    line(157, 4, 1.8);
    for (let i = 0; i < 6; i++) { const t = i / 5; L.coins.push({ x: 177.5 + t * 9, y: 1.6 + 4 * 2.2 * t * (1 - t) }); }
    line(202, 4, 1.5); line(222, 4, 1.4); line(247, 4, 1.4); line(271, 4, 1.4); line(299, 4, 1.5); line(321, 4, 1.5); line(351, 4, 1.5); line(368, 4, 1.4); line(391, 8, 2.6);
    b.end(FIN + 42);
  },
},
{
  id: 'capetown', name: 'Cape Town', plate: 'Cape Town', area: 'capetown', city: 'Cape Town',
  build(b) {
    const L = b.L;
    // Cape Town, drawn from Ladi's art (src/capetown/cut.py; sizes in src/capetown/pieces.json). Plan: london-runner/capetown/capetown-plan.md
    // minibus taxi at Mouille Point -> Blue Train Park ride -> promenade -> V&A Waterfront -> Two Oceans Aquarium (two floors)
    // -> Greenmarket Square -> Bo-Kaap (uphill) -> fynbos path -> lower cable station -> cable car -> Table Mountain top (Cape Doctor wind) -> tablecloth ending
    L.outfit = 'dxb'; L.killY = -8; L.startX = 2.0; L.camMin = -9; L.introCam = -6.2;
    const art = (key, x, y, h, o = {}) => (L.ctArt = L.ctArt || []).push(Object.assign({ key, x, y, h }, o));   // a picture standing at (x, y), h units tall
    const solid = (x, w, h, y = 0, o = {}) => L.solids.push(Object.assign({ kind: 'block', x, y, w, h, style: 'hidden' }, o));
    const ledge = (x, y, w) => b.ledge(x, y, w);
    const ground = (x0, x1, style, y = 0) => L.solids.push({ kind: 'ground', x: x0, y: y - 40, w: x1 - x0, h: 40, style });
    const W = k => ({ ct_wf1: 5.547, ct_wf2: 5.617, ct_gm_cream: 3.847, ct_gm_green: 3.933, ct_gm_upper: 3.41, ct_townhouse: 6.443, ct_mk_red: 2.407, ct_mk_yel: 2.24, ct_mk_grn: 2.367, ct_mk_blu: 2.333,
      ct_bk_pink: 3.709, ct_bk_lime: 3.875, ct_bk_teal: 3.944, ct_bk_yel: 3.869, ct_bk_lilac: 3.717, ct_mosque: 5.061, ct_stall_g: 2.827, ct_stall_o: 2.727, ct_stall_b: 2.727, ct_kiosk: 2.757 })[k];
    // knee-high things A hops by himself, and taller ones he leans on and jumps
    const bollard = (x) => { art('ct_bollard', x, 0, 0.45); solid(x + 0.05, 0.3, 0.42); };
    const rope = (x) => { art('ct_rope', x, 0, 0.45); solid(x + 0.05, 0.57, 0.4); };
    const crates2 = (x) => { art('ct_crates2', x, 0, 0.7); solid(x + 0.04, 0.55, 0.66); };
    const crates4 = (x) => { art('ct_crates4', x, 0, 1.45); solid(x + 0.04, 0.64, 1.4); ledge(x + 0.02, 1.42, 0.68); };   // a tap
    const pbench = (x) => { art('ct_prom_bench', x, 0, 0.85); solid(x + 0.1, 1.3, 0.5); };
    const planter = (x, y = 0, tall) => { const k = tall ? 1.6 : 1; art('ct_planter', x, y, 0.9 * k); solid(x + 0.08 * k, 0.57 * k, tall ? 1.4 : 0.85, y); if (tall) ledge(x + 0.1, y + 1.42, 0.8); };

    // ---------- 1. Mouille Point: the minibus taxi drops A on Beach Road ----------
    b.wall(-9.5, 1, 22);
    ground(-14, 7, 'ctprom');
    L.ctTaxi = { x: -4.0 };                                     // the doorway is in the middle; A steps out, the taxi drives off to the left
    art('ct_palm2', -7.8, 0, 5.5, { back: true });
    pbench(4.0);
    b.coins(4.0, 1.4, 3, 0.6);

    // ---------- 2. The Blue Train Park: a fast ride on the miniature train ----------
    ground(7, 95, 'ctlawn');
    L.ctFence = [[7.6, 94.0]];
    art('ct_gate_l', 6.2, 0, 0.8, { back: true });
    art('ct_gazebo', 8.0, 0, 2.5, { back: true });
    const ST = 11.0;                                             // the little station: platform with its striped canopy
    art('ct_plat', ST, 0, 2.7, { back: true });
    // the track: A sits in the open carriage behind the engine. Tap = jump up out of his seat (high coins), swipe down = duck (tunnel)
    const T0 = 17.6, TB = 94.0;
    const pts = [[T0, 0], [27.5, 0], [30.5, 1.5], [32.0, 1.6], [35.6, 0], [44.5, 0], [46.3, 0.9], [53.8, 0.9], [55.6, 0], [TB - 7.0, 0]];
    L.rides = L.rides || [];
    const train = { kind: 'train', x0: T0, pts, v: 10.5, acc: 7, w0: 0.45, w1: 0.35, input: true, seat: 0.48, up: 1.2, down: 0.78,
      jump: 11.5, grav: 22, hits: [{ x: 38.0, kind: 'ctbonk' }], exitY: 0 };
    L.rides.push(train); L.ctTrain = train;
    const ty = (x) => { for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [a, c] = [pts[i - 1], pts[i]]; return a[1] + (c[1] - a[1]) * (x - a[0]) / (c[0] - a[0]); } return 0; };
    const lo = (x) => b.coins(x, ty(x) + 1.15, 1), hi = (x) => b.coins(x, ty(x) + 2.45, 1);
    // whoosh out of the station past the playground, the coins weaving low and high
    art('ct_swings', 19.0, 0, 2.4, { back: true }); art('ct_seesaw', 24.0, 0, 0.9, { back: true });
    [20.5, 22.5, 24.5].forEach(lo); [21.5, 23.5, 25.5, 26.5].forEach(hi);
    // the big dip into the tunnel: duck under its low mouth (or bonk and drop some coins)
    L.ctTrestles = [[27.5, 35.6], [44.5, 55.6]];
    [29.0, 30.5, 32.0, 33.5, 34.8].forEach(lo);
    L.ctTunnel = { x: 37.2 };                                    // the grassy hill and its stone mouth, the track runs through it
    [38.8, 40.0, 41.2, 42.4].forEach(x => b.coins(x, 0.6, 1));
    // out into the sun and over the little wooden bridge
    [46.5, 48.0, 49.5, 51.0, 52.5].forEach(hi);
    // along the sea wall: a string of coins up high, only reached with a big jump out of the seat
    L.ctSeaWall = [55.0, 80.0];
    [58.0, 59.4].forEach(lo);
    [61.6, 62.8, 64.0, 65.2, 66.4].forEach((x, i) => b.coins(x, 3.7 + [0, 0.45, 0.6, 0.45, 0][i], 1));
    [70.0, 71.4].forEach(lo);
    // the lighthouse special: hanging high on the bunting by the red and white lighthouse
    art('ct_lighthouse', 73.0, 0, 7.5, { back: true });
    L.ctBunting = [[76.2, 6.0], [83.5, 3.0]];
    b.special(78.6, 2.6);                                        // 1: pop up at the right moment
    [77.2, 80.0].forEach(hi);
    // screech into the station with a burst of steam; A climbs out and runs on
    art('ct_plat', TB - 11.6, 0, 2.7, { back: true });
    [84.0, 85.5].forEach(lo);
    art('ct_gym', 96.0, 0, 2.5, { back: true });
    art('ct_gate_l', 94.0, 0, 0.8, { back: true, flip: true });

    // ---------- 3. Along the promenade to the Waterfront ----------
    ground(95, 125, 'ctprom');
    L.ctPromWall = [95, 125];
    art('ct_palm2', 99.5, 0, 5.5, { back: true });
    b.coins(97.0, 1.1, 3, 0.8);
    pbench(101.5); b.coins(101.6, 1.8, 3, 0.6);
    b.gull(106.5, 2.6, 1.6);
    planter(104.6, 0, true); planter(110.0); planter(119.7, 0, true); art('ct_palm2', 111.5, 0, 5.5, { back: true });
    b.arc(112.5, 1.3, 5, 3.4, 1.4);
    pbench(117.5); b.coins(117.6, 1.8, 3, 0.6);
    b.pigeon(121.0);

    // ---------- 4. V&A Waterfront ----------
    ground(125, 230, 'ctquay');
    const CT = 124.6; art('ct_clock', CT, 0, 9.1, { back: true }); L.ctSwap0 = CT + 1.26;   // the middle strip changes behind the Clock Tower
    // Victorian harbour buildings wall to wall, their canopies are ledges
    let x = 127.6; L.ctWfRow = [x, 0]; x += 1.885;
    const WF = [];
    for (let i = 0; i < 5; i++) { const k = i % 2 ? 'ct_wf2' : 'ct_wf1'; WF.push([k, x]); ledge(x + 0.3, i % 2 ? 2.45 : 2.38, W(k) - 0.6); x += W(k) - 0.02; }
    L.ctWf = WF; L.ctWfRow[1] = x;
    bollard(130.0); rope(132.0); b.coins(130.5, 1.2, 3, 0.8);
    crates4(135.0); b.coins(135.1, 2.3, 2, 0.5);
    b.coins(136.5, 3.4, 5, 1.0);                                 // along the canopies
    bollard(140.0); b.pigeon(143.0);
    crates2(146.0); crates4(147.2); b.coins(147.0, 2.4, 3, 0.7);
    bollard(152.0);
    // the fishing boats moored along the quay: hop across their decks and wheelhouse roofs
    const BQ = 157.0; L.ctBoats = []; L.ctWater = [x + 1.5, 192.5];
    const boat = (k, bx, deck, roof) => { L.ctBoats.push([k, bx]); const w = k === 'ct_boat_r' ? 4.312 : 3.39, h = k === 'ct_boat_r' ? 3.0 : 2.5;
      ledge(bx + w * deck[0], -0.35 + h * deck[2], w * (deck[1] - deck[0])); ledge(bx + w * roof[0], -0.35 + h * roof[2], w * (roof[1] - roof[0])); };
    boat('ct_boat_r', BQ, [0.05, 0.93, 0.42], [0.48, 0.72, 0.74]);
    boat('ct_boat_b', BQ + 5.3, [0.05, 0.93, 0.44], [0.48, 0.75, 0.78]);
    boat('ct_boat_r', BQ + 10.0, [0.05, 0.93, 0.42], [0.48, 0.72, 0.74]);
    b.coins(BQ + 1.0, 1.9, 3, 0.9); b.coins(BQ + 2.3, 3.2, 2, 0.6); b.coins(BQ + 6.0, 1.9, 2, 0.9); b.coins(BQ + 7.0, 3.0, 2, 0.6); b.coins(BQ + 11.0, 1.9, 3, 0.9); b.coins(BQ + 12.3, 3.2, 2, 0.6);
    rope(BQ + 3.7); bollard(BQ + 9.0); crates4(BQ + 7.6); b.gull(BQ + 8.0, 4.4, 1.4);
    // Cape fur seals lazing on the quay and on their pontoon (they bark; they don't hurt)
    L.ctPontoon = { x: 173.5 }; L.ctSeals = [['ct_seal1', 174.0, 0.45, 0.83], ['ct_seal3', 175.4, 0.45, 0.65]];
    const seal = (k, sx) => { const h = ({ ct_seal0: 0.53, ct_seal2: 0.95 })[k]; L.ctSeals.push([k, sx, 0, h]); solid(sx + 0.25, ({ ct_seal0: 1.795, ct_seal2: 1.552 })[k] - 0.5, h - 0.08); };
    seal('ct_seal0', 177.0); b.coins(177.0, 1.6, 3, 0.6);
    seal('ct_seal2', 182.0); b.coins(182.0, 1.9, 3, 0.6);
    crates4(184.4);
    // three craft stalls and a food kiosk with flat tops to bounce along
    let sx2 = 186.0; L.ctStalls = [];
    for (const k of ['ct_stall_g', 'ct_stall_o', 'ct_stall_b', 'ct_kiosk']) { L.ctStalls.push([k, sx2]); ledge(sx2 + 0.15, k === 'ct_kiosk' ? 2.45 : 2.5, W(k) - 0.3); sx2 += W(k) + 0.05; }
    b.coins(186.4, 3.3, 10, 1.05);
    b.pigeon(190.5);
    crates2(198.6); crates4(200.0);
    b.coins(203.0, 1.1, 3, 0.8);

    // ---------- 5. Two Oceans Aquarium: in through the doors, two floors inside, out of a side door ----------
    const AQ = 205.5;
    L.ctAq = { x0: AQ };                                         // outside: end piece, wall with windows, the entrance
    const ENT = AQ + 4.93 + 8.36 - 0.04;                           // the entrance piece (doors in the middle)
    const BX = ENT + 5.471 - 0.35;                                // inside from here (a cut-away box)
    const UP = 4.6, CEIL = 9.4, OUT = BX + 66;
    Object.assign(L.ctAq, { ent: ENT, box: BX, x1: OUT, up: UP, ceil: CEIL });
    ground(BX, OUT - 0.8, 'ctaqua'); ground(OUT - 0.8, OUT + 1, 'ctcobble');   // the hall's floor ends at the side door L.solids.forEach(q => { if (q.style === 'ctquay') q.w = BX - q.x; });
    solid(BX + 0.3, OUT - BX - 0.6, 40, CEIL);                    // the ceiling
    L.ctSwap1 = BX + 33;                                          // far and middle strips change in here, out of sight
    // ground floor: the ray touch-pool, a crab, the stairs up
    art('ct_raypool', BX + 2.0, 0, 1.6); solid(BX + 2.2, 3.3, 1.4); ledge(BX + 2.15, 1.42, 3.4);   // tall enough to need a tap
    b.coins(BX + 2.3, 2.0, 3, 0.8);
    const SU = BX + 6.5;                                           // the stairs up (the top landing is the upper floor)
    L.ctStairs = [[SU, 0, false]];
    b.slope(SU + 0.55, 0.05, SU + 5.25, UP);
    L.oneways.push({ kind: 'ledge', x: SU + 5.25, y: UP, w: BX + 54.0 - SU - 5.25 });
    L.ctUpper = [SU + 5.25, BX + 54.0];
    b.coins(SU + 1.2, 1.3, 4, 1.0, 0.95);
    // the kelp forest tank under the upper floor; the special sits above it, at the top of the tank
    L.ctKelp = { x: BX + 12.6, w: 15.0 };
    b.crab(BX + 18.0, BX + 13.0, BX + 27.0);
    b.coins(BX + 14.0, 1.1, 6, 1.6);
    b.coins(BX + 13.0, UP + 1.1, 5, 1.0);
    ledge(BX + 19.4, UP + 2.4, 2.4); L.ctTankTop = [BX + 19.4, UP + 2.4, 2.4];   // a lamp beam over the tank
    b.special(BX + 20.6, UP + 3.5);                              // 2: at the top of the kelp forest tank
    // upper floor: the African penguins on their rocks (knee-high, harmless), then the glass walkway over the predator tank
    L.ctPeng = { x: BX + 29.0 };
    const prock = (x) => { art('ct_pg_rock', x, UP, 0.6); solid(x + 0.1, 0.88, 0.55, UP); };
    art('ct_pg_rock', BX + 31.3, UP, 1.5); solid(BX + 31.55, 1.9, 1.4, UP); ledge(BX + 31.55, UP + 1.42, 1.9); prock(BX + 36.5); prock(BX + 41.0);
    b.coins(BX + 30.5, UP + 1.3, 3, 0.9); b.coins(BX + 35.5, UP + 1.6, 3, 0.9); b.coins(BX + 40.0, UP + 1.3, 3, 0.9);
    L.ctWalk = { x: BX + 44.6 };
    b.arc(BX + 45.0, UP + 1.2, 6, 7.0, 1.6);
    // ground floor under the upper floor: portholes and a second crab
    L.ctPorthole = [BX + 29.0, BX + 54.0];
    b.crab(BX + 36.0, BX + 30.0, BX + 44.0);
    b.coins(BX + 31.0, 1.1, 5, 1.2);
    // down the stairs on the far side, and out of the side door
    const SD = BX + 54.0;
    L.ctStairs.push([SD, UP, true]);
    b.slope(SD, UP, SD + 4.7, 0.05);
    b.coins(SD + 0.8, UP + 0.4, 4, 1.0, -0.95);
    b.coins(BX + 58.5, 1.1, 4, 0.9); planter(BX + 60.8, 0, true);
    L.ctAqOut = { x: OUT };
    solid(OUT + 0.7, 0.3, 0.2);                                  // the door step (pigeons turn back here)

    // ---------- 6. Greenmarket Square ----------
    const GM = OUT + 1.0;
    ground(OUT + 1, GM + 62, 'ctcobble');
    let gx = GM + 3.0; const GMR = []; L.ctGmRow = [gx, 0]; gx += 1.494;
    for (const k of ['ct_gm_cream', 'ct_gm_green', 'ct_townhouse', 'ct_gm_upper', 'ct_gm_cream', 'ct_gm_green', 'ct_gm_upper', 'ct_gm_cream', 'ct_gm_green']) {
      GMR.push([k, gx]); if (k === 'ct_townhouse') L.ctTown = gx; gx += W(k) - 0.02; }
    L.ctGm = GMR; L.ctGmRow[1] = gx;
    // the Old Town House: its balcony is a ledge; the special sits above it (from the stall canopies)
    ledge(L.ctTown + 0.4, 2.55, 5.6);
    b.special(L.ctTown + 3.2, 4.3);                              // 3: on the Old Town House balcony
    // market stalls in groups of three and four, their canopies are ledges
    const stalls = (x, ks) => { for (const k of ks) { (L.ctMk = L.ctMk || []).push([k, x]); ledge(x + 0.15, 2.62, W(k) - 0.3); x += W(k) + 0.04; } return x; };
    const s1 = stalls(GM + 2.5, ['ct_mk_red', 'ct_mk_yel', 'ct_mk_grn']);
    b.coins(GM + 2.9, 3.4, 6, 1.0);
    b.pigeon(GM + 6.0);
    art('ct_baskets', s1 + 0.6, 0, 1.4); solid(s1 + 0.65, 0.66, 1.35); ledge(s1 + 0.62, 1.37, 0.72);
    b.coins(L.ctTown + 1.0, 1.1, 5, 1.0);
    const s2 = stalls(L.ctTown + 7.8, ['ct_mk_blu', 'ct_mk_red', 'ct_mk_yel', 'ct_mk_grn']);
    b.coins(L.ctTown + 8.2, 3.4, 8, 1.0);
    b.pigeon(L.ctTown + 12.0);
    art('ct_cloth', s2 + 0.8, 0, 2.15); solid(s2 + 0.9, 0.88, 2.1); ledge(s2 + 0.85, 2.12, 0.98);   // a tall stack of fabrics: lean, then jump
    b.coins(s2 + 0.9, 3.0, 2, 0.6);
    b.pigeon(s2 + 4.5);
    const s3 = stalls(s2 + 6.5, ['ct_mk_grn', 'ct_mk_blu', 'ct_mk_red']);
    b.coins(s2 + 6.9, 3.4, 6, 1.0);
    art('ct_baskets', s3 + 0.5, 0, 1.4); solid(s3 + 0.55, 0.66, 1.35); ledge(s3 + 0.52, 1.37, 0.72);

    // ---------- 7. Bo-Kaap: the steep cobbled street, each house a step higher than the last ----------
    const BK = GM + 62.0;
    const HOUSES = ['ct_bk_pink', 'ct_bk_lime', 'ct_bk_teal', 'ct_mosque', 'ct_bk_yel', 'ct_bk_lilac', 'ct_bk_pink', 'ct_bk_lime', 'ct_bk_teal', 'ct_bk_yel', 'ct_bk_lilac'];
    const HH = { ct_bk_pink: 5.0, ct_bk_lime: 3.65, ct_bk_teal: 5.0, ct_bk_yel: 3.62, ct_bk_lilac: 4.98, ct_mosque: 4.6 };
    const RISE = 0.4;
    let hx = BK + 1.93, hy = 0; L.ctBk = [];
    let prevX = BK - 2;
    for (let i = 0; i < HOUSES.length; i++) {
      const k = HOUSES[i], w = W(k), ny = i === 0 ? 0 : hy + RISE;
      if (i > 0) { ground(prevX, hx + 0.2, 'ctbokaap', hy); b.slope(hx + 0.2, hy, hx + 1.4, ny); prevX = hx + 1.4; }
      else { ground(BK - 2, hx + 0.2, 'ctbokaap', 0); prevX = hx + 0.2; }
      hy = ny;
      L.ctBk.push([k, hx, hy]);
      if (k !== 'ct_mosque') ledge(hx + 0.15, hy + HH[k] - 0.15, w - 0.3);   // flat roofs
      hx += w - 0.02;
    }
    const TOPY = hy;                                              // the top of the street: the mountain path and the lower cable station
    ground(prevX, hx + 26, 'ctbokaap', hy);
    L.ctBkEnd = [BK, hx, hy];
    L.ctSwap2 = hx - W('ct_bk_lilac') / 2;                        // the middle strip changes behind the last house
    // stoeps, geraniums, benches and bollards along the street
    const at = (x) => { let y = 0; for (const [k, xx, yy] of L.ctBk) if (x >= xx + 1.4 - 0.01) y = yy; return y; };
    const stoep = (x) => { const y = at(x); art('ct_steps', x, y, 1.0); solid(x + 0.1, 1.15, 0.9, y); };
    const tallStoep = (x) => { const y = at(x); art('ct_steps', x, y, 1.6); solid(x + 0.15, 1.75, 1.5, y); };   // too tall to hop: a tap up and over
    const geranium = (x) => { const y = at(x); art('ct_geranium', x, y, 0.95); solid(x + 0.1, 0.5, 0.9, y); };
    const bkbench = (x) => { const y = at(x); art('ct_bk_bench', x, y, 1.0); solid(x + 0.1, 1.43, 0.6, y); };
    const lamp = (x) => art('ct_lamp', x, at(x), 4.4, { back: true });
    const H0 = L.ctBk;
    b.coins(H0[0][1] + 1.0, 1.1, 3, 0.8);
    tallStoep(H0[0][1] + 2.2); b.coins(H0[1][1] + 1.6, H0[1][2] + 1.4, 3, 0.7);
    geranium(H0[1][1] + 2.8);
    lamp(H0[2][1] + 0.4);
    b.coins(H0[1][1] + 1.0, H0[1][2] + 4.4, 3, 0.9);              // along the lime roof
    b.pigeon(H0[2][1] + 2.4, H0[2][2]);
    bkbench(H0[3][1] + 1.8); b.coins(H0[3][1] + 2.0, H0[3][2] + 1.8, 3, 0.6);
    tallStoep(H0[4][1] + 2.0); b.coins(H0[4][1] + 1.0, H0[4][2] + 4.4, 3, 0.9);
    b.coins(H0[5][1] + 1.0, H0[5][2] + 5.8, 3, 0.9);              // along the lilac roof
    geranium(H0[5][1] + 2.6); lamp(H0[6][1] + 0.3);
    b.pigeon(H0[6][1] + 2.6, H0[6][2]);
    tallStoep(H0[7][1] + 2.3); b.coins(H0[7][1] + 1.0, H0[7][2] + 4.4, 3, 0.9);
    bkbench(H0[8][1] + 1.8);
    b.coins(H0[9][1] + 1.0, H0[9][2] + 4.4, 3, 0.9);              // along the yellow roof, then up onto the highest house
    geranium(H0[9][1] + 2.7);
    const top = H0[10];
    b.special(top[1] + 1.9, top[2] + 4.98 + 0.9);                 // 4: on the flat roof of the highest painted house
    b.coins(top[1] + 1.0, top[2] + 1.2, 3, 0.8);

    // ---------- 8. Up to the cableway: fynbos, boulders, a blank signpost ----------
    const FP = hx;
    const boulder = (x) => { art('ct_boulder', x, TOPY, 0.45); solid(x + 0.05, 0.6, 0.42, TOPY); };
    const rockT = (x) => { art('ct_rock_tall', x, TOPY, 2.2); solid(x + 0.2, 1.35, 2.15, TOPY); ledge(x + 0.25, TOPY + 2.15, 1.25); };
    const protea = (x, y = TOPY) => art('ct_protea', x, y, 1.3, { back: true });
    const restio = (x, y = TOPY) => art('ct_restio', x, y, 1.5, { back: true });
    protea(FP + 0.6); restio(FP + 2.2);
    boulder(FP + 3.0); b.coins(FP + 2.8, TOPY + 1.4, 3, 0.6);
    art('ct_sign', FP + 5.0, TOPY, 1.8, { back: true });
    rockT(FP + 7.5); b.coins(FP + 7.7, TOPY + 3.0, 3, 0.6);
    protea(FP + 10.0); b.gull(FP + 12.0, TOPY + 2.6, 1.4);
    art('ct_bush', FP + 13.5, TOPY, 0.6, { back: true }); restio(FP + 15.0);
    boulder(FP + 16.5); b.coins(FP + 15.0, TOPY + 1.2, 4, 0.8);
    // ---------- 9. The lower cable station and the cable car ----------
    const LS = FP + 19.5;
    L.ctCliff = { x0: LS - 6.0, top: 28.0 };                      // the cliffs of Table Mountain rise behind the station
    L.ctLs = { x: LS, y: TOPY };                                   // end piece, entrance (A walks in), then out onto the platform behind
    const LSE = LS + 2.543 - 0.05, LSD = LSE + 6.829 * 0.5;        // the open doors
    L.ctLs.ent = LSE; L.ctLs.door = LSD;
    const WH = LSE + 6.829 - 0.05;                                  // the wheel house: the cable comes out of its roof
    L.ctLs.wheel = WH;
    const CAB = WH + 8.475 + 2.4;                                  // the cabin waits by the platform, centre
    L.ctLs.plat = CAB - 2.3;
    ground(hx + 26, CAB + 4, 'ctbokaap', TOPY);
    b.coins(LSE + 1.5, TOPY + 1.1, 4, 0.9); b.coins(WH + 1.0, TOPY + 1.1, 6, 1.1);
    const TOP = 28.0, TX = CAB + 40.0;                             // the top station on the edge of the mountain: a long, steep climb
    const cab = { kind: 'cable', x0: CAB, pts: [[CAB, TOPY], [CAB + 2.0, TOPY + 0.6], [TX - 2.0, TOP - 0.4], [TX, TOP]], v: 6.0, acc: 2.2, w0: 1.4, w1: 1.1, input: false, seat: 0, up: 0, down: 0, exitY: TOP };
    L.rides.push(cab); L.ctCab = cab;
    // coins beside the cable, far apart at the bottom and closer and closer towards the top, so their tune climbs too
    for (let x = CAB + 4.0, gap = 6.4; x < TX - 2.2; x += gap, gap = Math.max(1.15, gap * 0.8)) b.coins(x, rideY(cab, x) + 0.8, 1);
    // ---------- 10. Table Mountain top: the Cape Doctor blows A along, so his jumps go further ----------
    L.ctUs = { x: TX - 4.68 };
    L.camFloor = [[TX - 1.0, TX + 120, TOP]];
    const E = TX + 70.0;                                            // the viewpoint at the edge
    ground(TX - 1.0, E, 'ctrock', TOP);
    L.wind = [TX + 6.0, E - 10.0, 2.3, 0.55];                      // (from, to, push in the air, how much gravity is left when falling)
    const ROCK = (x) => { art('ct_rock_tall', x, TOP, 2.2); solid(x + 0.2, 1.35, 2.15, TOP); ledge(x + 0.25, TOP + 2.15, 1.25); };
    const STACK = (x) => { art('ct_rock_stack', x, TOP, 3.1); solid(x + 0.35, 1.8, 3.0, TOP); ledge(x + 0.35, TOP + 3.02, 1.8); };
    const BOULDER = (x) => { art('ct_boulder', x, TOP, 0.45); solid(x + 0.05, 0.6, 0.42, TOP); };
    const DECK = (x) => { art('ct_deck', x, TOP, 2.1); solid(x + 0.1, 6.16, 1.4, TOP); };   // a raised boardwalk: tap up, run along
    const DAS = (k, x, y = TOP) => (L.ctDassies = L.ctDassies || []).push([k, x, y]);
    b.coins(TX + 2.0, TOP + 1.1, 4, 0.9);
    protea(TX + 4.5, TOP); BOULDER(TX + 7.0);
    STACK(TX + 11.0); b.special(TX + 12.2, TOP + 4.1);            // 5: on top of a tall sandstone stack
    b.coins(TX + 9.5, TOP + 2.0, 3, 0.7);
    DAS('ct_das_sit', TX + 11.6, TOP + 3.02);
    restio(TX + 15.0, TOP); BOULDER(TX + 17.5);
    DECK(TX + 20.0); b.coins(TX + 20.5, TOP + 2.4, 6, 1.0);
    DAS('ct_das_peek', TX + 27.6);
    b.gull(TX + 29.0, TOP + 3.4, 1.6);
    ROCK(TX + 31.0); b.coins(TX + 33.0, TOP + 3.6, 4, 0.9);
    protea(TX + 35.5, TOP); BOULDER(TX + 37.5);
    STACK(TX + 40.0); DAS('ct_das_look', TX + 41.0, TOP + 3.02); b.coins(TX + 42.8, TOP + 4.0, 3, 0.9);
    restio(TX + 45.5, TOP); BOULDER(TX + 47.0); b.gull(TX + 49.5, TOP + 2.8, 1.4);
    DECK(TX + 51.0); b.coins(TX + 51.5, TOP + 2.4, 6, 1.0);
    DAS('ct_das_sleep', TX + 58.5); protea(TX + 59.5, TOP);
    // ---------- 11. The ending: the flag at the viewpoint; A watches the sunset as the tablecloth rolls over the mountain ----------
    L.ctEdge = E;
    b.flag(E - 7.5); L.flagY = TOP;
    L.finale = E - 2.2;
    L.ctFinale = true;
    b.hidden(E + 0.2, 1, 40);   // invisible: past the edge the hill slopes away
    b.end(E + 5.0);
  },
},
{
  id: 'westminster', name: 'Westminster', plate: 'Westminster', area: 'westminster', city: 'London',
  build(b) {
    const L = b.L;
    // Westminster on a spring morning, drawn from Ladi's art (src/westminster/cut.py). Plan: london-runner/westminster/westminster-plan.md
    // black cab onto Westminster Bridge -> inside Big Ben (spiral stairs, the clock's giant gears, behind the glowing dial, the Great Bell, the lift down)
    // -> Parliament Square and Whitehall -> Horse Guards (up to the clock turret, through the arch) -> St James's Park (pelicans, Duck Island Cottage,
    // the Blue Bridge) -> the Mall and the Victoria Memorial -> Buckingham Palace: the changing of the guard
    L.killY = -8; L.startX = 2.0; L.camMin = -12; L.introCam = 'centre';   // A starts in the middle of the screen (Ladi 2026-11-07)
    const art = (key, x, y, h, o = {}) => (L.wmArt = L.wmArt || []).push(Object.assign({ key, x, y, h }, o));   // a picture standing at (x, y), h units tall
    const solid = (x, w, h, y = 0, o = {}) => L.solids.push(Object.assign({ kind: 'block', x, y, w, h, style: 'hidden' }, o));
    const ledge = (x, y, w) => b.ledge(x, y, w);
    const ground = (x0, x1, style, y = 0) => L.solids.push({ kind: 'ground', x: x0, y: y - 40, w: x1 - x0, h: 40, style });
    const back = (key, x, y, h, o = {}) => art(key, x, y, h, Object.assign({ back: true }, o));
    // knee-high things A hops by himself, and taller ones he leans on and jumps onto
    const bollard = (x) => { art('wm_bollard', x, 0, 0.8); solid(x + 0.04, 0.3, 0.75); };
    const daff = (x) => { art('wm_daff', x, 0, 0.55); solid(x + 0.1, 1.05, 0.5); };
    const bench = (x) => { art('wm_bench', x, 0, 0.85); solid(x + 0.1, 1.45, 0.5); };
    const cab = (x, k = 'wm_cab') => { art(k, x, 0, 1.8); solid(x + 0.15, 3.1, 1.45); ledge(x + 0.15, 1.45, 3.1); };   // a parked cab: lean, then hop on its roof
    const lean = (k, x, h, sx, sw, sh, y = 0) => { art(k, x, y, h); solid(x + sx, sw, sh, y); ledge(x + sx, y + sh, sw); };

    // ---------- 1. Westminster Bridge: the black cab drops A off, Big Ben and Parliament across the river ----------
    b.wall(-12.5, 1, 22);
    ground(-14, 57, 'wmbridge');
    L.wmCab = { x: -3.0 };                                         // the back door is open; A steps out, the cab drives off to the left
    L.wmBridge = [-14, 57]; L.wmLamps = [-6, 3, 12, 21, 30, 39, 48];   // the bridge's railing and lamps, behind A
    bollard(6.0);
    cab(9.0); b.coins(9.4, 2.1, 4, 0.8);
    lean('wm_bus', 13.5, 4.3, 0.1, 7.9, 4.15);                    // the red bus in the traffic: lean, jump up from the cab roof
    b.coins(14.4, 5.0, 4, 1.0);
    b.special(18.0, 7.0);                                          // 1: above the bus roof
    b.coins(22.6, 3.4, 3, 0.8, -1.0);
    bollard(27.5);
    b.pigeon(30.5);
    cab(34.0, 'wm_cab_blue'); b.coins(34.4, 2.1, 4, 0.8);
    lean('wm_nutcart', 41.0, 1.75, 0.05, 1.0, 1.6); b.coins(41.0, 2.6, 2, 0.6);
    bollard(47.0); bollard(48.2);
    ground(57, 61.5, 'wmpave');
    b.coins(57.0, 1.1, 4, 1.0);

    // ---------- 2. Inside Big Ben: in at the foot of the tower, up the spiral stairs, through the clock, out at the bottom ----------
    const BX = 61.5, OUT = 137.5;
    L.wmIn = { box: BX, x1: OUT };
    L.wmTower = [62.6 - 6.19 * 0.52, 136.1 - 6.19 * 0.52];         // the foot of the tower outside: its door on the bridge side, and on the square side
    L.wmDoor = [62.6, 136.1];                                       // the doorway wipe in and out
    ground(BX, OUT, 'wmstone');
    // no going back out once inside (Ladi 2026-11-07): the doorway behind A stops him if he turns round
    solid(62.9, 0.2, 40, 0, { backOnly: true, noGrab: true });
    // climb 1, up the tower: a stone pier on an archway (A runs under it) and the clock room's wall facing it.
    // A runs into the wall, then jumps from one to the other to go up (like the Greenwich towers); coins zigzag between them
    const F = 9.6;                                                   // the clock room floor
    const P1 = [63.9, 67.2];
    solid(P1[0], P1[1] - P1[0], 40, 3.6);
    solid(70.2, 29.4, F);
    L.wmPiers = [[P1[0], P1[1], 3.6, 40], [70.2, 71.6, 0, F, 'r']];
    b.coins(63.6, 1.1, 4, 1.0);
    [[69.3, 3.4], [68.1, 5.4], [69.3, 7.4], [68.1, 9.4], [70.9, 11.0]].forEach(([x, y]) => b.coins(x, y, 1));
    // the clock room: the clockwork turning behind, the giant gears turning half sunk in the floor
    const W = 14.2;                                                  // the dial room floor
    L.wmClock = { x0: 70.2, x1: 99.6, f: F, w: W };
    L.wmGears = [80.0, 89.5];
    b.coins(73.0, F + 1.0, 4, 1.0); b.coins(81.6, F + 1.1, 6, 1.0);
    lean('wm_motor', 86.2, 1.6, 0.05, 2.6, 1.5, F); b.coins(86.5, F + 2.4, 3, 0.8);   // the clock's motor housing
    // climb 2, up to the dial room: another pier on an archway, facing the dial room's wall
    const P2 = [94.8, 96.6];
    solid(P2[0], P2[1] - P2[0], 40, F + 3.6);
    L.wmPiers.push([P2[0], P2[1], F + 3.6, 40], [99.6, 101.0, F, W, 'r']);
    [[98.7, F + 3.4], [97.5, F + 5.3], [100.2, W + 1.4]].forEach(([x, y]) => b.coins(x, y, 1));
    // behind the clock face: the glowing dial
    solid(99.6, 16.4, W);
    L.wmDial = { x: 104.4, y: W + 0.6 };
    b.special(108.0, W + 4.2);                                       // 2: the centre of the clock face
    b.arc(101.0, W + 1.0, 5, 5.0, 2.4);
    lean('wm_motor', 112.6, 1.6, 0.05, 2.6, 1.5, W); b.coins(112.9, W + 2.4, 3, 0.8);   // the dial's motor housing
    // the belfry: up the steps, under the Great Bell (it bongs once as A passes)
    solid(115.6, 16.4, W);
    b.slope(115.6, W, 120.0, 17.0); solid(120.0, 12.0, 17.0);
    L.wmBelfry = { x0: 115.6, x1: 132.0, f: 17.0 };
    L.wmBell = { x: 122.8 }; L.wmBong = 126.0;
    b.coins(121.0, 18.0, 3, 0.9); b.coins(128.6, 18.0, 3, 0.9);
    L.wmArches = [[(P1[0] + P1[1]) / 2, 0], [(P2[0] + P2[1]) / 2, F], [99.5, W], [120.6, 17.0]];                         // deep stone archways between the rooms: [middle, floor]
    // the lift down: it waits for A, takes him to the bottom, and he walks out through the door to the square
    const lift = { kind: 'lift', mover: true, trig: 'wmLift', x: 132.0, w: 2.4, y: 17.0, y0: 17.0, y1: 0, up: 1.9, d0: 0.25 };   // (Ladi 2026-11-07: quicker down)
    (L.movers = L.movers || []).push(lift); L.oneways.push(lift); L.wmLift = lift;
    solid(134.4, 0.3, 30, 2.0, { noGrab: true });                  // the lift's far side: he rides it down and walks out at the bottom
    b.coins(135.0, 1.0, 2, 0.8);
    solid(136.7, 0.2, 40, 0, { backOnly: true, noGrab: true });     // out in the square: no going back in
    // high floors stay at the bottom of the screen; up the belfry steps the floor rises with them (no dip and bounce)
    L.camFloor = [[70.2, 99.6, F], [99.6, 115.6, W], [115.6, 120.0, W, 17.0], [120.0, 132.0, 17.0]];
    L.wmSwap1 = 110.0;                                               // the backdrops change while A is inside

    // ---------- 3. Parliament Square and Whitehall ----------
    ground(OUT, 162 + 23.7, 'wmpave');
    back('wm_lawnrail', 138.8, 0, 1.2); back('wm_lawnrail', 141.55, 0, 1.2); back('wm_tulips', 139.4, 0, 0.6);
    back('wm_sqlamp', 144.6, 0, 2.8);
    lean('wm_phone', 146.0, 2.9, 0.1, 1.45, 2.85); b.coins(146.2, 3.8, 2, 0.6);
    art('wm_pillar', 150.5, 0, 1.1); solid(150.52, 0.55, 1.05);
    b.coins(151.0, 1.1, 4, 1.0);
    lean('wm_kiosk', 154.6, 2.3, 0.05, 2.0, 2.2); b.coins(154.8, 3.1, 3, 0.8);
    back('wm_sqlamp', 158.2, 0, 2.8); bollard(159.4); bollard(160.6);

    // ---------- 4. Horse Guards: up the porch and the ledges to the clock turret, then through the arch ----------
    // (drawn at 0.8 of its old size so the City skyline still shows above it on a phone: rule 2)
    const HG = 162.0, S = 0.8, X0 = HG + 4.0 * S, hx = v => X0 + v * S;   // the wings, the main building (Ladi's picture 18)
    ground(HG + 23.7, 228.6, 'wmgravel');
    back('wm_hg_endl', HG, 0, 7.25 * S); back('wm_hg', X0, 0, 11.0 * S); back('wm_hg_endr', hx(21.56), 0, 7.25 * S);
    L.wmHG = { x: HG, x0: X0 };
    L.wmMounted = [[HG + 0.25 * S, 0], [hx(22.4), 4]]; L.wmMountedH = 3.0 * S;   // the mounted guards in their sentry arches (red, then blue): they never move
    lean('wm_pier', HG + 2.2, 1.4, 0.05, 0.95, 1.4);                // a stone pier (clear of the mounted guard): lean, then up onto the porch
    ledge(hx(0.1), 3.4 * S, 4.3 * S);                                // the porch roof
    ledge(hx(4.3), 6.1 * S, 4.4 * S);                                // the window heads
    ledge(hx(0.4), 8.25 * S, 20.7 * S);                              // the roof
    ledge(HG + 0.2 * S, 7.0 * S, 3.8 * S);                           // the left wing
    solid(hx(9.9), 1.8 * S, 1.4 * S, 8.25 * S); ledge(hx(9.9), 9.65 * S, 1.8 * S);   // the clock turret
    ledge(hx(21.6), 7.05 * S, 3.9 * S);                              // the right-hand wing
    b.coins(hx(10.3), 9.65 * S + 1.2, 3, 0.5);                       // on top of the clock turret
    b.coins(HG + 2.0, 2.4, 2, 0.6); b.coins(hx(0.6), 3.4 * S + 0.9, 3, 1.0); b.coins(hx(4.7), 6.1 * S + 0.9, 3, 1.0); b.coins(hx(5.0), 8.25 * S + 0.9, 3, 1.0);
    b.coins(hx(13.0), 8.25 * S + 0.9, 6, 0.9); b.coins(hx(22.3), 7.05 * S + 0.9, 3, 0.8); b.coins(hx(26.0), 4.6, 4, 1.0, -1.1);
    L.wmHgArch = { x: hx(10.9), s: S };                              // the archway through the building: A runs under it
    b.coins(hx(9.4), 1.1, 4, 1.0);
    L.wmSwap2 = hx(22.6);                                            // the backdrops change behind the right-hand wing (big trees above hide the seam)
    L.wmClump = [hx(15.0), hx(31.0)];                                // (every tree stands on the ground)
    L.wmJoins = [57.0, HG + 23.7];                                   // where one kind of ground meets another: a stone kerb (rule 8)

    // ---------- 4b. The rooftop run (Ladi 2026-11-07: after the blossom tree): round the grand buildings at the edge of Horse Guards Parade ----------
    // in under the archway, up between two walls onto the roofs, along them behind their stone balustrades, over the gaps, down at the park gate.
    // A miss drops A onto the gravel in front of the row; he carries on along the ground (Ladi's pictures 32-36)
    const RT = HG + 32.0;
    const roof = (k, x, h, w, top) => { back(k, x, 0, h); ledge(x, top, w); (L.wmRoofs = L.wmRoofs || []).push([k, x, h]); };   // A runs on the flat roof, behind the balustrade
    const AH = 7.0, AW = AH * 544 / 1326, AB = RT;                   // the building over an archway: A runs under it
    back('wm_ab', AB, 0, AH); solid(AB + 0.1, AW - 0.2, 40, 3.0);   // wall 1: from the top of its arch up
    L.wmRoofs = [['wm_ab', AB, AH]];
    const BHh = 6.0, BW = BHh * 1087 / 928, BH = AB + AW + 2.9, BT = BHh * 0.92;   // the Banqueting House: right in his way
    back('wm_bh', BH, 0, BHh); solid(BH, BW, BT); ledge(BH, BT, BW); L.wmRoofs.push(['wm_bh', BH, BHh]);   // wall 2: jump from one to the other up to its roof
    [[BH - 1.4, 2.6], [BH - 2.4, 4.4], [BH - 1.3, 6.0], [BH + 0.6, BT + 1.0]].forEach(([x, y]) => b.coins(x, y, 1));
    lean('wm_pots', BH + 3.6, 1.1, 0.0, 0.95, 1.1, BT); b.coins(BH + 1.6, BT + 0.9, 2, 0.8); b.coins(BH + 4.0, BT + 2.0, 2, 0.7); b.coins(BH + 5.6, BT + 0.9, 2, 0.8);
    const Rh = 6.6, RBW = Rh * 597 / 1024, R2 = BH + BW + 2.0, R2T = Rh * 0.92;   // a taller roof: up a little step
    roof('wm_roofb', R2, Rh, RBW, R2T);
    lean('wm_chim', R2 + 2.2, 1.7, 0.0, 0.82, 1.7, R2T);             // the tall chimney: lean on it, jump up and off it
    b.coins(R2 + 0.4, R2T + 0.9, 2, 0.8); b.coins(R2 + 2.4, R2T + 2.6, 2, 0.5);
    const GAP = 3.4, Ah = 6.0, AW2 = Ah * 577 / 863, R3 = R2 + RBW + GAP, R3T = Ah * 0.91;
    b.special(R2 + RBW + GAP / 2, R2T + 5.2);                          // 3: in mid-air over the widest gap, off the tall chimney
    b.coins(R2 + RBW + 0.3, R2T + 3.4, 1); b.coins(R3 - 0.6, R2T + 3.4, 1);
    roof('wm_roofa', R3, Ah, AW2, R3T);
    lean('wm_skylt', R3 + 1.4, 0.9, 0.05, 1.45, 0.75, R3T);         // a glass skylight: A hops it
    back('wm_aerial', R3 + 3.2, R3T, 1.4);                           // a pigeon on a TV aerial
    b.coins(R3 + 0.3, R3T + 0.9, 1); b.coins(R3 + 1.6, R3T + 1.7, 2, 0.6);
    const R4 = R3 + AW2 + 2.0;
    roof('wm_roofb', R4, Rh, RBW, R2T);
    lean('wm_pots', R4 + 1.4, 1.1, 0.0, 0.95, 1.1, R2T);
    b.coins(R4 + 0.2, R2T + 0.9, 1); b.coins(R4 + 2.8, R2T + 1.0, 3, 0.9, -1.2);   // and down off the end
    // down on the gravel: the way on for a child who missed a jump
    b.coins(BH + 1.0, 1.1, 5, 1.2); bollard(R2 + 1.2); b.coins(R2 + RBW + 0.6, 1.1, 3, 1.0);
    bollard(R3 + 1.6); b.coins(R3 + AW2, 1.1, 3, 1.0);
    b.pigeon(R4 + RBW + 0.8);
    lean('wm_gpier', 227.6, 1.8, 0.05, 1.9, 1.7); b.coins(227.9, 2.7, 3, 0.6);   // the park gate's stone pier and railing
    L.wmJoins.push(228.6);

    // ---------- 5. St James's Park: pelicans, Duck Island Cottage, the Blue Bridge ----------
    const SJ = 236.0;
    back('wm_btree', SJ - 1.0, 0, 4.4); back('wm_willow', SJ + 9.6, 0, 4.4); back('wm_wtree', SJ + 20.5, 0, 3.8);
    daff(SJ + 2.0);
    bench(SJ + 5.8); bench(SJ + 7.6);
    b.coins(SJ + 5.0, 1.3, 6, 0.9);
    lean('wm_prock', SJ + 14.6, 1.4, 0.4, 2.6, 1.3); b.coins(SJ + 15.2, 2.3, 3, 0.8);   // the pelicans' rock
    L.wmPel = [[SJ + 12.3, 0, 0, true], [SJ + 15.4, 1.3, 1], [SJ + 17.6, 1.25, 3]];   // [x, y, pose, standing on the grass]
    L.wmSq = [[SJ + 4.0, 0], [SJ + 22.5, 0], [SJ + 63.0, 0]];
    b.pigeon(SJ + 22.0);
    const DC = SJ + 27.0, CW = 12.207;                               // Duck Island Cottage (Ladi's picture 23, 7 tall)
    back('wm_cottage', DC, 0, 7.0);
    solid(DC + 0.85, 1.5, 1.35); ledge(DC + 0.85, 1.35, 1.5);       // the porch railing: lean, then up
    ledge(DC + 0.2, 3.45, 2.4);                                      // the porch roof
    ledge(DC + 2.7, 5.0, 7.75);                                      // across the roof
    ledge(DC + 3.9, 6.3, 6.5);                                       // the ridge
    solid(DC + 10.5, 0.8, 1.7, 5.0); ledge(DC + 10.5, 6.7, 0.8);    // the chimney
    b.special(DC + 10.9, 9.3);                                       // 4: on the cottage chimney
    b.coins(DC + 0.5, 4.3, 2, 1.0); b.coins(DC + 3.0, 5.9, 4, 1.0); b.coins(DC + 4.4, 7.2, 5, 1.0);
    b.coins(DC + 12.0, 5.6, 3, 0.8, -1.6);
    bench(DC + 13.6);
    lean('wm_pkiosk', DC + 16.0, 2.3, 0.1, 2.8, 2.2); b.coins(DC + 16.4, 3.1, 3, 0.8);
    daff(DC + 20.6);
    lean('wm_deck', DC + 23.6, 1.6, 0.05, 1.15, 1.55); b.coins(DC + 23.7, 2.5, 2, 0.6);   // striped deckchairs stacked up
    back('wm_btree', DC + 18.4, 0, 4.4); back('wm_wtree', DC + 25.4, 0, 3.8);
    // the Blue Bridge over the lake (Ladi's picture 24): the ramps up from the banks, the deck over the water
    const BB = 290.0, K = 1.4, RW = 4.858 * K, DW = 8.648 * K;
    ground(228.6, BB + RW, 'wmpath');
    L.wmBlue = { x: BB, k: K, rw: RW, dw: DW, wy: -0.6 };
    b.slope(BB + 2.6, 0.05, BB + RW, 0.92); solid(BB + RW, DW, 0.98); b.slope(BB + RW + DW, 0.92, BB + RW + DW + RW - 2.6, 0.05);
    ground(BB + RW, BB + RW + DW, 'wmlake', -0.6);
    b.special(BB + RW + DW / 2, 4.7);                                // 5: over the middle of the Blue Bridge, the palace behind
    b.coins(BB + 3.0, 1.0, 4, 1.0, 0.25); b.arc(BB + RW + 3.0, 2.0, 4, 4.0, 1.6); b.coins(BB + RW + DW + 0.6, 1.8, 3, 1.0, -0.3);
    const BE = BB + 2 * RW + DW;
    ground(BB + RW + DW, 330, 'wmpath');
    L.wmJoins.push(BB + RW, BB + RW + DW, 330);                      // the lake's stone edges, the Mall's kerb
    back('wm_willow', BE + 0.4, 0, 4.4);
    lean('wm_deck', BE + 2.0, 1.6, 0.05, 1.15, 1.55); b.coins(BE + 2.1, 2.5, 2, 0.6);   // a stack of deckchairs
    daff(BE + 6.5);

    // ---------- 6. The Mall and the Victoria Memorial ----------
    ground(330, 420, 'wmmall');
    [331.5, 339.0, 346.5, 354.0].forEach(x => back('wm_plane', x, 0, 7.0));
    [335.6, 343.2, 350.6].forEach(x => back('wm_malllamp', x, 0, 2.6));
    b.coins(332.0, 1.1, 6, 1.0);
    lean('wm_icevan', 342.0, 2.4, 0.1, 2.45, 1.9); b.coins(342.4, 2.8, 4, 0.8);
    b.pigeon(351.0);
    const VM = 358.0;                                                // the memorial (cut from Ladi's picture 26), 9 tall
    back('wm_vmem', VM, 0, 9.0);
    solid(VM + 0.5, 8.4, 0.6);                                       // its low steps: A hops up
    solid(VM + 2.2, 4.7, 0.6, 0.6);
    solid(VM + 3.1, 3.1, 1.3, 1.2); ledge(VM + 3.1, 2.5, 3.1);      // the base with the wreath: lean, then up
    b.coins(VM + 1.0, 1.4, 3, 0.8, 0.3); b.coins(VM + 3.4, 3.3, 4, 0.8); b.coins(VM + 7.0, 2.2, 3, 0.8, -0.5);

    // ---------- 7. The ending: Buckingham Palace; A watches the changing of the guard through the railings ----------
    const PG = VM + 13.0, PC = PG + 8.555;                           // the palace (Ladi's picture 27), its gates in the middle
    L.wmPalace = { x: PG, c: PC };
    b.flag(PG - 0.5); L.flagY = 0;
    L.finale = PC - 0.4; L.wmFinale = true; L.finaleT = 5.0;            // a short watch: the guards are already passing the gates (Ladi 2026-11-07)
    b.wall(PG + 15.5, 1, 40);
    b.end(PG + 19.0);
  },
},
{
  // Barcelona, rebuilt from scratch from the level kit (plan: claude.ai/artifact/NGEdrYdSqXXcPNrqtVn1XT; Ladi's picks and block OK 2026-11-08).
  // Sea to hill on a summer afternoon into sunset: Barceloneta -> Gothic Quarter (castellers, Bishop's Bridge) -> La Rambla + La Boqueria
  // gate -> e-scooter -> Passeig de Gracia (Batllo, La Pedrera roof) -> Sagrada Familia (the ONE door) -> escalators -> Park Guell.
  // Pictures: art/barcelona/NN_*.png, cut by src/barcelona2/cut.py; BC_ASP = width / height of each piece.
  id: 'barcelona', name: 'Barcelona', plate: 'Barcelona', area: 'barcelona', city: 'Barcelona',
  build(b) {
    const L = b.L, BC_ASP = {"bc_taxi":2.2167,"bc_taxi_open":2.2167,"bc_beachbar":2.014,"bc_cubes":0.3415,"bc_umb_blue":1.124,"bc_umb_red":1.128,"bc_lifeguard":0.9139,"bc_lounger":2.0133,"bc_palm":0.7269,"bc_icecart":1.0591,"bc_bench":1.9,"bc_scooters":2.7154,"bc_flat1":0.6079,"bc_flat2":0.5014,"bc_flat_endl":0.3262,"bc_flat3":0.6793,"bc_flat4":0.666,"bc_flat_endr":0.3368,"bc_arch":0.8675,"bc_goth1":0.463,"bc_goth2":0.4439,"bc_goth3":0.5042,"bc_goth_endl":0.2186,"bc_goth4":0.6326,"bc_goth5":0.6659,"bc_goth6":0.6971,"bc_goth_endr":0.2482,"bc_cityhall":1.03,"bc_castell":0.4343,"bc_bridge":2.8387,"bc_flowercart":1.3263,"bc_wallfount":0.7833,"bc_stonebench":2.4333,"bc_pots":1.1056,"bc_cafe":1.0667,"bc_bollards":1.72,"bc_planetree":1.0183,"bc_statue":0.5103,"bc_metrosign":0.5964,"bc_miro":14.75,"bc_flowerbox":1.75,"bc_rbench":2.2,"bc_fountainrim":4.0333,"bc_gate":1.3137,"bc_corner":0.983,"bc_manzana":2.1495,"bc_ptower":0.3208,"bc_pedrera":1.0952,"bc_war3":0.6714,"bc_war2":0.8333,"bc_war1":0.8478,"bc_roofwave":2.7062,"bc_eix1":0.7089,"bc_eix2":0.5902,"bc_eix3":0.7371,"bc_eix_endl":0.3758,"bc_eix4":0.8512,"bc_eix_endr":0.3758,"bc_benchlamp":0.9472,"bc_newsstand":0.8933,"bc_planter":1.3,"bc_plane2":0.8668,"bc_kiosk":1.2808,"bc_bikes":2.7154,"bc_nativity":0.6812,"bc_door_leaf":0.6364,"bc_door":1.3273,"bc_door_half":0.6568,"bc_gallery":3.9517,"bc_liftshaft":0.4511,"bc_canopy":1.9231,"bc_altar":2.2706,"bc_chairs":3.0211,"bc_font":0.8812,"bc_snail":0.8515,"bc_stairarch":2.534,"bc_grac2":0.507,"bc_grac1":0.7273,"bc_grac_endl":0.3478,"bc_grac_endr":0.3593,"bc_bins":3.8333,"bc_stonewall":3.2571,"bc_escalator":2.0459,"bc_gatehouses":2.6935,"bc_lizstairs":1.6344,"bc_hypostyle":2.9207,"bc_mosaicpot":1.1154,"bc_cloud0":2.4285,"bc_cloud1":2.1135,"bc_cloud2":1.9127,"bc_cloud3":3.4491,"bc_cloud4":1.579,"bc_gull0":1.35,"bc_gull1":4.1,"bc_gull2":1.6333,"bc_para0":1.325,"bc_para1":3.0,"bc_para2":1.8308,"bc_pigeon0":1.0968,"bc_pigeon1":1.74,"bc_boat0":1.0967,"bc_boat1":1.0045,"bc_flowers0":1.3844,"bc_flowers1":1.3844,"bc_flowers2":1.3844,"bc_stall0":1.15,"bc_stall1":1.15,"bc_stall2":1.15,"bc_cctower":0.3241,"bc_cabin":0.8132,"bc_roof1":0.5316,"bc_roof2":0.4987,"bc_roof3":0.5483,"bc_roof4":0.4964,"bc_washing":1.7961,"bc_chimney":0.4125,"bc_chimneys":1.0205,"bc_tank":0.6743,"bc_planter2":0.8394,"bc_solar":1.8535,"bc_spring0":0.785,"bc_spring1":0.8486,"bc_gegant0":0.5135,"bc_gegant1":0.4943,"bc_gegant2":0.5077,"bc_ramp0":2.6121,"bc_ramp1":2.6265,"bc_boost":6.1906}, BC_RAMP = { bc_ramp0: 1.155, bc_ramp1: 1.66, bc_boost: 0.425 };
    L.outfit = 'dxb';                                    // the summer outfit (Ladi 2026-11-08)
    L.killY = -8; L.startX = 2.0; L.camMin = -12; L.introCam = 'centre';
    const aw = (k, h) => BC_ASP[k] * h;                  // a picture's width when drawn h units tall
    const ground = (x0, x1, style, y = 0) => b.groundTop(x0, x1, y, style);
    const art = (key, x, y, h, o = {}) => b.kitArt(key, x, y, h, Object.assign({ w: aw(key, h) }, o));
    const back = (key, x, h, o = {}) => art(key, x, o.y || 0, h, Object.assign({ back: true }, o));
    const solid = (x, w, h, y = 0, o = {}) => { const s = Object.assign({ kind: 'block', x, y, w, h, style: 'hidden' }, o); L.solids.push(s); return s; };
    // props: stand on the floor at y (given, so a prop in front of a row isn't stood on the row's top balcony)
    const lean = (key, x, h, sh, y = 0) => { const w = aw(key, h); return b.kitProp(key, x, w, h, { y, solid: [0.1, w - 0.2, sh], ledge: [0.1, sh, w - 0.2] }); };   // taller than a knee: lean, then hop on
    const hop = (key, x, h, y = 0, sh = Math.min(h, 1.0)) => { const w = aw(key, h); return b.kitProp(key, x, w, h, { y, solid: [0.1, w - 0.2, sh] }); };   // knee-high: he hops it by himself
    const prop = (key, x, h, y = 0) => b.kitProp(key, x, aw(key, h), h, { y });
    // a row of houses wall to wall; each house: [key, ledge heights (balconies, roof)] at the sheet's own scale
    const RS = { flat: 7.6 / 7.6, goth: 1, eix: 1, grac: 1 };
    const H = { bc_flat1: 6.577, bc_flat2: 7.6, bc_flat3: 5.301, bc_flat4: 5.928, bc_flat_endl: 5.279, bc_flat_endr: 5.279,
      bc_goth1: 7.722, bc_goth2: 8.2, bc_goth3: 7.587, bc_goth4: 5.626, bc_goth5: 5.54, bc_goth6: 5.503, bc_goth_endl: 5.0, bc_goth_endr: 5.013,
      bc_eix1: 7.615, bc_eix2: 9.0, bc_eix3: 7.295, bc_eix4: 5.974, bc_eix_endl: 6.256, bc_eix_endr: 6.256,
      bc_grac1: 5.401, bc_grac2: 7.4, bc_grac_endl: 5.494, bc_grac_endr: 5.494 };
    const LED = { bc_flat1: [2.2, 4.1, 6.3], bc_flat2: [3.3, 5.6, 7.3], bc_flat3: [2.9, 4.9], bc_flat4: [2.3, 4.0, 5.5], bc_flat_endl: [5.1], bc_flat_endr: [5.1],
      bc_goth1: [3.3, 5.6, 7.4], bc_goth2: [3.3, 5.5, 7.9], bc_goth3: [3.1, 5.5, 7.3], bc_goth4: [3.0, 5.2], bc_goth5: [3.0, 5.2], bc_goth6: [3.0, 5.1],
      bc_goth_endl: [4.85], bc_goth_endr: [4.85],
      bc_eix1: [3.0, 4.6, 6.0, 7.2], bc_eix2: [3.2, 4.6, 5.9, 7.2, 8.6], bc_eix3: [2.9, 4.6, 6.0, 6.9], bc_eix4: [2.8, 4.2, 5.6], bc_eix_endl: [6.0], bc_eix_endr: [6.0],
      bc_grac1: [2.4, 4.4], bc_grac2: [2.0, 4.6, 6.6], bc_grac_endl: [5.35], bc_grac_endr: [5.35] };
    const house = k => { const w = aw(k, H[k]); return { key: k, w, h: H[k], ledges: LED[k].map(y => [0.35, y, w - 0.7]) }; };
    const row = (x, keys, y = 0) => {
      const r = b.kitRow(x, keys.slice(1, -1).map(house), { capL: house(keys[0]), capR: house(keys[keys.length - 1]) });
      if (y) for (const a of L.kitArt) if (a.row === x) a.y = y;
      return r;
    };
    const swapAt = (x, to, why) => (L.kitSwaps = L.kitSwaps || []).push({ x, to, why });   // an arch, a gate, behind a building: not a door
    L.bcJoins = [];                                        // where two kinds of ground meet (each one behind a prop or under an arch)
    L.bcLife = [];                                         // birds and boats: [key, x, y, kind]

    // ---------- 1. Barceloneta: the taxi drops A on the boardwalk by the beach ----------
    b.wall(-12.5, 1, 22);
    const E = 18.0;                                       // (the cable ride was made longer, Ladi 2026-11-09: all the old town moves along by E)
    ground(-14, 79.7 + E, 'bcboard');
    L.bcCar = { x: -4.4 };                                 // yellow-and-black taxi: A steps out, it drives off
    L.bcLife.push(['bc_boat0', -8, 0.9, 'boat'], ['bc_boat1', 30, 0.9, 'boat'], ['bc_gull0', 8, 9.5, 'fly'], ['bc_gull2', 48, 10.5, 'fly']);
    hop('bc_bench', 5.0, 1.0);
    // special 1 = BOUNCE: beach umbrella -> beach bar roof -> umbrella on the roof -> top of L'Estel Ferit (the stacked cubes)
    prop('bc_umb_blue', 10.2, 2.5); solid(10.5, 2.2, 0.3, 2.15, { bounce: 3.6 });
    const BB = 13.4, BH = 4.4, BW = aw('bc_beachbar', BH);
    back('bc_beachbar', BB, BH); b.ledge(BB + 0.13 * BW, 0.84 * BH, 0.74 * BW);                       // its roof terrace
    b.ledge(BB + 0.815 * BW, 0.5 * BH, 0.12 * BW); b.ledge(BB + 0.865 * BW, 0.28 * BH, 0.125 * BW);       // the steps at its side
    prop('bc_umb_red', BB + 3.9, 2.5, 0.84 * BH); solid(BB + 4.2, 2.2, 0.3, 0.84 * BH + 2.15, { bounce: 4.6 });
    const CB = BB + BW + 0.6;
    back('bc_cubes', CB, 10.6); b.ledge(CB + 0.35, 10.3, 2.8);
    b.arc(9.8, 3.0, 5, 4.2, 2.6); b.coins(BB + 4.6, 9.2, 3, 0.9, 0.6);
    b.special(CB + 1.75, 12.3);                                                     // 1
    prop('bc_lounger', CB + 5.0, 0.75);
    // ---------- the port cable car (Ladi 2026-11-08: the first half higher up and more exciting) ----------
    // Torre de Sant Sebastia: wall-jump up between its two steel legs (its left leg stands on a base he runs past), onto the station deck
    const CT = (x, flip) => {                                          // one tower: picture + legs + deck. (pieces measured from the picture)
      const m = (a, w) => flip ? x + 5.51 - a - w : x + a;
      back('bc_cctower', x, 17.0, { flip: !!flip });
      b.ledge(m(0.29, 4.56), 14.6, 4.56);                              // the station deck (he jumps up through it from below)
      return { legL: [m(0.89, 0.98), 0.98], legR: [m(3.27, 0.97), 0.97] };
    };
    const T1 = 30.0, t1 = CT(T1);
    solid(t1.legL[0], 0.6, 14.35 - 3.2, 3.2, { noGrab: true });         // (the left leg's base is in front: he runs, or hops, past it into the gap;
    solid(t1.legL[0] + 0.6, t1.legL[1] - 0.6, 14.35 - 3.2, 3.2);        //  its outer side is no wall to kick off, its inner side is)
    solid(t1.legR[0], t1.legR[1], 14.35);
    solid(T1 + 0.2, 0.3, 2.0, 14.6, { noGrab: true });                      // (the deck's railing at its far end: off the top of the climb he lands on the deck)
    for (let i = 0, y = 1.6; y < 14.0; i++, y += 1.5) b.coins(i % 2 ? T1 + 2.3 : T1 + 2.85, y, 1);   // zigzag up the gap
    // the cabin waits at the station with its floor level with the deck: A walks in, rides inside it high over the beach, walks out at the far tower
    b.ledge(T1 + 4.85, 14.6, 1.6);                                     // (the cabin's floor beside the deck)
    const T2 = 63.0 + E, CX0 = T1 + 5.8, CX1 = T2 - 1.6;                // (where A stands in the cabin: 0.9 in from its left wall)
    L.rides = L.rides || [];
    // the swoop (Ladi 2026-11-09): out of the station it dips low over the flats like a rollercoaster, speeding up downhill,
    // climbs, dips again and rises to the far tower. No tapping in the cabin (Ladi 2026-11-09): he rides through the coins
    const CK = [[CX0, 14.6], [CX0 + 2.5, 14.6], [CX0 + 12.0, 9.6], [CX0 + 19.0, 9.6], [CX0 + 25.0, 12.8], [CX0 + 30.0, 10.4], [CX0 + 36.0, 10.4], [CX1 - 3.0, 14.6], [CX1, 14.6]];
    const CP = [CK[0]];                                                // (eased between those points, so the cable curves instead of kinking)
    for (let i = 1; i < CK.length; i++) { const [x0, y0] = CK[i - 1], [x1, y1] = CK[i], n = Math.max(1, Math.round(x1 - x0)); for (let j = 1; j <= n; j++) { const k = j / n; CP.push([x0 + (x1 - x0) * k, y0 + (y1 - y0) * k * k * (3 - 2 * k)]); } }
    const cable = { kind: 'bccable', x0: CX0, pts: CP, v: 8.0, acc: 6.0, swoop: 1.6, w0: 0.6, w1: 0.5, vEnd: 6.2, walkOut: 3.2, input: false,   // (walks out as it glides in: Ladi 2026-11-09)
      seat: 0.0, up: 0, down: 0, exitY: 14.6 };
    L.rides.push(cable); L.bcCable = { ride: cable, y: 17.7, hang: 3.1, x0: T1 + 4.3, x1: T2 + 1.21, posts: [T1 + 4.3, T2 + 1.21] };
    b.ledge(CX1 - 0.9, 14.6, 3.2);                                     // (at the far tower he walks out of the cabin onto the deck)
    const cy = x => { for (let i = 1; i < CP.length; i++) if (x <= CP[i][0]) { const a = CP[i - 1], c = CP[i]; return a[1] + (c[1] - a[1]) * (x - a[0]) / (c[0] - a[0]); } return 14.6; };
    for (let x = CX0 + 3.0; x < CX1 - 1; x += 1.3) b.coins(x, cy(x) + 0.75, 1);   // a line of coins along the swoop
    L.bcLife.push(['bc_gull1', 44, 18.5, 'fly'], ['bc_gull0', 58, 19.5, 'fly'], ['bc_gull2', 72, 18.0, 'fly']);
    prop('bc_palm', 37.0, 7.0);
    // Barceloneta flats close behind, different heights, washing on the balconies; balconies are ledges
    const R1 = row(40, ['bc_flat_endl', 'bc_flat1', 'bc_flat2', 'bc_flat3', 'bc_flat4', 'bc_flat1', 'bc_flat_endr']);
    lean('bc_icecart', 44.0, 2.2, 1.5); b.coins(44.3, 2.8, 3, 0.9);
    b.coins(47.6, 4.6, 5, 1.0); b.coins(53.6, 6.6, 4, 1.0);
    lean('bc_scooters', 54.6, 1.35, 1.3); b.coins(55.0, 2.4, 3, 0.9);              // parked blue/white e-scooters under the cable: hop
    const R1b = row(R1 + 2.2, ['bc_flat_endl', 'bc_flat3', 'bc_flat2', 'bc_flat4', 'bc_flat_endr']);   // more flats under the longer cable
    hop('bc_bench', R1 + 0.6, 1.0); b.coins(R1b - 9.0, 6.2, 4, 1.0);
    // the middle tower (Torre Jaume I): off the end of its deck he drops back down to the boardwalk, down a trail of coins
    CT(T2, true);
    for (let i = 0; i < 7; i++) b.coins(T2 + 5.7 + i * 0.55, 14.9 - 0.3 * i * i, 1);
    hop('bc_bench', R1 + 10.5 + E, 1.0); b.pigeon(R1 + 14.0 + E);
    // into the old town under a deep stone arch: the backdrops change in its shade (an arch, not a door)
    const AR = 73.9 + E;
    back('bc_arch', AR, 8.0); b.ledge(AR + 1.4, 7.1, 4.2); b.ledge(AR + 0.05, 5.3, 1.2); b.ledge(AR + 5.65, 5.3, 1.2);
    L.bcArch = { x: AR, h: 8.0 };
    swapAt(AR + 3.5, 'oldtown', 'deep stone arch'); L.bcJoins.push(AR + 5.8);   // (the ground changes behind the arch's right pillar)

    // ---------- 2. Gothic Quarter: narrow lanes, the human tower, the Bishop's Bridge ----------
    const R2 = row(81 + E, ['bc_goth_endl', 'bc_goth1', 'bc_goth4', 'bc_goth2', 'bc_goth5', 'bc_goth_endr']);
    lean('bc_flowercart', 85.6 + E, 1.9, 1.3); b.coins(86.0 + E, 2.6, 3, 0.8);
    b.coins(89.0 + E, 4.4, 4, 1.0); b.coins(93.0 + E, 6.6, 3, 1.0);
    prop('bc_wallfount', R2 + 0.2, 2.4); lean('bc_planter2', R2 + 0.95, 1.4, 1.3);   // (a planter to hop before the castellers: 6s rule)
    hop('bc_stonebench', R2 + 2.5, 0.9);
    b.pigeon(R2 + 6.6);
    // Placa Sant Jaume: City Hall, and the castellers' tower in front of it. Special 2 = TAP-CLIMB the human tower, level by level
    const CH = 103.6 + E; back('bc_cityhall', CH, 8.0); b.ledge(CH + 2.6, 2.75, 3.0); b.ledge(CH + 0.2, 6.4, 7.9);
    const TX = 106.4 + E, TW = aw('bc_castell', 10.2);
    back('bc_castell', TX, 10.2);
    for (const [i, y] of [[0, 2.4], [1, 4.5], [2, 6.6], [3, 8.7]].map((y, i) => [i, y[1]])) { b.ledge(TX + 0.3, y, TW - 0.6); b.coins(TX + TW / 2, y + 1.3, 1); }
    solid(TX + TW - 0.9, 0.9, 8.7, 0, { noGrab: true });                            // the crowd at its foot: he can't walk through, he climbs
    L.bcCastell = { x: TX, w: TW, h: 10.2 };
    b.special(TX + TW / 2, 10.9);                                                   // 2: where the child at the top stands
    // two castellers from the team just before the tower: he jumps onto their hands and they spring him to the top (Ladi 2026-11-08)
    const SP = TX - 3.6;
    L.bcSpring = { x: SP, s: solid(SP + 0.25, 1.2, 1.1, 0, { bounce: 9.4, noGrab: true }) };   // (knee-high: he always hops on)
    solid(SP + 1.45, 0.3, 5.0, 0, { noGrab: true });                                // (and can't jump past them: Ladi 2026-11-09, they always fling him)
    b.coins(SP + 0.9, 3.0, 1); b.coins(SP + 1.6, 5.4, 1); b.coins(SP + 2.4, 7.6, 1);
    // ---------- the rooftop run: off the top of the human tower, over the old town's roof terraces to the Bishop's Bridge ----------
    // each house: its roof terrace and the little hut / bell turret on it (measured from the pictures: [dx, y, w])
    const ROOF = { bc_roof1: [[0.35, 8.34, 2.75], [3.2, 8.97, 1.3]], bc_roof2: [[0.38, 9.94, 1.35], [1.8, 9.1, 2.5], [4.36, 9.19, 0.35]],
      bc_roof3: [[0.35, 7.66, 2.58], [3.0, 8.47, 1.3]], bc_roof4: [[0.3, 10.67, 1.1], [1.65, 9.07, 2.1], [3.85, 9.94, 1.3]] };
    const RH = { bc_roof1: 9.014, bc_roof2: 10.007, bc_roof3: 8.505, bc_roof4: 11.0 };
    const roofH = k => ({ key: k, w: aw(k, RH[k]), h: RH[k], ledges: ROOF[k] });
    const RX = TX + TW + 0.2 - aw('bc_goth_endl', H.bc_goth_endl), RK = ['bc_roof3', 'bc_roof2', 'bc_roof1', 'bc_roof4'];
    const RE = b.kitRow(RX, RK.map(roofH), { capL: house('bc_goth_endl'), capR: house('bc_goth_endr') });
    const rx = {}; { let cx = RX + aw('bc_goth_endl', H.bc_goth_endl) - 0.05; for (const k of RK) { rx[k] = cx; cx += aw(k, RH[k]) - 0.05; } }
    lean('bc_solar', rx.bc_roof3 + 0.45, 1.3, 1.2, 7.66);                          // (a solar panel to hop on the first roof: 6s rule)
    lean('bc_chimney', rx.bc_roof2 + 3.0, 2.4, 1.4, 9.1);                           // a tall chimney on the terrace: lean, hop over
    // the washing line on a roof terrace is springy: land on it and it bounces him up to the bell turret
    const WL = rx.bc_roof1 + 0.3, WW = aw('bc_washing', 1.7);
    prop('bc_washing', WL, 1.7, 8.34); solid(WL + 0.5, WW - 1.0, 0.3, 8.34 + 0.95, { bounce: 3.4 });
    prop('bc_tank', rx.bc_roof4 + 1.75, 2.18, 9.07);
    b.coins(TX + TW / 2 + 1.2, 9.6, 3, 1.0); b.coins(rx.bc_roof3 + 0.6, 8.9, 4, 0.8); b.coins(rx.bc_roof2 + 0.6, 11.0, 4, 1.0);
    b.arc(WL + 0.6, 10.6, 6, 4.4, 2.6); b.coins(rx.bc_roof4 + 2.0, 10.2, 3, 0.9);
    L.bcLife.push(['bc_pigeon1', rx.bc_roof4 + 4.1, 9.94, 'sit']);
    lean('bc_cafe', rx.bc_roof1 + 0.5, 2.1, 1.3); lean('bc_flowercart', rx.bc_roof4 + 2.2, 1.9, 1.3);   // down in the lane under the roofs: cafe tables, a flower cart
    // over the rooftops to the Bishop's Bridge (Carrer del Bisbe): palace, the bridge, the canons' house, in one picture
    const BR = RE + 0.4, D = BR - (TX + TW + 0.4), BRH = 7.6, BRW = aw('bc_bridge', BRH), k = BRH / 8.6;
    back('bc_bridge', BR, BRH); b.ledge(BR + 0.1, 8.45 * k, BRW - 0.2);
    b.ledge(BR + 15.0 * k, 3.5 * k, 6.3 * k); b.ledge(BR + 15.5 * k, 6.0 * k, 2.0 * k); b.ledge(BR + 19.6 * k, 6.0 * k, 2.0 * k);
    b.ledge(BR + 1.0 * k, 3.6 * k, 2.4 * k);
    lean('bc_pots', BR + 9.6 * k, 1.8, 1.4, 8.45 * k);
    b.coins(BR + 1.0, 8.6, 6, 1.0); b.arc(BR + 8.0, 8.4, 5, 5.0, 1.2); b.coins(BR + 14.0, 8.6, 5, 1.0);
    L.bcLife.push(['bc_pigeon0', BR + 4.0, 8.45 * k, 'sit'], ['bc_gull1', BR + 12, 11.0, 'fly']);
    const G2 = BR + BRW + 3.0;
    const R3 = row(G2 + 4.0, ['bc_goth_endl', 'bc_goth3', 'bc_goth6', 'bc_goth1', 'bc_goth4', 'bc_goth_endr']);
    // the street bubble artist (Ladi 2026-11-09, instead of the giants): he blows a giant bubble round A and it floats him up past the
    // balconies and over the roofs. A tap pops it (he drops onto the roofs or the lane); untouched, it pops by itself past the last roof
    const GX0 = G2 + 3.0, GX1 = R3 + 1.5;
    const bub = { kind: 'bcbubble', x0: GX0, pts: [[GX0, 0], [GX0 + 1.5, 1.6], [GX0 + 6.0, 5.0], [GX0 + 11.0, 8.0], [GX0 + 16.0, 9.4], [GX1, 9.6]],   // (lifts off quicker, wanders about: Ladi 2026-11-09)
      v: 4.3, acc: 5.0, drift: [0.45, 0.35], w0: 0.35, w1: 0.1, input: true, popTap: true, seat: 0.0, up: 0, down: 0, exitY: 9.6 };
    L.rides.push(bub); L.bcBubble = { ride: bub, x: GX0 - 2.4 };                    // (the artist: his rope loop is where the bubble forms round A)
    lean('bc_pots', G2 - 1.4, 1.8, 1.4);                                            // (flower pots in the lane by the bubble artist)
    { const P = bub.pts, by = x => { for (let i = 1; i < P.length; i++) if (x <= P[i][0]) { const a = P[i - 1], c = P[i]; return a[1] + (c[1] - a[1]) * (x - a[0]) / (c[0] - a[0]); } return 9.6; };
      for (let x = GX0 + 1.5; x < GX1 - 0.5; x += 1.25) b.coins(x, by(x) + 0.75 + 0.5 * Math.sin((x - GX0) * 1.3), 1); }   // a wavy trail of coins up through the air
    b.coins(G2 + 5.0, 8.4, 3, 0.9); b.coins(G2 + 13.0, 8.6, 3, 0.9); b.coins(G2 + 17.0, 6.2, 3, 0.9);   // (on the roofs and balconies, for popping early)
    ground(79.7 + E, 176 + D + E, 'bcsetts');
    lean('bc_cafe', GX1 + 2.2, 2.1, 1.3); hop('bc_bollards', 172.0 + D + E, 1.0); L.bcJoins.push(176 + D + E);   // (cafe tables where the bubble lands him)

    // ---------- 3. La Rambla and La Boqueria (from outside) ----------
    const fk = i => ({ key: 'bc_flowers' + i, w: aw('bc_flowers' + i, 3.2), h: 3.2, top: 3.0 });
    lean('bc_flowerbox', 175.0 + D + E, 1.35, 1.3);
    const FK = b.kitStalls(179.8 + D + E, [fk(0), fk(1), fk(2)]); b.coins(180.4 + D + E, 4.2, 11, 1.1);
    prop('bc_planetree', FK + 0.6, 7.5);
    prop('bc_statue', FK + 4.6, 2.9); lean('bc_pots', FK + 8.6, 1.8, 1.4);                                               // the golden human statue on his box
    prop('bc_miro', FK + 6.6, 0.12);                                                // Miro's tiles in the pavement
    // special 3 = STALL ROOFS -> GATE: fruit, juice, sweets stalls, the gate's iron pillar, its cornice, along the top of the stained-glass arch
    const sk = i => ({ key: 'bc_stall' + i, w: aw('bc_stall' + i, 2.8), h: 2.8, top: 2.65 });
    const SK = b.kitStalls(FK + 12.0, [sk(0), sk(1), sk(2)]); b.coins(FK + 12.4, 3.8, 8, 1.1);
    const GX = SK + 0.6, GH = 11.0, gk = GH / 11.0;
    back('bc_gate', GX, GH); L.bcGate = { x: GX, h: GH };
    b.ledge(GX + 0.6 * gk, 4.6 * gk, 1.7 * gk);                                     // the pillar's capital
    b.ledge(GX + 1.8 * gk, 6.9 * gk, 10.8 * gk);                                     // the iron cornice over the gate
    b.slope(GX + 1.6 * gk, 7.0 * gk, GX + 7.2 * gk, 11.0 * gk); b.slope(GX + 7.2 * gk, 11.0 * gk, GX + 12.9 * gk, 7.0 * gk);   // the curved top
    b.coins(GX + 1.0, 5.8, 1); b.coins(GX + 2.6, 8.0, 5, 1.0); b.arc(GX + 2.0, 9.2, 7, 10.6, 1.8);
    b.special(GX + 7.2 * gk, 12.8);                                                 // 3: above the stained glass
    const RA = GX + aw('bc_gate', GH) + 2.0;
    prop('bc_planetree', RA, 7.5); lean('bc_flowerbox', RA + 4.0, 1.35, 1.3);
    // Placa de Catalunya: fountain rim, pigeons, the metro sign, then the e-scooter
    hop('bc_fountainrim', RA + 8.0, 0.9); b.coins(RA + 8.4, 2.0, 5, 0.9);
    b.pigeon(RA + 14.0); b.pigeon(RA + 17.0);
    const SC = RA + 24.0, SE = SC + 62.0;                                         // (longer ride with ramps: Ladi 2026-11-09)
    lean('bc_metrosign', SC - 2.0 - aw('bc_metrosign', 2.8) / 2, 2.8, 1.6);          // (stands on the join of the Rambla and the road)
    L.bcScooter = { x: SC - 1.6 };                                                  // the e-scooter A hops on (parked at the kerb)
    // ---------- the e-scooter ride up to Passeig de Gracia: tap to hop for the high coins ----------
    ground(176 + D + E, SC - 2.0, 'bcrambla'); ground(SC - 2.0, SE + 4.0, 'bcroad'); L.bcJoins.push(SC - 2.0);
    L.rides = L.rides || [];
    // kicker ramps (A rides up them and flies) and boost arrows (a burst of speed) on the road (Ladi 2026-11-09)
    const RMP = [['bc_ramp0', SC + 5.0, 9.0], ['bc_ramp1', SC + 25.0, 11.0], ['bc_ramp0', SC + 48.0, 9.0]], BST = [SC + 19.0];
    const RW = { bc_ramp0: [aw('bc_ramp0', BC_RAMP.bc_ramp0), BC_RAMP.bc_ramp0], bc_ramp1: [aw('bc_ramp1', BC_RAMP.bc_ramp1), BC_RAMP.bc_ramp1] };
    const pts = [[SC, 0]], ramps = [];
    for (const [k, x, v] of RMP) {                                                 // his path up each ramp's curved deck, measured from the picture
      const [w, h] = RW[k];
      for (const [f, y] of [[0.0, 0.0], [0.05, 0.17], [0.4, 0.36], [0.7, 0.62], [0.93, 0.92]]) pts.push([x + f * w, y * h]);
      pts.push([x + 0.93 * w + 0.01, 0]); ramps.push({ x: x + 0.93 * w, v, h: 0.92 * h });
      prop(k, x, h);
    }
    for (const x of BST) prop('bc_boost', x, BC_RAMP.bc_boost);
    pts.push([SE, 0]);
    const ride = { kind: 'scooter', x0: SC, pts, ramps, boosts: BST.map(x => [x, x + aw('bc_boost', BC_RAMP.bc_boost)]), v: 13.0, acc: 8.0, vEnd: 6.2, w0: 0.5, w1: 0, input: true, jump: 9.0, grav: 30,   // (slows to walking pace and he walks off: Ladi 2026-11-09)
     
      seat: 0.0, up: 0, down: 0, exitY: 0 };
    L.rides.push(ride); L.bcRide = ride;
    for (const [dx, y] of [[2.0, 0.75], [3.6, 0.75], [5.2, 0.88], [6.8, 1.36], [8.4, 2.15], [10.0, 2.87], [11.6, 3.12], [13.2, 2.92], [14.8, 2.28], [16.4, 1.15], [18.0, 0.75], [19.6, 0.75], [21.2, 0.75], [22.8, 0.75], [24.4, 0.75], [26.0, 1.19], [27.6, 1.65], [29.2, 2.28], [30.8, 3.09], [32.4, 3.68], [34.0, 4.07], [35.6, 4.24], [37.2, 4.18], [38.8, 3.92], [40.4, 3.44], [42.0, 2.73], [43.6, 1.77], [45.2, 0.75], [46.8, 0.75], [48.4, 0.98], [50.0, 1.45], [51.6, 2.23], [53.2, 2.91], [54.8, 3.12], [56.4, 2.69], [58.0, 1.37]]) b.coins(SC + dx, y, 1);   // (along his flights off the ramps, from a test ride)
    const CO = SC + 18.0; back('bc_corner', CO, 13.0);                              // a big Placa de Catalunya corner building fills the screen as he rides past
    swapAt(CO + 6.4, 'eixample', 'behind the big corner building A rides past');

    // ---------- 4. Passeig de Gracia: the Block of Discord (Lleo Morera, Amatller, Batllo), then up La Pedrera ----------
    const PG0 = SE + 4.0;
    L.bcJoins.push(PG0);
    prop('bc_planetree', PG0 - aw('bc_planetree', 7.5) / 2, 7.5);                    // (a plane tree on the join: he runs straight past, Ladi 2026-11-09)
    const MZ = PG0 + 4.0, MH = 10.6, mk = MH / 10.6;
    back('bc_manzana', MZ, MH);
    b.ledge(MZ + 1.0 * mk, 3.1 * mk, 6.5 * mk); b.ledge(MZ + 1.4 * mk, 7.3 * mk, 6.2 * mk);                          // Casa Lleo Morera
    b.ledge(MZ + 8.0 * mk, 5.6 * mk, 6.0 * mk); b.ledge(MZ + 9.6 * mk, 8.3 * mk, 3.4 * mk);                          // Casa Amatller's stepped gable
    b.ledge(MZ + 15.0 * mk, 4.4 * mk, 6.0 * mk); b.ledge(MZ + 15.2 * mk, 6.6 * mk, 5.8 * mk); b.ledge(MZ + 16.2 * mk, 9.0 * mk, 3.8 * mk);   // Casa Batllo's bone balconies, its dragon roof
    b.coins(MZ + 1.6, 4.2, 6, 1.0); b.coins(MZ + 8.6, 6.8, 5, 1.0); b.arc(MZ + 15.6, 7.8, 6, 5.0, 2.0);
    L.bcLife.push(['bc_para0', MZ + 6, 11.5, 'fly'], ['bc_para2', MZ + 18, 12.4, 'fly']);
    const MZE = MZ + aw('bc_manzana', MH);
    lean('bc_newsstand', MZE + 1.2, 3.0, 2.8);
    // special 4 = WALL-JUMP + WARRIOR LEAPS: under the corner building's arcade, up the gap, onto La Pedrera's roof, chimney to chimney
    const CX = MZE + 5.6, CH2 = 13.0, CW = aw('bc_ptower', CH2), GAP = 1.8, PX = CX + CW + GAP, PH2 = 13.4, PW2 = aw('bc_pedrera', PH2), PT = 12.2;
    back('bc_ptower', CX, CH2); solid(CX + 0.2, CW - 0.4, CH2 - 0.6 - 1.9, 1.9);    // its ground floor is an arcade he runs under
    b.ledge(CX + 0.4, CH2 - 0.6, CW - 0.8);
    back('bc_pedrera', PX, PH2); solid(PX, PW2, PT);
    (L.kitClimbs = L.kitClimbs || []).push({ x: CX, xr: PX, gap: GAP, hL: CH2 - 0.6, hR: PT });
    for (let i = 0, y = 2.4; y < PT - 0.4; i++, y += 1.5) b.coins(CX + CW + (i % 2 ? GAP - 0.55 : 0.15), y, 1);   // zigzag up the gap
    const war = (key, dx, h) => { const w = aw(key, h); art(key, PX + dx, PT, h, { back: true }); solid(PX + dx + 0.2, w - 0.4, h - 0.1, PT); b.ledge(PX + dx + 0.15, PT + h - 0.1, w - 0.3); return w; };
    art('bc_roofwave', PX + 0.6, PT, 1.6, { back: true }); b.ledge(PX + 0.7, PT + 1.0, 1.0);
    war('bc_war1', 4.4, 2.3); war('bc_war2', 7.4, 3.0); const w3 = war('bc_war3', 11.0, 4.2);
    b.coins(PX + 5.3, PT + 3.2, 1); b.coins(PX + 8.6, PT + 4.0, 1); b.arc(PX + 9.0, PT + 4.4, 4, 3.0, 1.2);
    b.special(PX + 11.0 + w3 / 2, PT + 5.9);                                        // 4: on the tallest warrior's helmet
    L.bcLife.push(['bc_gull2', PX + 2, PT + 6, 'fly']);
    // down the far side, on the next houses' balconies
    const R4 = row(PX + PW2 - 0.1, ['bc_eix_endl', 'bc_eix2', 'bc_eix3', 'bc_eix_endr']);
    for (const a of L.kitArt) if (a.key === 'bc_eix_endl' && Math.abs(a.x - (PX + PW2 - 0.1)) < 0.01) a.hide = true;   // (the end piece would sit behind La Pedrera)
    b.coins(PX + PW2 + 1.0, 9.6, 4, 1.0, -1.6);
    prop('bc_plane2', R4 + 0.8, 6.5);
    hop('bc_benchlamp', R4 + 4.6, 3.6, 0, 1.3);
    b.pigeon(R4 + 9.0);
    lean('bc_bikes', R4 + 11.0, 1.35, 1.3); b.coins(R4 + 11.4, 2.4, 3, 1.0);          // blue/white bike dock
    const R5 = row(R4 + 16.0, ['bc_eix_endl', 'bc_eix1', 'bc_eix4', 'bc_eix3', 'bc_eix_endr']);
    b.coins(R4 + 17.4, 4.0, 5, 1.0); b.coins(R4 + 23.0, 6.4, 5, 1.0);
    lean('bc_kiosk', R5 + 1.0, 2.6, 2.4);
    hop('bc_planter', R5 + 5.4, 1.5, 0, 1.0);

    // ---------- 5. Sagrada Familia: THE ONE DOOR. In at the Nativity door, out at the Passion door ----------
    const SD = R5 + 12.0, NH = 24.0;
    back('bc_nativity', SD - aw('bc_nativity', NH) / 2, NH);
    b.kitDoor(SD, { inside: true }); b.kitSwap(SD, 'sagrada'); L.bcDoorIn = SD;
    ground(PG0, SD, 'bchex');
    hop('bc_chairs', SD + 3.4, 0.95); b.coins(SD + 3.8, 1.9, 3, 1.0);
    // the wall bounce up to the choir gallery (Ladi 2026-11-09, instead of the lift): A wall-jumps between a stone tree column and the
    // gallery's first pier, and comes out on top of the gallery
    const GF = 5.0, LX = SD + 8.0, PSH = 7.2, PSW = aw('bc_liftshaft', PSH), PCW = PSW * 62 / 203, PGAP = 1.8;
    back('bc_liftshaft', LX, PSH, { clip: [0, PCW] });                                // (the left column of the old lift shaft picture)
    solid(LX + 0.15, 0.4, PSH - 2.5, 2.0, { noGrab: true });                          // the column (he runs past in front of its foot into the gap;
    solid(LX + 0.55, PCW - 0.7, PSH - 2.5, 2.0);                                       //  its outer side is no wall to kick off, its inner side is)
    b.ledge(LX + 0.15, PSH - 0.5, PCW - 0.3);
    const LW = PCW + PGAP;
    for (let i = 0, y = 1.6; y < GF + 0.5; i++, y += 1.4) b.coins(LX + PCW + (i % 2 ? PGAP - 0.5 : 0.25), y, 1);   // zigzag up the gap
    const GH2 = GF / 4.65 * 6.0, GW = aw('bc_gallery', GH2), GX2 = LX + LW - GW * 72 / 1135, GE = GX2 + GW;
    back('bc_gallery', GX2, GH2); b.ledge(GX2 + 0.2, GF, GW - 0.4);                  // the choir gallery on its tree arches
    const GP = GX2 + GW * 72 / 1135;                                                  // (its first pier: the right-hand wall of the bounce)
    solid(GP, GW * 50 / 1135, GF - 0.1);
    (L.kitClimbs = L.kitClimbs || []).push({ x: LX, xr: GP, gap: GP - LX - PCW, hL: PSH - 0.5, hR: GF });
    b.coins(GX2 + 1.5, GF + 1.0, 9, 1.1); lean('bc_chairs', GX2 + 12.0, 1.35, 1.3, GF); lean('bc_chairs', GX2 + 9.0, 1.35, 1.3); b.coins(GX2 + 16.0, GF + 2.2, 5, 1.0);
    // special 5 = BIG LEAP: off the end of the gallery onto the canopy hanging over the altar
    const CN = GE + 2.4, CNY = GF + 0.3;
    art('bc_canopy', CN, CNY, 2.6, { back: true, hang: true }); b.ledge(CN + 0.2, CNY + 1.35, 4.6);
    b.arc(GE - 0.4, GF + 1.4, 5, 4.4, 2.2);
    b.special(CN + 2.5, GF + 3.3);                                                  // 5 (lower: the camera stays down inside now)
    back('bc_altar', CN + 0.6, 1.7); b.ledge(CN + 0.75, 1.6, 3.5);
    // the snail stair down from the canopy, then the stone arch bridge, the font, the Passion door
    const S0 = CN + 5.6, SH = GF / (5.5 / 6.0), SW = aw('bc_snail', SH);
    back('bc_snail', S0, SH); b.ledge(S0 + 0.1, GF, 1.7); b.slope(S0 + 1.8, GF, S0 + SW - 0.2, 0.0);
    b.coins(S0 + 2.2, GF - 0.2, 4, 0.9, -1.4);
    L.bcInSwap = S0 + 0.5 * SW;                                                       // the blue-green side gives way to the warm side behind its column
    const SA = S0 + SW + 2.5; lean('bc_stairarch', SA, 3.0, 2.85); b.coins(SA + 0.6, 4.0, 6, 1.1);
    lean('bc_font', SA + aw('bc_stairarch', 3.0) + 3.0, 1.6, 1.35);
    const D2 = SA + aw('bc_stairarch', 3.0) + 9.0;
    b.kitDoor(D2, { inside: false }); b.kitSwap(D2, 'gracia'); L.bcDoorOut = D2;
    ground(SD, D2, 'bcnave');
    L.camFloor = [];                                                                   // (no camera shift inside: Ladi 2026-11-09)

    // ---------- 6. Up to Park Guell: Gracia's streets, the outdoor escalators, the gate, the lizard stair, the terrace at sunset ----------
    const EH = 6.0, ES = EH / 4.9 * 7.4, EW = aw('bc_escalator', ES), ek = ES / 7.4;
    const R6 = row(D2 + 3.0, ['bc_grac_endl', 'bc_grac1', 'bc_grac2', 'bc_grac1', 'bc_grac_endr']);
    prop('bc_bins', R6 + 0.6, 1.2); lean('bc_stonewall', R6 + 4.4, 1.4, 1.35); b.coins(R6 + 4.8, 2.6, 4, 0.9);
    const EX = R6 + 10.0;
    ground(D2, EX + 15.3 * ek, 'bchill');
    art('bc_escalator', EX, 0, ES);                                                   // (in front of the hill's wall: its top landing hides where the wall starts)
    b.slope(EX + 3.0 * ek, 0, EX + 12.8 * ek, EH); L.slopes[L.slopes.length - 1].belt = 1.5;   // (slower: Ladi 2026-11-09)   // the escalator: it carries him up, he walks off at the top
    ground(EX + 12.8 * ek, 900, 'bchill', EH);
    b.coins(EX + 4.0 * ek, 1.6, 6, 1.6 * ek, 0.82);
    lean('bc_stonewall', EX + EW - 1.0, 1.4, 1.35, EH); b.coins(EX + EW - 0.6, EH + 2.6, 4, 0.9);
    L.camFloor.push([EX + 3.0 * ek, EX + 12.8 * ek, 0, EH], [EX + 12.8 * ek, 900, EH]);
    // Park Guell's gate between the two gingerbread gatehouses: the backdrop changes in the gateway (a gate, not a door)
    const PG = EX + EW + 4.5, GHh = 7.4, gw = GHh / 7.4;
    back('bc_gatehouses', PG, GHh, { y: EH }); L.bcGatehouses = { x: PG, h: GHh, y: EH };
    b.ledge(PG + 3.6 * gw, EH + 4.4 * gw, 2.0 * gw); b.ledge(PG + 13.9 * gw, EH + 4.4 * gw, 1.4 * gw);
    solid(PG + 5.6 * gw, 1.9 * gw, 1.6 * gw, EH); b.ledge(PG + 5.6 * gw, EH + 1.6 * gw, 1.9 * gw); b.ledge(PG + 12.5 * gw, EH + 1.6 * gw, 1.4 * gw);
    b.coins(PG + 1.0, EH + 5.6, 4, 1.0); b.coins(PG + 14.2, EH + 5.6, 3, 1.0);
    swapAt(PG + 9.9 * gw, 'parkguell', 'gateway between the gatehouses');
    // the double stairway with the mosaic dragon, up to the Hypostyle Hall; its roof is the terrace
    const SX = PG + 19.93 * gw + 3.0, LH = 9.0, lk = LH / 9.0;
    back('bc_lizstairs', SX, LH, { y: EH });
    b.slope(SX + 2.2 * lk, EH, SX + 10.5 * lk, EH + 4.6 * lk); b.ledge(SX + 10.4 * lk, EH + 4.6 * lk, 4.0 * lk);
    b.ledge(SX + 9.8 * lk, EH + 8.6 * lk, 4.6 * lk);
    b.coins(SX + 3.0, EH + 1.4, 7, 1.0, 0.55); b.coins(SX + 10.2, EH + 9.6, 4, 1.1);
    L.bcLife.push(['bc_para1', SX + 4, EH + 9.5, 'fly']);
    const HX = SX + aw('bc_lizstairs', LH) - 0.3, TT = EH + 5.2;
    back('bc_hypostyle', HX, 7.0, { y: EH }); solid(HX + 0.1, aw('bc_hypostyle', 7.0) - 0.2, 5.2, EH, { noGrab: true });
    L.camFloor.push([HX, 900, TT]);                                                    // up on the terrace: the terrace at the bottom of the screen, the view above
    prop('bc_mosaicpot', HX + 16.4, 1.3, TT); lean('bc_mosaicpot', HX + 3.0, 1.3, 1.3, TT);
    b.coins(HX + 1.0, TT + 1.2, 6, 1.0);
    b.flag(HX + 9.0); L.flagY = TT;
    L.bcFinale = true;                                                              // (no fireworks sound here: Ladi 2026-11-08)
    L.finale = HX + 12.0; L.finaleT = 7;                                             // A walks to the bench, stands and looks out over the grid (back view)
    L.bcView = HX + 12.0;
    const HE = HX + aw('bc_hypostyle', 7.0);
    b.wall(HE - 0.2, 1, 40);
    b.end(HE - 0.2);
    L.bcTop = { x: HX, y: TT };
  },
},
{
  // Sydney Harbour (plan: claude.ai/artifact/WudwvdMN2q7pib8MwQTCjW, Ladi's picks 2026-11-09), built from the level kit on Ladi's art
  // (cut by london-runner/sydney/src/cut.py into atlas_sy*.webp). A bright summer morning, summer outfit.
  // Seaplane ride -> Botanic Garden -> up the Opera House steps and its big sail, slide down the next -> inside the concert hall (the ONE door)
  // -> Circular Quay + the Cahill Walk over the station -> The Rocks market canopies -> over the Harbour Bridge arch
  // -> Luna Park's face + the giant slide -> jet boat ride -> Taronga Zoo giraffes.
  id: 'sydney', name: 'Sydney', plate: 'Sydney', area: 'sydney', city: 'Sydney',
  build(b) {
    const L = b.L, SY_ASP = {"sy_pontoon":4.058,"sy_seawall":5.7,"sy_fence":4.3,"sy_plane":2.0038,"sy_plane_open":1.9048,"sy_jet":3.1235,"sy_jetspin":2.493,"sy_spray":0.8404,"sy_ferry":2.1133,"sy_wharf":2.4802,"sy_fig":1.3454,"sy_palm":0.5532,"sy_bench":1.6889,"sy_fountain":0.5875,"sy_lamp":0.33,"sy_pot":1.3,"sy_opera":2.8068,"sy_door_in":1.1425,"sy_door_out":1.125,"sy_organ":0.6614,"sy_gal_wall":0.5133,"sy_ring0":0.87,"sy_ring1":0.7143,"sy_ring2":0.8643,"sy_gal_front":6.3427,"sy_seats":4.3368,"sy_station":3.9922,"sy_icecream":1.1808,"sy_busker":0.9677,"sy_bin":0.5857,"sy_lookout":1.4071,"sy_bollards":1.425,"sy_gates":2.0,"sy_qbench":1.8333,"sy_rock_endl":0.3972,"sy_rock1":0.8185,"sy_rock2":0.7994,"sy_rock3":0.9213,"sy_rock_endr":0.3952,"sy_glamp":0.2176,"sy_cafe":0.9192,"sy_potree":0.7167,"sy_flowerbox":1.1692,"sy_stonewall":1.6692,"sy_pylon":0.3467,"sy_arch":3.2484,"sy_plinth":0.6848,"sy_flags":1.0795,"sy_gate":2.1286,"sy_train":6.5895,"sy_luna":1.1205,"sy_funslide":3.6138,"sy_floss":0.9,"sy_lpbench":0.9071,"sy_lpot":1.1667,"sy_gum":0.8297,"sy_kooka":1.9143,"sy_zbench":2.0,"sy_zfence":2.2818,"sy_giraffes":1.0478,"sy_cloud0":1.845,"sy_cloud1":1.7824,"sy_cloud2":1.7959,"sy_cloud3":1.7222,"sy_cloud4":1.7733,"sy_gull0":1.52,"sy_gull1":1.4875,"sy_gull2":1.6667,"sy_cock0":1.0727,"sy_cock1":1.0667,"sy_cock2":1.1375,"sy_boat0":0.9187,"sy_boat1":0.9214,"sy_cocksit":0.6333,"sy_kayak0":1.225,"sy_kayak1":1.2417,"sy_stall0":0.9214,"sy_stall1":0.9214,"sy_stall2":0.9214,"sy_stall3":0.9214};
    L.outfit = 'dxb';                                    // the summer outfit
    L.killY = -8; L.startX = -0.35; L.camMin = -12; L.introCam = 'centre';
    const aw = (k, h) => SY_ASP[k] * h;
    const ground = (x0, x1, style, y = 0) => b.groundTop(x0, x1, y, style);
    const art = (key, x, y, h, o = {}) => b.kitArt(key, x, y, h, Object.assign({ w: aw(key, h) }, o));
    const back = (key, x, h, o = {}) => art(key, x, o.y || 0, h, Object.assign({ back: true }, o));
    const solid = (x, w, h, y = 0, o = {}) => { const s = Object.assign({ kind: 'block', x, y, w, h, style: 'hidden' }, o); L.solids.push(s); return s; };
    const lean = (key, x, h, sh, y = 0) => { const w = aw(key, h); return b.kitProp(key, x, w, h, { y, solid: [0.1, w - 0.2, sh], ledge: [0.1, sh, w - 0.2] }); };
    const hop = (key, x, h, y = 0, sh = Math.min(h, 1.0)) => { const w = aw(key, h); return b.kitProp(key, x, w, h, { y, solid: [0.1, w - 0.2, sh] }); };
    const prop = (key, x, h, y = 0) => b.kitProp(key, x, aw(key, h), h, { y });
    const path = (pts, id, belt) => { for (let i = 1; i < pts.length; i++) { b.slope(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]); const s = L.slopes[L.slopes.length - 1]; s.id = id; if (belt) s.belt = belt; } };
    const swapAt = (x, to, why) => (L.kitSwaps = L.kitSwaps || []).push({ x, to, why });   // behind the bridge pylon: not a door
    L.syLife = [];                                       // birds, boats and kayaks: [key, x, y, kind]
    L.syFaces = [];                                      // raised stone floors drawn with their wall face: [x0, x1, y, style]
    L.rides = []; L.camFloor = [];

    // ---------- 1. the seaplane lands on Farm Cove: A rides it in, a tap hops it off the water for the coins ----------
    b.wall(-12.5, 1, 22);
    ground(-14, 26.4, 'sywater', -1.6);                  // harbour water (the plane skims it; nobody walks on it)
    const PL = [[0, 3.4], [4, 2.2], [7, 0.9], [9.5, 0.15], [12, 0], [17.0, 0]];
    const plane = { kind: 'syplane', x0: 0, pts: PL, v: 10.5, acc: 7.0, vEnd: 6.2, walkOut: 2.4, w0: 0.2, w1: 0, input: true, jump: 7.5, grav: 26, seat: 0, up: 0, down: 0, exitY: 0 };
    L.rides.push(plane); L.syPlane = plane;
    b.arc(4.5, 3.2, 5, 4, 1.6); b.arc(11.5, 1.4, 5, 5, 2.2);
    const PT = 18.9;
    solid(PT + 0.2, aw('sy_pontoon', 2.4) - 0.4, 1.6, -1.6);   // the pontoon (deck at 0)
    art('sy_pontoon', PT, -1.16, 2.4, { front: true });
    L.syLife.push(['sy_kayak0', -6, -0.85, 'kayak'], ['sy_boat0', 6, 0.5, 'boat'], ['sy_gull0', 8, 7.5, 'fly'], ['sy_gull1', 20, 8.5, 'fly']);
    ground(26.4, 99, 'sysand');                           // sandstone paving along the seawall and the garden

    // ---------- 2. Royal Botanic Garden ----------
    prop('sy_lamp', 28.0, 3.0);
    const FG = 31.0, fw = aw('sy_fig', 7.2);
    b.kitProp('sy_fig', FG, fw, 7.2, { y: 0, solid: [fw * 0.36, fw * 0.24, 1.6] });   // the big fig: lean on its roots,
    b.ledge(FG + fw * 0.36, 1.6, fw * 0.24); b.ledge(FG + fw * 0.12, 4.0, fw * 0.76);  // then up into its low branches
    b.coins(FG + fw * 0.38, 2.7, 3, 0.8); b.coins(FG + fw * 0.2, 5.1, 6, 0.9);
    L.syLife.push(['sy_cock0', FG + 6, 8.6, 'fly'], ['sy_cock2', FG + fw * 0.7, 7.6, 'fly']);   // (Ladi 2026-11-10: no bird sitting on thin air)
    hop('sy_bench', 44.0, 0.9);
    lean('sy_fountain', 49.5, 1.6, 1.4); b.coins(49.6, 2.8, 3, 0.8);
    prop('sy_palm', 53.5, 7.0);
    lean('sy_pot', 57.5, 1.5, 1.4);

    // ---------- 3. Opera House: up the Monumental Steps and the big sail (special 1 at its tip), slide down the next sail ----------
    const OX = 62.0, OH = 16.7, PD = 4.03;                // the picture, its height, the podium top
    back('sy_opera', OX, OH);
    path([[OX + 0.3, 0.1], [OX + 6.5, 3.6]], 'systeps');  // the steps
    const S1 = [[6.5, 3.6], [7.5, 4.29], [8.5, 4.86], [9.5, 5.64], [10.5, 6.7], [11.5, 7.86], [12.5, 9.12], [13.5, 10.27], [14.5, 11.33], [15.5, 12.32],
      [16.5, 13.18], [17.5, 13.97], [18.5, 14.66], [19.5, 15.2], [20.5, 15.69], [21.5, 16.09], [22.5, 16.38], [23.1, 16.5]];
    path(S1.map(([x, y]) => [OX + x, y]), 'sysail1');
    for (let i = 3; i < S1.length - 1; i += 2) b.coins(OX + S1[i][0], S1[i][1] + 1.1, 1);
    b.special(OX + 24.4, 18.8);                                                        // 1: jump off the tip of the big sail
    const S2 = [[23.6, 12.75], [24.5, 12.8], [25.5, 12.7], [26.5, 12.45], [27.5, 12.0], [28.5, 11.25], [29.5, 10.15], [30.3, 8.8], [31.0, 7.0], [31.8, PD]];
    path(S2.map(([x, y]) => [OX + x, y]), 'sysail2', 3.5);                              // the second sail: he slides down its back
    for (let i = 1; i < S2.length - 2; i += 2) b.coins(OX + S2[i][0], S2[i][1] + 1.0, 1);
    solid(OX + 9.5, 31.5, PD - 0.4, 0.4, { noGrab: true });                          // the podium (its own picture is its face)
    ground(OX + 9.5, OX + 41.5, 'syopod', PD);                                         // (nothing drawn: the Opera House picture is the podium)
    L.camFloor.push([OX, OX + 6.5, 0, PD], [OX + 6.5, OX + 41.5, PD]);
    lean('sy_pot', OX + 34.5, 1.5, 1.4, PD);

    // ---------- 4. inside the concert hall: THE ONE DOOR (in under the small sails, out through the glass foyer) ----------
    // (Ladi 2026-11-10: zoomed out like the Sagrada, and more to do: the stalls rise in tiers, the acoustic rings bounce him along
    //  playing a rising tune, then the wall-jump between the organ and the gallery)
    const D1 = OX + 40.0, D2 = D1 + 66;
    b.kitDoor(D1, { inside: true }); b.kitSwap(D1, 'hall'); L.syDoorIn = D1; L.syDoorOut = D2; L.syOpera = { x: OX, h: OH };
    ground(D1 - 1.5, D2 + 1.0, 'syhall', PD); L.camFloor.push([D1 - 0.5, D2 + 0.5, PD]); L.syHallY = PD;
    hop('sy_seats', D1 + 3.5, 0.95, PD); b.coins(D1 + 3.8, PD + 1.9, 3, 1.0);
    const TW = aw('sy_seats', 0.95), TI = D1 + 9.0; L.syRisers = [];                    // three rows of seats, each a step higher (wooden risers under them)
    for (let i = 0; i < 3; i++) {
      const x = TI + i * 2.6, y = PD + 0.45 + 0.9 * i;                                    // (the first row is too high to vault: a tap)
      solid(x + 0.1, TW - 0.2, y + 0.9 - PD, PD); b.ledge(x + 0.1, y + 0.9, TW - 0.2); L.syRisers.push([x + 0.05, TW - 0.1, PD, y + 0.1]);
      b.kitProp('sy_seats', x, TW, 0.95, { y, onArt: true });   // (standing on its wooden riser)
      b.coins(x + 1.4, y + 2.0, 2, 0.8);
    }
    const RT = TI + 2 * 2.6 + TW;                                                         // the top row's end
    const RGH = 3.0, RY = PD + 2.3, RS = 4.25, RNG = ['sy_ring0', 'sy_ring2', 'sy_ring0', 'sy_ring2'], NOTE = [1.0, 1.26, 1.5, 2.0];
    L.syRings = [];
    RNG.forEach((k, i) => {                                                                // the acoustic rings: springy, each one a note higher
      const w = aw(k, RGH), x = RT + 0.2 + i * RS, top = RY;
      L.syRings.push({ key: k, x, y: top - RGH * 0.33, h: RGH, w });
      L.oneways.push({ kind: 'ledge', x: x + w * 0.12, y: top, w: w * 0.76, bounce: i === 3 ? 5.4 : 2.6, note: NOTE[i] });
      b.coins(x + w * 0.5 + RS * 0.5, top + (i === 3 ? 4.2 : 2.6), 1);
    });
    const OC = RT + 0.2 + 3 * RS + 4.0, ow = aw('sy_organ', 7.0), GX = OC + ow + 1.8;   // special 2: wall-jump between the organ and the gallery
    solid(OC, ow, 7.0 - 2.6, PD + 2.6); back('sy_organ', OC, 7.0, { y: PD });          // (he runs in under the organ's arch)
    b.ledge(OC + 0.3, PD + 5.4, ow - 0.6);
    const GF = 1.8, GW = aw('sy_gal_front', GF), GT = PD + 5.6;                         // the gallery: wooden panels under a gold-railed front
    solid(GX, GW, 5.6, PD, { noGrab: false });
    for (let x = GX; x < GX + GW - 0.1; x += aw('sy_gal_wall', 4.7) - 0.05) back('sy_gal_wall', Math.min(x, GX + GW - aw('sy_gal_wall', 4.7)), 4.7, { y: PD });
    back('sy_gal_front', GX, GF, { y: GT - 1.0 });
    for (let i = 0, y = 1.4; y < 6.6; i++, y += 1.5) b.coins(OC + ow + (i % 2 ? 1.25 : 0.15), PD + y, 1);
    (L.kitClimbs = L.kitClimbs || []).push({ x: OC, xr: GX, gap: 1.8, hL: 7.0, hR: 5.6 });
    b.special(OC + ow + 0.9, PD + 9.0);                                                // 2: up under the sound reflectors
    b.coins(GX + 0.6, GT + 1.0, 8, 1.2);
    lean('sy_seats', GX + 1.6, 1.4, 1.3, GT);                                           // a row of gallery seats to hop
    lean('sy_gal_wall', GX + GW + 4.5, 1.6, 1.5, PD);                                    // a wooden stage box
    hop('sy_seats', GX + GW + 9.5, 0.95, PD);
    b.kitDoor(D2, { inside: false }); b.kitSwap(D2, 'quay');

    // ---------- 5. Circular Quay: down the forecourt steps, then up over the station on the Cahill Walk ----------
    const Q0 = D2 + 6.0;
    ground(D2 + 1.0, Q0, 'sypodium', PD);
    path([[Q0, PD], [Q0 + 6.2, 0.05]], 'systepsdn'); L.sySteps = Q0;                  // the forecourt steps down (the Opera House's own steps)
    L.syQ0 = Q0;
    const QA = Q0 + 8;
    lean('sy_icecream', QA, 2.6, 1.3); b.coins(QA + 0.4, 2.6, 3, 0.9);
    prop('sy_busker', QA + 5.0, 1.55);
    lean('sy_bin', QA + 8.0, 1.4, 1.3);
    art('sy_wharf', QA + 10.5, -1.6, 4.6, { back: true });                              // a ferry wharf, its pier deck at the quay
    L.syLife.push(['sy_gull2', QA + 6, 2.2, 'fly'], ['sy_cocksit', QA + 8.25, 1.4, 'sit']);
    hop('sy_bollards', QA + 14.0, 0.8); lean('sy_lookout', QA + 18.5, 1.5, 1.4);
    const SX = QA + 23.0, SH = 8.5, SW = aw('sy_station', SH);                         // the station, flipped: steps up on the left, its stone pier on the right
    back('sy_station', SX, SH, { flip: true });
    const PF = SH * 0.36, TR = SH * 0.67, WK = SH * 0.80, PR = SH * 0.957;
    path([[SX + 0.3, 0.05], [SX + 4.5, PF]], 'systair');
    b.ledge(SX + 4.5, PF, SW - 4.5 - 3.9); b.ledge(SX + 4.9, TR, SW - 9.4); b.ledge(SX + 4.1, WK, SW - 4.1 - 3.8);   // platform, train roof, the walk
    solid(SX + SW - 3.8, 3.7, PR);                                                     // the pier at the far end: lean on it from the walk, drop off it
    L.syStation = { x: SX, w: SW, h: SH };
    lean('sy_bin', SX + 19.0, 1.4, 1.3, PF);                                           // a bin on the platform
    b.coins(SX + 2, 2.6, 3, 1.2, 0.8); b.coins(SX + 6, WK + 1.0, 6, 1.4); b.arc(SX + 16, WK + 1.0, 6, 5, 1.2); b.coins(SX + 24, WK + 1.0, 6, 1.3);
    L.syCamLevel = [Q0 + 6.0, SX + SW + 6.0, 0];                                         // (Ladi 2026-11-10: the camera stays level past the station)
    hop('sy_qbench', SX + SW + 2.0, 0.9);

    // ---------- 6. The Rocks: sandstone terraces and the weekend market's bouncy canopies ----------
    const RK = SX + SW + 8.0, RH = 8.6 / 678;
    const house = (k, px, ys) => { const h = px * RH, w = aw(k, h); return { key: k, w, h, ledges: ys.map(y => [0.4, y * h, w - 0.8]) }; };
    const rEnd = b.kitRow(RK, [house('sy_rock1', 605, [0.45]), house('sy_rock2', 678, [0.47, 1]), house('sy_rock3', 493, [0.55])],
      { capL: house('sy_rock_endl', 506, [1]), capR: house('sy_rock_endr', 506, [1]) });
    lean('sy_flowerbox', RK + 3.0, 1.5, 1.4); b.coins(RK + 3.3, 2.5, 3, 0.8); b.coins(RK + 6.0, 4.6, 5, 1.0);
    lean('sy_potree', rEnd + 0.3, 2.4, 1.4);
    const MK = rEnd + 3.6, ST = 2.8, SWD = aw('sy_stall0', ST), BO = [3.2, 3.8, 4.6, 5.6];
    b.kitStalls(MK, [0, 1, 2, 3].map(i => ({ key: 'sy_stall' + i, w: SWD, h: ST })));
    BO.forEach((v, i) => solid(MK + i * (SWD - 0.05) + 0.25, SWD - 0.5, 0.3, 2.45, { bounce: v }));
    BO.forEach((v, i) => b.coins(MK + i * (SWD - 0.05) + 1.0, 2.8 + v * 0.75, 2, 0.6));
    b.special(MK + 3 * (SWD - 0.05) + 5.2, 2.8 + 6.2);                                 // 3: where the last bounce peaks
    const ME = MK + 4 * (SWD - 0.05);
    prop('sy_glamp', ME + 1.5, 3.4);
    lean('sy_cafe', ME + 5.0, 2.6, 1.4);
    L.syLife.push(['sy_cocksit', ME + 1.55, 3.35, 'sit'], ['sy_gull0', ME, 9.5, 'fly']);
    lean('sy_stonewall', ME + 11.0, 1.3, 1.2);

    // ---------- 7. up and over the Harbour Bridge: the pylon's own stair, the climbers' gate, along the arch, down the north pylon ----------
    const PX = ME + 17.0, PYH = 18.0, PYW = aw('sy_pylon', PYH), BD = 4.9;            // south pylon (its plinth half under the paving), the deck
    const AX = PX + 3.0, AY = BD - 2.9, NX = AX + 45.7;                                // the arch picture (its small end towers hide behind the pylons)
    back('sy_arch', AX, 16.0, { y: AY });
    back('sy_pylon', PX, PYH, { y: -1.0 }); back('sy_pylon', NX, PYH, { y: -1.0, flip: true });
    L.syBridge = { px: PX, nx: NX, ax: AX, ay: AY, bd: BD };
    solid(PX + 0.2, PYW - 0.4, 1.0); path([[PX + 0.95, 1.0], [PX + 4.11, BD]], 'sypylon_s');   // up the pylon's stair
    swapAt(PX + PYW / 2, 'north', 'behind the south pylon');
    solid(PX + 4.11, NX + 2.21 - PX - 4.11, BD + 1.6, -1.6, { noGrab: true });         // the road deck (the harbour below it)
    ground(L.syQ0, PX + 6.0, 'sysand'); ground(PX + 6.0, NX + 0.3, 'sywater', -1.6); L.syNX = NX;
    L.camFloor.push([PX, PX + 4.11, 0, BD], [PX + 4.11, NX + 2.21, BD]);
    const ARCH = [[4, 6.5], [5, 6.9], [6, 7.4], [7, 8.0], [8, 8.6], [9, 9.25], [10, 9.78], [11, 10.25], [12, 10.75], [13, 11.16], [14, 11.62], [15, 11.92], [16, 12.28],
      [17, 12.56], [18, 12.82], [19, 13.1], [20, 13.25], [21, 13.4], [22, 13.53], [23, 13.63], [24, 13.7], [25, 13.75], [26, 13.78], [27, 13.75], [28, 13.68], [29, 13.61],
      [30, 13.53], [31, 13.4], [32, 13.22], [33, 13.07], [34, 12.82], [35, 12.56], [36, 12.25], [37, 11.9], [38, 11.59], [39, 11.11], [40, 10.75], [41, 10.3], [42, 9.71],
      [43, 9.22], [44, 8.7], [45, 8.0], [46, 7.39], [47, 6.9], [48, 6.5]];
    path(ARCH.map(([x, y]) => [AX + x, AY + y - 0.45]), 'syarch');
    hop('sy_gate', AX + 0.6, 1.5, BD, 1.4); b.ledge(AX + 0.7, BD + 1.3, aw('sy_gate', 1.4) - 0.2);   // the climbers' gate: lean on it, then up onto the arch
    for (let i = 2; i < ARCH.length - 2; i += 3) b.coins(AX + ARCH[i][0], AY + ARCH[i][1] + 0.9, 1);
    L.wind = [AX + 5, AX + 47, 1.2, 0.55];                                              // the breeze up top: longer floaty jumps
    lean('sy_plinth', AX + 14.0, 3.6, 2.0, BD); lean('sy_plinth', AX + 33.0, 3.6, 2.0, BD);   // the deck's stone lamp plinths
    lean('sy_flags', AX + 25.2, 2.4, 1.4, AY + 13.78 - 0.45);                         // the two flags at the top
    b.special(AX + 26.4, AY + 13.78 + 4.6);                                             // 4: over the two flags at the very top
    L.syTrain = { x0: PX - 10, x1: NX + 6, y: BD - 0.05, at: AX + 20 };                // the train rumbles across the deck as he gets near the top
    L.syLife.push(['sy_gull1', AX + 10, AY + 17.5, 'fly'], ['sy_gull0', AX + 36, AY + 18.5, 'fly']);
    solid(NX + 0.2, PYW - 0.4, 1.0); path([[NX + 2.21, BD], [NX + 5.37, 1.0]], 'sypylon_n');   // down the north pylon's stair
    L.camFloor.push([NX + 2.21, NX + 5.37, BD, 1.0]);

    // ---------- 8. Luna Park: up the giant face (special 5 between the tower tops), then the funhouse's giant slide ----------
    const LP = NX + PYW + 9.0, LH = 11.0, LW = aw('sy_luna', LH);
    lean('sy_lpot', LP - 6.0, 1.5, 1.4);
    back('sy_luna', LP, LH);                                                            // he can run straight in through its mouth, or climb the face
    L.oneways.push({ kind: 'ledge', x: LP + LW * 0.27, y: 3.95, w: LW * 0.46, bounce: 8.2 });        // the big red lip is springy: land on it and it throws him up between the towers
    b.ledge(LP + 0.1, 9.1, LW * 0.2); b.ledge(LP + LW * 0.79, 9.1, LW * 0.2);           // the towers' blue cornices,
    b.ledge(LP + 0.2, 10.95, LW * 0.18); b.ledge(LP + LW * 0.8, 10.95, LW * 0.18);      // and their tops
    b.coins(LP + LW * 0.38, 6.0, 3, 0.7, 2.0); b.coins(LP + LW * 0.62, 12.6, 2, 0.8);
    b.special(LP + LW * 0.77, 13.2);                                                    // 5: thrown up by the lip, between the tower tops
    L.syLife.push(['sy_cock1', LP + 3, 13.5, 'fly']);
    lean('sy_lpot', LP + LW + 5.5, 1.5, 1.4);
    const FH = LP + LW + 8.0, FS = 7.6;                                                 // the funhouse: up its stair, along its top, the giant slide
    back('sy_funslide', FH, FS);
    path([[FH + 0.6, 0.05], [FH + 5.2, 5.85]], 'syfunstair');
    solid(FH + 5.2, 5.8, 5.85); L.camFloor.push([FH + 0.6, FH + 5.2, 0, 5.85]);
    const SLD = [[10.9, 5.85], [11.6, 6.45], [12.0, 6.47], [12.5, 6.2], [13.0, 5.75], [13.5, 5.14], [14.0, 4.61], [14.5, 4.3], [15.0, 4.17], [15.5, 4.19], [16.0, 4.3], [16.5, 4.43],
      [17.0, 4.47], [17.5, 4.41], [18.0, 4.22], [18.5, 3.86], [19.0, 3.32], [19.5, 2.93], [20.0, 2.71], [20.5, 2.67], [21.0, 2.76], [21.5, 2.87], [22.0, 2.91], [22.5, 2.84],
      [23.0, 2.64], [23.5, 2.29], [24.0, 1.81], [24.5, 1.38], [25.0, 1.05], [25.5, 0.84], [26.0, 0.71], [26.5, 0.62], [27.4, 0.0]];
    path(SLD.map(([x, y]) => [FH + x, y]), 'syslide', 4.5);
    for (const sl of L.slopes) if (sl.id === 'syslide') sl.noJump = true;            // (Ladi 2026-11-10: he slides all the way down, no hopping off)
    for (let i = 2; i < SLD.length - 1; i += 3) b.coins(FH + SLD[i][0], SLD[i][1] + 1.1, 1);
    lean('sy_floss', FH + 31.0, 2.8, 1.4);
    lean('sy_lpbench', FH + 36.0, 2.8, 1.4);

    // ---------- 9. the green-and-gold ferry from the Luna Park wharf to Taronga (Ladi's pick 2026-11-10, instead of the jet boat):
    //            taps hop A between its two decks for the coins, dolphins leap alongside; one leaps right past and its splash fills
    //            the screen, and the view behind changes inside it ----------
    const JX = FH + 44.0, JE = JX + 42;
    ground(L.syNX + 0.3, JX - 1, 'sysand'); ground(JX - 1, JE + 1, 'sywater', -1.6);
    solid(JX - 6.6, aw('sy_pontoon', 2.4) - 0.4, 1.6, -1.6); art('sy_pontoon', JX - 6.8, -1.16, 2.4, { front: true });
    const FY = 0.3, DH = 0.85;                                                           // the lower deck's height, the upper deck above it
    const fer = { kind: 'syferry', x0: JX, pts: [[JX, FY], [JE, FY]], v: 10.5, acc: 7.0, vEnd: 6.2, walkOut: 3.0, w0: 0.25, w1: 0, input: true, jump: 7.6, grav: 26, decks: [0, DH], seat: 0, up: 0, down: 0, exitY: 0 };
    L.rides.push(fer); L.syFerry = { ride: fer, h: 4.4, splash: [JX + 24, JX + 28] };
    for (const [x, up] of [[JX + 5, 1], [JX + 9, 0], [JX + 13, 1], [JX + 17, 0], [JX + 30.5, 1], [JX + 34, 0], [JX + 37.5, 1]]) b.coins(x, FY + 0.9 + (up ? DH + 0.25 : 0), 2, 0.9);
    b.arc(JX + 21, FY + DH + 1.2, 4, 3, 1.0);                                          // over a dolphin's leap: a hop off the upper deck
    L.syLife.push(['sy_boat1', JX + 4, 0.5, 'boat'], ['sy_kayak1', JX + 38, -0.85, 'kayak'], ['sy_gull2', JX + 30, 6.5, 'fly']);
    solid(JE - 3.8, aw('sy_pontoon', 2.4) - 0.4, 1.6, -1.6); art('sy_pontoon', JE - 4.0, -1.16, 2.4, { front: true });


    // ---------- 10. Taronga Zoo: up the path past the koala, the giraffes and the view back over the harbour ----------
    const TZ = JE + 6.0, TP = 6.0;
    ground(JE + 1, TZ + 6, 'sypath');
    const gw = aw('sy_gum', 7.4);
    b.kitProp('sy_gum', TZ - 1.0, gw, 7.4, { y: 0, solid: [gw * 0.3, gw * 0.22, 1.5] }); b.ledge(TZ - 1.0 + gw * 0.3, 1.5, gw * 0.22);
    b.ledge(TZ - 1.0 + gw * 0.25, 3.9, gw * 0.5);                                      // a gum tree with a koala asleep on its branch
    b.coins(TZ + gw * 0.15, 2.7, 3, 0.8); b.coins(TZ, 5.0, 4, 0.8);
    path([[TZ + 6, 0], [TZ + 22, TP]], 'syzoopath'); L.syHill = [TZ + 6, TZ + 22, TP];
    L.camFloor.push([TZ + 6, TZ + 22, 0, TP]);
    b.coins(TZ + 7, 1.4, 8, 2.0, 0.75);
    ground(TZ + 22, TZ + 60, 'sypath', TP);
    L.camFloor.push([TZ + 22, TZ + 60, TP]);
    lean('sy_kooka', TZ + 23.0, 1.4, 1.3, TP);                                         // (off the slope: Ladi 2026-11-10 saw it judder there)
    hop('sy_zbench', TZ + 27.0, 0.95, TP);
    b.flag(TZ + 31.0); L.flagY = TP;
    back('sy_zfence', TZ + 33.0, 1.1, { y: TP }); back('sy_zfence', TZ + 33.0 + aw('sy_zfence', 1.1) - 0.05, 1.1, { y: TP });
    back('sy_giraffes', TZ + 38.5, 9.0, { y: TP });
    L.finale = TZ + 36.0; L.finaleT = 7; L.syView = TZ + 36.0;                          // A at the rail from behind, the giraffes lean in, the harbour below
    const TE = TZ + 38.5 + aw('sy_giraffes', 9.0) + 1.0;
    b.wall(TE, 1, 40);
    b.end(TE);
  },
},
{
  // Rome (plan: claude.ai/artifact/WtANzmDHimnuEaWVJHfrhX, Ladi's picks 2026-11-10), built from the level kit on art made with the image maker
  // (cut by london-runner/rome/src/cut.py into atlas_rm*.webp). A late autumn afternoon; A in his own London clothes.
  // Taxi at the Colosseum -> Arch of Constantine -> past the Colosseum's outer wall into its open arena (lift fling) -> the Forum's columns
  // -> sidecar scooter ride -> inside the Pantheon (rose petals, petal heaps) -> up an alley gap onto the rooftops -> Trevi -> Spanish Steps
  // -> e-scooter in Villa Borghese -> Pincio at sunset.
  // Round 2 (Ladi 2026-11-10): the Colosseum is open to the sky, so no door: the arena is outside, in one go. The Pantheon is the one inside.
  id: 'rome', name: 'Rome', plate: 'Rome', area: 'rome', city: 'Rome',
  build(b) {
    const L = b.L, RM_ASP = {"rm_taxi":1.9,"rm_taxi_open":1.9056,"rm_colo":2.0322,"rm_arch":1.1544,"rm_mwall1":1.1676,"rm_mwall2":1.1559,"rm_lift":0.9176,"rm_deck":2.42,"rm_seats":1.8417,"rm_iarch":0.9658,"rm_iarch_pier":0.261,"rm_mosaic":12.125,"rm_mosarch":0.775,"rm_bronze":0.1406,"rm_carch":0.6589,"rm_temple":0.5625,"rm_column":0.1933,"rm_stumps":1.6083,"rm_block":1.89,"rm_lowwall":2.37,"rm_cypress":0.4713,"rm_titus":1.1346,"rm_poppies":1.3,"rm_pal4":0.5145,"rm_pal2":0.6021,"rm_pal3":0.5952,"rm_pal1":0.7919,"rm_corner":0.5846,"rm_cafe":0.5962,"rm_gelato":0.6723,"rm_alley":0.6452,"rm_endl":0.7467,"rm_narrow":0.53,"rm_endr":0.7462,"rm_gwall":1.5135,"rm_nasone":0.8083,"rm_vespa1":1.2273,"rm_vespa2":1.375,"rm_car1":1.64,"rm_table":0.95,"rm_lamp":0.3472,"rm_lemon":0.875,"rm_car2":1.2643,"rm_side":1.0238,"rm_side_wave":1.0142,"rm_side_shell":1.2178,"rm_largo":3.4556,"rm_cat1":1.5167,"rm_cat2":0.8308,"rm_cat0":1.6444,"rm_hump":5.7143,"rm_pantheon":1.5679,"rm_niche":0.666,"rm_niche2":0.666,"rm_mstep":2.7286,"rm_mbench":2.5875,"rm_rope":1.84,"rm_obelisk":0.7846,"rm_cafes":2.2818,"rm_flowercart":1.275,"rm_roof1":6.4462,"rm_roofterr":2.6237,"rm_roof2":2.3071,"rm_chimneys":1.1765,"rm_aerial":0.7713,"rm_washing":1.6144,"rm_lantern":0.9104,"rm_trevi":1.9819,"rm_steps":2.0219,"rm_flowers":1.0364,"rm_gelcart":1.045,"rm_barca":2.3,"rm_cart":0.9577,"rm_cart_park":0.9538,"rm_cart_side":1.5843,"rm_clock":0.8389,"rm_bust1":0.6615,"rm_ramp":3.1,"rm_bust2":0.6846,"rm_hedge":2.0083,"rm_pbench":1.8273,"rm_pine":0.8336,"rm_plane":0.9283,"rm_plane2":0.8642,"rm_oak":1.0172,"rm_terrace":3.12,"rm_cloud0":2.155,"rm_cloud1":2.525,"rm_cloud2":2.3857,"rm_cloud3":2.1368,"rm_cloud4":2.3607,"rm_gull0":1.6,"rm_gull1":1.5857,"rm_gull2":1.6571,"rm_para0":1.3,"rm_para1":1.3167,"rm_para2":1.3833,"rm_catwall":2.1125,"rm_pigeon0":1.1818,"rm_pigeon1":1.2182,"rm_pigeonf0":0.9167,"rm_pigeonf1":0.9};
    L.killY = -8; L.startX = 2.0; L.camMin = -12; L.introCam = 'centre';
    const aw = (k, h) => RM_ASP[k] * h;
    const ground = (x0, x1, style, y = 0) => b.groundTop(x0, x1, y, style);
    const art = (key, x, y, h, o = {}) => b.kitArt(key, x, y, h, Object.assign({ w: aw(key, h) }, o));
    const back = (key, x, h, o = {}) => art(key, x, o.y || 0, h, Object.assign({ back: true }, o));
    const solid = (x, w, h, y = 0, o = {}) => { const s = Object.assign({ kind: 'block', x, y, w, h, style: 'hidden' }, o); L.solids.push(s); return s; };
    const lean = (key, x, h, sh, y = 0) => { const w = aw(key, h); return b.kitProp(key, x, w, h, { y, solid: [0.1, w - 0.2, sh], ledge: [0.1, sh, w - 0.2] }); };
    const hop = (key, x, h, y = 0, sh = Math.min(h, 1.0)) => { const w = aw(key, h); return b.kitProp(key, x, w, h, { y, solid: [0.1, w - 0.2, sh] }); };
    const prop = (key, x, h, y = 0) => b.kitProp(key, x, aw(key, h), h, { y });
    const path = pts => { for (let i = 1; i < pts.length; i++) b.slope(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]); };
    const swapAt = (x, to, why) => (L.kitSwaps = L.kitSwaps || []).push({ x, to, why });   // behind something reaching above the sky band: not a door
    const zone = (x0, x1, z) => { for (const a of L.kitArt) if (a.zone === undefined && !a.out && a.x > x0 - 0.1 && a.x < x1) a.zone = z; };
    // a row of houses wall to wall; each house's ledges as parts of its height (balconies, roof)
    const LED = { rm_pal1: [0.42, 1], rm_pal2: [0.36, 0.62, 1], rm_pal3: [0.36, 0.62, 1], rm_pal4: [0.3, 0.52, 0.74, 1], rm_cafe: [0.3, 0.6, 1],
      rm_gelato: [0.37, 0.66, 1], rm_alley: [0.5, 1], rm_narrow: [0.55, 1], rm_endl: [1], rm_endr: [1], rm_corner: [1] };
    const HH = { rm_pal1: 6.644, rm_pal2: 8.553, rm_pal3: 8.566, rm_pal4: 10.5, rm_cafe: 8.026, rm_gelato: 6.833, rm_alley: 6.556, rm_narrow: 5.829, rm_endl: 6.0, rm_endr: 5.991, rm_corner: 10.739 };
    const house = k => { const h = HH[k], w = aw(k, h); return { key: k, w, h, ledges: LED[k].map(f => [0.35, f * h, w - 0.7]) }; };
    const row = keys => x => b.kitRow(x, keys.slice(1, -1).map(house), { capL: house(keys[0]), capR: house(keys[keys.length - 1]) });
    L.rmLife = [];                                       // birds and cats: [key, x, y, kind]
    L.rmJoins = [];                                      // where two kinds of ground meet (under a pier, a building or a tree)
    L.rides = []; L.camFloor = [];

    // ---------- 1. the taxi drops A at the Colosseum; the Arch of Constantine (special 1: ledge climb to the top of its attic) ----------
    b.wall(-12.5, 1, 22);
    L.rmCar = { x: -2.8 };                               // white Rome taxi: A jumps out, it drives away
    hop('rm_nasone', 5.5, 1.2);                          // a nasone drinking fountain (knee-high: he hops it)
    const AC = 9.0, ak = 1;                              // the Arch of Constantine (measured from the picture at 9 units)
    back('rm_arch', AC, 9.0); L.rmArch = { x: AC, h: 9.0 };
    for (const [dx, w] of [[0.05, 1.4], [2.55, 1.45], [6.4, 1.5], [8.95, 1.35]]) b.ledge(AC + dx * ak, 2.0, w * ak);   // the plinths
    for (const [dx, w] of [[1.3, 1.4], [7.7, 1.4]]) b.ledge(AC + dx, 4.2, w);                                          // over the side arches
    for (const [dx, w] of [[0.0, 1.9], [2.4, 1.8], [6.2, 1.8], [8.8, 1.6]]) b.ledge(AC + dx, 6.5, w);                  // the cornice under the statues
    b.ledge(AC + 0.1, 9.0, 10.1);                                                                                      // the attic's flat top
    b.coins(AC + 0.5, 3.0, 2, 0.8); b.coins(AC + 1.6, 5.2, 2, 0.8); b.coins(AC + 0.6, 7.5, 2, 1.0); b.coins(AC + 1.5, 10.1, 8, 1.0);
    b.special(AC + 9.6, 11.0);                                                                                         // 1: the far end of the attic
    L.rmLife.push(['rm_pigeon0', AC + 3.2, 9.0, 'sit'], ['rm_gull0', 14, 12.0, 'fly'], ['rm_para0', 30, 13.5, 'fly']);
    const CO = 21.5, CH = 16.0, CW = aw('rm_colo', CH);  // the Colosseum's outer wall: A runs along it; its far end is broken and steps down
    back('rm_colo', CO, CH); L.rmColo = { x: CO, h: CH, w: CW };
    lean('rm_block', CO + 2.0, 1.4, 1.35);               // a fallen carved block: lean on it, then up
    b.ledge(CO + 0.3, 3.4, 12.2);                         // the first cornice
    b.coins(CO + 2.4, 2.3, 2, 0.8); b.coins(CO + 4.6, 4.5, 8, 1.0);
    prop('rm_stumps', CO + 9.0, 1.2); L.rmLife.push(['rm_pigeon1', CO + 11.6, 0, 'walk']);
    swapAt(CO + CW * 0.543, 'arena', 'behind the tall middle of the Colosseum outer wall');   // (over its broken end: the arena inside)
    lean('rm_block', CO + 19.0, 1.4, 1.35); b.coins(CO + 19.3, 2.4, 3, 0.8); b.coins(CO + 23.0, 1.4, 5, 1.0);
    const D1 = CO + CW - 2.0;                             // (the arena's pieces start where the outer wall ends)

    // ---------- 2. the Colosseum's arena, open to the sky (no door): the maze walls, the trapdoor lift (special 2: FLING), the arcade, the seats ----------
    lean('rm_mwall1', D1 + 3.5, 3.4, 3.3); b.coins(D1 + 4.0, 4.4, 4, 0.9);
    const M2 = D1 + 3.5 + aw('rm_mwall1', 3.4) + 1.8;
    b.arc(M2 - 1.9, 4.6, 3, 1.8, 0.9);
    lean('rm_mwall2', M2, 3.4, 3.3); b.coins(M2 + 0.5, 4.4, 4, 0.9);
    const LX = M2 + aw('rm_mwall2', 3.4) + 3.5, LW = aw('rm_lift', 3.4);   // the wooden lift: step on its platform and it flings him up through the trapdoor
    back('rm_lift', LX, 3.4);
    L.rmLift = { x: LX, s: solid(LX + 0.4, LW - 0.8, 0.45, 0, { bounce: 6.6, noGrab: true }) };
    for (let i = 0; i < 5; i++) b.coins(LX + LW / 2 + 0.3 * i, 4.4 + i * 1.1, 1);
    b.special(LX + LW / 2 + 1.6, 7.3);                                                    // 2: at the top of the fling
    const IA = LX + LW + 1.2, IW = aw('rm_iarch', 4.2);   // the arcade of the arena's inner wall: run along its top or under its arches
    for (let i = 0; i < 4; i++) back('rm_iarch', IA + i * (IW - 0.05), 4.2);
    const IE = IA + 4 * (IW - 0.05) + 0.05;
    b.ledge(IA + 0.1, 4.2, IE - IA - 0.2); b.coins(IA + 1.0, 5.2, 6, 1.2); b.coins(IA + 10.6, 6.6, 5, 1.0);
    lean('rm_block', IA + 8.5, 1.4, 1.35, 4.2);                                        // (a fallen block up on the arcade too)
    lean('rm_block', IA + 6.0, 1.4, 1.35);                                             // (on the floor under the arches: a fallen block)
    const ST = IE + 2.5, SW = aw('rm_seats', 2.4);       // two blocks of stone seats: up the steps
    for (const x of [ST, ST + SW + 1.6]) { back('rm_seats', x, 2.4); solid(x + 0.1, SW - 0.2, 0.9); solid(x + 1.2, SW - 1.3, 1.5); solid(x + 2.5, SW - 2.6, 2.3); b.coins(x + 1.4, 2.8, 3, 1.0, 0.4); }
    lean('rm_block', ST + 2 * SW + 5.0, 1.4, 1.35);
    // the far side of the ring: the outer wall again (seen from inside, its broken end first); the Forum's view comes back behind its tall part
    const XE = ST + 2 * SW + 7.5, CH2 = 13.0, CW2 = aw('rm_colo', CH2);
    back('rm_colo', XE, CH2, { flip: true }); L.rmColo2 = { x: XE, h: CH2, w: CW2 };
    swapAt(XE + CW2 * 0.457, 'forum', 'behind the tall part of the far Colosseum wall');
    lean('rm_block', XE + CW2 * 0.6 - 2.2, 1.4, 1.35);
    b.ledge(XE + CW2 * 0.615, 3.4 * CH2 / CH, CW2 * 0.375);  // its first cornice: run along it
    b.coins(XE + CW2 * 0.62, 3.9, 8, 1.0); b.coins(XE + 3.0, 1.4, 4, 1.0);
    prop('rm_stumps', XE + CW2 * 0.3, 1.2); L.rmLife.push(['rm_pigeon0', XE + CW2 * 0.8, 3.4 * CH2 / CH, 'sit']);
    const D2 = XE + CW2 - 4.0;

    // ---------- 3. the Roman Forum: up between the Temple of Castor and Pollux and its lone column (special 3: WALL-JUMP) ----------
    lean('rm_lowwall', D2 + 4.0, 1.4, 1.35); prop('rm_poppies', D2 + 8.5, 0.8);
    prop('rm_cypress', D2 + 10.0, 6.0);
    const TX = D2 + 15.0, TW = aw('rm_temple', 12.0);     // the temple: he runs in front of its podium; its columns and beam are the left wall
    back('rm_temple', TX, 12.0);
    solid(TX + 0.5, TW - 0.6, 12.0 - 1.9, 1.9);           // (from just above his head: its right face is the wall)
    b.ledge(TX + 0.3, 12.0, TW - 0.5);
    const GP = 1.8, CL = TX + TW - 0.1 + GP - 0.1;          // the lone column on its plinth: the right wall
    back('rm_column', CL, 12.0);
    solid(CL + 0.1, aw('rm_column', 12.0) - 0.2, 3.2); solid(CL + 0.5, aw('rm_column', 12.0) - 1.0, 12.0); b.ledge(CL + 0.3, 12.0, aw('rm_column', 12.0) - 0.6);
    (L.kitClimbs = L.kitClimbs || []).push({ x: TX, xr: CL + 0.1, gap: GP, hL: 12.0, hR: 12.0 });
    for (let i = 0, y = 1.6; y < 11.4; i++, y += 1.5) b.coins(TX + TW - 0.1 + (i % 2 ? GP - 0.5 : 0.25), y, 1);   // zigzag up the gap
    b.special(TX + TW - 0.1 + GP / 2 + 0.2, 13.8);                                        // 3: over the top of the gap
    b.coins(TX + 1.0, 13.0, 5, 1.0); L.rmLife.push(['rm_pigeon0', TX + 1.2, 12.0, 'sit'], ['rm_gull1', TX + 4, 15.5, 'fly']);
    const CE = CL + aw('rm_column', 12.0);
    for (let i = 0; i < 6; i++) b.coins(CE + 0.6 + i * 0.6, 12.6 - 0.32 * i * i, 1);     // the trail back down
    const TI = CE + 5.0, TIW = aw('rm_titus', 6.5);       // the Arch of Titus: run through it, or along its top
    back('rm_titus', TI, 6.5); b.ledge(TI + 0.25, 6.4, TIW - 0.5); b.ledge(TI + 0.3, 3.3, 1.2); b.ledge(TI + TIW - 1.5, 3.3, 1.2);
    b.coins(TI + 1.0, 7.5, 6, 1.0);
    lean('rm_lowwall', TI + TIW + 2.5, 1.4, 1.35); b.coins(TI + TIW + 2.8, 2.0, 3, 0.8);
    prop('rm_cypress', TI + TIW + 6.5, 6.0);

    // ---------- 4. the sidecar scooter: up Via dei Fori Imperiali into the old town, cobble humps, a boost, Largo Argentina's cats ----------
    const SC = TI + TIW + 12.0, SE = SC + 64.0;
    L.rmSide = { x: SC };
    const HUMPS = [SC + 7.0, SC + 31.0, SC + 50.0], HW = aw('rm_hump', 0.35);
    const pts = [[SC, 0]], ramps = [];
    for (const x of HUMPS) { pts.push([x, 0], [x + HW * 0.35, 0.3], [x + HW * 0.65, 0.3], [x + HW, 0]); ramps.push({ x: x + HW * 0.5, v: 8.5, h: 0.3 }); prop('rm_hump', x, 0.35); }
    pts.push([SE, 0]);
    const BST = [SC + 19.0];
    const side = { kind: 'rmside', x0: SC, pts, ramps, boosts: BST.map(x => [x, x + 2.4]), v: 12.0, acc: 8.0, vEnd: 6.2, walkOut: 2.6, w0: 0.3, w1: 0, input: true, jump: 8.0, grav: 28,
      seat: 0.0, up: 0, down: 0, exitY: 0 };
    L.rides.push(side); L.rmSideRide = side; L.rmBoosts = BST;
    for (const x of HUMPS) b.arc(x + HW * 0.5, 1.2, 5, 5.5, 2.6);
    b.coins(SC + 20, 1.0, 6, 1.4); b.coins(SC + 40, 1.2, 4, 1.4, 0.4);
    prop('rm_stumps', SC + 2.5, 1.2); L.rmSideStop = SC + 2.5;   // (behind the scooter's parking spot)
    const CN = SC + 15.0, CNH = 13.0;                     // a big golden corner palazzo fills the screen as he rides past it: the view changes behind it
    back('rm_corner', CN, CNH); swapAt(CN + aw('rm_corner', CNH) / 2, 'old', 'behind the big corner palazzo A rides past');
    L.rmJoins.push(CN + aw('rm_corner', CNH) / 2);
    const LA = SC + 27.0;                                 // Largo Argentina: the temple ruins behind their railing, cats asleep on them
    back('rm_largo', LA, 4.5);
    L.rmLife.push(['rm_cat1', LA + 4.2, 1.15, 'cat'], ['rm_cat2', LA + 8.6, 1.8, 'cat'], ['rm_cat0', LA + 12.4, 1.2, 'cat']);
    const R1 = row(['rm_endl', 'rm_pal2', 'rm_pal1', 'rm_pal3', 'rm_endr'])(LA + aw('rm_largo', 4.5) + 1.5);
    L.rmLife.push(['rm_para1', LA + 10, 11.5, 'fly'], ['rm_gull2', SC + 52, 12.5, 'fly']);
    ground(-14, CN + aw('rm_corner', CNH) / 2, 'rmforum');

    // ---------- 5. Piazza della Rotonda and inside the Pantheon (THE DOOR): niches, rose petals falling through the oculus, petal heaps (special 4: BOUNCE) ----------
    const PQ = Math.max(SE + 4.0, R1 + 2.0);
    lean('rm_flowercart', PQ + 2.0, 1.6, 1.4); b.coins(PQ + 2.3, 2.5, 3, 0.8);
    const OB = PQ + 7.0, OBW = aw('rm_obelisk', 6.5);
    back('rm_obelisk', OB, 6.5); solid(OB + 0.35, OBW - 0.7, 1.35); b.ledge(OB + 0.35, 1.35, OBW - 0.7);   // the obelisk fountain: hop onto its rim
    b.coins(OB + 0.6, 2.2, 4, 1.0);
    lean('rm_cafes', OB + OBW + 2.0, 2.2, 1.35);
    const PX = OB + OBW + 2.0 + aw('rm_cafes', 2.2) + 2.5, PH = 13.0, PW = aw('rm_pantheon', PH);
    back('rm_pantheon', PX, PH); L.rmPan = { x: PX, h: PH, w: PW };
    solid(PX + 5.9, 8.6, 0.5); b.coins(PX + 1.5, 1.6, 4, 1.0);
    const D3 = PX + PW * 0.4975;                          // the bronze doors
    b.kitDoor(D3, { inside: true }); b.kitSwap(D3, 'pan_in'); L.rmDoor3 = D3;
    hop('rm_rope', D3 + 3.0, 1.0); b.coins(D3 + 3.3, 2.0, 2, 0.9);
    lean('rm_mstep', D3 + 6.5, 1.4, 1.35);
    const N1 = D3 + 10.0, NW = aw('rm_niche', 5.0);      // two marble niches: up the first, across to the second
    back('rm_niche', N1, 5.0); solid(N1 + 0.1, NW - 0.2, 1.0); b.ledge(N1 + 0.1, 1.0, NW - 0.2); b.ledge(N1 + 0.05, 4.2, NW - 0.1);
    const N2 = N1 + NW + 1.6;
    back('rm_niche2', N2, 5.0); solid(N2 + 0.1, NW - 0.2, 1.0); b.ledge(N2 + 0.1, 1.0, NW - 0.2); b.ledge(N2 + 0.05, 4.2, NW - 0.1);
    b.coins(N1 + 0.6, 2.0, 3, 1.0); b.coins(N1 + 0.5, 5.2, 3, 1.0); b.arc(N1 + NW - 0.4, 5.2, 3, 2.2, 0.9); b.coins(N2 + 0.5, 5.2, 3, 1.0);
    // the beam of sunlight from the oculus, and red rose petals falling through it (Rome's Pentecost tradition): they lie in soft heaps
    // on the marble; each heap bounces him higher than the last (Ladi 2026-11-10: no gliding in the beam, make it longer and more fun)
    const BX = N2 + NW + 2.6, BW = 3.6;
    L.rmBeam = { x: BX, w: BW };
    const HEAPS = [[BX + 0.2, 3.2, 2.6], [BX + 6.8, 3.2, 4.0], [BX + 13.4, 3.4, 5.2]];   // [x, width, bounce height]
    L.rmHeaps = HEAPS.map(([x, w, h]) => ({ x, w, s: solid(x + 0.4, w - 0.8, 0.8, 0, { bounce: h, noGrab: true }) }));
    for (const [x, w, h] of HEAPS) b.arc(x + w / 2 + 0.6, 1.4, 6, 5.2, h * 0.85 + 0.6);
    b.special(HEAPS[2][0] + HEAPS[2][1] / 2 + 2.4, 6.6);                                  // 4: at the top of the biggest bounce
    lean('rm_mstep', HEAPS[2][0] + HEAPS[2][1] + 4.4, 1.4, 1.35);   // (a marble step where he lands from the last heap: lean, then up)
    const N3 = HEAPS[2][0] + HEAPS[2][1] + 8.2;            // two more niches: along their cornice, down past the altar steps
    back('rm_niche', N3, 5.0); solid(N3 + 0.1, NW - 0.2, 1.0); b.ledge(N3 + 0.1, 1.0, NW - 0.2); b.ledge(N3 + 0.05, 4.2, NW - 0.1);
    const N4 = N3 + NW + 1.6;
    back('rm_niche2', N4, 5.0); solid(N4 + 0.1, NW - 0.2, 1.0); b.ledge(N4 + 0.1, 1.0, NW - 0.2); b.ledge(N4 + 0.05, 4.2, NW - 0.1);
    b.coins(N3 + 0.5, 5.2, 3, 1.0); b.arc(N3 + NW - 0.4, 5.2, 3, 2.2, 0.9); b.coins(N4 + 0.5, 5.2, 3, 1.0);
    const AF = N4 + NW + 2.5;
    hop('rm_mbench', AF + 1.0, 0.8); b.coins(AF + 1.3, 1.8, 3, 0.8);
    lean('rm_mstep', AF + 4.5, 1.4, 1.35);
    const D4 = AF + 9.0;                                  // out by the side door
    L.rmDoor4 = D4; zone(D3, D4, 2);
    b.kitDoor(D4, { inside: false }); b.kitSwap(D4, 'old2');
    L.camFloor.push([D3 - 0.5, D4 + 0.5, 0]);
    back('rm_pantheon', D4 - PW * 0.94, PH, { out: true });   // outside: the Pantheon's brick drum, the side door in it
    for (const a of L.kitArt) if (a.out && a.zone === undefined) a.zone = 0;

    // ---------- 6. the alley gap: through the arched passage, wall-jump up between the houses, the rooftop run, down into the Trevi fountain ----------
    const AX0 = D4 + 4.0, EW = aw('rm_endl', 6.0), AW = aw('rm_alley', HH.rm_alley), AX = AX0 + EW - 0.05;
    back('rm_endl', AX0, 6.0, { row: AX0 }); back('rm_alley', AX, HH.rm_alley, { row: AX0 });
    b.ledge(AX0 + 0.35, 6.0, EW - 0.7);
    solid(AX + 0.1, AW - 0.1, HH.rm_alley - 2.7, 2.7); b.ledge(AX + 0.2, HH.rm_alley, AW - 0.3);   // (its ground floor is the arched passage he runs through)
    const GX = AX + AW, GG = 1.8, RX = GX + GG;
    const roofs = ['rm_pal3', 'rm_pal4', 'rm_pal2', 'rm_pal1'];
    const R2 = b.kitRow(RX, roofs.map(house), { capL: null, capR: house('rm_endr') });
    L.kitWarn = (L.kitWarn || []).filter(w => !w.startsWith(`kitRow at ${RX}`));   // (its left end is the climb's wall, not an end piece)
    solid(RX, aw('rm_pal3', HH.rm_pal3), HH.rm_pal3);
    (L.kitClimbs = L.kitClimbs || []).push({ x: AX, xr: RX, gap: GG, hL: HH.rm_alley, hR: HH.rm_pal3 });
    for (let i = 0, y = 1.6; y < HH.rm_pal3 - 0.6; i++, y += 1.5) b.coins(GX + (i % 2 ? GG - 0.5 : 0.25), y, 1);
    const rx = {}; { let cx = RX; for (const k of roofs) { rx[k] = cx; cx += aw(k, HH[k]) - 0.05; } }
    // on the roofs: a tiled roof, chimneys, a washing line that bounces, a roof terrace, an aerial
    prop('rm_roof2', rx.rm_pal3 + 1.0, 1.266, HH.rm_pal3); b.ledge(rx.rm_pal3 + 1.1, HH.rm_pal3 + 1.15, aw('rm_roof2', 1.266) - 0.2);
    lean('rm_chimneys', rx.rm_pal4 + 0.6, 1.5, 1.4, HH.rm_pal4);
    const WL = rx.rm_pal4 + 2.7, WW = aw('rm_washing', 1.53);
    prop('rm_washing', WL, 1.53, HH.rm_pal4); solid(WL + 0.4, WW - 0.8, 0.3, HH.rm_pal4 + 1.0, { bounce: 4.2 });
    lean('rm_roofterr', rx.rm_pal2 + 0.05, 1.94, 1.35, HH.rm_pal2);
    prop('rm_aerial', rx.rm_pal1 + 2.5, 1.88, HH.rm_pal1);
    b.coins(rx.rm_pal3 + 0.6, HH.rm_pal3 + 2.4, 4, 1.0); b.arc(WL + 0.4, HH.rm_pal4 + 2.2, 6, 4.6, 3.0); b.coins(rx.rm_pal2 + 0.6, HH.rm_pal2 + 1.2, 4, 1.0);
    b.coins(rx.rm_pal1 + 0.5, HH.rm_pal1 + 1.0, 3, 0.9);
    L.rmLife.push(['rm_pigeon1', rx.rm_pal2 + 3.8, HH.rm_pal2 + 0.02, 'sit'], ['rm_gull0', RX + 6, 15.0, 'fly'], ['rm_para2', RX + 18, 14.0, 'fly']);
    hop('rm_vespa1', RX + 4.0, 1.1); lean('rm_lemon', rx.rm_pal2 + 1.0, 2.0, 1.4);    // (down in the street under the roofs)
    const TV = R2 + 2.5, TVH = 11.0, TVW = aw('rm_trevi', TVH);   // the Trevi fountain: drop down from the roofs; a coin always goes in as he passes
    back('rm_trevi', TV, TVH); L.rmTrevi = { x: TV, w: TVW, toss: TV + TVW * 0.5 };
    b.ledge(TV + 2.6, 2.7, 5.2); b.ledge(TV + 13.6, 2.7, 5.8); b.ledge(TV + 8.4, 3.4, 4.6);   // the rocks and Neptune's shell
    b.coins(TV + 1.0, 2.2, 3, 0.9); b.arc(TV + 3.0, 3.8, 5, 5.0, 1.2); b.arc(TV + 8.8, 4.6, 5, 4.0, 1.6); b.arc(TV + 14.0, 3.8, 5, 5.0, 1.2);
    L.rmLife.push(['rm_pigeon0', TV + 19.6, 2.7, 'sit']);
    lean('rm_flowercart', TV + 4.5, 1.6, 1.4); lean('rm_flowers', TV + TVW + 3.4, 2.2, 1.4);

    // ---------- 7. the gelato lane, the Barcaccia, up the Spanish Steps ----------
    const R3 = row(['rm_endl', 'rm_gelato', 'rm_cafe', 'rm_narrow', 'rm_pal1', 'rm_endr'])(TV + TVW + 6.0);
    const r3 = TV + TVW + 6.0 + EW - 0.05;
    lean('rm_gelcart', r3 + 1.5, 2.0, 1.4); b.coins(r3 + 1.3, 2.4, 3, 0.8);
    b.coins(r3 + 3.0, 3.6, 5, 1.0); b.coins(r3 + 9.0, 5.6, 4, 1.0);
    lean('rm_catwall', r3 + 10.5, 1.6, 1.4);
    prop('rm_lamp', r3 + 14.5, 3.6);
    lean('rm_flowercart', r3 + 17.0, 1.6, 1.4);
    hop('rm_vespa2', R3 + 1.5, 1.2);
    const BA = R3 + 6.0;
    lean('rm_barca', BA, 1.6, 1.35); b.coins(BA + 0.6, 2.0, 4, 0.8);
    const SP = BA + aw('rm_barca', 1.6) + 2.0, SH = 13.0, SPW = aw('rm_steps', SH), TOP = 6.75;
    back('rm_steps', SP, SH); L.rmSteps = { x: SP, h: SH, w: SPW };
    path([[SP + 4.3, 0.05], [SP + 10.4, 2.55], [SP + 11.4, 2.55], [SP + 19.2, 5.0], [SP + 19.8, 5.0], [SP + 24.3, TOP]]);
    solid(SP + 24.3, SPW - 24.3, TOP);                    // the church terrace at the top
    lean('rm_flowers', SP + SPW + 0.2, 2.2, 1.4, TOP);
    b.coins(SP + 5.0, 1.4, 5, 1.2, 0.5); b.coins(SP + 12.0, 3.8, 6, 1.2, 0.36); b.coins(SP + 20.0, 6.2, 4, 1.1, 0.4);
    L.camFloor.push([SP + 4.3, SP + 24.3, 0, TOP], [SP + 24.3, 9999, TOP]);
    ground(CN + aw('rm_corner', CNH) / 2, SP + SPW - 0.2, 'rmstreet');

    // ---------- 8. Villa Borghese: an e-scooter along the avenue, the ramp over the water clock's pond (special 5: RAMP JUMP) ----------
    const PTH = 9.4, PL = aw('rm_plane', PTH), T1 = SP + SPW + 1.0;   // a big plane tree, whole on screen: the park's view changes behind it
    back('rm_plane', T1, PTH, { y: TOP }); swapAt(T1 + PL * 0.5, 'view', 'behind the trunk of a giant plane tree: from here to the flag the backdrop is the ending view, so its sky never changes colour (Ladi 2026-11-11)');
    ground(SP + SPW - 0.2, T1 + PL * 0.5, 'rmstreet', TOP); ground(T1 + PL * 0.5, 9999, 'rmgravel', TOP); L.rmJoins.push(T1 + PL * 0.5);
    L.rmFace = [SP + SPW - 0.2, TOP];
    back('rm_bust1', T1 + PL + 0.5, 2.6, { y: TOP });
    lean('rm_hedge', T1 + PL + 3.0, 1.45, 1.4, TOP); b.coins(T1 + PL + 3.3, TOP + 2.2, 3, 0.9);
    back('rm_bust2', T1 + PL + 7.0, 2.6, { y: TOP });
    const CR = T1 + PL + 10.0, CRE = CR + 46.0;           // a blue and white e-scooter at the path's edge: A rides it along the avenue (Ladi 2026-11-10, not the pedal cart)
    L.rmScoot = { x: CR };
    const RP = CR + 18.0, RPW = aw('rm_ramp', 0.9);
    const cp = [[CR, TOP], [RP, TOP]];
    for (const [f, y] of [[0.1, 0.1], [0.4, 0.3], [0.7, 0.6], [0.95, 0.88]]) cp.push([RP + f * RPW, TOP + y * 0.9]);
    cp.push([RP + 0.95 * RPW + 0.01, TOP], [CRE, TOP]);
    const scoot = { kind: 'rmscoot', x0: CR, pts: cp, ramps: [{ x: RP + 0.95 * RPW, v: 13.0, h: 0.8 }], v: 12.0, acc: 8.0, vEnd: 6.2, w0: 0.5, w1: 0, input: true, jump: 8.5, grav: 28,
      seat: 0.0, up: 0, down: 0, exitY: TOP };
    L.rides.push(scoot); L.rmScootRide = scoot;
    prop('rm_ramp', RP, 0.9, TOP);
    const WC = RP + RPW + 4.2, WCW = aw('rm_clock', 3.6);  // the water clock in its pond: he flies over it
    back('rm_clock', WC, 3.6, { y: TOP });
    b.special(WC + WCW / 2, TOP + 5.6);                    // 5: over the top of the water clock
    b.coins(CR + 3, TOP + 0.8, 8, 1.6); b.arc(RP + RPW - 0.5, TOP + 1.2, 7, 11.0, 4.2); b.coins(WC + 9, TOP + 0.8, 6, 1.6);
    for (const [k, x] of [['rm_bust1', CR + 6], ['rm_hedge', CR + 9], ['rm_bust2', CR + 13], ['rm_hedge', WC + 8], ['rm_bust1', WC + 12.5]]) back(k, x, k === 'rm_hedge' ? 1.2 : 2.6, { y: TOP });
    prop('rm_pine', CR + 25.0, 8.6, TOP); L.rmPineX = CR + 25;
    L.rmLife.push(['rm_para0', CR + 10, TOP + 9.5, 'fly'], ['rm_para2', CR + 30, TOP + 10.5, 'fly']);
    hop('rm_pbench', CRE + 4.0, 1.1, TOP);                 // (a few steps after he climbs out)

    // ---------- 9. the Pincio terrace at sunset: the view over the rooftops to St Peter's (only here), the starlings ----------
    const T2 = CRE + 8.0;
    // the terrace's balustrade starts behind the tree's trunk (it is drawn first), so it never shows a cut-off end (Ladi 2026-11-10)
    const TR = T2 + PL * 0.5 - 0.2, TRW = aw('rm_terrace', 5.0);
    back('rm_terrace', TR, 5.0, { y: TOP });
    back('rm_plane', T2, PTH, { y: TOP });
    b.coins(TR + 1.0, TOP + 1.2, 4, 1.0);
    b.flag(TR + 4.0); L.flagY = TOP;
    L.rmFinale = true;
    L.finale = TR + 9.0; L.finaleT = 7; L.rmView = TR + 9.0;   // A walks to the balustrade and looks out (back view); the starlings swirl
    const TE = TR + TRW;
    b.wall(TE - 0.2, 1, 40);
    b.end(TE - 0.2);
  },
},
{
  // Lagos (plan: claude.ai/artifact/Rpb8XJbLxAR4iT6LJ3orzt, Ladi's picks 2026-11-10: all recommended, plus okadas), built from the level kit
  // on art made with the image maker (cut by london-runner/lagos/src/cut.py into atlas_lg*.webp). A hot sunny day going golden, then dusk;
  // A in his summer outfit. A danfo drops A in Yaba -> the market (umbrella bounces, special 1) -> the National Theatre (the one inside:
  // talking drums, special 2) -> go-slow on Third Mainland Bridge (over the danfo and bus roofs, special 3) -> a danfo off the bridge ->
  // Victoria Island's glass towers (wall-jump, special 4) and roofs -> Landmark Beach (quad bike ride, the big wave, special 5)
  // -> the Lekki-Ikoyi Link Bridge at dusk.
  id: 'lagos', name: 'Lagos', plate: 'Lagos', area: 'lagos', city: 'Lagos',
  build(b) {
    const L = b.L, LG_ASP = {"lg_danfo":1.6565,"lg_danfo:h":2.3,"lg_danfo_open":1.6542,"lg_danfo_open:h":2.395,"lg_danfo_door":0.9609,"lg_danfo_door:h":2.3,"lg_okada1":1.02,"lg_okada1:h":2.0,"lg_okada2":1.07,"lg_okada2:h":2.0,"lg_okada0":1.4467,"lg_okada0:h":1.5,"lg_keke1":1.3895,"lg_keke1:h":1.9,"lg_keke2":1.3947,"lg_keke2:h":1.9,"lg_y4":0.4246,"lg_y4:h":9.575,"lg_y5":0.375,"lg_y5:h":10.812,"lg_y3":0.5111,"lg_y3:h":7.975,"lg_y2":0.6779,"lg_y2:h":6.062,"lg_market":1.1051,"lg_market:h":7.725,"lg_tech":0.7339,"lg_tech:h":7.488,"lg_buka":1.1913,"lg_buka:h":3.85,"lg_phone":1.1939,"lg_phone:h":3.788,"lg_endl":0.9408,"lg_endl:h":6.038,"lg_narrow":0.5097,"lg_narrow:h":5.9,"lg_endr":0.9262,"lg_endr:h":6.038,"lg_gatewall":2.0061,"lg_gatewall:h":4.2,"lg_suya":0.9792,"lg_suya:h":2.4,"lg_cooler":0.912,"lg_cooler:h":2.5,"lg_tank":0.6826,"lg_tank:h":2.3,"lg_corn":1.18,"lg_corn:h":1.0,"lg_lamp":0.7395,"lg_lamp:h":4.2,"lg_banana_pot":1.07,"lg_banana_pot:h":2.0,"lg_barrier":2.5333,"lg_barrier:h":0.9,"lg_table":2.0727,"lg_table:h":1.1,"lg_theatre":2.3192,"lg_theatre:h":13.0,"lg_palmpot":0.6378,"lg_palmpot:h":4.5,"lg_pillar1":0.3357,"lg_pillar1:h":8.0,"lg_pillar2":0.3339,"lg_pillar2:h":8.0,"lg_fountain":1.1938,"lg_fountain:h":1.6,"lg_bench":2.34,"lg_bench:h":1.0,"lg_seats":1.9767,"lg_seats:h":3.0,"lg_drum3":0.6231,"lg_drum3:h":2.6,"lg_drum2":0.635,"lg_drum2:h":2.0,"lg_drum1":0.6,"lg_drum1:h":1.35,"lg_djembe":0.8708,"lg_djembe:h":2.4,"lg_tpier":0.2914,"lg_tpier:h":4.4,"lg_tarch":1.1725,"lg_tarch:h":4.4,"lg_adire":9.85,"lg_adire:h":0.4,"lg_dframe":0.7318,"lg_dframe:h":4.4,"lg_glass":0.1496,"lg_glass:h":4.48,"lg_dpier":0.2,"lg_dpier:h":4.4,"lg_rail":11.7273,"lg_rail:h":1.1,"lg_blamp":0.6339,"lg_blamp:h":5.5,"lg_pier":0.88,"lg_pier:h":4.0,"lg_gantry":1.5813,"lg_gantry:h":6.2,"lg_brt":2.5903,"lg_brt:h":3.1,"lg_lorry":1.6133,"lg_lorry:h":3.0,"lg_car":1.65,"lg_car:h":1.6,"lg_suv":1.7676,"lg_suv:h":1.85,"lg_danfo2":1.5346,"lg_danfo2:h":2.6,"lg_hawk1":0.419,"lg_hawk1:h":2.1,"lg_hawk2":0.4095,"lg_hawk2:h":2.1,"lg_hawk3":0.419,"lg_hawk3:h":2.1,"lg_hawk4":0.5316,"lg_hawk4:h":1.9,"lg_apt":0.5411,"lg_apt:h":11.6,"lg_rest":0.7064,"lg_rest:h":8.029,"lg_hotel":0.6184,"lg_hotel:h":9.263,"lg_cafe":1.2545,"lg_cafe:h":4.965,"lg_helipad":3.2368,"lg_helipad:h":1.9,"lg_rtank":1.3783,"lg_rtank:h":2.3,"lg_rac":2.25,"lg_rac:h":1.4,"lg_pergola":2.1385,"lg_pergola:h":2.6,"lg_bgate":1.6238,"lg_bgate:h":4.2,"lg_hut1":1.7944,"lg_hut1:h":3.6,"lg_hut2":1.7944,"lg_hut2:h":3.6,"lg_net":2.2731,"lg_net:h":2.6,"lg_coco":1.1842,"lg_coco:h":1.9,"lg_umb":1.0731,"lg_umb:h":2.6,"lg_loungers":2.46,"lg_loungers:h":1.0,"lg_castle":1.5643,"lg_castle:h":1.4,"lg_castle2":1.6714,"lg_castle2:h":0.7,"lg_drift":2.1375,"lg_drift:h":0.8,"lg_ball":1.35,"lg_ball:h":0.6,"lg_horse":1.0818,"lg_horse:h":2.2,"lg_horse_g1":1.5131,"lg_horse_g1:h":1.906,"lg_horse_g2":1.2732,"lg_horse_g2:h":2.05,"lg_horse_hand":1.5874,"lg_horse_hand:h":2.233,"lg_bigwave":1.9727,"lg_bigwave:h":2.2,"lg_splash":1.3071,"lg_splash:h":1.4,"lg_wave":2.5889,"lg_wave:h":0.9,"lg_walkway":4.3783,"lg_walkway:h":4.6,"lg_palm":0.841,"lg_palm:h":7.5,"lg_oilpalm":0.9838,"lg_oilpalm:h":6.5,"lg_almond":1.2267,"lg_almond:h":6.5,"lg_bougain":1.4909,"lg_bougain:h":2.2,"lg_bananas":1.45,"lg_bananas:h":3.2,"lg_cloud0":1.865,"lg_cloud0:h":2.0,"lg_cloud1":1.8687,"lg_cloud1:h":1.6,"lg_cloud2":1.8071,"lg_cloud2:h":1.4,"lg_cloud3":1.77,"lg_cloud3:h":1.0,"lg_cloud4":1.7671,"lg_cloud4:h":0.8,"lg_egret0":1.3429,"lg_egret0:h":0.7,"lg_egret1":1.2286,"lg_egret1:h":0.7,"lg_egret2":1.2571,"lg_egret2:h":0.7,"lg_gull0":1.3833,"lg_gull0:h":0.6,"lg_gull1":1.4167,"lg_gull1:h":0.6,"lg_gull2":1.2833,"lg_gull2:h":0.6,"lg_egret_st":0.81,"lg_egret_st:h":1.0,"lg_agama_wall":1.4417,"lg_agama_wall:h":1.2,"lg_agama1":2.6,"lg_agama1:h":0.35,"lg_agama2":1.8889,"lg_agama2:h":0.45,"lg_stalls":3.6735,"lg_stalls:h":3.4,"lg_stall1":1.2235,"lg_stall1:h":3.4,"lg_stall2":1.2265,"lg_stall2:h":3.4,"lg_stall3":1.2235,"lg_stall3:h":3.4,"lg_umbs":2.964,"lg_umbs:h":5.0,"lg_umb1":0.9,"lg_umb1:h":5.0,"lg_umb2":0.772,"lg_umb2:h":5.0,"lg_umb3":0.908,"lg_umb3:h":5.0,"lg_umb4":0.796,"lg_umb4:h":5.0,"lg_tower1":0.2808,"lg_tower1:h":16.0,"lg_tower2":0.4583,"lg_tower2:h":13.694,"lg_quad":1.8448,"lg_quad:h":1.0,"lg_quadwheel":0.9809,"lg_quadwheel:h":1.0,"lg_quadfull":1.4197,"lg_quadfull:h":1.0,"lg_quad2":1.4197,"lg_quad2:h":1.0,"lg_lorry2":2.1834,"lg_lorry2:h":3.0,"domes":[[0.1197,0.1083,3.759],[0.3429,0.1045,4.21],[0.6054,0.1257,4.619],[0.8653,0.1247,5.0]]};
    L.killY = -8; L.startX = 2.0; L.camMin = -12; L.introCam = 'centre'; L.outfit = 'dxb';   // the summer outfit
    const aw = (k, h) => LG_ASP[k] * h;
    const ground = (x0, x1, style, y = 0) => b.groundTop(x0, x1, y, style);
    const art = (key, x, y, h, o = {}) => b.kitArt(key, x, y, h, Object.assign({ w: aw(key, h) }, o));
    const back = (key, x, h, o = {}) => art(key, x, o.y || 0, h, Object.assign({ back: true }, o));
    const solid = (x, w, h, y = 0, o = {}) => { const s = Object.assign({ kind: 'block', x, y, w, h, style: 'hidden' }, o); L.solids.push(s); return s; };
    const Y = y => ({ y: y || 0 });
    const lean = (key, x, h, sh, y) => { const w = aw(key, h); return b.kitProp(key, x, w, h, Object.assign(Y(y), { solid: [0.1, w - 0.2, sh], ledge: [0.1, sh, w - 0.2] })); };
    const hop = (key, x, h, y, sh = Math.min(h, 1.0)) => { const w = aw(key, h); return b.kitProp(key, x, w, h, Object.assign(Y(y), { solid: [0.1, w - 0.2, sh] })); };
    const prop = (key, x, h, y) => b.kitProp(key, x, aw(key, h), h, Y(y));
    const bounce = (x, w, y, h, note) => L.oneways.push({ kind: 'ledge', x, y, w, bounce: h, note });
    const swapAt = (x, to, why) => (L.kitSwaps = L.kitSwaps || []).push({ x, to, why });   // behind something reaching above the sky band: not a door
    const zone = (x0, x1, z) => { for (const a of L.kitArt) if (a.zone === undefined && !a.out && a.x > x0 - 0.1 && a.x < x1) a.zone = z; };
    // buildings: their ledges (balconies, roofs) as parts of their height
    const LED = { lg_y2: [0.62, 0.9], lg_y3: [0.5, 0.73, 0.92], lg_y4: [0.42, 0.6, 0.78, 0.93], lg_y5: [0.36, 0.52, 0.68, 0.84, 0.94],
      lg_endl: [0.52, 0.96], lg_endr: [0.52, 0.96], lg_narrow: [0.5, 0.96], lg_market: [0.37, 0.68, 0.97], lg_tech: [0.36, 0.68, 0.96],
      lg_buka: [0.9], lg_phone: [0.92], lg_hotel: [0.28, 0.46, 0.63, 0.8, 0.97], lg_rest: [0.34, 0.6, 0.86], lg_cafe: [0.55, 0.95], lg_apt: [0.3, 0.45, 0.6, 0.75, 0.97] };
    const house = k => { const h = LG_ASP[k + ':h'], w = aw(k, h); return { key: k, w, h, ledges: LED[k].map(f => [0.35, f * h, w - 0.7]) }; };
    const row = keys => x => b.kitRow(x, keys.slice(1, -1).map(house), { capL: house(keys[0]), capR: house(keys[keys.length - 1]) });
    L.lgLife = [];                                       // birds, lizards, okadas, hawkers: [key, x, y, kind]
    L.lgJoins = [];                                      // where two kinds of ground meet (a concrete pier stands there)
    L.rides = []; L.camFloor = [];

    // ---------- 1. Yaba: the danfo drops A; okadas and kekes; the market street ----------
    b.wall(-12.5, 1, 22);
    L.lgBus = { x: -3.4 };                               // a yellow danfo: A jumps out of its open door, it drives away
    prop('lg_corn', 9.0, 1.0); L.lgLife.push(['lg_agama1', 9.4, 0, 'lizard']);
    const R1 = row(['lg_endl', 'lg_y2', 'lg_y4', 'lg_y3', 'lg_endr'])(12.0);
    lean('lg_suya', 16.0, 2.4, 1.35);
    b.coins(16.4, 2.6, 3, 0.8); b.coins(19.5, 4.6, 4, 1.0); b.coins(24.0, 7.2, 4, 1.0);
    lean('lg_keke1', 22.0, 1.9, 1.35);
    prop('lg_lamp', 27.5, 4.2);
    L.lgLife.push(['lg_okada1', 30, 0, 'okada'], ['lg_agama_wall', R1 - 9.5, 0, 'wall'], ['lg_egret1', 14, 12.5, 'fly']);
    // the fabric stalls (three in a row): run along their flat roofs
    const FS = R1 + 5.0;
    lean('lg_tank', R1 + 2.4, 2.3, 1.35);              // (a water tank by the end house: lean on it, then up)
    const FE = b.kitStalls(FS, ['lg_stall1', 'lg_stall2', 'lg_stall3'].map(k => ({ key: k, w: aw(k, 3.4), h: 3.4, top: 3.35 })));
    b.coins(FS + 1.0, 4.4, 9, 1.2);
    lean('lg_cooler', FE + 1.8, 2.5, 1.35);
    // ---------- special 1: up the market umbrellas, each bounces him higher, onto the Yaba market's roof ----------
    const UM = FE + 6.0, UW = aw('lg_umbs', 5.0), DOMES = LG_ASP.domes;
    back('lg_umbs', UM, 5.0);
    const BNC = [3.4, 3.8, 4.3, 5.4], NOTE = [1.0, 1.12, 1.26, 1.5];
    DOMES.forEach(([c, hw, top], i) => { bounce(UM + (c - hw * 0.7) * UW, hw * 1.4 * UW, top - 0.15, BNC[i], NOTE[i]); b.arc(UM + c * UW + 0.6, top + 0.6, 4, 3.0, BNC[i] * 0.75); });
    lean('lg_table', UM - 3.0, 1.1, 1.0);                // (a table to hop up from, before the first umbrella)
    const MK = UM + UW + 0.6;
    const R2 = row(['lg_endl', 'lg_market', 'lg_tech', 'lg_narrow', 'lg_buka', 'lg_phone', 'lg_endr'])(MK - aw('lg_endl', LG_ASP['lg_endl:h']) + 0.05);
    const MKH = LG_ASP['lg_market:h'] * 0.97, MKW = aw('lg_market', LG_ASP['lg_market:h']);
    b.coins(MK + 0.8, MKH + 1.0, 6, 1.1);
    L.lgMarket = [FS - 4, MK + MKW + 4];                // (the fabric stalls to the market: market chatter plays here)
    b.special(MK + MKW - 1.2, MKH + 2.0);                                                 // 1: at the far end of the market roof
    L.lgLife.push(['lg_agama2', MK + 2.0, MKH, 'lizard']);
    lean('lg_banana_pot', MK + 2.5, 2.0, 1.35); hop('lg_okada0', MK + 9.0, 1.5, 0, 1.1); lean('lg_keke2', MK + 16.0, 1.9, 1.35);
    prop('lg_tank', MK + 21.5, 2.3); hop('lg_corn', MK + 25.5, 1.0);
    b.coins(MK + 10, 2.6, 4, 1.0); b.coins(MK + 18, 4.2, 4, 1.0);
    L.lgLife.push(['lg_okada2', MK + 14, 0, 'okada'], ['lg_egret0', MK + 6, 13.0, 'fly']);
    const J1 = R2 + 2.0;                                 // Yaba's paving meets the theatre plaza at a pier
    ground(-14, J1, 'lgstreet'); L.lgJoins.push(J1);
    L.lgYaba = [-14, J1];                               // (Yaba's street: the conductors' and sellers' calls play here)

    // ---------- 2. the National Theatre: Creative Park's pillars (wall-jump for coins), the fountain, up the steps, THE DOOR ----------
    lean('lg_tank', R2 + 0.2, 2.3, 1.35);              // (a water tank where the market street ends: lean on it, then up)
    const P1 = J1 + 6.0, PW1 = aw('lg_pillar1', 8.0), GP = 1.8, P2 = P1 + PW1 + GP;
    back('lg_pillar1', P1, 8.0); back('lg_pillar2', P2, 8.0);
    solid(P1 + 0.2, PW1 - 0.2, 8.0 - 2.0, 2.0); solid(P2, aw('lg_pillar2', 8.0) - 0.2, 8.0 - 2.0, 2.0);   // (from just above his head: he runs under, or climbs)
    b.ledge(P1 + 0.1, 8.0, PW1 - 0.2); b.ledge(P2 + 0.1, 8.0, aw('lg_pillar2', 8.0) - 0.2);
    (L.kitClimbs = L.kitClimbs || []).push({ x: P1, xr: P2, gap: GP, hL: 8.0, hR: 8.0 });
    for (let i = 0, y = 2.6; y < 7.6; i++, y += 1.4) b.coins(P1 + PW1 + (i % 2 ? GP - 0.5 : 0.25), y, 1);
    b.coins(P1 + 0.6, 9.0, 6, 1.0);
    const PE = P2 + aw('lg_pillar2', 8.0);
    lean('lg_fountain', PE + 2.5, 1.6, 1.35); b.coins(PE + 2.8, 2.4, 3, 0.7);
    hop('lg_bench', PE + 7.0, 1.0); prop('lg_palmpot', PE + 10.5, 4.5); lean('lg_cooler', PE + 13.6, 2.5, 1.35);
    const TX = PE + 14.0, TW = aw('lg_theatre', 13.0), ST = 2.4;   // the theatre: its steps up to the glass doors in the middle
    back('lg_theatre', TX, 13.0); L.lgTh = { x: TX, w: TW, h: 13.0 }; L.lgStage = ST;
    b.slope(TX + 4.7, 0.05, TX + 10.3, ST);
    ground(TX + 10.3, TX + 15.07, 'lghide', ST);
    b.coins(TX + 5.2, 1.4, 5, 1.1, 0.42);
    L.camFloor.push([TX + 4.7, TX + 10.3, 0, ST]);
    const D1 = TX + 15.07;                               // the glass doors
    b.kitDoor(D1, { inside: true }); b.kitSwap(D1, 'th_in'); L.lgDoor1 = D1;
    ground(J1, TX + 10.3, 'lgplaza');

    // ---------- 3. inside the National Theatre: seat rows, the talking drums on the stage (special 2: BOUNCE, each beat higher) ----------
    lean('lg_djembe', D1 + 1.6, 2.4, 1.35, ST);        // (a djembe just inside the doors)
    const S1 = D1 + 5.0, SW = aw('lg_seats', 3.0);      // two blocks of seats rising: up the rows
    for (const x of [S1, S1 + SW + 1.4]) { back('lg_seats', x, 3.0, { y: ST }); solid(x + 0.1, SW - 0.2, 1.0, ST); solid(x + 2.0, SW - 2.1, 2.0, ST); solid(x + 3.9, SW - 4.0, 3.0, ST); b.coins(x + 1.2, ST + 2.6, 3, 1.9, 0.9); }
    const DR = S1 + 2 * SW + 5.0;
    const DRUMS = [['lg_drum1', 1.35, 3.2, 1.0], ['lg_drum2', 2.0, 3.8, 1.19], ['lg_drum3', 2.6, 4.8, 1.41]];
    L.lgDrums = [];
    let dx = DR;
    for (const [k, h, bh, note] of DRUMS) {
      const w = aw(k, h); back(k, dx, h, { y: ST, drum: true });
      solid(dx + 0.1, w - 0.2, Math.max(1.35, h - 0.1), ST, { noGrab: true }); const o = { kind: 'ledge', x: dx + 0.05, y: ST + Math.max(1.35, h - 0.1) + 0.1, w: w - 0.1, bounce: bh, note, talk: true };   // (talk: it sounds like a talking drum) L.oneways.push(o);
      L.lgDrums.push({ x: dx, w, h, k, o }); b.arc(dx + w / 2 + 0.6, ST + h + 0.6, 4, 2.6, bh * 0.8);
      dx += w + 2.6;
    }
    const DL = L.lgDrums[2];
    b.special(DL.x + DL.w / 2 + 2.2, ST + DL.h + 4.6);                                     // 2: at the top of the big drum's bounce
    lean('lg_djembe', dx + 2.4, 2.4, 1.35, ST); b.coins(dx + 2.6, ST + 3.2, 4, 0.8);
    const S2 = dx + 7.0;
    back('lg_seats', S2, 3.0, { y: ST }); solid(S2 + 0.1, SW - 0.2, 1.0, ST); solid(S2 + 2.0, SW - 2.1, 2.0, ST); solid(S2 + 3.9, SW - 4.0, 3.0, ST); b.coins(S2 + 1.2, ST + 2.6, 3, 1.9, 0.9);
    b.arc(S2 + SW + 0.4, ST + 3.8, 4, 3.0, 1.2);
    const D2 = S2 + SW + 7.0;                            // out by the far glass doors, down the theatre's other steps
    L.lgDoor2 = D2; zone(D1, D2, 2);
    b.kitDoor(D2, { inside: false }); b.kitSwap(D2, 'bridge');
    ground(TX + 15.07, D2 + 4.73, 'lgstage', ST);
    L.camFloor.push([D1 - 0.5, D2 + 0.5, ST]);
    back('lg_theatre', D2 - 15.07, 13.0, { out: true }); L.lgTh2 = { x: D2 - 15.07 };
    for (const a of L.kitArt) if (a.out && a.zone === undefined) a.zone = 0;
    b.slope(D2 + 4.73, ST, D2 + 10.6, 0.05); L.camFloor.push([D2 + 4.73, D2 + 10.6, ST, 0]);
    const TE = D2 - 15.07 + TW;
    ground(D2 + 4.73, TE + 0.5, 'lgplaza');
    lean('lg_cooler', D2 + 11.2, 2.5, 1.35);
    b.coins(D2 + 5.4, ST + 0.8, 5, 1.1, -0.42);

    // ---------- 4. go-slow on Third Mainland Bridge: over the roofs of the stopped traffic (special 3: the long jump over the bus) ----------
    const BR = TE + 0.5;                                 // (the bridge begins at a pier, where the theatre's plaza ends)
    L.lgJoins.push(BR); L.lgBridge = [BR];
    L.lgLife.push(['lg_egret_st', BR - 2.6, 0, 'rail']);   // (standing on the plaza by the bridge's first pier, not on the railing)
    const veh = (k, x, h, roof, body) => { const w = aw(k, h); b.kitProp(k, x, w, h, { y: 0, solid: [0.15, w - 0.3, body], ledge: [0.15, roof, w - 0.3] }); return x + w; };
    let vx = BR + 4.0;
    vx = veh('lg_car', vx, 1.6, 1.45, 1.35) + 2.2;
    L.lgLife.push(['lg_hawk1', vx - 1.3, 0, 'hawker']);
    vx = veh('lg_suv', vx, 1.85, 1.75, 1.3) + 1.6;
    b.coins(BR + 7.0, 2.6, 3, 0.8); b.coins(vx - 3.0, 3.0, 3, 0.8);
    vx = veh('lg_danfo2', vx, 2.6, 2.55, 2.0) + 2.4;
    L.lgLife.push(['lg_hawk2', vx - 1.4, 0, 'hawker']);
    const BUS = vx; vx = veh('lg_brt', vx, 3.1, 3.0, 2.6) + 3.4;
    b.coins(BUS + 0.6, 4.1, 7, 1.0);
    const LOR = vx; vx = veh('lg_lorry2', vx, 2.9, 2.8, 2.4) + 2.0;   // (its back under a tarpaulin: no watermelons, Ladi round 2)
    b.special(LOR - 1.7, 7.0);                                                             // 3: over the gap, from the bus roof to the lorry's tarpaulin
    b.arc(LOR - 3.4, 4.2, 5, 3.4, 2.4);
    L.lgLife.push(['lg_hawk3', LOR - 1.6, 0, 'hawker']);
    b.kitArt('lg_gantry', LOR - 4.0, 0, 6.2, { w: aw('lg_gantry', 6.2), back: true, grounded: true });
    vx = veh('lg_car', vx, 1.6, 1.45, 1.2) + 2.0;
    L.lgLife.push(['lg_hawk4', vx - 1.2, 0, 'hawker']);
    vx = veh('lg_suv', vx, 1.85, 1.75, 1.3) + 1.8;
    b.coins(vx - 5.0, 2.8, 5, 1.0);
    vx = veh('lg_danfo2', vx, 2.6, 2.55, 2.0) + 2.6;
    b.coins(vx - 4.4, 3.6, 4, 1.0);
    L.lgLife.push( ['lg_egret2', vx - 10, 11.5, 'fly'], ['lg_gull0', vx + 4, 12.5, 'fly']);
    // the danfo with its door open, its conductor calling: A jumps in, it rides off the bridge onto Victoria Island
    const DB = vx + 3.0, DE = DB + 40.0;
    L.lgRide = { x: DB };
    const bus = { kind: 'lgbus', x0: DB, pts: [[DB, 0], [DE, 0]], v: 12.0, acc: 8.0, vEnd: 6.2, walkOut: 2.6, w0: 0.5, w1: 0, input: false,
      seat: 0.0, up: 0, down: 0, exitY: 0 };
    L.rides.push(bus); L.lgBusRide = bus;
    const AP = DB + 22.0, APH = LG_ASP['lg_apt:h'];    // a tall block of flats at the end of the bridge: the view changes behind it
    back('lg_apt', AP, APH, { flip: true }); swapAt(AP + aw('lg_apt', APH) / 2, 'vi', 'behind the tall block of flats the danfo drives past');
    const BE = AP + aw('lg_apt', APH) / 2;
    ground(BR, BE, 'lgroad'); L.lgJoins.push(BE); L.lgBridge.push(BE);
    for (let x = BR + 2; x < BE - 2; x += 13) back('lg_blamp', x, 5.5);
    // the far lane (Ladi round 2: "more cars ... moving slowly so it looks like real traffic"): a second lane of traffic behind the one he
    // runs over, creeping forward stop-start (drawn only; standing still while the danfo skips past it). Its front end goes on behind the flats.
    const FAR = [['lg_suv', 1.85], ['lg_danfo2', 2.6], ['lg_car', 1.6], ['lg_brt', 3.1], ['lg_keke1', 1.9], ['lg_car', 1.6], ['lg_danfo2', 2.6], ['lg_suv', 1.85]];
    L.lgFar = { x0: BR, x1: BE, y: 0.42, k: 0.85, cars: [] };
    for (let x = BR + 0.6, i = 0; x < BE + 6; i++) { const [k, h] = FAR[i % FAR.length]; L.lgFar.cars.push([k, x, h * 0.85]); x += aw(k, h * 0.85) + 1.1 + (i * 7 % 5) * 0.25; }

    // ---------- 5. Victoria Island: up between two glass towers (special 4: WALL-JUMP), the rooftop run ----------
    const T1 = DE + 6.0, T1W = aw('lg_tower1', LG_ASP['lg_tower1:h']), T1H = LG_ASP['lg_tower1:h'], GG = 1.8, T2 = T1 + T1W + GG;
    // (the green tower's picture is empty sky for its left third: it is drawn that much further left, so its wall is where he wall-jumps
    // off it; Ladi 2026-11-11: "the second building on the right is missing, he's jumping through thin air")
    const T2H = LG_ASP['lg_tower2:h'], T2P = aw('lg_tower2', T2H), T2W = T2P * 0.6;
    back('lg_tower1', T1, T1H); back('lg_tower2', T2 - T2P * 0.36, T2H);
    solid(T1 + 0.2, T1W - 0.2, T1H - 2.2, 2.2); solid(T2, T2W - 0.2, T2H - 2.2, 2.2);
    b.ledge(T1 + 0.3, T1H - 0.2, T1W - 0.6); b.ledge(T2 + 0.3, T2H - 0.25, T2W - 0.6);
    (L.kitClimbs = L.kitClimbs || []).push({ x: T1, xr: T2, gap: GG, hL: T1H, hR: T2H });
    for (let i = 0, y = 2.8; y < T2H - 0.6; i++, y += 1.5) b.coins(T1 + T1W + (i % 2 ? GG - 0.5 : 0.25), y, 1);
    b.special(T1 + T1W + GG / 2, T2H + 1.2);                                               // 4: over the top of the gap
    L.lgLife.push(['lg_egret1', T1 + 6, 17.5, 'fly']);
    const RX = T2 + T2W - 0.05;
    const R3 = b.kitRow(RX, ['lg_hotel', 'lg_rest'].map(house), { capL: null, capR: house('lg_cafe') });
    L.kitWarn = (L.kitWarn || []).filter(w => !w.startsWith(`kitRow at ${RX}`));   // (its left end is the tower, not an end piece)
    const HW = aw('lg_hotel', LG_ASP['lg_hotel:h']), HH = LG_ASP['lg_hotel:h'] * 0.97, RW = aw('lg_rest', LG_ASP['lg_rest:h']);
    lean('lg_rtank', RX + 1.0, 2.3, 1.35, HH); b.coins(RX + 1.2, HH + 2.5, 3, 0.9); b.coins(RX + 3.8, HH + 1.2, 2, 0.8);
    b.arc(RX + HW - 0.4, HH + 1.4, 5, 3.6, 1.2);
    lean('lg_rac', RX + HW + 1.0, 1.4, 1.35, LG_ASP['lg_rest:h'] * 0.86); b.coins(RX + HW + 3.6, LG_ASP['lg_rest:h'] * 0.86 + 1.2, 3, 0.8);
    b.coins(RX + HW + RW + 0.6, LG_ASP['lg_cafe:h'] + 1.0, 4, 1.0);
    lean('lg_cooler', T2 + T2W + 2.5, 2.5, 1.35); prop('lg_palmpot', RX + HW + 2.0, 4.5); hop('lg_corn', RX + HW + RW + 1.5, 1.0);
    L.lgLife.push(['lg_agama1', RX + HW + 4.5, 0, 'lizard']);
    prop('lg_bougain', R3 + 1.0, 2.2); prop('lg_lamp', R3 + 5.0, 4.2); lean('lg_coco', R3 + 9.0, 1.9, 1.35);
    b.coins(R3 + 9.3, 2.8, 3, 0.8);

    // ---------- 6. Landmark Beach: a big palm (the view changes behind its trunk), the beach gate, huts, the quad bike ride (special 5: THE BIG WAVE) ----------
    const PB = R3 + 14.0, PBH = 9.6, PBW = aw('lg_palm', PBH);
    back('lg_palm', PB, PBH); const PT = PB + PBW * 0.22;     // (the trunk is at its left)
    swapAt(PT, 'beach', 'behind the trunk of a tall coconut palm (drawn whole)');
    prop('lg_bananas', PB - 1.6, 3.2);
    const GT = PB + PBW * 0.5;                          // the beach gate: the pavement turns to sand under it
    back('lg_bgate', GT, 4.2); const GTW = aw('lg_bgate', 4.2);
    b.ledge(GT + 0.4, 4.15, GTW - 0.8); b.coins(GT + 0.8, 5.2, 5, 1.0);
    ground(BE, GT + 0.9, 'lgpave'); L.lgJoins.push(GT + 0.9); L.lgGate = GT + 0.9;
    const HT = GT + GTW + 2.0;
    lean('lg_cooler', GT + GTW - 1.0, 2.5, 1.35);
    back('lg_hut1', HT, 3.6); b.ledge(HT + 0.4, 3.45, aw('lg_hut1', 3.6) - 0.8);
    hop('lg_loungers', HT + aw('lg_hut1', 3.6) + 1.2, 1.0);
    const HT2 = HT + aw('lg_hut1', 3.6) + 5.0;
    back('lg_hut2', HT2, 3.6); b.ledge(HT2 + 0.4, 3.45, aw('lg_hut2', 3.6) - 0.8);
    b.coins(HT + 0.8, 4.5, 5, 1.0); b.coins(HT2 + 0.8, 4.5, 5, 1.0);
    lean('lg_castle', HT2 + aw('lg_hut2', 3.6) + 1.5, 1.4, 1.35); prop('lg_umb', HT2 + aw('lg_hut2', 3.6) + 5.0, 2.6);
    back('lg_net', HT2 + aw('lg_hut2', 3.6) + 9.0, 2.6);
    L.lgLife.push(['lg_gull1', HT + 6, 12.0, 'fly'], ['lg_gull2', HT2 + 10, 13.0, 'fly']);
    // the quad bike ride along the water's edge (Ladi round 2: a quad bike, not a horse): tap to jump the waves; the big wave always lifts him
    const HR = HT2 + aw('lg_hut2', 3.6) + 18.0, HE = HR + 64.0;
    L.lgQuad = { x: HR };
    const WAVES = [HR + 12, HR + 22, HR + 46], BIG = HR + 33;
    const quad = { kind: 'lgquad', x0: HR, pts: [[HR, 0], [HE, 0]], ramps: [{ x: BIG, v: 12.5, h: 0.6 }], v: 11.5, acc: 8.0, vEnd: 6.2, walkOut: 2.6,
      w0: 0.4, w1: 0, input: true, jump: 8.5, grav: 28, seat: 0.95, up: 0, down: 0, exitY: 0 };
    L.rides.push(quad); L.lgQuadRide = quad; L.lgWaves = WAVES; L.lgBig = BIG;
    for (const x of WAVES) b.arc(x, 2.6, 5, 4.0, 1.4);
    b.special(BIG + 5.4, 5.6);                                                              // 5: at the top of the big wave's lift
    b.arc(BIG + 1.0, 3.2, 7, 9.0, 2.6);
    b.coins(HR + 4, 2.0, 5, 1.4); b.coins(HR + 52, 2.0, 6, 1.4);
    L.lgLife.push(['lg_gull0', HR + 20, 12.0, 'fly'], ['lg_egret2', HR + 40, 13.0, 'fly']);
    hop('lg_drift', HE + 3.0, 0.8); lean('lg_castle2', HE + 6.0, 1.4, 1.35);
    L.lgSea = [GT, 1e9];

    // ---------- 7. the Lekki-Ikoyi Link Bridge at dusk: up the walkway, the cables lit up, egrets flying ----------
    // a tall block of flats on the Lekki shore: the view changes behind it (the palm trunk was too thin, Ladi 2026-11-10: "a sharp change of backdrop near the flag")
    const J5 = HE + 10.0, AP2 = J5 + 1.0, APH2 = 13.5, APW2 = aw('lg_apt', APH2);
    L.lgBeach = [GT, J5];                                // (the beach: waves on the sand play here)
    back('lg_apt', AP2, APH2); swapAt(AP2 + APW2 / 2, 'view', 'behind a tall block of flats on the Lekki shore');
    L.lgGold = [T1 - 20, AP2 + APW2 / 2];
    const WK = AP2 + APW2 - 1.0, WKW = aw('lg_walkway', 4.6), DK = 1.15;   // the walkway starts behind the flats
    back('lg_walkway', WK, 4.6);
    ground(J5, WK + 0.3, 'lgpave'); L.lgJoins.push(J5, WK + 0.3);
    ground(GT + 0.9, J5, 'lgsand');
    b.slope(WK + 0.3, 0.05, WK + 7.55, DK);
    ground(WK + 7.55, WK + WKW + 40, 'lghide', DK); L.lgWalk = WK + 7.55;
    L.camFloor.push([WK + 0.3, WK + 7.55, 0, DK], [WK + 7.55, 99999, DK]);
    b.coins(WK + 1.0, 1.4, 5, 1.2, 0.18);
    const FX = WK + 10.0;
    b.flag(FX); L.flagY = DK;
    L.lgLife.push(['lg_egret0', FX - 3, 8.2, 'fly'], ['lg_egret1', FX + 3, 9.4, 'fly'], ['lg_egret2', FX + 9, 7.6, 'fly']);   // (small egrets flying home over the lagoon)
    L.lgFinale = true;
    L.finale = FX + 4.5; L.finaleT = 7; L.lgView = FX + 4.5;
    b.wall(WK + WKW - 0.4, 1, 40);
    b.end(WK + WKW - 0.4);
  },
},
{
  // Singapore (plan: claude.ai/artifact/KW8WaPiJEUMjTsGJDNnbnM, Ladi's picks 2026-11-11: all recommended), built from the level kit on art
  // made with the image maker (cut by london-runner/singapore/src/cut.py into atlas_sg*.webp). A hot afternoon going golden at the bay,
  // dusk at the Helix Bridge, night at the Supertrees; A in his summer outfit. A taxi drops A at Boat Quay -> the shophouses (cafe awning
  // bounces onto the roofs, special 1) -> a bumboat down the river (duck the old bridges, jump the wake, special 2) -> the Merlion (its
  // spout launches him, special 3) -> Jubilee Bridge and the Esplanade -> the Helix Bridge at dusk -> the Gardens -> inside the Cloud
  // Forest (the one inside: pitcher plants and mist, special 4 behind the waterfall) -> the Supertrees at night (wall-jump between two,
  // special 5, the skywalk) -> the light show with Marina Bay Sands behind (Ladi 2026-11-11: back to this ending).
  id: 'singapore', name: 'Singapore', plate: 'Singapore', area: 'singapore', city: 'Singapore',
  build(b) {
    const L = b.L, SG_ASP = {"sg_taxi":1.83,"sg_taxi:h":2.0,"sg_taxi_open":1.87,"sg_taxi_open:h":2.0,"sg_taxi_door":0.5974,"sg_taxi_door:h":1.536,"sg_boat":2.25,"sg_boat:h":3.16,"sg_boat_man":2.1059,"sg_boat_man:h":3.395,"sg_boat_front":2.4148,"sg_boat_front:h":1.757,"sg_sh_green":0.7413,"sg_sh_green:h":6.588,"sg_sh_pink":0.5397,"sg_sh_pink:h":9.075,"sg_sh_yellow":0.5382,"sg_sh_yellow:h":9.088,"sg_sh_blue":0.4581,"sg_sh_blue:h":10.688,"sg_sh_red":0.448,"sg_sh_red:h":10.325,"sg_sh_lilac":0.7964,"sg_sh_lilac:h":6.988,"sg_sh_peach":0.7724,"sg_sh_peach:h":7.075,"sg_sh_white":0.6845,"sg_sh_white:h":6.875,"sg_endl":1.166,"sg_endl:h":6.725,"sg_narrow":0.454,"sg_narrow:h":6.625,"sg_endr":1.1679,"sg_endr:h":6.738,"sg_terrace":3.2811,"sg_terrace:h":3.213,"sg_tiles":4.2644,"sg_tiles:h":2.275,"sg_lanterns":1.3231,"sg_lanterns:h":4.2,"sg_parasol":1.0615,"sg_parasol:h":2.6,"sg_lamp":0.3405,"sg_lamp:h":4.2,"sg_pot":0.85,"sg_pot:h":2.0,"sg_bollard":0.9333,"sg_bollard:h":0.9,"sg_planter":1.87,"sg_planter:h":1.0,"sg_bench":1.83,"sg_bench:h":1.0,"sg_steps":1.56,"sg_steps:h":3.0,"sg_wake":5.4125,"sg_wake:h":0.8,"sg_splash":1.8244,"sg_splash:h":1.4,"sg_jetty":3.0214,"sg_jetty:h":1.4,"sg_cavenagh":4.9407,"sg_cavenagh:h":3.6,"sg_anderson":7.8462,"sg_anderson:h":3.0,"sg_merlion":0.9113,"sg_merlion:h":8.0,"sg_fullerton":2.3577,"sg_fullerton:h":9.0,"sg_shelter":1.731,"sg_shelter:h":3.6,"sg_deck":2.3682,"sg_deck:h":2.2,"sg_jubilee":7.2333,"sg_jubilee:h":2.0,"sg_esplanade":2.0276,"sg_esplanade:h":9.5,"sg_stage":1.9283,"sg_stage:h":5.0,"sg_helix":6.9625,"sg_helix:h":4.0,"sg_helixpod":1.879,"sg_helixpod:h":4.075949367088608,"sg_helixend":3.6656,"sg_helixend:h":4.113924050632911,"sg_dome":2.0873,"sg_dome:h":12.0,"sg_dragonfly":0.9187,"sg_dragonfly:h":3.2,"sg_heliconia":2.1,"sg_heliconia:h":1.8,"sg_lily":2.73,"sg_lily:h":1.0,"sg_gbridge":2.6571,"sg_gbridge:h":1.4,"sg_glamp":0.7812,"sg_glamp:h":1.6,"sg_orchidwall":2.5917,"sg_orchidwall:h":1.2,"sg_pitch1":0.98,"sg_pitch1:h":1.5,"sg_pitch2":1.13,"sg_pitch2:h":2.0,"sg_pitch3":1.2,"sg_pitch3:h":2.7,"sg_vent":1.1167,"sg_vent:h":1.8,"sg_cloudwalk":2.6063,"sg_cloudwalk:h":2.6,"sg_falls":1.8179,"sg_falls:h":3.6,"sg_treefern":1.2254,"sg_treefern:h":4.0,"sg_orchids":1.225,"sg_orchids:h":1.6,"sg_brom":1.45,"sg_brom:h":1.2,"sg_boulder":1.6615,"sg_boulder:h":1.3,"sg_sundew":1.1643,"sg_sundew:h":1.4,"sg_fern":1.4579,"sg_fern:h":1.9,"sg_arch":1.3995,"sg_arch:h":4.4,"sg_apier":0.4249,"sg_apier:h":4.357,"sg_leaves":10.225,"sg_leaves:h":0.4,"sg_dframe":0.8545,"sg_dframe:h":4.4,"sg_glass":0.2225,"sg_glass:h":4.364,"sg_dpier":0.1176,"sg_dpier:h":4.251,"sg_stpair":0.75,"sg_stpair:h":11.0,"sg_st1":0.8,"sg_st1:h":11.0,"sg_st2":0.8915,"sg_st2:h":8.9,"sg_st3":1.0076,"sg_st3:h":6.917,"sg_skywalk":8.76,"sg_skywalk:h":1.0,"sg_stairs":0.5815,"sg_stairs:h":9.0,"sg_stdeck":1.0693,"sg_stdeck:h":7.345,"sg_raintree":1.4623,"sg_raintree:h":6.5,"sg_royalpalm":0.5775,"sg_royalpalm:h":7.5,"sg_travellers":1.0659,"sg_travellers:h":5.0,"sg_frangipani":0.985,"sg_frangipani:h":4.0,"sg_bamboo":0.6689,"sg_bamboo:h":4.5,"sg_cloud0":1.8462,"sg_cloud0:h":2.0,"sg_cloud1":2.0,"sg_cloud1:h":1.6,"sg_cloud2":2.9091,"sg_cloud2:h":1.4,"sg_cloud3":1.6512,"sg_cloud3:h":1.0,"sg_cloud4":2.475,"sg_cloud4:h":0.8,"sg_mynah0":1.1167,"sg_mynah0:h":0.6,"sg_mynah1":1.5,"sg_mynah1:h":0.6,"sg_mynah2":1.4167,"sg_mynah2:h":0.6,"sg_mynah_st":1.0667,"sg_mynah_st:h":0.6,"sg_kingfisher":1.3,"sg_kingfisher:h":0.6,"sg_egret0":1.275,"sg_egret0:h":0.8,"sg_egret1":1.9,"sg_egret1:h":0.8,"sg_fly0":1.125,"sg_fly0:h":0.4,"sg_fly1":1.125,"sg_fly1:h":0.4,"sg_fly2":1.125,"sg_fly2:h":0.4,"sg_bfly0":1.1143,"sg_bfly0:h":0.35,"sg_bfly1":1.1714,"sg_bfly1:h":0.35,"sg_bfly2":1.1714,"sg_bfly2:h":0.35,"sg_otters":4.2182,"sg_otters:h":1.1,"sg_otter_swim":3.2286,"sg_otter_swim:h":0.7,"sg_jogger":0.5474,"sg_jogger:h":1.9,"sg_family":0.75,"sg_family:h":1.964,"sg_diner":0.7594,"sg_diner:h":1.868,"sg_umbrella":0.5721,"sg_umbrella:h":2.082,"sg_gardener":0.6579,"sg_gardener:h":1.904,"sg_kid":0.4912,"sg_kid:h":1.707,"sg_mbs_tower":0.2761,"sg_mbs_tower:h":22.0,"sg_mbs_roof":7.9688,"sg_mbs_roof:h":3.4,"sg_mbs_lift":0.7037,"sg_mbs_lift:h":2.7,"sg_mbs_base":4.1458,"sg_mbs_base:h":2.4,"sg_mbs_steps":1.8857,"sg_mbs_steps:h":1.75,"sg_mbs_sky":4.13,"sg_mbs_sky:h":1.0,"sg_mbs_palm":0.8406,"sg_mbs_palm:h":3.2,"sg_mbs_parasol":0.2846,"sg_mbs_parasol:h":2.6,"sg_mbs_lounger":1.9,"sg_mbs_lounger:h":0.9,"sg_mbs_glass":1.975,"sg_mbs_glass:h":1.2,"sg_mbs_jet":0.6409,"sg_mbs_jet:h":2.2,"sg_mbs_lamp":0.8,"sg_mbs_lamp:h":0.7,"sg_statue":1.9,"sg_statue:h":2.6,"sg_cafes":3.4812,"sg_cafes:h":6.092,"stpair":{"inL":0.3382,"inR":0.6921,"walk":0.9718,"walkB":0.7855},"mbs_tower":{"sL":0.1224,"sR":0.8759,"flare":0.1009},"mbs_roof_top":0.4883,"mbs_base_top":0.475};
    L.killY = -9; L.startX = 2.0; L.camMin = -12; L.introCam = 'centre'; L.outfit = 'dxb';   // the summer outfit
    const aw = (k, h) => SG_ASP[k] * h;
    const H_ = k => SG_ASP[k + ':h'];
    const ground = (x0, x1, style, y = 0) => b.groundTop(x0, x1, y, style);
    const art = (key, x, y, h, o = {}) => b.kitArt(key, x, y, h, Object.assign({ w: aw(key, h) }, o));
    const back = (key, x, h, o = {}) => art(key, x, o.y || 0, h, Object.assign({ back: true }, o));
    const solid = (x, w, h, y = 0, o = {}) => { const s = Object.assign({ kind: 'block', x, y, w, h, style: 'hidden' }, o); L.solids.push(s); return s; };
    const Y = y => ({ y: y || 0 });
    const lean = (key, x, h, sh, y) => { const w = aw(key, h); return b.kitProp(key, x, w, h, Object.assign(Y(y), { solid: [0.1, w - 0.2, sh], ledge: [0.1, sh, w - 0.2] })); };
    const hop = (key, x, h, y, sh = Math.min(h, 1.0)) => { const w = aw(key, h); return b.kitProp(key, x, w, h, Object.assign(Y(y), { solid: [0.1, w - 0.2, sh] })); };
    const prop = (key, x, h, y) => b.kitProp(key, x, aw(key, h), h, Y(y));
    const bounce = (x, w, y, h, note, o = {}) => { const s = Object.assign({ kind: 'ledge', x, y, w, bounce: h, note }, o); L.oneways.push(s); return s; };
    const swapAt = (x, to, why) => (L.kitSwaps = L.kitSwaps || []).push({ x, to, why });   // behind something reaching above the sky band: not a door
    const zone = (x0, x1, z) => { for (const a of L.kitArt) if (a.zone === undefined && !a.out && a.x > x0 - 0.1 && a.x < x1) a.zone = z; };
    const house = (k, top = 0.97, sc = 1) => { const h = H_(k) * sc, w = aw(k, h); return { key: k, w, h, ledges: [[0.4, top * h, w - 0.8]] }; };
    L.sgLife = [];                                       // birds, otters, people, dragonflies: [key, x, y, kind]
    L.sgJoins = [];                                      // where two kinds of ground meet (a granite kerb post stands there)
    L.sgWater = [];                                      // stretches of river or bay under the deck / the boat: [x0, x1, surface]
    L.rides = []; L.camFloor = [];
    const WY = -2.4;                                     // the river's and the bay's surface

    // ---------- 1. Boat Quay: the taxi drops A; the shophouses; the cafe awnings bounce him onto the roofs (special 1) ----------
    b.wall(-12.5, 1, 22);
    L.sgTaxi = { x: -3.6 };                              // a blue taxi: A jumps out of its open back door, it drives away
    hop('sg_bollard', 8.0, 0.9); prop('sg_lamp', 10.6, 4.2);
    L.sgLife.push(['sg_mynah_st', 9.6, 0, 'stand'], ['sg_kingfisher', 18, 11.5, 'fly'], ['sg_mynah0', 34, 12.5, 'fly']);
    const S1 = 0.76;                                     // (the tall front row, scaled so its tops and the skyline above them fit a phone held sideways)
    const R1 = b.kitRow(13.0, ['sg_sh_pink', 'sg_sh_blue', 'sg_sh_yellow', 'sg_sh_red'].map(k => house(k, 0.97, S1)), { capL: house('sg_endl', 0.97, S1), capR: house('sg_endr', 0.97, S1) });
    const E1 = 13.0 + aw('sg_endl', H_('sg_endl') * S1);
    lean('sg_parasol', E1 + 1.0, 2.6, 1.35); L.sgLife.push(['sg_diner', E1 + 4.2, 0, 'stand']);
    hop('sg_planter', E1 + 7.0, 1.0); b.coins(E1 + 7.2, 2.2, 3, 0.7);
    prop('sg_lanterns', E1 + 10.0, 4.2); lean('sg_pot', E1 + 16.4, 2.0, 1.35);
    L.sgLife.push(['sg_family', E1 + 18.5, 0, 'stand'], ['sg_jogger', E1 + 4, 0, 'jog']);
    b.coins(E1 + 11.0, 2.0, 5, 1.0); b.coins(E1 + 21.0, 3.2, 3, 0.9);
    // the riverside cafes (four stalls in a row, their awnings rising): bounce up them onto the shophouse roofs
    const CF = R1 + 0.6, CW = aw('sg_cafes', H_('sg_cafes')), CS = CW / 21.208;   // (CS: the picture's units, if it was sized differently)
    back('sg_cafes', CF, H_('sg_cafes'));
    const AWN = [[1.62, 5.81, 2.97, 2.7, 1.0], [5.91, 10.07, 3.43, 2.9, 1.12], [10.1, 14.6, 3.79, 3.1, 1.26], [14.8, 19.7, 4.26, 3.3, 1.5]];
    for (const [a0, a1, top, bh, note] of AWN) { bounce(CF + (a0 + 0.3) * CS, (a1 - a0 - 0.6) * CS, top, bh, note); b.arc(CF + (a0 + a1) / 2 * CS + 0.6, top + 0.7, 4, 3.0, bh * 0.7); }
    const CR = 5.7;                                      // the cafes' roof line
    b.ledge(CF + 14.8 * CS, CR, (21.0 - 14.8) * CS);
    lean('sg_parasol', CF + 10.08 * CS - 0.5, 2.6, 1.35);   // (a parasol out front between two cafes)
    // the second row of shophouses: lower, a roof run from the cafes' roof (special 1 at its end)
    const R2X = CF + CW - 0.05;
    const R2 = b.kitRow(R2X, ['sg_sh_green', 'sg_sh_white', 'sg_sh_lilac', 'sg_sh_peach'].map(k => house(k)), { capL: null, capR: house('sg_endr') });
    L.kitWarn = (L.kitWarn || []).filter(w => !w.startsWith(`kitRow at ${R2X}`));   // (its left end is the cafes' row, not an end piece)
    let rx = R2X; const tops = [];
    for (const k of ['sg_sh_green', 'sg_sh_white', 'sg_sh_lilac', 'sg_sh_peach']) { tops.push([rx, H_(k) * 0.97, aw(k, H_(k))]); rx += aw(k, H_(k)) - 0.05; }
    for (const [x, y, w] of tops) b.coins(x + 1.0, y + 1.0, 3, 1.0);
    const PK = tops[3];
    b.special(PK[0] + PK[2] - 1.0, PK[1] + 2.0);                                              // 1: at the far end of the shophouse roofs
    L.sgLife.push(['sg_mynah_st', tops[1][0] + 2.0, tops[1][1], 'stand']);
    hop('sg_bollard', R2X + 3.0, 0.9); L.sgLife.push(['sg_umbrella', R2X + 6.5, 0, 'stand']); lean('sg_pot', R2X + 9.0, 2.0, 1.35);
    lean('sg_parasol', R2X + 13.0, 2.6, 1.35); hop('sg_planter', R2X + 18.0, 1.0);
    b.coins(R2X + 4.0, 2.4, 3, 0.9); b.coins(R2X + 14.0, 3.4, 4, 1.0);

    // ---------- 2. the bumboat: down the river steps, along the river under the old bridges (special 2), to the Merlion's landing ----------
    const RS = R2 + 1.0, SW = aw('sg_steps', 3.0), BD = -1.5;   // the river steps go down to the boat's deck
    ground(-14, RS, 'sgquay');
    back('sg_steps', RS - 0.4, 3.0, { y: BD - 1.0 });
    b.slope(RS, 0.0, RS + SW * 0.62, BD); L.camFloor.push([RS, RS + SW * 0.62, 0, BD]);
    ground(RS + SW * 0.62, RS + SW + 1.2, 'sglanding', BD);
    L.sgLife.push(['sg_otters', RS - 6.5, 0, 'stand']);   // (an otter family on the quay by the steps)
    const BX = RS + SW + 1.0, BE = BX + 52.0;
    // the old bridges, side on, their stone piers standing in the river: A ducks as he goes under the deck and stays down till he's out
    const UY = BD + 1.25;                                 // the underside of both decks: above a ducking boy, below a standing one
    const BRG = [['cav', 'sg_cavenagh', BX + 12.0, 2.6, 0.122, 0.14, 0.857], ['and', 'sg_anderson', BX + 38.0, 2.2, 0.162, 0.093, 0.90]].map(([k, key, c, h, ub, a0, a1]) => {
      const w = aw(key, h); return { k, key, x: c - w / 2, w, h, y: UY - ub * h, d0: c - w / 2 + a0 * w, d1: c - w / 2 + a1 * w };
    });
    const boat = { kind: 'sgboat', x0: BX, pts: [[BX, BD], [BE, BD]], v: 9.5, acc: 7.0, vEnd: 6.2, walkOut: 2.6, w0: 0.4, w1: 0, input: true, jump: 7.6, grav: 26,
      seat: 0.0, up: 0, down: 0.75, exitY: BD, hits: BRG.map(B => ({ x: B.d0 - 0.35, w: B.d1 - B.d0 + 0.7, kind: 'sgbonk' })) };
    L.rides.push(boat); L.sgBoat = boat; L.sgBridges = BRG; L.sgWY = WY;
    L.camFloor.push([RS + SW * 0.62, BE + 6, BD]);
    b.arc(BX + 24.5, BD + 1.4, 5, 4.0, 1.3);
    b.special(BX + 24.5 + 2.0, BD + 2.7);                                                     // 2: at the top of the big wake jump between the bridges
    for (const B of BRG) b.coins(B.d0 + 0.6, BD + 0.55, Math.floor((B.d1 - B.d0 - 1.2) / 1.3) + 1, 1.3);   // (low coins under each bridge: duck!)
    L.sgWater.push([RS + SW * 0.55, BE + 3.0, WY]);
    // the far bank: a granite quay wall, and the grand old post office building (the view changes to the bay behind it)
    L.sgBank = [RS + SW, BE + 2.0];
    const FU = BX + 34.0, FUW = aw('sg_fullerton', 9.0);
    back('sg_fullerton', FU, 9.0, { grounded: true, bank: true });
    swapAt(FU + FUW / 2, 'bay', 'behind the grand old post office on the far bank, as the boat passes it');
    L.sgLife.push(['sg_otter_swim', BX + 10, WY + 0.05, 'swim'], ['sg_egret0', BX + 20, 10.5, 'fly'], ['sg_kingfisher', BX + 38, 9.5, 'fly']);
    // the Merlion's landing: the boat ties up at the jetty and stays; up the steps to the park
    const ML = BE - 1.0;
    back('sg_jetty', BE - 2.6, 1.4, { y: WY - 0.15 });
    ground(BE - 2.2, ML + 4.6, 'sglanding', BD);   // (long enough that he steps off the boat onto it before the steps start)
    b.slope(ML + 4.6, BD, ML + 7.4, 0.0); L.camFloor.push([ML + 4.6, ML + 7.4, BD, 0]);
    back('sg_shelter', ML + 7.8, 3.6); b.ledge(ML + 8.2, 3.45, aw('sg_shelter', 3.6) - 0.8);

    // ---------- 3. Merlion Park: the Merlion's spout launches him over the bay (special 3), onto Jubilee Bridge ----------
    const MP = ML + 7.4;
    L.sgJoins.push(MP);
    b.coins(ML + 8.8, 4.6, 4, 1.0);
    prop('sg_royalpalm', ML + 12.6, 7.5); lean('sg_pot', ML + 16.6, 2.0, 1.35);
    const MX = ML + 21.0, MW = aw('sg_merlion', 8.0);
    back('sg_merlion', MX, 8.0, { flip: true });           // (facing right: his spout arcs out over the bay)
    solid(MX + 0.3, MW * 0.55, 0.75);                       // the stone base: a knee-high step
    const JET = MX + MW * 0.56;                             // the spout's foot: a jet that always throws him up and over
    L.sgJet = { x: JET, w: 1.7, s: solid(JET, 1.7, 1.1, 0, { bounce: 9.0, noGrab: true }) };
    b.arc(JET + 1.4, 3.4, 8, 9.0, 6.4);
    b.special(JET + 5.3, 10.4);                                                               // 3: at the top of the Merlion's launch
    const QE = MX + MW + 0.6;                               // the edge of the park: Jubilee Bridge goes on over the water
    ground(MP, QE, 'sgprom'); L.sgJoins.push(QE);
    const JB = QE - 0.2, JBW = aw('sg_jubilee', 2.0);
    for (let i = 0; i < 2; i++) back('sg_jubilee', JB + i * (JBW - 0.4), 2.0, { y: -1.15, flip: i === 1 });
    const JE = JB + 2 * JBW - 0.4;
    ground(QE, JE, 'sgdeck'); L.sgWater.push([QE, JE, WY]);
    L.sgLife.push(['sg_egret1', QE + 6, 11.5, 'fly'], ['sg_mynah1', JE - 4, 12.0, 'fly']);
    b.coins(QE + 10.0, 2.2, 4, 1.0); lean('sg_pot', QE + 16.0, 2.0, 1.35); b.coins(JE - 7.0, 2.6, 3, 0.9);

    // ---------- 4. the Esplanade: its stage to hop up, the spiky dome (the view changes to the gardens at dusk behind it) ----------
    L.sgJoins.push(JE);
    lean('sg_pot', JE + 2.0, 2.0, 1.35); L.sgLife.push(['sg_jogger', JE + 8, 0, 'jog']);
    const STG = JE + 5.0, STW = aw('sg_stage', 5.0);
    back('sg_stage', STG, 5.0);
    solid(STG + STW * 0.2, STW * 0.6, 0.85); b.ledge(STG + STW * 0.12, 4.85, STW * 0.76);   // (its steps, and the top of its roof)
    b.coins(STG + 1.2, 6.0, 6, 1.1);
    const EX = STG + STW + 1.5, EW = aw('sg_esplanade', 9.5);
    back('sg_esplanade', EX, 9.5);
    swapAt(EX + EW / 2, 'gardens', 'behind the Esplanade dome (wide and tall)');
    prop('sg_frangipani', EX - 1.4, 4.0); hop('sg_bench', EX + 3.0, 1.0); lean('sg_pot', EX + EW - 4.0, 2.0, 1.35);
    b.coins(EX + 6.0, 2.2, 4, 1.0); b.coins(EX + 12.0, 3.0, 4, 1.0);
    L.sgGold = [MX - 10, EX + EW / 2];

    // ---------- 5. the Helix Bridge at dusk: up its ramp, the coins follow its spiral, down the other end into the gardens ----------
    const HX = EX + EW + 2.0, HEW = aw('sg_helixend', H_('sg_helixend')), HSW = aw('sg_helix', 4.0), DY = 1.57, HB = DY - 1.85;
    ground(JE, HX + 2.68, 'sgprom');
    back('sg_helixend', HX, H_('sg_helixend'), { y: HB, flip: true });
    b.slope(HX + 2.68, 0.0, HX + 9.58, DY); L.camFloor.push([HX + 2.68, HX + 9.58, 0, DY]);
    const HS = HX + HEW - 0.3;
    const H2 = HS + HSW - 0.3;
    L.sgHelix = { x0: HX + HEW, x1: H2, hb: HB, eh: H_('sg_helixend'), dy: DY };   // (the span between the two end arches is drawn whole, so its spiral never breaks)
    back('sg_helixend', H2, H_('sg_helixend'), { y: HB });
    ground(HX + 9.58, H2 + 5.5, 'sghelix', DY); L.sgWater.push([HX + 8.0, H2 + 7.5, WY]);
    lean('sg_pot', HS + 6.0, 2.0, 1.35, DY); lean('sg_pot', HS + 19.0, 2.0, 1.35, DY);   // (planters on the deck: lean, then over)
    for (let i = 0; i < 14; i++) { const x = HS + 1.0 + i * 1.9; L.coins.push({ x, y: DY + 1.6 + 1.1 * Math.sin(i * 0.9) }); }   // (along the spiral: jump in time)
    b.slope(H2 + 5.5, DY, H2 + 12.4, 0.0); L.camFloor.push([HX + 9.58, H2 + 5.5, DY], [H2 + 5.5, H2 + 12.4, DY, 0]);
    L.sgLife.push(['sg_egret0', HS + 8, 10.8, 'fly'], ['sg_egret1', HS + 20, 11.6, 'fly']);
    const GA = H2 + 12.4;
    L.sgJoins.push(GA);

    // ---------- 6. Gardens by the Bay: the path to the Cloud Forest dome, THE DOOR ----------
    prop('sg_travellers', GA + 1.0, 5.0); prop('sg_dragonfly', GA + 6.6, 3.2);
    hop('sg_orchidwall', GA + 10.5, 1.2); b.coins(GA + 10.8, 2.4, 3, 0.8);
    lean('sg_heliconia', GA + 16.5, 1.8, 1.35); b.coins(GA + 16.9, 2.8, 4, 0.8);
    prop('sg_glamp', GA + 20.5, 1.6); L.sgLife.push(['sg_gardener', GA + 22.0, 0, 'stand'], ['sg_kid', GA + 24.0, 0, 'stand']); back('sg_lily', GA + 25.5, 1.0);
    prop('sg_bamboo', GA + 29.5, 4.5);
    L.sgLife.push(['sg_fly0', GA + 6, 2.6, 'dfly'], ['sg_bfly1', GA + 14, 2.2, 'bfly'], ['sg_fly2', GA + 22, 3.0, 'dfly'], ['sg_bfly0', GA + 27, 2.0, 'bfly']);
    const DH = 9.6, DX = GA + 32.0, DW = aw('sg_dome', DH);   // (sized so its top stays on a phone held sideways)
    back('sg_dome', DX, DH); L.sgDome = { x: DX, w: DW, h: DH };
    const D1 = DX + DW * 0.5;                            // the glass doors in the middle of the dome
    b.kitDoor(D1, { inside: true }); b.kitSwap(D1, 'cf_in'); L.sgDoor1 = D1;
    ground(GA, D1 + 0.5, 'sggarden');

    // ---------- 7. inside the Cloud Forest: pitcher plants bounce him, a mist burst lifts him to the cloud walk, special 4 behind the waterfall ----------
    prop('sg_fern', D1 + 1.6, 1.9); lean('sg_boulder', D1 + 4.6, 1.6, 1.35);
    const PT = D1 + 8.5, PITCH = [['sg_pitch1', 1.5, 3.2, 1.0], ['sg_pitch2', 2.0, 3.8, 1.19], ['sg_pitch3', 2.7, 4.6, 1.41]];
    L.sgPitch = []; let px = PT;
    for (const [k, h, bh, note] of PITCH) {
      const w = aw(k, h); back(k, px, h, { pitch: true });
      solid(px + w * 0.3, w * 0.4, h * 0.82, 0, { noGrab: true });
      const o = bounce(px + w * 0.25, w * 0.5, h * 0.82 + 0.05, bh, note);
      L.sgPitch.push({ x: px, w, h, k, o }); b.arc(px + w / 2 + 0.6, h + 0.6, 4, 2.6, bh * 0.8);
      px += w + 2.4;
    }
    prop('sg_orchids', px + 0.5, 1.6); prop('sg_treefern', px + 3.0, 4.0);
    // the mist vent: its burst always lifts him onto the cloud walk
    const MV = px + 8.5, VW = aw('sg_vent', 1.8);
    back('sg_vent', MV, 1.8, { vent: true });
    L.sgVent = { x: MV, w: VW, s: solid(MV + VW * 0.2, VW * 0.6, 0.55, 0, { bounce: 6.4, noGrab: true }) };
    const CK = MV + VW + 0.6, CKW = aw('sg_cloudwalk', 2.6), CKY = 2.6;   // the cloud walk on its steel legs
    for (let i = 0; i < 3; i++) back('sg_cloudwalk', CK + i * (CKW - 0.3), 2.6, { y: CKY - 2.45 });
    const CKE = CK + 3 * (CKW - 0.3);
    b.ledge(CK + 0.1, CKY + 0.0, CKE - CK - 0.2);
    b.coins(CK + 1.0, CKY + 1.2, 9, 1.4);
    // the waterfall's rock ledge: special 4 waits on it, behind the falling water
    const FL = CKE + 2.0, FLW = aw('sg_falls', 3.6);
    back('sg_falls', FL, 3.6, { falls: true }); L.sgFalls = { x: FL, w: FLW };
    solid(FL + FLW * 0.08, FLW * 0.84, 3.1, 0, { noGrab: true }); b.ledge(FL + FLW * 0.08, 3.1, FLW * 0.84);
    b.special(FL + FLW * 0.72, 4.4);                                                          // 4: behind the waterfall, on the rock ledge
    lean('sg_boulder', FL - 2.0, 1.6, 1.35);
    prop('sg_brom', FL + FLW + 1.4, 1.2); lean('sg_sundew', FL + FLW + 4.0, 1.6, 1.35);
    L.sgLife.push(['sg_bfly2', D1 + 12, 3.4, 'bfly'], ['sg_bfly0', FL - 4, 5.0, 'bfly'], ['sg_bfly1', FL + FLW + 3, 3.0, 'bfly']);
    b.coins(FL + FLW + 2.0, 2.0, 4, 0.9);
    const D2 = FL + FLW + 9.0;                            // out by the far glass doors into the night
    L.sgDoor2 = D2; zone(D1, D2, 2);
    b.kitDoor(D2, { inside: false }); b.kitSwap(D2, 'view');
    ground(D1 + 0.5, D2 + 0.5, 'sgcf');
    L.camFloor.push([D1 - 0.5, D2 + 0.5, 0]);
    back('sg_dome', D2 - DW * 0.5, DH, { out: true }); L.sgDome2 = { x: D2 - DW * 0.5 };
    for (const a of L.kitArt) if (a.out && a.zone === undefined) a.zone = 0;
    const DE = D2 + DW * 0.5;

    // ---------- 8. the Supertrees at night: wall-jump up between two, the skywalk, down the stair tower ----------
    ground(D2 + 0.5, DE + 2.0, 'sgnight');
    L.sgLife.push(['sg_bfly2', DE - 4, 2.4, 'bfly']);
    lean('sg_heliconia', DE - 6.5, 1.8, 1.35); hop('sg_orchidwall', DE - 2.0, 1.2); prop('sg_glamp', DE + 1.0, 1.6);
    const SP = DE + 4.0, SPW = aw('sg_stpair', 11.0), info = SG_ASP.stpair;
    back('sg_stpair', SP, 11.0);
    const IL = SP + info.inL * SPW, IR = SP + info.inR * SPW, GAP = 2.0, MID = (IL + IR) / 2;
    const WL = MID - GAP / 2, WR = MID + GAP / 2, WALK = 11.0 * 0.829;
    solid(SP + SPW * 0.1, WL - SP - SPW * 0.1, WALK - 0.4 - 2.4, 2.4); solid(WR, SP + SPW * 0.9 - WR, WALK - 0.4 - 2.4, 2.4);   // (from just above his head: he runs under, or climbs)
    (L.kitClimbs = L.kitClimbs || []).push({ x: SP + SPW * 0.1, xr: WR, gap: GAP, hL: WALK - 0.4, hR: WALK - 0.4 });
    for (let i = 0, y = 3.0; y < WALK - 1.0; i++, y += 1.45) b.coins(WL + (i % 2 ? GAP - 0.5 : 0.25), y, 1);
    b.ledge(SP + SPW * 0.05, WALK, SPW * 0.93);                                                // the walkway between their canopies
    b.special(MID, WALK + 1.5);                                                               // 5: over the walkway, above the gap
    const SK = SP + SPW * 0.97, SKW = 14.0;                 // the skywalk goes on to a third Supertree and the stair tower
    L.sgSky = { x0: SK - 0.2, x1: SK + SKW, y: WALK };
    b.ledge(SK - 0.2, WALK, SKW + 0.2);
    back('sg_st2', SK + 6.0, 8.9);
    b.coins(SK + 1.0, WALK + 1.0, 8, 1.6);
    lean('sg_heliconia', SK + 7.0, 1.8, 1.35);                                                 // (down below, under the skywalk)
    const ST = SK + SKW - 1.0, TWW = aw('sg_stairs', 9.0);
    back('sg_stairs', ST, 9.0); b.ledge(ST + 0.2, 9.0 * 0.95, TWW - 0.4);
    for (const f of [0.73, 0.5, 0.27]) b.ledge(ST + TWW * 0.25, 9.0 * f, TWW * 0.6);         // (its landings, on the way down)
    prop('sg_st3', SP - 8.0, 6.917); L.sgLife.push(['sg_bfly1', SP - 3, 2.2, 'bfly']);
    b.coins(SP + 0.5, 2.0, 3, 0.9); b.coins(ST + TWW + 1.0, 2.2, 4, 1.0);
    // ---------- 9. the ending: the light show, Marina Bay Sands lit up behind; A waves ----------
    const FX = ST + TWW + 8.0;
    ground(DE + 2.0, FX + 40, 'sgnight');
    b.flag(FX); L.flagY = 0;
    L.sgLife.push(['sg_bfly0', FX - 4, 2.6, 'bfly'], ['sg_bfly2', FX + 5, 3.0, 'bfly']);
    L.sgFinale = true;
    L.finale = FX + 4.5; L.finaleT = 7; L.sgView = FX + 4.5;
    b.wall(FX + 30, 1, 40);
    b.end(FX + 30);
  },
},
];
// Tower Bridge is parked for now (Ladi 2026-10-28): its build and art stay, it just isn't in the game.
const PARKED = ['towerbridge', 'practice'];
const LEVELS = ALL_LEVELS.filter(l => !PARKED.includes(l.id));
// a child's own world: the practice street, then their trips in the order a grown-up picked them
function setTrips(ids) {
  const pick = ['practice', ...ids.filter(id => id !== 'practice' && !PARKED.includes(id))];
  const list = pick.map(id => ALL_LEVELS.find(l => l.id === id)).filter(Boolean);
  LEVELS.length = 0; LEVELS.push(...list);
  return LEVELS;
}

function buildLevel(i) {
  const def = LEVELS[i];
  const b = makeBuilder(def.area);
  def.build(b);
  const L = b.L;
  L.solids = L.solids.filter(s => s.w > 0);
  L.solids.sort((a, c) => a.x - c.x);
  L.id = def.id; L.name = def.name; L.index = i;
  return L;
}

/* ---------- game state ---------- */
function newGame(levelIndex, tune) {
  const L = buildLevel(levelIndex);
  const P = physics(Object.assign({}, DEFAULT_TUNE, tune || {}));
  const g = {
    L, P, t: 0, time: 0, mode: 'run', done: false, failed: false,
    p: { x: L.startX, y: L.startY || 0, vx: 0, vy: 0, dir: 1, onGround: true, wall: 0, coyote: 0, buffer: 0, rising: false,
         invuln: 0, wallCoyote: 0, wallSide: 0, landT: 0, airT: 0, lockT: 0 },
    coins: 0, coinsTotal: L.coins.length,
    got: L.specials.map(() => false),
    bubbles: 3, safe: [], safeT: 0, bubble: null, flag: null,
    coinList: L.coins.map(c => ({ x: c.x, y: c.y, taken: false })),
    specialList: L.specials.map(s => ({ x: s.x, y: s.y, taken: false })),
    enemies: L.enemies.map((e, i) => Object.assign({}, e, { vx: 0, vy: 0, edir: -1, alive: true, dead: 0, x0e: e.x, y0e: e.y, ph: FIXED_PH ? (i * 2.399 + 1.3) % 6 : Math.random() * 6 })),   // (fixed phases when a run is recorded for replay)
    events: [], held: false,
    bonus: 0, passList: (L.passes || []).map(s => ({ x: s.x, y: s.y, taken: false })),

    race: L.race ? newRace(L) : null,
  };
  if (g.race) { g.p.x = g.race.a.x - PW / 2; }
  return g;
}

function overlaps(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

function solidsNear(L, x0, x1) {
  const out = [];
  for (const s of L.solids) { if (s.x > x1) break; if (s.x + s.w >= x0) out.push(s); }
  return out;
}

function step(g, dt, input) {
  // input: { held: bool, pressed: bool }
  if (input.pressed) g.p.buffer = g.P.buffer;
  g.held = input.held;
  if (input.down && g.mode === 'run' && !g.L.race) dropDown(g);
  let acc = dt;
  while (acc > 1e-9) { const h = Math.min(STEP, acc); tick(g, h); acc -= h; g.p.buffer = Math.max(0, g.p.buffer - h); }
}

// in the water a swipe down or a tap both send A on a deep dive (not near the far bank, where he climbs out)
const DIVE_T = 1.4, DIVE_D = 1.75;
function startDive(g) {
  const p = g.p, v = g.P.speed + (p.ground.belt || 0);
  if (p.diveT || p.x + PW / 2 > p.ground.x + p.ground.w - v * (DIVE_T - 0.2)) return;
  p.diveT = 1e-6;
}
function diveDip(t) {   // down steeply, a glide along the bottom, then up
  const e = k => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, k)));
  return t < 0.4 ? DIVE_D * e(t / 0.4) : t < 0.9 ? DIVE_D : DIVE_D * (1 - e((t - 0.9) / (DIVE_T - 0.9)));
}

// swipe/press down: fall through the ledge A is standing on (or just hopped off with the same touch)
function dropDown(g) {
  const p = g.p;
  if (p.zip) { p.zip.tgt = -1; p.zip.tt = 0.55; return; }
  if (p.ride) { p.duck = true; return; }   // on the zip line: drop lower
  if (p.onGround && p.ground && p.ground.swim) { startDive(g); return; }   // swimming: dive under
  p.buffer = 0;
  const on = p.onGround && p.ground && p.ground.h === undefined && !p.ground.slope ? p.ground
    : (!p.onGround && p.lastOne && g.t - p.lastOneT < 0.4 ? p.lastOne : null);
  if (on) { p.dropY = on.y; p.onGround = false; p.coyote = 0; }
  if (!p.onGround) { p.vy = Math.min(p.vy, 0); p.rising = false; p.coyote = 0; }
}

function hurt(g, why) {
  const p = g.p;
  if (g.mode !== 'run') return;
  if (why !== 'fall' && p.invuln > 0) return;
  g.bubbles -= 1;
  g.events.push({ type: 'hurt', why });
  if (g.bubbles < 0) { g.bubbles = 0; g.mode = 'fail'; g.failed = true; g.events.push({ type: 'fail' }); return; }
  // float back to where A was standing a moment ago
  let target = g.safe.length ? g.safe[0] : { x: g.L.startX, y: g.L.startY || 0, dir: 1 };
  for (let i = g.safe.length - 1; i >= 0; i--) { if (g.t - g.safe[i].t >= 1.4) { target = g.safe[i]; break; } }
  const fy = floorAt(g.L, p.x + PW / 2);
  if (why !== 'fall' && p.y < fy + 1.5 && target.y > fy + 1.0) {   // hit down on the street: stay at street level, never float back up to a tower or roof (Ladi 2026-11-09)
    const lv = g.safe.filter(s => Math.abs(s.y - fy) < 0.3);
    target = lv.length ? lv[lv.length - 1] : { x: p.x - 1.5, y: fy, dir: 1 };
  }
  g.bubble = { fx: p.x, fy: p.y, tx: target.x, ty: target.y, dir: target.dir, t: 0, dur: 1.1 };
  g.mode = 'bubble';
}

// Tower Bridge road leaves: angle from when they started lifting, as two slopes from the hinges
function leafAngle(g) {
  const B = g.L.bascule; if (!B || g.liftAt === undefined) return 0;
  const k = Math.min(1, (g.t - g.liftAt) / B.dur);
  return B.maxA * k * k * (3 - 2 * k);
}
function leafSlopes(g) {
  const B = g.L.bascule, a = leafAngle(g), dx = B.len * Math.cos(a), dy = B.len * Math.sin(a);
  return [
    { slope: true, id: 'leafA', x0: B.xa, y0: B.y, x1: B.xa + dx, y1: B.y + dy, leaf: 1 },
    { slope: true, id: 'leafB', x0: B.xb - dx, y0: B.y + dy, x1: B.xb, y1: B.y, leaf: 1 },
  ];
}
// rides (Cape Town): the Blue Train and the cable car carry A along their track (a list of points). He can't run or jump on them;
// on the train a tap pops him up out of his seat and a swipe down ducks him (r.input). r.hits: places he must duck under.
function rideY(r, x) {
  const P = r.pts; if (x <= P[0][0]) return P[0][1];
  for (let i = 1; i < P.length; i++) if (x <= P[i][0]) { const a = P[i - 1], c = P[i]; return a[1] + (c[1] - a[1]) * (x - a[0]) / (c[0] - a[0]); }
  return P[P.length - 1][1];
}
function rideTick(g, dt) {
  const p = g.p, R = g.L.rides;
  if (!p.ride) {
    let i = p.rideN || 0;
    while (R[i] && p.x > R[i].x0 + 3) { i++; p.rideN = i; }   // (a ride he got past without boarding, e.g. over the roofs: the next one still works)
    const r = R[i];
    if (!r || p.x + PW / 2 < r.x0 || p.x > r.x0 + 3 || Math.abs(p.y - r.pts[0][1]) > 6) return false;
    p.ride = { i, s: r.x0, off: 0, tgt: 0, tt: 0, t: 0, v: 0, end: 0, y0: p.y };
    g.events.push({ type: 'ride', kind: r.kind });
  }
  const z = p.ride, r = R[z.i], end = r.pts[r.pts.length - 1][0];
  z.t += dt;
  if (r.popTap && p.buffer > 0 && z.t > r.w0 + 0.3) {   // (Barcelona's bubble: a tap pops it and he drops from where he is)
    p.buffer = 0; p.ride = null; p.rideN = z.i + 1;
    p.vy = 0; p.vx = 0; p.onGround = false; p.dir = 1; p.coyote = 0; p.rising = false;
    g.events.push({ type: 'rideEnd', kind: r.kind, pop: true });
    return true;
  }
  if (r.decks) {   // (Sydney's ferry, Ladi 2026-11-10: a tap hops him between its two decks; z.dz is his height above the lower one)
    if (p.buffer > 0) { if (!z.hop) { z.hop = true; z.jvy = r.jump; z.toDeck = 1 - (z.deck || 0); g.events.push({ type: 'jump', x: p.x, y: p.y }); } p.buffer = 0; }
    if (z.hop) {
      z.jvy -= r.grav * dt; z.dz = (z.dz || 0) + z.jvy * dt;
      if (z.jvy < 0 && z.dz <= r.decks[z.toDeck]) { z.dz = r.decks[z.toDeck]; z.deck = z.toDeck; z.hop = false; z.jvy = 0; }
    }
    p.duck = false;
  } else if (r.input) {
    if (p.buffer > 0) { if (r.jump) { if (!(z.jy > 0)) { z.jy = 0.001; z.jvy = r.jump; } } else { z.tgt = 1; z.tt = 0.55; } p.buffer = 0; }
    if (z.jy > 0) { z.jvy -= r.grav * dt; z.jy += z.jvy * dt; if (z.jy <= 0) { z.jy = 0; z.jvy = 0; } }
    if (p.duck) { z.tgt = -1; z.tt = 0.55; p.duck = false; }
    z.tt -= dt; if (z.tt <= 0) z.tgt = 0;
    z.off += (z.tgt - z.off) * Math.min(1, dt * 10);
  } else { p.buffer = 0; p.duck = false; }
  if (z.t > r.w0 && z.s < end) {
    let vtop = r.v;
    if (r.swoop) { const k = (rideY(r, z.s + 0.5) - rideY(r, z.s - 0.5)); vtop *= Math.max(0.7, Math.min(1.9, 1 - k * r.swoop)); }   // (Barcelona cable car: faster downhill)
    if (r.boosts) for (const b of r.boosts) if (z.s >= b[0] && z.s <= b[1]) { z.boostT = 1.2; }
    if (z.boostT > 0) { z.boostT -= dt; vtop *= 1.45; }                                                                    // (Barcelona scooter: boost arrows)
    let vmax = Math.min(vtop, Math.max(r.vEnd || 0, Math.sqrt(2 * r.acc * Math.max(0, end - z.s)) + 0.5));   // (r.vEnd: slows only to walking pace)
    if (z.wx !== undefined) vmax = Math.sqrt(2 * r.acc * Math.max(0, end - z.s)) + 0.1;                         // (he's walking out: the cabin glides to a stop)
    z.v = z.v > vmax ? Math.max(vmax, z.v - r.acc * 2.5 * dt) : Math.min(vmax, z.v + r.acc * (z.boostT > 0 ? 4 : 1.6) * dt);
    const ps = z.s; z.s = Math.min(end, z.s + z.v * dt);
    for (const m of r.ramps || []) if (ps < m.x && z.s >= m.x) { z.jy = Math.max(0, z.jy || 0) + (m.h || 0) + 0.001; z.jvy = Math.max(z.jvy || 0, m.v); g.events.push({ type: 'jump' }); }   // (kicker ramps launch him)
    for (const h of r.hits || []) if (ps < h.x && z.s >= h.x) {
      const hit = z.off > -0.45 || z.jy > 0;
      if (hit && h.kind === 'ctbonk') { const n = Math.min(3, g.coins); g.coins -= n; z.lost = n; }
      z[h.kind] = { t: z.t, hit };
      g.events.push({ type: h.kind, hit, x: z.s });
    }
    // h.w (Singapore's bridges): a long low deck; once he's under it he stays ducked (and can't jump) until he's out the other side
    for (const h of r.hits || []) if (h.w && z.s >= h.x && z.s < h.x + h.w) { z.tgt = -1; z.tt = Math.max(z.tt, 0.15); z.jy = 0; z.jvy = 0; p.buffer = 0; }
  }
  // r.walkOut (Barcelona cable car, Ladi 2026-11-09): this far from the station he starts walking out at running pace while the cabin
  // glides on and stops; the ride ends once it has stopped, with him already out on the deck and running
  if (r.walkOut && z.wx === undefined && z.s >= end - r.walkOut) z.wx = z.s;
  if (z.wx !== undefined) {
    z.wx += r.vEnd * dt;
    if (z.s >= end) {
      p.ride = null; p.rideN = z.i + 1;
      p.x = z.wx - PW / 2; p.y = r.exitY + 0.02; p.vy = 0; p.vx = r.vEnd; p.onGround = false; p.dir = 1; p.coyote = 0;
      g.events.push({ type: 'rideEnd', kind: r.kind });
      return true;
    }
    p.x = z.wx - PW / 2; p.y = (z.wx < end ? rideY(r, z.wx) : r.exitY) + r.seat;
    p.vx = r.vEnd; p.vy = 0; p.onGround = false; p.coyote = 0; p.wall = 0; p.blocked = false; p.airT = 0; p.dir = 1; p.rising = false;
    pickUp(g);
    return true;
  }
  if (z.s >= end) {
    z.end += dt;
    if (z.end >= r.w1) {
      p.ride = null; p.rideN = z.i + 1;
      p.x = end - PW / 2 + (r.exitDx || 0); p.y = r.exitY + 0.02; p.vy = 0; p.vx = 0; p.onGround = false; p.dir = 1; p.coyote = 0;
      g.events.push({ type: 'rideEnd', kind: r.kind });
      return true;
    }
  }
  const y = rideY(r, z.s);
  p.x = z.s - PW / 2; p.y = y + r.seat + (z.off > 0 ? z.off * r.up : z.off * r.down) + (z.jy || 0) + (z.dz || 0);
  if (r.drift && z.t > r.w0) { const k = Math.min(1, (z.t - r.w0) / 0.8); p.x += k * r.drift[0] * Math.sin((z.t - r.w0) * 1.3); p.y += k * r.drift[1] * Math.sin((z.t - r.w0) * 2.1); }   // (the bubble wanders about as it floats)
  if (r.liftIn && z.t < r.liftIn) { const k = z.t / r.liftIn; p.y = z.y0 + (p.y - z.y0) * k * k * (3 - 2 * k); }   // (lifted up into his seat: the Barcelona giant)
  p.vx = z.v; p.vy = 0; p.onGround = false; p.coyote = 0; p.wall = 0; p.blocked = false; p.airT = 0; p.dir = 1; p.rising = false;
  pickUp(g);
  return true;
}
function pickUp(g) {
  const p = g.p;
  const cx = p.x + PW / 2, cy = p.y - (p.dip || 0) + PH / 2;
  for (const c of g.coinList) {
    if (c.taken || Math.abs(c.x - cx) > 1 || Math.abs(c.y - cy) > 1.3) continue;
    if (Math.abs(c.x - cx) < PW / 2 + 0.32 && Math.abs(c.y - cy) < PH / 2 + 0.32) { c.taken = true; g.coins++; g.events.push({ type: 'coin', x: c.x, y: c.y }); }
  }
  g.specialList.forEach((s, i) => {
    if (s.taken) return;
    if (Math.abs(s.x - cx) < PW / 2 + 0.5 && Math.abs(s.y - cy) < PH / 2 + 0.5) { s.taken = true; g.got[i] = true; g.events.push({ type: 'special', x: s.x, y: s.y, i }); }
  });

}
function tick(g, dt) {
  const p = g.p, P = g.P, L = g.L;
  g.t += dt;
  if (L.race) { tickRace(g, dt); return; }
  if (g.mode === 'run' || g.mode === 'bubble') g.time += dt;
  updateEnemies(g, dt);
  if (g.mode === 'bubble') {
    const B = g.bubble; B.t += dt;
    const k = Math.min(1, B.t / B.dur), e = k * k * (3 - 2 * k);
    p.x = B.fx + (B.tx - B.fx) * e; p.y = B.fy + (B.ty - B.fy) * e + Math.sin(k * Math.PI) * 2.2;
    if (k >= 1) { g.mode = 'run'; p.vx = 0; p.vy = 0; p.dir = B.dir; p.invuln = 1.8; p.onGround = false; p.rising = false; p.buffer = 0; g.safe = []; g.events.push({ type: 'pop' }); }
    return;
  }
  if (g.mode === 'flag') { tickFlag(g, dt); return; }
  if (g.mode !== 'run') return;
  // the airport clock: miss it and the gate closes
  if (L.timed && g.time >= L.timed + g.bonus) { g.mode = 'fail'; g.failed = true; g.late = true; g.events.push({ type: 'fail', why: 'late' }); return; }

  p.invuln = Math.max(0, p.invuln - dt);
  p.lockT = Math.max(0, p.lockT - dt);
  p.landT = Math.max(0, p.landT - dt);
  if (!g.held) p.rising = false;
  if (L.rides && rideTick(g, dt)) return;

  // jumping
  if (p.buffer > 0 && p.zip) { p.zip.tgt = 1; p.zip.tt = 0.55; p.buffer = 0; }   // on the zip line: lift up
  if (p.buffer > 0 && p.onGround && p.ground && p.ground.swim) { startDive(g); p.buffer = 0; }
  if (p.buffer > 0 && (p.onGround || p.coyote > 0) && p.ground && p.ground.noJump) p.buffer = 0;   // (Sydney's giant slide: he slides all the way down)
  if (p.buffer > 0) {
    if (p.onGround || p.coyote > 0) {
      p.vy = P.jumpV; p.onGround = false; p.coyote = 0; p.buffer = 0; p.rising = true; p.airT = 0; p.cut = true;
      g.events.push({ type: 'jump', x: p.x, y: p.y });
    } else if (p.wall || p.wallCoyote > 0) {
      const side = p.wall || p.wallSide;
      p.dir = -side; p.vy = P.wallJumpV; p.buffer = 0; p.rising = true; p.wall = 0; p.wallCoyote = 0; p.lockT = 0.08; p.cut = false;
      g.events.push({ type: 'wjump', x: p.x + (side > 0 ? PW : 0), y: p.y + 0.6, side });
    }
  }

  // gravity
  let grav = p.vy > 0 ? (p.cut && !p.rising ? P.gCut : P.gUp) : P.gFall;
  const wind = L.wind && p.x > L.wind[0] && p.x < L.wind[1] ? L.wind : null;
  if (wind && p.vy <= 0) grav *= wind[3];
  p.vy -= grav * dt;
  if (p.vy < -P.maxFall) p.vy = -P.maxFall;
  if (wind && p.vy < -9) p.vy = -9;
  if (p.wall && p.vy < -P.wallSlide) p.vy = -P.wallSlide;

  // perfume mist slows A down; travelators carry him (and keep carrying him through a jump off one)
  let slow = 1;
  if (L.mists) for (const m of L.mists) if (mistOn(m, g.t) && p.x + PW > m.x0 && p.x < m.x1 && p.y < m.top) slow = m.slow;
  if (slow < 1 && !p.misted) g.events.push({ type: 'mist' });
  p.misted = slow < 1;
  // a beam of light that floats A up (Rome's Pantheon): [from, to, up to y, rising speed, part of his running speed left]
  p.beam = null;
  if (L.updrafts) for (const u of L.updrafts) if (p.x + PW / 2 > u[0] && p.x + PW / 2 < u[1] && p.y < u[2] && !p.ride) {
    p.beam = u; slow = Math.min(slow, u[4]); p.vy = Math.max(p.vy, u[3] * Math.min(1, (u[2] - p.y) / 1.2 + 0.12));
    if (p.onGround) { p.onGround = false; p.ground = null; p.coyote = 0; }
  }
  const belt = p.onGround ? (p.ground && p.ground.belt) || 0 : p.carry || 0;
  p.carry = belt;
  p.vx = p.dir * P.speed * slow + belt;
  if (wind) p.vx += p.onGround ? wind[2] * 0.25 : wind[2];

  // moving platforms: set their height for this moment, and carry A if he is standing on one
  if (L.movers) for (const m of L.movers) {
    if (m.ax === 'x') {   // boats slide sideways and carry A with them
      const nx = moverX(m, g.t) + m.off;
      if (p.onGround && p.ground === m) p.x += nx - (moverX(m, g.t - dt) + m.off);
      m.x = nx; continue;
    }
    if (m.trig) {
      m.trigT = g[m.trig]; m.y = moverY(m, g.t - dt);   // (movers are shared between game copies: work from this game's own trip)
      const inside = p.x + PW > m.x + 0.4 && p.x < m.x + m.w, on = inside && p.onGround && Math.abs(p.y - m.y) < 0.12;
      if (inside && p.y > m.y - 0.12 && p.y < m.y + 6 && g[m.trig] === undefined) g[m.trig] = g.t + (m.d0 || 0);   // A is in the car: off it goes
      m.trigT = g[m.trig];
      const ty = moverY(m, g.t);
      if (on) { p.y = ty; p.ground = m; }
      else if (inside && p.y < ty && p.y > ty - 2.5) { p.y = ty; p.vy = 0; p.onGround = true; p.ground = m; p.rising = false; }   // a hop in a moving car: the floor catches him
      m.y = ty; continue;
    }
    const ny = moverY(m, g.t);
    if (p.onGround && p.ground === m) p.y += ny - moverY(m, g.t - dt);
    m.y = ny;
  }

  // horizontal move
  const wasGround = p.onGround;
  let hitWall = null;
  p.x += p.vx * dt;
  const box = { x: p.x, y: p.y, w: PW, h: PH };
  for (const s of solidsNear(L, p.x - 2, p.x + 3)) {
    if (overlaps(box, s)) {
      // stepping off an escalator onto the floor at its end
      if (p.slope && s.y + s.h - p.y < 0.2) { p.y = s.y + s.h; box.y = p.y; continue; }
      if (s.backOnly && p.vx >= 0) continue;   // a doorway A has gone through: it only stops him going back
      if (p.vx > 0) p.x = s.x - PW - 1e-6; else p.x = s.x + s.w + 1e-6;
      box.x = p.x; hitWall = s;
    }
  }

  // vertical move
  const prevY = p.y;
  p.y += p.vy * dt;
  box.y = p.y; box.x = p.x;
  p.onGround = false;
  for (const s of solidsNear(L, p.x - 2, p.x + 3)) {
    if (s.backOnly) continue;
    if (overlaps(box, s)) {
      if (p.vy <= 0) { p.y = s.y + s.h; p.vy = 0; p.onGround = true; p.ground = s; }
      else { p.y = s.y - PH - 1e-6; p.vy = 0; p.rising = false; g.events.push({ type: 'bonk' }); }
      box.y = p.y;
    }
  }
  if (p.vy <= 0) {
    for (const o of L.oneways) {
      if (p.x + PW <= o.x || p.x >= o.x + o.w) continue;
      if (p.dropY !== undefined && o.y >= p.dropY - 0.05) continue;
      if (prevY >= o.y - 1e-4 && p.y <= o.y) { p.y = o.y; p.vy = 0; p.onGround = true; p.ground = o; }
    }
  }
  if (p.dropY !== undefined && (p.onGround || p.y < p.dropY - 0.8)) p.dropY = undefined;
  if (p.onGround) { p.lastOne = p.ground.h === undefined && !p.ground.slope ? p.ground : null; p.lastOneT = g.t; }

  // escalators: feet follow the slope (the higher end of A's box decides)
  const wasSlope = p.slope; p.slope = null;
  if (L.bascule && g.liftAt === undefined && p.x > L.bascule.trig) g.liftAt = g.t;
  const slopes = L.bascule ? (L.slopes || []).concat(leafSlopes(g)) : L.slopes;
  const yIn = p.y;
  if (slopes && p.vy <= 0) for (const sl of slopes) {
    if (p.x + PW < sl.x0 || p.x > sl.x1) continue;
    const at = x => sl.y0 + (sl.y1 - sl.y0) * Math.min(1, Math.max(0, (x - sl.x0) / (sl.x1 - sl.x0)));
    const ys = Math.max(at(p.x), at(p.x + PW));
    const same = wasSlope === sl || (wasSlope && sl.id && wasSlope.id === sl.id);
    const stepUp = wasGround && !wasSlope && ys > prevY && ys - prevY < 0.35;   // running into the foot of a stair from the flat
    const py = sl.id ? yIn : p.y;   // pieces of one long slide: judge each against where A was, and keep the highest
    if (sl.id && p.slope && p.slope.id === sl.id && ys <= p.y) continue;
    if ((prevY >= ys - 0.05 && py <= ys) || (same && Math.abs(py - ys) < 0.7) || stepUp) {
      p.y = ys; p.vy = 0; p.onGround = true; p.ground = sl; p.slope = sl;
    }
  }
  if (p.onGround && !wasGround) { p.dir = 1; p.landT = 0.14; g.events.push({ type: 'land', x: p.x, y: p.y, hard: p.airT > 0.5 }); }
  if (p.onGround) { p.coyote = P.coyote; p.airT = 0; p.wall = 0; p.cut = false; }
  // fly-tipped mattress: landing on it bounces A up high
  if (p.onGround && !wasGround && p.ground && (p.ground.kind === 'mattress' || p.ground.bounce) && (!p.ground.jet || mistOn(p.ground.jet, g.t))) {
    p.vy = Math.sqrt(2 * P.gUp * (p.ground.bounce || 5.2)); p.ground.bounceT = g.t; p.onGround = false; p.rising = false; p.cut = false; p.coyote = 0;
    g.events.push({ type: 'bounce', x: p.x, y: p.y, note: p.ground.note, talk: p.ground.talk });
  }
  else { p.coyote = Math.max(0, p.coyote - dt); p.airT += dt; }

  // walls: vault small things, turn around at big ones on the ground, slide down them in the air
  const wasBlocked = p.blocked; p.blocked = false;
  if (hitWall) {
    const rise = hitWall.y + hitWall.h - p.y;
    if (p.onGround && rise <= P.vaultMax && rise > 0 && !(p.ground && p.ground.trig)) {   // (no hopping out of a moving lift: he waits and walks out)
      p.vy = Math.sqrt(2 * P.gUp * (rise + 0.35)); p.onGround = false; p.rising = false; p.coyote = 0;
      g.events.push({ type: 'vault' });
    } else if (p.onGround) {
      if (p.dir > 0) { if (!wasBlocked) g.events.push({ type: 'block' }); p.blocked = true; }
      else p.dir = 1;
    } else if (p.lockT <= 0 && !hitWall.noGrab) {   // (lift shaft walls are too smooth to cling to)
      if (!p.wall) g.events.push({ type: 'grab' });
      p.wall = p.dir; p.wallSide = p.dir;
    }
  } else if (p.wall) {
    // still touching?
    const probe = { x: p.x + p.wall * 0.03, y: p.y, w: PW, h: PH };
    if (!solidsNear(L, p.x - 2, p.x + 3).some(s => overlaps(probe, s))) { p.wall = 0; p.wallCoyote = 0.08; }
  }
  if (!p.wall) p.wallCoyote = Math.max(0, p.wallCoyote - dt);

  // the zip line (Marina XLine): off the launch deck A rides a trolley down the cable; a tap lifts his legs up, a swipe down drops him lower
  const Z = L.zip;
  if (Z && !p.zip && !p.zipDone && p.x + PW / 2 >= Z.x0 && p.x < Z.x0 + 2 && p.y > Z.y0 - Z.hang - 1.0) { p.zip = { x: p.x, off: 0, tgt: 0, tt: 0 }; g.events.push({ type: 'zip' }); }
  if (p.zip) {
    const z = p.zip; z.tt -= dt; if (z.tt <= 0) z.tgt = 0;
    z.off += (z.tgt - z.off) * Math.min(1, dt * 7);
    z.x += Z.v * dt;
    const cx = Math.min(Z.x1, z.x + PW / 2), ly = Z.y0 + (Z.y1 - Z.y0) * (cx - Z.x0) / (Z.x1 - Z.x0);
    p.x = z.x; p.y = ly - Z.hang + z.off; p.vy = 0; p.onGround = false; p.coyote = 0; p.wall = 0; p.blocked = false; p.airT = 0; p.dir = 1;
    if (z.x + PW / 2 >= Z.x1) { p.zip = null; p.zipDone = true; p.y = Z.land + 0.02; }
  }

  // remember safe spots for the bubble
  g.safeT -= dt;
  if (p.onGround && g.safeT <= 0) {
    g.safeT = 0.2;
    const onSolid = p.ground && p.ground.w >= 2.0 && !p.ground.mover;
    if (onSolid) { g.safe.push({ x: p.x, y: p.y, dir: p.dir, t: g.t }); if (g.safe.length > 40) g.safe.shift(); }
  }

  // diving under the water in the lazy river (swipe down): down and back up in a second
  if (p.diveT) {
    p.diveT += dt;
    if (p.diveT >= DIVE_T || !(p.onGround && p.ground && p.ground.swim)) { p.diveT = 0; p.dip = 0; }
    else p.dip = diveDip(p.diveT);
  }
  // pick-ups
  pickUp(g);
  const cx = p.x + PW / 2, cy = p.y - (p.dip || 0) + PH / 2;
  for (const s of g.passList) {
    if (s.taken || Math.abs(s.x - cx) > PW / 2 + 0.5 || Math.abs(s.y - cy) > PH / 2 + 0.5) continue;
    s.taken = true; g.bonus += L.passBonus || 2; g.events.push({ type: 'pass', x: s.x, y: s.y });
  }

  // enemies
  for (const e of g.enemies) {
    if (!e.alive || e.fly) continue;
    const eb = { x: e.x, y: e.y, w: e.w, h: e.h };
    // pigeons are small: A hops them automatically on the ground
    if ((e.kind === 'pigeon' || e.kind === 'raven') && !e.fly && p.onGround && Math.abs(p.y - e.y) < 0.3) {
      const ahead = p.dir > 0 ? e.x - (p.x + PW) : p.x - (e.x + e.w);
      if (ahead > 0 && ahead < 0.55) { p.vy = Math.sqrt(2 * P.gUp * 1.25); p.onGround = false; p.coyote = 0; g.events.push({ type: 'vault' }); }
    }
    if (!overlaps({ x: p.x, y: p.y, w: PW, h: PH }, eb)) continue;
    const feet = p.y, prevFeet = prevY;
    if (p.vy < 0 && prevFeet >= e.y + e.h * 0.45) {
      e.alive = false; e.dead = 1; e.vy = 4;
      p.vy = P.bounceV; p.rising = true; p.wall = 0; p.cut = false;
      g.coins += 1;
      g.events.push({ type: 'stomp', x: e.x + e.w / 2, y: e.y + e.h, kind: e.kind });
    } else {
      hurt(g, 'enemy');
      return;
    }
  }

  // water: falling into the lazy river or the lagoon costs a bubble
  if (L.wetKill) for (const [a, c, top, bot] of L.wetKill) if (p.x + PW / 2 > a && p.x + PW / 2 < c && p.y < top && p.y > bot) { g.events.push({ type: 'splash', x: p.x + PW / 2 }); hurt(g, 'fall'); return; }
  // falling out of the world
  if (p.y < (L.killY !== undefined ? L.killY : -7)) { hurt(g, 'fall'); return; }

  // finish flag
  if (L.flagX && p.x + PW >= L.flagX && p.dir > 0) {
    g.mode = 'flag';
    const grab = Math.max(0, Math.min(9, p.y - (L.flagY || 0) + PH * 0.6));
    g.flag = { grab, t: 0, y0: p.y, slid: false };
    p.x = L.flagX - PW + 0.05; p.vy = 0; p.wall = 0;
    g.events.push({ type: 'flag', grab });
  }
}

/* ---------- the desert race: two cars on a height line ---------- */
// height of the race ground at x: smooth (cosine) between points, straight where a point says 'lin' (the rock ramp)
function raceH(L, x) {
  const P = L.race.pts;
  if (x <= P[0][0]) return P[0][1];
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], c = P[i + 1];
    if (x <= c[0]) { const k = (x - a[0]) / (c[0] - a[0]); return c[3] === 'lin' ? a[1] + (c[1] - a[1]) * k : a[1] + (c[1] - a[1]) * (0.5 - 0.5 * Math.cos(Math.PI * k)); }
  }
  return P[P.length - 1][1];
}
function raceKind(L, x) {
  const P = L.race.pts; let k = P[0][2];
  for (const q of P) { if (q[0] > x) break; k = q[2]; }
  return k;
}
const RACE = {
  g: 26,
  a: { half: 1.1, hard: 12.5, soft: 10.4, river: 12.0, storm: 9.6, slope: 15, k: 1.6 },
  j: { half: 3.24, hard: 14.5, soft: 11.9, river: 13.5, storm: 10.5, slope: 20, k: 1.4 },
  boostV: 9, boostT: 1.0, cost: 0.34, refill: 0.05, slip: 0.22,
  jRefill: 0.06, jBoostV: 7, rb: 0.17,   // the Jeep has boosts too
};
function raceCar(x, half) { return { x, y: 0, vx: 0, vy: 0, air: false, bt: 0, half, airT: 0 }; }
function newRace(L) {
  const S = L.race.S;
  // side by side on the line: the Jeep in the lane behind, both noses on the line
  return { a: raceCar(S - RACE.a.half, RACE.a.half), j: raceCar(S - RACE.j.half, RACE.j.half), meter: 1, jMeter: 0.7, won: null, margin: 0, stopT: 0, slip: false };
}
function driveCar(g, c, T, dt, vt) {
  const L = g.L, H = x => raceH(L, x);
  const sl = (H(c.x + 0.3) - H(c.x - 0.3)) / 0.6, cs = sl / Math.sqrt(1 + sl * sl);
  const k = c.bt > 0 ? 3 : T.k;
  if (!c.air && vt > 0) c.vx += ((vt - c.vx) * k - RACE.g * 0.6 * cs * (T.slope / 15)) * dt;   // (braking after the finish is done in tickRace)
  else c.vx += (vt - c.vx) * 0.15 * dt;
  c.vx = Math.max(vt <= 0 ? 0 : 2.5, c.vx);
  const nx = c.x + c.vx * dt;
  if (!c.air) {
    // the ground drops away faster than gravity pulls the car down: it takes off
    const gy = H(nx), vg = (gy - c.y) / dt;
    if (vg < c.vy - RACE.g * dt - 0.05) { c.air = true; c.airT = 0; c.x = nx; c.vy -= RACE.g * dt; c.y += c.vy * dt; }
    else { c.vy = vg; c.x = nx; c.y = gy; }
  } else {
    c.airT += dt; c.vy -= RACE.g * dt; c.x = nx; c.y += c.vy * dt;
    const gy = H(c.x);
    if (c.y <= gy) {
      const hard = c.vy < -6; c.y = gy; c.air = false;
      c.vy = Math.max(-20, Math.min(20, (H(c.x + 0.05) - H(c.x - 0.05)) / 0.1 * c.vx));
      if (c === g.race.a) { g.p.landT = 0.25; g.events.push({ type: 'land', hard, car: 'a' }); } else g.events.push({ type: 'land', hard, car: 'j' });
    }
  }
}
function tickRace(g, dt) {
  const L = g.L, R = g.race, A = R.a, J = R.j, p = g.p, F = L.race.FIN;
  // the audit tool moves A around: put the buggy where it put him
  if (Math.abs(p.x + PW / 2 - A.x) > 1) { A.x = p.x + PW / 2; A.y = raceH(L, A.x); A.air = false; A.vy = 0; }
  const racing = R.won === null;
  if (racing) g.time += dt;
  // boost
  if (p.buffer > 0) {
    p.buffer = 0;
    if (racing && A.bt <= 0 && R.meter >= RACE.cost) { R.meter -= RACE.cost; A.bt = RACE.boostT; g.events.push({ type: 'boost' }); }
    else if (racing && A.bt <= 0) g.events.push({ type: 'noboost' });
  }
  A.bt = Math.max(0, A.bt - dt); J.bt = Math.max(0, J.bt - dt);
  // the meter refills slowly, and fast in the Jeep's slipstream (close behind it)
  const gap = (J.x + J.half) - (A.x + A.half);
  R.slip = racing && gap > 1.5 && gap < 9 && !A.air;
  if (racing) R.meter = Math.min(1, R.meter + (RACE.refill + (R.slip ? RACE.slip : 0)) * dt);
  const want = (c, T) => {
    if (!racing && (c.x + c.half > F)) return 0;
    const kd = raceKind(L, c.x); let v = T[kd === 'dune' ? 'soft' : kd] || T.hard;
    if (kd === 'storm' && c.bt > 0) v = T.soft + 1;
    if (c.bt > 0) v += c === A ? RACE.boostV : RACE.jBoostV;
    return v;
  };
  // the Jeep fights back: it boosts when A gets ahead, and speeds up or eases off so the race is always tight
  if (racing) {
    R.jMeter = Math.min(1, R.jMeter + RACE.jRefill * dt);
    if (J.bt <= 0 && R.jMeter >= RACE.cost && gap < -1.5 && !J.air) { R.jMeter -= RACE.cost; J.bt = RACE.boostT; g.events.push({ type: 'jboost' }); }
  }
  let vA = want(A, RACE.a), vJ = want(J, RACE.j);
  if (racing) {
    const late = J.x + J.half > F - 25 ? 0.5 : 1;   // a little gentler on the run-in, so A's last boost can decide it
    if (gap < -1) vJ *= 1 + Math.min(RACE.rb, (-gap - 1) * 0.04) * late;
    else if (gap > 5) vJ *= 1 - Math.min(0.12, (gap - 5) * 0.03);
  }
  if (!racing) { for (const [c, v] of [[A, vA], [J, vJ]]) if (v === 0 && !c.air) c.vx = Math.max(0, c.vx - (c === A ? 6 : 8) * dt); }   // skid to a stop by the camp
  driveCar(g, A, RACE.a, dt, vA);
  driveCar(g, J, RACE.j, dt, vJ);
  // coins
  for (const c of g.coinList) if (!c.taken && Math.abs(c.x - A.x) < 1.1 && Math.abs(c.y - (A.y + 0.85)) < 1.0) { c.taken = true; g.coins++; g.events.push({ type: 'coin', x: c.x, y: c.y }); }
  // the finish arch
  if (racing) {
    const af = A.x + A.half >= F, jf = J.x + J.half >= F;
    if (af || jf) {
      R.won = af ? 'a' : 'j';
      const other = af ? J : A; R.margin = Math.max(0, (F - other.x - other.half) / Math.max(4, other.vx));
      if (af) { g.mode = 'race'; g.events.push({ type: 'finishline' }); }
      else { g.mode = 'fail'; g.failed = true; g.beaten = true; g.events.push({ type: 'fail', why: 'beaten' }); }
    }
  } else if (R.won === 'a' && !g.done && A.vx < 0.05 && !A.air) {
    R.stopT += dt;
    if (R.stopT > 0.9) { g.done = true; g.events.push({ type: 'done' }); }
  }
  p.x = A.x - PW / 2; p.y = A.y; p.vx = A.vx; p.vy = A.vy; p.onGround = !A.air; p.dir = 1;
}
function tickFlag(g, dt) {
  const p = g.p, F = g.flag;
  F.t += dt;
  if (!F.slid) {
    const fb = g.L.flagY || 0;
    p.y = Math.max(fb, p.y - 7 * dt);
    if (p.y <= fb) { F.slid = true; F.t2 = 0; p.x += 0.5; }
  } else {
    F.t2 += dt;
    const L = g.L;
    p.dir = 1; p.y = L.flagY || 0;
    if (L.gateEnd !== undefined) {   // walk through the gate doors, then the plane leaves
      if (F.ride === undefined) { p.x = Math.min(L.gateEnd, p.x + 3.4 * dt); if (p.x >= L.gateEnd) { F.ride = 0; g.events.push({ type: 'board' }); } }
      else { F.ride += dt; if (F.ride > 5.6 && !g.done) { g.done = true; g.events.push({ type: 'done' }); } }
      return;
    }
    if (L.finale !== undefined) {   // Downtown: walk up to the lake railing, stop, and watch the fountains and fireworks
      if (F.ride === undefined) { p.x = Math.min(L.finale, p.x + (F.t2 < 0.3 ? 3.2 : 3.0) * dt); if (p.x >= L.finale) { F.ride = 0; g.events.push({ type: 'finale' }); } }
      else { F.ride += dt; if (F.ride > (L.finaleT || 10) && !g.done) { g.done = true; g.events.push({ type: 'done' }); } }
      return;
    }
    const rideX = L.scooterEnd !== undefined ? L.scooterEnd + 0.36 : L.busEnd !== undefined ? L.busEnd + 0.55 : L.boatEnd !== undefined ? L.boatEnd + 1.2 : L.trainEnd !== undefined ? L.trainEnd - 0.39 : L.taxiEnd !== undefined ? L.taxiEnd + 0.95 : undefined;
    if (rideX !== undefined) {   // step off the pole, run to the e-scooter / bus / river bus, hop on and ride away
      const board = rideX;
      if (F.ride === undefined) {
        p.x = Math.min(board, p.x + (F.t2 < 0.3 ? 3.2 : 5) * dt);
        if (p.x >= board) { F.ride = 0; g.events.push({ type: 'scooter' }); }
      } else {
        F.ride += dt;
        const walk = L.buggyEnd ? 1.2 : L.busEnd !== undefined || L.trainEnd !== undefined || L.taxiEnd !== undefined ? 0.8 : 0;   // bus / train: A walks in through the door first
        if (F.ride < walk) p.x = board + (L.trainEnd !== undefined || L.taxiEnd !== undefined ? 0 : F.ride);
        else if (L.taxiEnd !== undefined) { const r = Math.max(0, F.ride - walk - 0.5); p.x = board; F.tx = 1.5 * r + 4 * r * r; }   // the taxi pulls away with A inside
        else if (L.trainEnd !== undefined) { const r = Math.max(0, F.ride - walk - 1.4); p.x = board; F.tx = 2 * r + 4.5 * r * r; }   // camera stays; the train pulls away on its own
        else { const r = Math.max(0, F.ride - walk - 0.3); p.x = Math.min(g.L.endX + (L.scooterEnd !== undefined ? -3 : 30), board + (L.trainEnd !== undefined ? 0 : walk) + 2 * r + 4.5 * r * r); }
        if (F.ride > (L.trainEnd !== undefined ? 3.9 : L.taxiEnd !== undefined ? 3.2 : 1.9) + walk && !g.done) { g.done = true; g.events.push({ type: 'done' }); }
      }
      return;
    }
    // finish: a quick step off the pole, turn round, then moonwalk away to the right
    p.x += (F.t2 < 0.3 ? 3.2 : F.t2 < 0.55 ? 0 : 1.6) * dt;
    if (F.t2 > 2.3 && !g.done) { g.done = true; g.events.push({ type: 'done' }); }
  }
}

function updateEnemies(g, dt) {
  const L = g.L;
  for (const e of g.enemies) {
    if (!e.alive) {
      if (e.dead > 0) { e.dead -= dt; e.vy -= 30 * dt; e.y += e.vy * dt; }
      continue;
    }
    if (e.kind === 'raven') {   // shy ravens take off when A gets close, and flap away up and to the right
      const p = g.p;
      if (!e.fly && e.shy) { const d = e.x - (p.x + PW); if (d > -0.4 && d < 2.6 && Math.abs(p.y - e.y) < 1.2) { e.fly = true; e.vx = 3.6; e.vy = 5.5; e.edir = 1; } }
      if (e.fly) { e.x += e.vx * dt; e.y += e.vy * dt; e.vy = Math.max(2.5, e.vy - 3 * dt); if (e.y > 40) e.alive = false; continue; }
    }
    if (e.kind === 'gull') {
      e.ph += dt;
      const nx = e.x0e + Math.sin(e.ph * 0.9) * e.range;
      e.edir = nx >= e.x ? 1 : -1;
      e.x = nx; e.y = e.y0e + Math.sin(e.ph * 2.4) * 0.35;
      continue;
    }
    // walkers
    const sp = e.speed;
    e.vx = e.edir * sp;
    e.vy -= 40 * dt; if (e.vy < -18) e.vy = -18;
    e.x += e.vx * dt;
    let turned = false;
    const near = solidsNear(L, e.x - 2, e.x + 3);
    let eb = { x: e.x, y: e.y, w: e.w, h: e.h };
    for (const s of near) if (overlaps(eb, s)) { e.x = e.vx > 0 ? s.x - e.w - 1e-6 : s.x + s.w + 1e-6; e.edir *= -1; turned = true; eb.x = e.x; }
    e.y += e.vy * dt; eb.y = e.y;
    let grounded = false, under = null;
    for (const s of near) if (overlaps(eb, s)) { if (e.vy <= 0) { e.y = s.y + s.h; e.vy = 0; grounded = true; under = s; } eb.y = e.y; }
    if (!grounded) for (const o of L.oneways) { if (e.x + e.w > o.x && e.x < o.x + o.w && e.y <= o.y && e.y > o.y - 0.4 && e.vy <= 0) { e.y = o.y; e.vy = 0; grounded = true; under = o; } }
    // don't walk off edges
    if (grounded && !turned && under) {
      const fx = e.edir > 0 ? e.x + e.w + 0.05 : e.x - 0.05;
      const support = (under.y !== undefined) && (fx >= under.x && fx <= under.x + under.w);
      if (!support) {
        const any = near.some(s => fx >= s.x && fx <= s.x + s.w && Math.abs(s.y + s.h - e.y) < 0.05);
        if (!any) e.edir *= -1;
      }
    }
    if (e.kind === 'fox') {
      if (e.x < e.x0 && e.edir < 0) e.edir = 1;
      if (e.x + e.w > e.x1 && e.edir > 0) e.edir = -1;
    }
    if (e.y < -20) e.alive = false;
  }
}

function cloneGame(g) {
  return {
    ...g, p: { ...g.p, zip: g.p.zip && { ...g.p.zip }, ride: g.p.ride && { ...g.p.ride } }, safe: g.safe.slice(), bubble: g.bubble && { ...g.bubble }, flag: g.flag && { ...g.flag },
    got: g.got.slice(), passList: g.passList.map(s => ({ ...s })), coinList: g.coinList.map(c => ({ ...c })), specialList: g.specialList.map(s => ({ ...s })),
    enemies: g.enemies.map(e => ({ ...e })), events: [],
    race: g.race && { ...g.race, a: { ...g.race.a }, j: { ...g.race.j } },
  };
}

// height of the floor under x (escalators included), for the camera
function floorAt(L, x) {
  if (L.slopes) for (const sl of L.slopes) if (x >= sl.x0 && x <= sl.x1) return sl.y0 + (sl.y1 - sl.y0) * (x - sl.x0) / (sl.x1 - sl.x0);
  let best = null;
  for (const s of L.solids) if (s.kind === 'ground' && x >= s.x && x <= s.x + s.w) best = best === null ? s.y + s.h : Math.max(best, s.y + s.h);
  return best === null ? 0 : best;
}

const api = { rideY, setTrips, ALL_LEVELS, raceH, RACE, fixPhases: v => { FIXED_PH = v; }, DIVE_T, LEVELS, moverY, moverX, DX_HOUSE, mistOn, CW_TALL, floorAt, DEFAULT_TUNE, newGame, step, cloneGame, buildLevel, PW, PH };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ARun = api;
})(typeof window !== 'undefined' ? window : globalThis);
