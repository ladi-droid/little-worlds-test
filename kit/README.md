# Level kit

Everything a thread needs to build a trip that matches **Marina and Greenwich**, the gold standard (Ladi, 2026-11-08).
The art is made fresh for each city; the kit is what stays the same.

| Part | Where |
|---|---|
| The rules | rules doc "A's World: rules for every world" (https://claude.ai/artifact/2CQUSWDYfUY5roALDZ24Sw) |
| What Ladi spotted before, and what fixed it | `kit/feedback-log.md` (also the "Feedback log" tab in the rules doc) |
| What good looks like | `kit/reference/marina/`, `kit/reference/greenwich/` (each part at 590x540 and 844x390) |
| Picture prompts and sheet layouts | `kit/prompts.md` |
| Shared level pieces | `game.js` "LEVEL KIT" block (builders) and `play.html` "LEVEL KIT" block (drawing) |
| Rule checker | `node tools/kit-check.js <trip id>` |
| Screenshot sheet for Ladi | `node tools/shot-sheet.js <trip id> '[["name", x, y], ...]'` |
| Step by step | `kit/checklist.md` |
| Starting point for a new trip | `kit/level-template.js` |

## Read first
1. The rules doc, all of it, then `kit/feedback-log.md`.
2. The reference shots. Then play Marina and Greenwich in the game (`__arun.start(i)`), not the latest trip:
   new trips copied the latest one and quality slipped (Barcelona review, 2026-11-08).

## What makes Marina and Greenwich good (look for these in the reference shots)
- **A climbs the place.** Greenwich: wall-jump the Union Wharf towers, up the Avocado flats' balconies, onto the market roofs, the Cutty Sark's rigging. Marina: superyacht flybridge, Pier 7 roof, the zip line, the bridge arch. Specials sit on those climbs, each a different move.
- **Close, varied front rows.** Marina's towers stand right behind the walk, different heights, gaps that show the skyline. Greenwich's market shops touch wall to wall with an arch.
- **The full screen is used.** Play reaches 8-20 units up; the top of the screen has skyline, clouds, birds; the ground has a kerb and a deep stone face, never a plain band.
- **Scenes change behind something.** Marina swaps backdrops while Pier 7 and its towers fill the screen; Greenwich goes underground through the foot tunnel shaft.
- **Life.** Boats, gulls, yachts, cars at the kerb, cafés with tables, shadows under every prop.

## Shared pieces (game.js, in the builder `b`)
Each places the picture *and* what A stands on together, so the rules hold by default. A broken rule goes to `L.kitWarn` and the checker fails.

| Builder | Does | Rule |
|---|---|---|
| `b.kitArt(key, x, y, h, o)` | a picture at (x, y), h units tall. `o.back` behind A | |
| `b.kitProp(key, x, w, h, {solid, ledge})` | a prop **grounded on the floor under it**, with its bump box and landing ledge | 4 |
| `b.kitRow(x, pieces, {capL, capR})` | buildings **wall to wall**, end piece at each side; warns if heights don't vary | 2, 3, 8 |
| `b.kitStalls(x, stalls)` | stalls side by side; warns under 3 | 4 |
| `b.kitClimb(x, {gap, hL, hR, keyL, keyR, special})` | **two walls facing each other**, zigzag coins, special above | 11 |
| `b.kitDoor(x, {inside})` | doorway wipe point + **backOnly** wall | 6 |
| `b.kitSwap(x, to)` | backdrop change; warns unless at a door | 8 |
| `b.kitFloor(x)` | top of what A would stand on at x | |

Drawing (play.html): `drawKit(a => a.back)` before A and `drawKit(a => !a.back)` after; `kitBand(key, par, h, y, haze, grain)` for the two backdrops
(far: par 0.1, grain ~0.3; mid: par 0.3, grain ~0.16; rule 1); `kitScene(first)` gives the backdrop after the last `kitSwap`;
`kitDoorTick()` every frame and `drawKitDoor(edge)` last, with the trip's own `edge = { dark, rim, trim: [keys] }`.
Already shared before the kit: `doorWipe`/`DOOR_T` (doorway wipe), `L.introCam = 'centre'` (A starts in the middle),
`b.slope`, `b.ledge`, `b.groundTop`, lifts as `movers`, `L.zip` (zip line ride), `drawRideA` (A disappears behind the bus/train door).

Use the kit pieces for everything new. Older trips keep their own code; move a piece into the kit when you touch it.

## Checks before Ladi sees anything
1. `node tools/kit-check.js <trip id>`: 5 specials + flag, nothing floating, no gaps in rows, stalls 3+, doors one-way, swaps at doors.
2. `bot.js` (flag and each special) and `handsoff.js` (6s), in the project folder `london-runner/src/`.
3. `node tools/shot-sheet.js <trip id> '[...]'` with a spot for every part. Look at each picture against every rule, fix, re-shoot.
4. Send Ladi the two sheets **before** merging (Barcelona went live without this).
