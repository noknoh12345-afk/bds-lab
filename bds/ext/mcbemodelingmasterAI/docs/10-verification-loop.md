# 10 — The verification loop

*Field-proven. Every line exists because something shipped broken without it.*

## 1. Checks before writing (`python <builder> --check`)

`forge.checks.validate` refuses to write a model with: too many cubes, duplicate cubes, z-fighting (at rest and in every pose), a stray cube, an asymmetric silhouette (unless `symmetric=False`), anything below ground or (vehicles) below the clearance, a rider sunk into a cube, a moving part crossing the centre line / entering a tyre / sinking into a fixed cube, a steering column poking out of its cowl.

## 2. Look at it (`tools/preview/render_model.py`)

The renderer applies the four facts of `docs/01`–`02`. Render:

- the default views, **and the camera the player will really have** (`chase` for a vehicle, first-person distance for a held item);
- **every pose** (`--anim ... --clip ...`);
- with the rider (`--rider x,y,z`) for anything ridden;
- a **light and a dark livery** (a logo or a seam that works on white may vanish on black);
- close-ups of whatever you just changed.

Then actually read the image. Things only a look finds: a body that "looks like a lizard", wings that are boards, a pillar that turns into a billboard, a hub that is one grey square, a front that is "too similar to the last kart".

## 3. Lint the file (`tools/inspect_model.py`)

Also — especially — for files a person saved from Blockbench: collapsed cubes (negative size), z-fighting between hand-placed wedges, UVs off the atlas, one-sided edits.

## 4. Tests in the consuming project

Pin what would fail silently: bone names and parents, locator names and positions, the seat agreeing across every table that holds it, clip symmetry and continuity, the open part facing the camera, every livery byte-distinct, the outer face of each wheel carrying its picture.

**Prove each new test.** Break the model on purpose (revert the fix, feed the old file) and see the test fail. A test that was never seen failing proves nothing: one of ours passed the very defect it was written for, because it checked the shaft's *end face* while the defect was where the shaft *left the cowl*.

When a feedback round fixes four defects, write four tests and show that the rejected model fails all four.

## 5. Report honestly

- Say what was rendered and what was not; a software render is not a game capture.
- "Fixed" means the diff shows it. Count what changed, do not estimate.
- List what the person must still check in the game (orientation of asymmetric art, particle positions, feel).
- Name pre-existing failures separately from new ones.
