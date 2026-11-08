// Starting point for a new trip, built from the kit pieces (kit/README.md). Not loaded by the game:
// copy LEVEL into ALL_LEVELS in game.js and DRAW into play.html, then rename 'xx' to the trip's prefix.
// Sizes (w, h) are in units, measured from the cut pictures. Run `node kit/level-template.js` to check it builds clean.

const LEVEL = {
  id: 'xx', name: 'Trip name', plate: 'Trip name', area: 'xx', city: 'City',
  build(b) {
    const L = b.L;
    L.killY = -8; L.startX = 2.0; L.camMin = -12; L.introCam = 'centre';   // A starts in the middle of the screen
    // ---------- 1. arrival: famous skyline in the first 5 seconds ----------
    b.groundTop(-20, 60, 0, 'xxpave');                 // ground style = a strip WITH its kerb/edge (kit/prompts.md picture 4)
    b.kitProp('xx_bench', 8, 2.4, 1.0, { solid: [0.1, 2.2, 0.6] });   // hop it
    b.coins(7, 1.6, 3, 0.8);
    // ---------- 2. a row of front buildings, wall to wall, different heights, end pieces ----------
    const shop = (k, w, h, roof) => ({ key: 'xx_shop' + k, w, h, ledges: [[0.3, 2.9, w - 0.6], [0.3, roof, w - 0.6]] });   // canopy + roof
    const rowEnd = b.kitRow(14, [shop(1, 5.0, 8.2, 8.0), shop(2, 4.6, 10.4, 10.2), shop(3, 5.2, 7.1, 6.9)],
      { capL: { key: 'xx_end_l', w: 1.2, h: 8.2 }, capR: { key: 'xx_end_r', w: 1.2, h: 7.1 } });
    b.coins(15, 4.0, 10, 1.1);
    b.special(21.5, 12.0);                             // 1: on the tallest roof, seen from the bottom
    // ---------- 3. a climb: two walls facing each other ----------
    const cEnd = b.kitClimb(rowEnd + 6, { gap: 1.8, hL: 9, hR: 6.5, keyL: 'xx_tower_tall', keyR: 'xx_tower_short', special: true });   // 2
    // ---------- 4. market: 3+ stalls ----------
    const st = k => ({ key: 'xx_stall' + k, w: 2.8, h: 2.6, top: 2.4 });
    const mEnd = b.kitStalls(cEnd + 6, [st(1), st(2), st(3)]);
    b.coins(cEnd + 6.4, 3.4, 7, 1.1);
    // ---------- 5. in through a door to the inside part; the backdrop changes at the door ----------
    const D1 = mEnd + 5;
    b.kitDoor(D1, { inside: true, key: 'xx_door', w: 2.2, h: 3.4 }); b.kitSwap(D1, 'inside');
    b.groundTop(60, D1 + 40, 0, 'xxfloor');
    b.ledge(D1 + 6, 3.2, 8); b.ledge(D1 + 16, 6.0, 8);   // two floors inside (rule 3)
    b.special(D1 + 20, 8.0);                             // 3
    b.coins(D1 + 6.4, 4.2, 7, 1.1);
    const D2 = D1 + 30;
    b.kitDoor(D2, { inside: false, key: 'xx_door', w: 2.2, h: 3.4 }); b.kitSwap(D2, 'outside');
    // ---------- 6. a set piece A rides or climbs, then the ending ----------
    b.groundTop(D1 + 40, D2 + 60, 0, 'xxpave');
    b.kitProp('xx_planter', D2 + 6, 3.2, 1.3, { solid: [0.2, 2.8, 1.3] });
    b.special(D2 + 7.6, 3.6);                            // 4
    b.kitClimb(D2 + 14, { gap: 1.6, hL: 5.5, hR: 7.5, keyL: 'xx_pillar', keyR: 'xx_pillar', special: true });   // 5
    b.flag(D2 + 34);
    b.end(D2 + 58);
  },
};

// play.html: the trip's draw function, in this order (back to front). Hook it into draw() like drawMarina.
const DRAW = `
const XX_EDGE = { dark: '#20283a', rim: '#f0c060', trim: ['xx_trim1', 'xx_trim2'] };
function drawXx(dt) {
  kitDoorTick();
  // sky, then the two backdrops: far with more haze, mid with less (rule 1); they only change at doors (kitScene)
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#7fb6e8'); g.addColorStop(1, '#dcefff'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (kitScene('outside') === 'outside') { kitBand('xx_far', 0.1, 9.0, 0.4, '214,232,250', 0.3); kitBand('xx_mid', 0.3, 5.0, -0.5, '214,232,250', 0.16); }
  else kitBand('xx_inside', 0.6, 12, -0.5);
  drawKit(a => a.back);                 // buildings, stalls, doors
  for (const s of G.L.solids) if (s.kind === 'ground') xxGround(s);   // the trip's ground strips (with kerbs)
  drawKit(a => !a.back);                // props in front of the buildings
}
function drawXxFront() { drawKitDoor(XX_EDGE); }   // after A: the doorway wipe over everything
`;

if (require.main === module) {   // check the template builds clean
  const A = require('../game.js');
  A.LEVELS.push(LEVEL);
  const r = require('../tools/kit-check.js').check(A.LEVELS.length - 1);
  console.log(r.fail.length ? 'FAIL\n  ' + r.fail.join('\n  ') : 'template builds clean', r.note.length ? '\n  ' + r.note.join('\n  ') : '');
}
module.exports = { LEVEL, DRAW };
