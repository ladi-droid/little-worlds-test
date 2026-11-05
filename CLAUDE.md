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

## Checks (keep them light)
- Small tweak (a prop, a colour, a word, one picture): one screenshot at 590x540 of the spot that changed.
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
