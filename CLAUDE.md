# Little Worlds test site and A's World

This repo is the **one main copy** of the game. GitHub Pages serves it at
https://ladi-droid.github.io/little-worlds-test/ and A's World (the claude.ai artifact,
https://claude.ai/artifact/YU5fMxcV9Y5qeW9obR8Tov) is built from it. Make every change here, once.
Older copies in the project folder (`london-runner/src/index*.html`, `game.js`) are history: don't edit them.

## Files
- `play.html` + `game.js`: the game (renderer/menus in play.html, rules and levels in game.js).
  The part of play.html between `<!-- site-only:start` and `<!-- site-only:end -->` is test-site only
  (home-screen tags, the child's icon, `LW_SITE_MODE`).
- `sfx.js`: all sounds. `kids/`: boy/girl pictures and colour masks (`*_lab.webp`, `*_front.webp`, lossless).
- `index.html` landing, `builder.html`, `login.html`, `feedback.html`, `reset.html`.
- Pictures are flat in the root as `.webp` (quality ~88, sized for 2x screens; see "Art" below).

## Making a change
1. Pull, then edit the files here (small Python patch scripts are fine; keep them out of the repo).
2. Check it (see "Checks").
3. `python3 tools/stamp.py` so phones fetch the new files, then commit on a branch and open a PR.
4. Rebuild A's World (below) when the game itself changed.

## Building A's World
```
python3 tools/build-as-world.py
```
writes `dist/as-world/index.html` (play.html without the site-only part, so it always plays as A),
`files.json` (everything A's World needs) and `changed.json` (only files that differ from the last publish).
Publish with the Artifact tool: `url` = A's World, `file_path` = `dist/as-world/index.html`,
`files` = the map in `changed.json` (at most 255 per call; send the rest in a second call).
Then `python3 tools/build-as-world.py --mark` and commit `tools/as-world-published.json`.
The artifact limit is 511 files; the script stops if the game needs more.
A's World keeps the **5 latest trips** plus **West End** (`ALSO` in the script, Ladi 2026-11-09), so 6 trips in trip order,
all always open; the oldest of the 5 drops out when a new one is added at the end. The test site keeps every trip. A new trip needs an `AREA_LISTS` entry
(and any pictures it borrows from older trips in `BORROWS`) in `tools/build-as-world.py`.

## Level kit (read before any level work)
`kit/README.md`: the gold standard is **Marina and Greenwich** (Ladi 2026-11-08), with reference shots in `kit/reference/`,
everything Ladi has spotted before in `kit/feedback-log.md`, picture prompt templates in `kit/prompts.md`, and the step list in
`kit/checklist.md`. Build new trips from the shared pieces (`b.kitRow`, `b.kitProp`, `b.kitStalls`, `b.kitClimb`, `b.kitDoor`,
`b.kitSwap` in game.js; `drawKit`, `kitBand`, `kitDoorTick` in play.html). Before Ladi sees anything:
`node tools/kit-check.js <trip id>` and `node tools/shot-sheet.js <trip id> '[["name", x, y], ...]'` (sheets go to Ladi before merge).
Add every new piece of Ladi's feedback to `kit/feedback-log.md` and the rules doc's Feedback log tab.

## Level rules: every change, not just new levels
Ladi (2026-11-07): every fix, tweak, new level and build must follow ALL the level rules in the doc
"A's World: rules for every world" (https://claude.ai/artifact/2CQUSWDYfUY5roALDZ24Sw; same list in
project memory `london-runner-world-rules.md`). Small breaks in fixes are what he keeps finding. Before
handing back any change, look at the changed spot and what sits next to it and check at least:
- Everything stands on the ground or a ledge: props, trees, buildings, stalls. Nothing floats.
- No gaps between pieces that should touch (building ends, ground strips, walls, steps, quays) and no
  visible straight seams; joins happen at a door, arch, kerb, step or gate.
- Nothing cut off by the screen edge, a roof or a ledge; the far skyline still shows above the front rows.
- A starts in the centre of the screen; never more than 6s without a tap; specials and flag reachable.

## Checks (keep them light, but always against the rules above)
- Every change: `node tools/kit-check.js <trip id>` (nothing floating, no gaps, 5 specials, doors one-way).
- Small tweak (a prop, a colour, a word, one picture): screenshots at 590x540 and 844x390 of the spot
  that changed and its neighbours, checked against the level rules.
- New or moved platforms/specials in a level: also run the level checkers (`bot.js`, `handsoff.js`
  in the project folder `london-runner/src/`).
- Whole new world: full checks (all specials reachable, 6s hands-off, screenshots of each part).
- Don't play through every world for a small change, and never send Ladi videos.

## Art
- New pictures: cut on #FF00FF, save as `.webp` quality 88 (`PIL ... save(f, 'WEBP', quality=88, method=6)`).
  Size them so the art is about 2 screen pixels per picture pixel on a big tablet, never more than 2048 wide.
- Measured 2026-11-05: on an iPad Pro the current art is already shown at 1.2x to 4.8x its own size,
  so shrinking it further would look soft. Don't downscale existing art.
- Masks and anything read pixel-by-pixel: lossless webp (`lossless=True, exact=True`), never lossy.
