# 15 — Review checklist

Answer every line with evidence (a command's output, a render, a diff). "I believe so" is not an answer. `data/review-checklist.json` is the same list for machines.

## Geometry
- [ ] `--check` passes: cube cap, no duplicates, no z-fighting at rest **and in every pose**, no stray cube, symmetric (or deliberately not), nothing below ground.
- [ ] `tools/inspect_model.py` on the written file: no errors; every "no mirror image" note explained.
- [ ] No stair steps anywhere a curve or diagonal was meant. Width steps splayed, valleys filled, tilted ends run into their neighbours.
- [ ] The body is closed: no face shows its own sides, nothing floats, no inside visible from the player's viewpoints (sight-line test where it matters).
- [ ] One silhouette: side view balanced from end to end.
- [ ] Thin things are cut-out plates, not boards or box fans; vanilla's own solution was looked at first.

## Fit
- [ ] Rider / hand / head fit checked against the pose the game shows; render with the rider.
- [ ] Steering column buried; nothing in the driver's arms' way.
- [ ] Wheels clear the body at full steering lock.

## Moving parts
- [ ] Modelled open, folded by the bind pose; clips add to the bind.
- [ ] Poses listed and checked: folded, half, open, overshoot (and the extreme of any loop).
- [ ] Nothing fixed in any moving part's path; fixed structure is ahead of the hinge.
- [ ] The display face really faces the camera (normal test), left and right are mirrors, open/close continuity holds.
- [ ] Effect locators sit where the effect belongs (in the moving bone, if the glowing core moves).

## Texture
- [ ] Outer faces identified with the x mirror in mind (`west` on +x parts); pictures and density are there.
- [ ] Step faces continue their neighbours; no cracks on wheels, links, panels.
- [ ] Lines that cross cubes are placed by position.
- [ ] Two-faced plates painted by position; atlas viewed on magenta to check outlines; material is alpha-tested.
- [ ] Buried and never-seen faces are one texel; nothing meant to be seen is covered.
- [ ] Every livery is distinct; checked in a light and a dark one.
- [ ] Atlas cropped to what is used; file sizes sane.

## Proof
- [ ] Rendered: default views, the player's camera, every pose, close-ups of what changed.
- [ ] Each new test was seen failing on the broken model.
- [ ] Footprint measured, margins 0–0.03.
- [ ] The report says what was rendered, what only the game can show, what was decided without being asked.
- [ ] Human hand edits preserved; any fix to their file listed, their original kept.
