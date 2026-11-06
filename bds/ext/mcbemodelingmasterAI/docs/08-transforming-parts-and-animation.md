# 08 — Transforming parts and animation

*Field-proven: a kart's cobra hood, boot lids that rise like wings, pop-up headlamps. The drake's wings use the same method.*

## Model it open, fold it with the bind pose

1. Build the moving part in the pose where its picture matters — **open** (the display faces the camera that will look at it, e.g. `south` for a camera chasing a vehicle).
2. Give its bone a **bind rotation** that folds it away.
3. The animation **adds** the opening to the bind. A clip value of `0` is folded; the last keyframe is "bind + this = as modelled (plus any lean you want)".

```python
FOLD = (-98, 0, 0)              # bone bind: the lid lies on a deck pitched 8 degrees
OPEN = (108, 0, 18)             # added: 10 degrees past upright (leaning FORWARD), spread 18 out
PEAK = (113, 0, 22)             # an overshoot keyframe before it settles
```

Why open-first: the picture is painted upright and unrotated, the checks see the real open geometry, and the folded pose costs one rotation.

## Rules that came from mistakes

- **A panel that must face a camera above and behind leans FORWARD.** Leaning back turns its face to the ground. (Our test: the open panel's outward normal has z > 0.9 and y > 0.)
- **Hinge at the folded part's top front edge**, so that when it stands its thickness is *behind* the hinge and does not dig into what is in front of it.
- **Nothing fixed in the path.** Put pillars, hoops, fairings in FRONT of the hinge and rake them steeper than the open part leans at its overshoot. Codex's pipe stays crossed the panels; the rebuild moved the whole rear structure ahead of the hinge.
- **A yawed wall's front end is diagonal** and intrudes under a folding part: set the wall's top a hair below the plane the part folds onto, so it slides beneath.
- **Left and right are mirrors**: rotation `[x, -y, -z]`, position `[-x, y, z]`; never `-0.0` in a file.
- **Open / close continuity**: the last key of the opening clip equals the first key of the closing clip; the closing clip ends at `[0, 0, 0]`.
- **Effects belong to the part that glows.** If the transforming part carries the bright core (a nozzle, a star), the emitter's **locator lives in that part's bone** and moves with it. (Found late, on three karts: their exhaust locators sat at ordinary tail pipes while the visual core was on the booster.)

## Check every pose

List the poses in the spec: `folded`, `half`, `open`, `peak`. For each the forge checks z-fighting again, that moving cubes do not cross the centre line, do not enter a tyre, and do not sink more than `pose_tolerance` (0.25) into a fixed cube. Render each pose too.

## Parts that wake when the entity moves

Pop-up lamps were first keyed into the shared spawn animation. Better: a small **animation controller** with three states — `parked` (loop: folded), `driving` (play `drive_on`, hold), `stopping` (play `drive_off`, hold) — switching on a smoothed speed variable, with hysteresis (up at 10 km/h, down below 9) so the part does not flutter at the threshold. A model opts in by naming its own three animations. The same pattern serves a creature's crest that rises in combat, landing gear, an idle/alert pose.

## Looping motion

Write it in Molang, remembering it is added to the bind:

```json
"wing_left":    { "rotation": [0, 0, "33.0 + math.sin(q.life_time * 540.0) * 20.0"] },
"wingtip_left": { "rotation": [0, 0, "-47.0 + math.sin(q.life_time * 540.0 - 70.0) * 25.0"] }
```

The second line lags the first by a phase: hands, tail tips and antennae follow, they do not lead.
