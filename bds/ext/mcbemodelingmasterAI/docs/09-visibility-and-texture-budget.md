# 09 — Visibility and the texture budget

*Field-proven. The art director: "You painted this well, but on the model it is covered by another cube and nobody sees it. If it is not used, remove it and save the space; if it was meant to be seen, make it visible."*

## Two passes

1. **Buried faces** (`forge.output.buried_faces`): a face that lies wholly inside other cubes **of its own bone** — sampled on an 11 × 11 grid that includes the edges, a hair outside the face. Other bones move, so they never bury a face. Rotated cubes count.
2. **Unseen faces** (`forge/visibility.py` + `visibility.mjs`): every face is drawn by id into a z-buffer from some 170 directions (straight above down to 15° below level), at rest **and in every listed pose**, at about 32 pixels per model unit so that the thin steps between parts set a hair apart still count as seen. A face that never wins a pixel gets one texel.

Both use the game-true face positions (`docs/02`). The first version of pass 1 used the naive reading and blanked the *outer* face of every wheel hub.

## Bones that move freely

A bone that an animation moves without a listed pose — a wheel that spins, a steering wheel, a neck, a tail, legs — goes into `spinning`. Its faces are judged only by burial inside its own bone. Otherwise what hides a face at rest (a fender over a tyre) blanks a face the motion reveals.

## Things seen from underneath

The default directions stop 15° below level: nobody looks up at the floor of a ground vehicle. A model that flies, is held in a hand, is worn, or stands as a prop sets `seen_from_below=True`, which adds the directions from underneath. Without it the underside of a wing is "never seen" and gets one texel.

## Two-faced plates are never blanked

A cut-out plate (`only=("up", "down")`, `docs/05`, `docs/07`) has two faces in one plane, drawn over each other. If the pass reduced one of them to a single texel, that texel's colour would be stretched over the whole plate — over the cut-out too — and fight the other face. The forge therefore never blanks either face of such a plate, and `tools/inspect_model.py` reports a two-faced plate whose faces differ in size as an **error**. (We found this on the demo drake: the underside of the arm web was blanked, and the wing turned into a solid board from below.)

## What it bought

| | before | after |
| --- | --- | --- |
| one-texel faces (204-cube kart) | 26 | 105 |
| atlas | 512 × 512 | 512 × 384 |
| VRAM, 17 liveries | 17 MB | 12.75 MB |

## Spending the budget

- Density per face: the picture faces get 6–8 texels per unit, their inner twins 3, plain big surfaces 2–3.
- Large flat pearl panels do not need 4 texels per unit; a wheel's outer face does.
- Check the result independently: `tools/inspect_model.py`-style audit with a *different* set of directions, listing one-texel faces that some view does show. What remains should be faces that are one texel wide anyway or a single flat colour.

## Speed

The z-buffer loop over ~1000 faces × 170 views × 2 poses took two minutes in Python and sixteen seconds in Node. The liveries are painted in parallel processes. Keep heavy loops out of Python; the maintainer asked for exactly that.
