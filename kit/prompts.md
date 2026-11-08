# Picture prompt templates and sheet layouts

Every trip's art is made fresh for its city, but the *shape* of each picture is always the same, so pictures come back
ready to cut and fit. Copy a template, fill in the [brackets], keep everything else word for word.
Number every picture (`NN_name`) and give the whole set in one go, fillers included (rule 15).

## Rules every prompt box carries
- At the top AND the bottom of every box: **"One picture number = one image. Never put two picture numbers in one image, never a grid or collage. An asset sheet (several pieces in one picture) is fine when the prompt asks for one."** (Ladi 2026-11-08)
- Offer a one-picture-per-message file too: the only sure way to stop merges.
- Style line (same in every prompt): *2D side-scrolling mobile game art, flat cartoon style with thick dark outlines, clean shapes and gentle cel shading, bright and friendly, matching A's World.*
- Cut-outs: *on a solid flat magenta (#FF00FF) background, no magenta anywhere in the art, no cast shadow on the background.*
- Always: *straight side-on view, no perspective. No text, no logos, no real brand names, no people* (A's chibi style only, attach `a_sheet.png`, when people are needed: guards, sellers, castellers).
- Light: one time of day for the whole trip, named in every prompt (e.g. "late-afternoon sun, clear blue sky").
- Real, modern, famous things that belong to the place (rule 5). Ending landmark never in a backdrop (rule 13).

## The set for one trip (about 30 pictures)

| # | Picture | Layout | Notes |
|---|---|---|---|
| 1 | Far skyline | 3:1 panorama, full background (no magenta), left and right edges match | The famous skyline, tall enough to show above the front rows on a phone (rule 2). Bottom 15% plain haze. No ending landmark. |
| 2 | Mid strip | 4:1 strip on magenta, edges match | Closer buildings, trees, water. Varied heights with gaps (Marina). |
| 3 | Second far + mid pair | as 1 and 2 | Only if the trip changes scene; the swap happens at a door. |
| 4 | Floors sheet | 4 strips stacked on magenta, each 6:1 | Each ground the trip uses (pavement, sand, deck, indoor floor) WITH its front edge: kerb, quay wall or plinth and a deep face below. Never a plain band (Paris, Barcelona). |
| 5-6 | Arrival vehicle | side view on magenta, door open version too | Door open so A can walk in behind the far side of the door (rule 14). |
| 7-12 | Front-row buildings | one building per picture, on magenta, ground floor to roof | **Climbable**: balconies, canopies, sills, a flat roof A can stand on (Greenwich towers, Avocado flats). Different heights. Plain side walls so two stand wall to wall. |
| 13 | Building ends | sheet of 4 on magenta | Left and right end walls / corners for every row (no abrupt stops). |
| 14 | Climb pair | two tall pieces on magenta, side by side with a clear gap | Two solid things facing each other for a wall-jump (rule 11): towers, pillars, chimney stacks. Full height, standing on the ground. |
| 15-16 | Landmark set piece | one picture | Something A climbs or rides, not just walks past (Cutty Sark, Marina zip line). |
| 17-19 | Inside part | backdrop (full, 3:1) + floor + props sheet | The wow inside part (rule 13). Two floors visible, no plain walls. |
| 20 | Doorway | front door piece on magenta, plus the far half of the door as its own piece | The far half is drawn over A as he goes in. |
| 21 | Archway | deep archway on magenta | Room to room inside (rule 7). |
| 22-23 | Stalls | sheet of 3+ stalls on magenta, same height | Always 3 or more side by side. |
| 24-25 | Street props | sheet of 6 on magenta | Benches, planters, bins, lamps (short, modern), bikes on the ground. Each with a flat base. |
| 26 | Clouds and life | sheet on magenta | Clouds, birds, boats: so the top of the screen is never empty. |
| 27 | Ending view | full picture, no magenta | The ending landmark, seen for the first time. Huge. |
| 28 | Trip card | 4:3 full picture | Leave room for the child's kid on the right. |
| 29 | Sticker | on magenta | |
| 30 | Passport stamp | on magenta, attach `art/stamps/stamps.png` | New country only. |

## Templates

**Far skyline (picture 1)**
> [Style line]. Wide panoramic background for a side-scrolling game, very wide 3:1, left and right edges match so it can repeat. [City]'s famous skyline seen from [place] in [time of day]: [3-5 landmarks, NOT the ending landmark]. The skyline is tall and fills the upper two thirds; the bottom 15% is soft haze. Far away, slightly hazy. No text, no logos, no people.

**Front-row building (pictures 7-12)**
> [Style line]. One building piece, straight front view, standing on a thin strip of [pavement] along the bottom edge: [building, real place]. [Ground-floor shop / lobby] with a canopy, [N] floors of windows with balconies or deep sills A could land on, and a flat roof with a low parapet. Plain brick/stone side walls running the full height, so two of these can stand wall to wall. Nothing cut off: the whole building from pavement to roof in frame. [Light]. On a solid flat magenta (#FF00FF) background.

**Climb pair (picture 14)**
> [Style line]. Two tall pieces side by side with a clear gap between them, both standing on the ground: on the left [tall tower/pillar], on the right [shorter tower/pillar], their inner faces flat and solid so a character can wall-jump between them. Full height from the ground to the top, nothing cut off. [Light]. On a solid flat magenta (#FF00FF) background.

**Floors sheet (picture 4)**
> [Style line]. Four ground strips for a side-scrolling game, stacked with magenta between them, each 6:1 and seamless left to right: 1) [pavement] with a stone kerb and a deep stone face below, 2) [second ground] with its edge, 3) [indoor floor] with a skirting edge, 4) [quay wall / beach edge] meeting water. Each strip shows its top surface and its front face; no plain bands. On a solid flat magenta (#FF00FF) background.

**Props sheet (pictures 24-25)**
> [Style line]. A sheet of 6 separate street props for [place], evenly spaced, not touching, each standing on its own flat base: [bench], [planter with a tree], [modern short lamp], [bin], [bike-hire dock with bikes on the ground], [local thing]. Same scale as a child character 1.5 m tall. [Light]. On a solid flat magenta (#FF00FF) background.

**Stalls (pictures 22-23)**
> [Style line]. Three [market] stalls side by side in one row, touching, same height, each with a canopy a character can land on and goods on the counter: [stall 1], [stall 2], [stall 3]. Standing on a thin strip of ground. On a solid flat magenta (#FF00FF) background.

## Cutting
- Cut on magenta, save `.webp` quality 88, ~2 screen pixels per picture pixel on a big tablet, never over 2048 wide.
- Keep each cutter script in the project folder (`london-runner/src/<trip>/cut.py`), not the repo.
- Write each piece's size in units in the level (Marina's `src/marina/pieces.json` is the model).
