# 16 — Case studies

Four karts, a wrist watch and a demo dragon: what each taught. No assets of the originating game are in this repository; this is the record of the lessons.

## Falcon (first kart; Claude)
- **Brief:** at most 250 cubes, wheel bones A–D, particle locators, a transforming booster, cockpit fitted to the seated player, slimmer than the existing karts, no z-fighting, nothing disconnected.
- **Rejected 1:** "curves are stair steps" → tilted boxes joined corner to corner.
- **Rejected 2:** "one edge meets, but there is a gap" → splay boxes where widths step (the director saved an example model), valleys filled by running links past the corner.
- **Rejected 3:** asked only to smooth the steps, the AI redesigned the nose as a faceted fan → "restore it and do it again". *Fix what was pointed at.*
- **Director's own hand edits:** tilted ends run into their neighbours; cowl plate and cheeks share one pivot; the instrument panel takes the cowl's rake; covers narrower and steeper.
- The name *Kestrel* became *Falcon*: familiar words.
- The first physics footprint, eyeballed, was inside the body on three sides → the measuring method (`docs/13`).

## Cobra (second kart; Claude)
- The shared builder library (the forge) was written here.
- **Rejected:** "the front is too like the Falcon, and this is a lizard, not a cobra — the snake head plays apart from the car" → the car's own face became the cobra's face; the rear's language was carried to the front.
- A booster modelled open and folded by the bind pose; animation rotations add to the bind.
- The director later reworked the face by hand, turned the eyes into pop-up headlamps (zero-thickness plates and transparent texels — *their* choice, for that kart), and moved the cowl back over the steering column. The builder was brought to their file each time.
- Pop-up lamps moved from the spawn animation to a speed-driven state controller (`docs/08`).

## Sirius (third kart; Claude) — premium, a 1930s grand roadster
- Web research first (long bonnet, upright radiator and mascot, pontoon fenders, wire wheels, boat tail, coachlines).
- 512-wide atlas, per-face density, no grain; boot lids that rise like wings showing a night sky.
- **Rejected 1:** "cracks" on the whitewalls → step faces painted to continue their neighbours.
- **Rejected 2:** "painted but hidden" → the visibility passes; and the discovery of **the x mirror** (`docs/02`): the hubs' outer faces had been blanked.
- Heavy loops moved from Python to Node: 150 s → 24 s.

## Vega (fourth kart; Codex, then rebuilt by Claude) — premium, a modern saloon
- Codex received a written handoff of all of the above. It passed every check, registered everything, and painted a good grille, instruments and wheels.
- **Rejected:** the fascia stood proud and showed its sides; a large box floated over the front wheels; pipe stays crossed the booster's panels; the rear wheels showed from the seat; only the nose had been raised; the whole lacked refinement.
- **Rebuild:** flush body sides with wheel arches and chamfered corners; one shoulder line; a closed tub; the rear structure ahead of the hinge; four new tests, each shown to fail on Codex's model.
- An independent audit of Codex's performance sheet found it safe — the rules-and-numbers part was fine. What was missing was *looking*.
- Then the director hand-finished it; the linter found a collapsed cube (size −0.04, one side only) and two wedges on one plane in their save.

## The wrist watch (attachable; Claude)
- Slim- and wide-arm geometry, shared animation and icon; hands driven by `query.time_of_day`; a night face through emissive alpha.
- The dial's orientation was derived instead of verified and was 90° off. *Verify asymmetric art in the game.*

## The demo drake (this repository; Claude)
- **Rejected 1:** one flat board per wing. **Rejected 2:** a fan of box panels. "Go and look at the vanilla Ender Dragon." → two jointed segments, each a bone plus one zero-thickness membrane plate with a painted, alpha-cut, scalloped outline; both faces painted by position (`docs/07`).
- **Rejected 3:** "Look more closely — what is this?" The plates had been turned with their swept bones: the folded wing showed square board corners, the membrane cut through the body, spikes stood edge-on. → both plates in one wing plane, each inner edge on its hinge line, turning about that axis only; everything ahead of the bone cut away; deeper scallops; a rest pose half raised and bent at the wrist.
- Then the visibility pass was found blanking the underside of the arm web (a solid board from below) → two-faced plates are never blanked; `seen_from_below`.
- The checks caught the rest: two ribs on one plane, a folded wing arm inside the back, a down-stroke that sank the arm into the torso.

## The pattern
Every rejection was something a render would have shown and a rule could have prevented. The rules are in `AGENTS.md`; the render is one command.
