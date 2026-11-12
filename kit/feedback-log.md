# Feedback log: what Ladi spotted, and what fixed it

Every piece of Ladi's feedback on past levels, so a new thread can see *what went wrong and how it was fixed*,
not just the one-line rule. Read with the rules doc ("A's World: rules for every world") and `kit/README.md`.
Same list as the "Feedback log" tab in the rules doc. Add an entry every time Ladi gives feedback.

**Gold standard (Ladi, 2026-11-08): Marina and Greenwich.** Reference shots: `kit/reference/marina/`, `kit/reference/greenwich/`.

Each entry: **level, date** — what Ladi saw → what fixed it → where to look.

## 1. Nothing floats, nothing is cut off (rule 4)

- **Greenwich, 10-22** — tree and lamp hanging in mid-air above the brick path → every prop placed with y = the floor under it. → `b.kitProp` now grounds props for you; `tools/kit-check.js` flags any front picture with nothing under it.
- **Greenwich, 10-22** — the arch behind the run-in, and the green-and-white market stalls, floated → arch given stone stairs down to the ground (`b.bridge` in game.js), stalls stood on the pavement.
- **Greenwich, 10-22** — Lime bikes stood on top of the docks → bikes on the ground in front, docks still hoppable (`bk_bike`, `bk_dock`).
- **Greenwich, 10-25** — big foreground lamppost cut off halfway up the screen → removed (`g2f_lamp` no longer used). "If anything is half cut off, get rid of it straight away."
- **Tower Bridge, 10-25** — lampposts at 44s and 1:04 cut off → removed.
- **West End, 11-05** — a star cut off at the top of the screen at 7s → removed.
- **Central Park, 11-07** — water tower leaned off the edge of its roof, floating in space → props sit well inside roofs and ledges.
- **Westminster, 11-07** — trees behind Horse Guards floating → stood on the ground (rule 4 now says trees and seam-hiding clumps too).
- **Westminster rooftops, 11-07** — chimneys not attached to the roofs → chimneys, pots and skylight stand on the roofs. See `wmArt` in game.js.
- **Paris, 11-07** — climb's iron pier hanging from a short girder; walkway posts stretched → climbs must be two full pillars standing on the floor (`b.kitClimb`). Paris was removed.

## 2. No gaps, no seams, no abrupt starts and stops (rules 3, 8)

- **Woolwich, 10-24** — small gaps between the Powis Street shops and either side of the new apartments → closed up, pieces overlap a touch. → `b.kitRow` puts buildings wall to wall (0.05 overlap) and the checker flags any gap.
- **Woolwich, 10-25** — flats ended abruptly → end pieces added at both ends (`cn_*` corners). → `b.kitRow` warns if a row has no end piece.
- **Greenwich, 10-25** — market shops not tight together → packed wall to wall (`b.market`, B wall columns).
- **Brixton, 10-28** — terraced houses not touching → touching, with different door colours (`bx_hplain_r/y/k/p/b`).
- **Tower Bridge, 10-25** — the market "comes in quite abruptly" at 47s and ends the same way at 58s → "Never make any element just abruptly start and stop."
- **Old Dubai, 10-28** — beige blocks over the top half at the start and end of the souk → removed.
- **West End, 11-05** — new area at 1:11 enters abruptly and its top is cut off → needs a proper way in (now: switches only at a door), nothing cut off at the top.
- **Cape Town, 11-07** — mountain ends in a straight line after the flag at 1:44 → hilltop slopes away naturally.
- **Cape Town, 11-07** — Bo-Kaap steps were plain pale walls → stone courses like the walls under the houses.
- **Westminster, 11-07** — straight seams where ground met ground (bridge/pavement, gravel/path, path/Mall) and lake edges → stone kerbs at every join, stone lake edges.
- **Paris, 11-07** — plain beige/brown band under the ground on every screen; backdrop switch in a straight line in the sky; bridge ends cut straight next to the gravel → deep ground art (kerb + paving), switches hidden behind trees/doors, quay walls. Paris was removed.
- **Barcelona, 11-08** (quality review) — plain brown ground band, striped seams at ground joins, water slot at the harbour, big plain brick block under the Park Güell ending → still open; see the "Greenwich vs Barcelona" report.

## 3. Backdrops: two layers, never fade, change only at a door (rules 1, 2, 6, 8)

- **Woolwich, 10-24** — backgrounds fading into other backgrounds ("any background fades look unrealistic") → hard switch hidden behind a building A passes (tower over the station hides the split).
- **Woolwich, 10-24** — station backdrop moved with A on the escalator → stays still.
- **Woolwich, 10-24** — far backdrop should fade a bit, nearer one a little less, front clear → became rule 1 (grain/haze by depth). → `kitBand(key, par, h, y, haze, grain)` in play.html.
- **Greenwich, 10-25** — backdrop needed more haze ("a little bit more faintness") → haze raised to .32.
- **Tower Bridge, 10-25** — backdrop fade at 36s; pavement changed at 37s → "could something block the whole screen?" Then **10-28**: no giant bus passing in front either. Switches now only at doors.
- **Palm, 10-29** — backdrop moved too much, Atlantis sliding into view; the lift view zoomed out as A went up → backdrops stand still or scroll slowly, never zoom (the "view at 30 seconds" kept).
- **Palm, 10-30** — monorail and a switch at 40s looked like a glitch → switch moved behind a building.
- **Old Dubai, 10-28** — patterned top band moving → made still.
- **Cape Town, 11-07** — abrupt backdrop change at 1:17; mountains fading into the view at 1:40 → change behind the station doorway, no fade. Then the extra archways at the cable car were removed ("just go straight into it").
- **Central Park, 11-07** — on a phone only the front flats showed for the first 10s → rule 2: every phone screen shows the tall far skyline above the front rows.
- **Marina, 10-30** — towers should feel close, right behind the walk; front blocks all the same height → towers at parallax 0.8 close behind, front blocks with extra floors so heights vary (`ma_pod` with `floors`). Gold standard.
- **Westminster, 11-07** — Buckingham Palace in the backdrop from 46s, though it's the ending → ending landmark only at the end (rule 13). Same lesson in **Paris** ("only show the tower at the end, and make it massive").
- **Barcelona video, 11-08** — the Sagrada's inside picture was drawn far bigger than the screen (zoomed in, soft) → an inside backdrop shows the whole picture at about screen height, still up and down.
- **Barcelona, 11-09** — "the images look large, not the place": an inside backdrop at screen height still looked zoomed in → show it at ~0.7 of screen height, with its top mirrored above to fill the screen.
- **Barcelona, 11-09 (round 4)** — still too zoomed in at 0.7 → inside backdrop at ~0.55 of screen height, its vaulted top repeated (mirrored, then not) up to the top of the screen.
- **Barcelona, 11-09 (round 5)** — the camera rising onto the Sagrada gallery wasn't wanted → camera stays at floor level inside; gallery lowered and the special moved down so everything fits.

## 4. Doors, insides and exits (rules 6, 7, 14)

- **All levels, 11-08** — "only have one, maximum one scene change with a door per level. Never two, never more." Ladi then said going in and back out counts as one → one inside visit per level at most: one door in, one door out, no other door changes (`tools/kit-check.js` fails on more). Older trips with more doors are left as they are until they're next touched.

- **Airport Rush, 10-28** — A faded out at the final door → A walks through and disappears behind the far part of the door; applies to buses and trains too (`drawRideA`, `hwDoorFront`).
- **Tower Bridge, 10-25** — let A walk into the bus so you see him disappear into it → same rule.
- **Canary Wharf, 11-04** — boarding the train looked glitchy (hard box over A, doors snapping shut) → A framed in the door, doors slide shut, pause, A waves from the window (`CW_DOOR`, `cwDoorD`).
- **Central Park, 11-07** — "sharp entry" into buildings → Ladi picked the doorway-shaped wipe with the coin flip for going in/out, and the deep archway for room to room. → `doorWipe` (play.html "DOOR WIPE"), `b.kitDoor` + `kitDoorTick`.
- **Westminster, 11-07** — A could walk back out of the tower → backOnly wall at every doorway (`b.kitDoor` adds it).
- **Palm, 10-29** — "abruptly goes inside" Atlantis at 54s → inside removed.
- **Marina, 10-30** — "Ready" showed only the boat → show the platform, A centred (`L.introCam = 'centre'`).

## 5. Play: taps, climbs, specials (rules 10, 11, 12)

- **Canary Wharf, 10-26** — long tunnel, station and DLR stretches with nothing to press → became the 6-second rule (`handsoff.js`).
- **Westminster, 11-07** — climbs not clear as climbs (stacked ledges, moving gears) → two solid things facing each other, A wall-jumps between them, coins zigzag (`L.wmPiers`). → `b.kitClimb`. Greenwich towers are the model (`b.gwTowers`).
- **Central Park, 11-07** — climb up to the water tower not clear → same fix.
- **Marina, 10-30** — Pier 7 meant jumping up each floor → glass lift up the middle, whole tower shown. Coins on the right of the lift so standing collects them.
- **Marina, 10-30** — falling between yachts got A stuck → yachts touch, no way down.
- **Palm, 10-30** — pool jumps too hard for a kid → swimming, coins below the water, swipe down to dive.
- **Palm, 10-30** — fountain switching on and off → always on (rule 12: no on/off timed hazards). Obstacle right before the death slide → removed.
- **Cape Town, 11-05** — a 15s sit-down train ride "way too long" → under 10s and still played (tap up, swipe duck).
- **Cape Town, 11-07** — wave and seagulls on the train → removed; high coins to jump for instead. Cable car coins bunch closer near the top so the tune climbs.
- **Westminster, 11-07** — camera dipped and bounced at 24s → camera follows stairs smoothly (camFloor 4th number).
- **Westminster, 11-07** — lift too slow; guards took too long at the end → lift ~2s, ending wait 5s.
- **Barcelona, 11-08** (quality review) — two specials the same pillar-to-wall climb, one needs no taps; play mostly low → each special a different, earned move; use the height of the screen.
- **Barcelona video, 11-08** — human tower too hard to climb → two castellers before it spring A to the top. The first half was flat and boring → go higher (cable car up a tower, rooftop run), never a second inside. A ride must be fast and fun (e-scooter nearly 2x faster, coin arcs, speed lines) or removed; a vehicle always faces the way it goes.
- **Barcelona, 11-09** — the special moves must ALWAYS happen (castellers fling A whether he jumps or walks; the giant always lifts him). A ride where A just goes straight is boring → give it a shape and a reason to tap (cable car swoops low and speeds downhill, a tap swings the cabin up for high coins; scooter kicker ramps + boost arrows; giants carry A, tap to hop for coins), then the rides can be longer (~6-7s). A rides INSIDE a cabin, never on its roof. Long walks after a big moment need something new (Gegants parade).
- **Barcelona, 11-09 (round 4)** — no tapping/jumping inside a cable car cabin. A ride slows only to walking pace and A walks off; the vehicle stays parked where he left it, never vanishes. Escalators carry A up slowly. Hit by a pigeon down on the street → float back to a spot on the street, never back up to the tower/roof he came from. The giants carrying A didn't land → replaced.
- **Barcelona, 11-09 (round 5)** — getting out of any vehicle is smooth: A walks out at running pace while it glides to a stop (cable car, like the scooter). Ride lift-offs are quick. A in a bubble drifts about and moves (paddles, sways). No hop obstacle right where A gets off a ride. Climbs are wall-to-wall bounces, not lifts. No camera shift inside a building: keep the zoomed-out view. No splash/whoosh sound on an escalator.
- **Barcelona, rounds 3-5, 11-09 (Ladi happy with the result)** — what made the rides good: a quick start, a shape (swoops, ramps, boosts), taps only where they make sense, a smooth walk-off at running pace with the vehicle left parked, and movement while riding (the bubble drifts, A paddles and sways). These are now a checklist section: `kit/checklist.md` "Rides and moving moments". Each ride goes to Ladi as a row of frames (`tools/ride-sheet.js`).

## 6. Richness: make it a world, not a strip (rules 3, 5)

- **Woolwich, 10-24** — "shops just come out of nowhere… how can we make this feel fuller, richer, more like its own world?" → shadows, colour mood per zone, steam, washing lines, pigeons, fountains, moving escalator steps, clutter, foreground layer, ambient sound. Then **10-24**: people silhouettes removed ("not the best look"; rule: no silhouette people). Too much going on at 40s → thinned.
- **Woolwich, 10-24** — station top half empty → Elizabeth line maps on the walls.
- **Greenwich, 10-22** — "the rest of the level seems a bit plain compared to the amazing pub" → more set pieces: Greenwich Market with 8 shops and arch, Avocado shop with flats, Union Wharf towers, Cutty Sark, foot tunnel.
- **Downtown, 10-29** — mall too plain, blank top, plain bottom of escalator → grander mall, second floor of shops visible going down.
- **Gold Souk, 10-28** — should take up more of the screen.
- **West End, 11-05** — "after Elfridges it's quite flat for a while" → one more exciting thing. Ad screens too crowded → simpler, mostly words.
- **Westminster, 11-07** — "something a bit challenging in the second third" → rooftop run (Ladi then moved it later and lower).
- **Palm, 10-29** — lots of unused blank space around the lift → filled.
- **Barcelona, 11-08** (quality review) — landmarks were flat pictures A walks past; Greenwich lets A climb shops, towers and the Cutty Sark → front-row art must be climbable (picture prompts ask for it: `kit/prompts.md`).
- **Barcelona video, 11-08** — birds and clouds hovered in one spot and birds grew and shrank (frames drawn at one height) → birds fly forwards at one scale for all frames, small; clouds drift forwards. No firework sounds without fireworks; the ending needs something happening (parakeet flock).
- **Barcelona, 11-09 (round 5)** — the Park Güell escalator played a water-slide splash, and the bubble played the lift hum (sounds picked by ride number) → every sound checked against what is on screen; Barcelona switches both off.

## 7. Content and look

- **Woolwich, 10-23** — never mention Arsenal; authentic modern Woolwich (estates, new builds, chicken and African shops, Dial Arch, pubs) but not too rundown (10-24, 10-25) → brick flats from the backdrop, grey not beige.
- **Greenwich, 10-22** — old-school things replaced with modern ones (crates → Lime bike docks, ticket kiosk → concrete planters with timber tops, old lamps → modern lamps).
- **Old Dubai, 10-28** — cat clashed with the background → dark grey.
- **Downtown, 10-29** — cars in proportion to the taxi; never the same car twice (Marina).
- **Brixton, 10-28** — too many animals at the start → first pigeon and gull removed. Market boxes intrusive → removed. Signs say GLITZY and MONKEYS on purpose.
- **Marina, 10-30** — the wheel should be huge, top off-screen, still in the backdrop. A runs behind the rail, not in front.
- **Marina stairs, 10-31** — A shouldn't look see-through → glass in front made solid, only his head shows.
- **Titles, 10-28** — anything too long for one line on a phone goes on two lines.
- **Picture prompts, 11-08** — the image maker merges pictures → every box says one picture number = one image; one-picture-per-message files offered (`kit/prompts.md`).
- **Never videos, 10-30**: screenshots only, for plans, blocks and results.

## 8. How we build (rules 15, 16, and the quality review)

- **Rules thread, 11-07** — "every fix, every new level, every build needs to abide by the rules"; small breaks keep turning up in fixes → light checks on every change, against all rules. → run `tools/kit-check.js` + screenshot sheet.
- **Paris, 11-07** — "too many things wrong… we're going to delete it" → plan, OK'd blocks, and a full rules check before Ladi sees it.
- **Barcelona, 11-08** — built ~1.5h after the last pictures, Ladi never saw the finished level before merge → Ladi sees `tools/shot-sheet.js` sheet (new level next to Marina and Greenwich) before any merge. One trip at a time.
- **Barcelona rebuild, 11-08** — "how come this wasn't built with those fixes in hand?" The first full render with the art showed: no backdrop on one part (draw-code bug), two Sagradas on screen (the far skyline had the landmark A was about to visit), a straight line in the sky where a backdrop changed under open sky, the ending picture narrower than a phone, a ground-colour seam under an arch, a 6s+ ride. → checklist "Before the first render" below; backdrop prompts leave out every landmark A visits up close; every backdrop change hides behind something that reaches above the sky band (or fades); wide pictures sized to the widest screen; one ground fill colour per trip.

## 9. Sydney round 2 (Ladi, 11-10)

- Trip names are the city only ("Sydney", not "Sydney Harbour").
- A arriving in a vehicle stays out of sight inside it; he jumps out when it has landed (no head in the windows).
- A bird must sit on something or fly; never a sitting bird in mid-air.
- Inside a building, zoom out like the Sagrada (picture at about 55% of the screen, its ceiling repeated above); hanging lights hang on cables that reach the ceiling.
- The one inside part must have plenty to do (Sydney: rising rows of seats, bouncy acoustic rings that play a rising tune, a jump off the organ).
- Camera stays level while A runs past a station/train; no rising with the platform.
- A slide is ridden all the way: no hopping off it, and the slide starts level with the deck A runs off.
- No fade between backdrops, even at the ending view: the ending view becomes the backdrop at a cutaway.
- No fireworks sound at an ending unless there are fireworks (Downtown only).
- A lean or hop on a slope judders: keep props on flat ground.

## 10. Rome round 2 (Ladi, 11-10)

- A place that is open to the sky (the Colosseum) is not an inside part: no door, A runs into it in one go (Rome: the arena opens up past the broken end of the outer wall).
- No trees cut off at the top, in pictures or props; a tree that hides a backdrop change is drawn whole.
- No gliding: A doesn't float in the air (the Pantheon light beam float was removed). A longer inside part needs its own fun thing (Rome: rose petals falling through the oculus into heaps that bounce A higher each time).
- The ride before the ending is A on a scooter (the e-scooter drawing), not a pedal cart.
- No abrupt change of scenery before the ending: the light and sky turn slowly towards the ending's along the way (by position, never a fade in time), and the view comes in behind a tree.
- (Ladi, 11-10 15:44) "The ending is still cut off with the backdrop": a backdrop change hidden behind something tall still shows if the sky differs on the two sides. Hide it behind something that reaches the top of the screen (Rome: the flag pole) and match the sky on both sides; a long rail or wall must start behind something (a trunk), never show its cut end.
- A backdrop change needs something wide and tall enough to hide it, not a thin palm trunk (Lagos 2026-11-10: "a sharp change of backdrop near the flag"; the Link Bridge view now comes in behind a tall block of flats).
- Lagos round 2 (Ladi 2026-11-10): traffic jams look real when a far lane creeps stop-start behind the one A runs over (and stands still while a ride skips past); horns help. A backdrop change still feels like a glitch if the colours jump: lean each part towards the next one's colours before the swap. An ending picture that fills the whole screen looks "zoomed in": draw it at about two thirds of the height, mirrored sideways; birds in a picture must be small (paint big ones out, draw small ones in code). Talking drums need a talking-drum voice (pitch bend), not notes. Nothing floats: a bird on a railing read as floating, put it on the ground.
- Lagos round 3 (Ladi 2026-11-11): a sticker badge must keep its own shape (Lagos, Rome, Sydney were squashed to the default strip). A tower picture with empty space on one side puts the climbing wall in thin air: line the solid up with the drawn wall. Hiding a backdrop change behind a palm or a block of flats was still "a sharp change": blend the next backdrop in over ~12 units fixed in the world, and lay any colour tint over the whole screen at once (never per backdrop). A sky colour must not be read from under the moving camera (it "switched colours randomly"). No waves on the sand: waves stay in the sea; quad bike jumps over sand bumps.
- Lagos round 4 (Ladi 2026-11-11): a vehicle that drops A off at the start keeps driving until it is out of sight (it vanished when play began). A backdrop change into a very different scene (towers to beach) needs a long, smooth gradient, not short strips. A background sound should run under the whole trip (softer away from its place) so there is never silence. When a ride is there to skip a jam, pick him up early so it skips a lot. Check a bounce really bounces (a code line had slipped into a comment, so the drums were plain blocks).
- Singapore round 2 (Ladi 2026-11-11): a car that drops A drives off forwards (the way it faces) and keeps going until it is off the screen, never reverses or vanishes. A bridge built from several pictures must not show its joins (the Helix Bridge's spiral broke between pieces): draw the middle whole so it carries on from the end pieces. Inside, no made-up top half: the inside picture fills the screen from the floor up. The sky above an ending picture is that picture's own sky colour (no stars or haze it doesn't have), and a light show tints only the lit parts, never the sky. Ladi liked the bounce sounds.
- Lagos outfit (Ladi 2026-11-11): a trip can have its own local outfit (Lagos: blue agbada and fila cap for boys and A, purple iro, buba and gele for girls). Girls always wear shoes, never bare feet. No religious symbols on clothes (the cross on the agbada's chest was taken off). A cap or head wrap hides the hairstyle; only skin and the hair under the cap follow the child's colours.
- Lagos round 5 (Ladi 2026-11-11): things to bounce on must really be bounced on and heard: the talking drums now stand close together, a tap hops A onto the small one and each drum throws him onto the next (small, mid, big voices), the big one up to special 2. A vehicle drawn from several pictures must keep one size and place in every frame ("the buggy is getting big and smaller"): line every frame up on the vehicle's body (same length, back end, bottom), never on a separate fit per frame.
- Lagos round 6 (Ladi 2026-11-11, video): two climbing walls side by side need a clear gap (pillars 1.8 -> 2.5, towers 1.8 -> 2.3). One set of talking drums felt short: a second set makes the theatre last longer. A backdrop fade made by copying the canvas showed as a hard edge on the phone: fade with plain see-through strips, which look the same on every screen. A vehicle that flicks between two driving pictures looks jerky: drive on one picture with a gentle bob, and bumps the wheels ease on and off.
- Lagos round 6b (Ladi 2026-11-11): where a city backdrop gives way to open sea, don't fade or cut it: end it on a whole building (Lagos: the curved tower, and the mansion with its palm in front), then clear sky and sea. A tiled strip must not have buildings cut off at its tile edges (the beach sea strip's city cluster was taken out).
- Lagos round 6c (Ladi 2026-11-11, beach start): "a straight line cut" where the city sky met the beach sky, and the sun drawn in front of the last tower. The beach's own sky now comes in slowly over a long stretch starting behind the mansion, the sea starts behind the mansion too, the last tower is drawn after the beach sky (sun behind it), and the far ships were taken out of the beach strip so nothing shows see-through while the sky comes in.
- Lagos badge (Ladi 2026-11-11): the badge repeated the yellow bus from the card picture. A trip's badge and card picture must show different things; the Lagos badge is now a talking drum.
- Lagos outfit colour (Ladi 2026-11-11): a child's local outfit takes the colour of the top they picked (blue agbada / purple iro become their tee colour); beads, white stripes and shoes stay. Do the same for any future local outfit.
- New York round 2 (Ladi 2026-11-12, video): snow piles are fun as deep snow: A sinks in up to his head (only the head shows) and a tap jumps him out; no people standing at a snow pile. A wide room picture repeated side by side showed a sharp line between two copies: run it on with every other copy mirrored. A room change at an archway must fade in softly, never cut. Subway: no train ride; A runs the platform while the train rushes past behind the platform's pillars. The ending picture must reach the top of the screen (no band of sky above it). Fun parts (the ice rink) can run longer, with lots of skaters and more jumps. Times Square billboards and the buildings before Rockefeller weren't grand enough: Manhattan should feel tall and grand.
