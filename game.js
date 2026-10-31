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
    b.estate(40, 3);
    b.coins(42, 4.7, 4, 1.4); b.coins(47.4, 8.0, 4, 1.4); b.coins(42, 11.3, 4, 1.4);
    b.special(50.6, 16.1);                 // top of the tall estate block
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
    b.pigeon(172, -7); b.pigeon(216, -7);
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
    L.props.push({ kind: 'bx', key: 'dt_hand', x: HX, y: HY, h: 4.746 });
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
  if (p.zip) { p.zip.tgt = -1; p.zip.tt = 0.55; return; }   // on the zip line: drop lower
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

  // jumping
  if (p.buffer > 0 && p.zip) { p.zip.tgt = 1; p.zip.tt = 0.55; p.buffer = 0; }   // on the zip line: lift up
  if (p.buffer > 0 && p.onGround && p.ground && p.ground.swim) { startDive(g); p.buffer = 0; }
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
  p.vy -= grav * dt;
  if (p.vy < -P.maxFall) p.vy = -P.maxFall;
  if (p.wall && p.vy < -P.wallSlide) p.vy = -P.wallSlide;

  // perfume mist slows A down; travelators carry him (and keep carrying him through a jump off one)
  let slow = 1;
  if (L.mists) for (const m of L.mists) if (mistOn(m, g.t) && p.x + PW > m.x0 && p.x < m.x1 && p.y < m.top) slow = m.slow;
  if (slow < 1 && !p.misted) g.events.push({ type: 'mist' });
  p.misted = slow < 1;
  const belt = p.onGround ? (p.ground && p.ground.belt) || 0 : p.carry || 0;
  p.carry = belt;
  p.vx = p.dir * P.speed * slow + belt;

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
    g.events.push({ type: 'bounce', x: p.x, y: p.y });
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
  const cx = p.x + PW / 2, cy = p.y - (p.dip || 0) + PH / 2;
  for (const c of g.coinList) {
    if (c.taken || Math.abs(c.x - cx) > 1 || Math.abs(c.y - cy) > 1.3) continue;
    if (Math.abs(c.x - cx) < PW / 2 + 0.32 && Math.abs(c.y - cy) < PH / 2 + 0.32) { c.taken = true; g.coins++; g.events.push({ type: 'coin', x: c.x, y: c.y }); }
  }
  g.specialList.forEach((s, i) => {
    if (s.taken) return;
    if (Math.abs(s.x - cx) < PW / 2 + 0.5 && Math.abs(s.y - cy) < PH / 2 + 0.5) { s.taken = true; g.got[i] = true; g.events.push({ type: 'special', x: s.x, y: s.y, i }); }
  });

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
    p.dir = 1; p.y = g.L.flagY || 0;
    const L = g.L;
    if (L.gateEnd !== undefined) {   // walk through the gate doors, then the plane leaves
      if (F.ride === undefined) { p.x = Math.min(L.gateEnd, p.x + 3.4 * dt); if (p.x >= L.gateEnd) { F.ride = 0; g.events.push({ type: 'board' }); } }
      else { F.ride += dt; if (F.ride > 5.6 && !g.done) { g.done = true; g.events.push({ type: 'done' }); } }
      return;
    }
    if (L.finale !== undefined) {   // Downtown: walk up to the lake railing, stop, and watch the fountains and fireworks
      if (F.ride === undefined) { p.x = Math.min(L.finale, p.x + (F.t2 < 0.3 ? 3.2 : 3.0) * dt); if (p.x >= L.finale) { F.ride = 0; g.events.push({ type: 'finale' }); } }
      else { F.ride += dt; if (F.ride > 10 && !g.done) { g.done = true; g.events.push({ type: 'done' }); } }
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
        else if (L.trainEnd !== undefined) { const r = Math.max(0, F.ride - walk - 0.7); p.x = board; F.tx = 2 * r + 4.5 * r * r; }   // camera stays; the train pulls away on its own
        else { const r = Math.max(0, F.ride - walk - 0.3); p.x = Math.min(g.L.endX + (L.scooterEnd !== undefined ? -3 : 30), board + (L.trainEnd !== undefined ? 0 : walk) + 2 * r + 4.5 * r * r); }
        if (F.ride > (L.trainEnd !== undefined || L.taxiEnd !== undefined ? 3.2 : 1.9) + walk && !g.done) { g.done = true; g.events.push({ type: 'done' }); }
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
    ...g, p: { ...g.p, zip: g.p.zip && { ...g.p.zip } }, safe: g.safe.slice(), bubble: g.bubble && { ...g.bubble }, flag: g.flag && { ...g.flag },
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

const api = { setTrips, ALL_LEVELS, raceH, RACE, fixPhases: v => { FIXED_PH = v; }, DIVE_T, LEVELS, moverY, moverX, DX_HOUSE, mistOn, CW_TALL, floorAt, DEFAULT_TUNE, newGame, step, cloneGame, buildLevel, PW, PH };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ARun = api;
})(typeof window !== 'undefined' ? window : globalThis);
