# New trip checklist

One trip at a time. Tick each step; don't skip ahead.

## Plan
- [ ] Read the rules doc, `kit/feedback-log.md`, `kit/README.md`, and look at `kit/reference/`.
- [ ] Route of 5-7 parts: famous skyline in the first 5s, one wow inside part, an in-scene ending whose landmark is never in a backdrop before.
- [ ] Each of the 5 specials is a different move on something A climbs or rides (no two the same climb, none without a tap).
- [ ] Every scene change happens at a door (or a ride); list the doors.
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

## Build
- [ ] Cut on magenta, webp q88, sizes written in units.
- [ ] Place with `kitRow`, `kitProp`, `kitStalls`, `kitClimb`, `kitDoor`, `kitSwap`. Draw with `drawKit`, `kitBand`, `kitDoorTick`/`drawKitDoor`.
- [ ] Trip card, sticker, stamp (new country), `AREA_LISTS` entry in `tools/build-as-world.py`.

## Check (every build AND every later fix)
- [ ] `node tools/kit-check.js <id>` passes.
- [ ] bot.js (flag + each special), handsoff.js (6s).
- [ ] `node tools/shot-sheet.js <id> '[...]'`, one spot per part; every picture checked against every rule:
  grounded, no gaps, no seams, nothing cut off, skyline above the front rows on the phone, top of screen not empty,
  ground has a kerb/edge, A behind door fronts, no fades.
- [ ] Side by side with Marina and Greenwich on the sheet: is it as rich? If not, fix before sending.
- [ ] Sheets sent to Ladi **before** merge; merge only on his word.
- [ ] Ladi's feedback added to `kit/feedback-log.md` and the rules doc's Feedback log tab.
