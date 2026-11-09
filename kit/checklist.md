# New trip checklist

One trip at a time. Tick each step; don't skip ahead.

## Plan
- [ ] Read the rules doc, `kit/feedback-log.md`, `kit/README.md`, and look at `kit/reference/`.
- [ ] Route of 5-7 parts: famous skyline in the first 5s, one wow inside part, an in-scene ending whose landmark is never in a backdrop before.
- [ ] Each of the 5 specials is a different move on something A climbs or rides (no two the same climb, none without a tap).
- [ ] At most ONE inside visit per level: one door in, one door out, never more (Ladi 11-08). Name the doors.
- [ ] Arrival vehicle and the short ride out to the next trip.
- [ ] Ladi's picks asked in one message, with a recommendation.

## Blocks (before any pictures)
- [ ] Level built from kit pieces with grey blocks; `L.introCam = 'centre'`.
- [ ] `node tools/kit-check.js <id>` passes; bot reaches the flag and every special; handsoff 6s passes.
- [ ] Block screenshots at 590x540 and 844x390 sent to Ladi (never videos). Wait for his OK.

## Pictures
- [ ] Whole set from `kit/prompts.md` in one go, fillers included (ends, floors with edges, climb pair, clouds, doors, stalls of 3+).
- [ ] Every box says one picture number = one image; one-by-one file offered.
- [ ] When they come in: check each against its prompt (time of day, no ending landmark in backdrops, nothing cut off).

## Before the first render (Barcelona rebuild, 11-08: each of these cost a fix round)
- [ ] Far backdrops: none shows a landmark A visits up close (or two of it on one screen). Paint it out if the art has it.
- [ ] Every backdrop change: the thing hiding it reaches above the far band's top, or the sky fades across it. No straight line in open sky.
- [ ] Every single wide picture (ending view, interior): at least 1.4x the widest screen (844x390) and tall enough when the camera rises.
- [ ] One ground fill colour below the street for the whole trip; each ground change sits under a pier, arch pillar or prop.
- [ ] Rides: under 6s, or something that needs a tap on them (Ladi likes long rides when they are fun: swoops, ramps, boosts).
- [ ] Camera outside: `L.camFloor` on every raised floor A ends on (the ending terrace), so the floor sits at the bottom and the view fills the screen.
- [ ] Camera inside a building: it never moves up or down (Barcelona round 5). Keep every ledge, coin and special inside the phone view at floor level (about 10 units up at 844x390, below the top bar).

## Rides and moving moments (Barcelona rounds 3-5, 11-09)
- [ ] Getting on is quick (lift-off within about 0.3s); A never waits on a ride.
- [ ] The ride has a shape and a reason to tap (dips, ramps, boost arrows, coins up high), and only where a tap makes sense: no jumping inside a cabin.
- [ ] Getting off is smooth: the ride slows to running pace and A walks or runs straight off (ride fields `vEnd`, `walkOut`). The vehicle stays parked where he left it.
- [ ] Nothing to hop or lean on right where A gets off a ride.
- [ ] Anything A floats or rides in moves a little (drift, sway, wobble) and A moves inside it, never a still picture sliding along.
- [ ] Climbs are wall-to-wall bounces, not lifts.
- [ ] Knocked back after a hit: A returns to the level he was on (street stays street), never up to where he came from.
- [ ] Every sound matches what is on screen (no splash on an escalator, no lift hum in a bubble, no fireworks sound without fireworks).
- [ ] `node tools/ride-sheet.js <id> <name> <x> <y> <times>` for every ride: a row of frames goes to Ladi with the screenshot sheet.

## Build
- [ ] Cut on magenta, webp q88, sizes written in units.
- [ ] Place with `kitRow`, `kitProp`, `kitStalls`, `kitClimb`, `kitDoor`, `kitSwap`. Draw with `drawKit`, `kitBand`, `kitDoorTick`/`drawKitDoor`.
- [ ] Trip card, sticker, stamp (new country), `AREA_LISTS` entry in `tools/build-as-world.py`.

## Check (every build AND every later fix)
- [ ] `node tools/kit-check.js <id>` passes.
- [ ] bot.js (flag + each special), handsoff.js (6s).
- [ ] `node tools/shot-sheet.js <id> '[...]'`, one spot per part, plus `tools/ride-sheet.js` for each ride; every picture checked against every rule:
  grounded, no gaps, no seams, nothing cut off, skyline above the front rows on the phone, top of screen not empty,
  ground has a kerb/edge, A behind door fronts, no fades.
- [ ] Side by side with Marina and Greenwich on the sheet: is it as rich? If not, fix before sending.
- [ ] Sheets sent to Ladi **before** merge; merge only on his word.
- [ ] Ladi's feedback added to `kit/feedback-log.md` and the rules doc's Feedback log tab.
