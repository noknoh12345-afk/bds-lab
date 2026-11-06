---
name: mcbe-model-transforming-parts
description: Make parts of a Bedrock model open, fold, unfold, pop up or transform with animations: model open, fold with the bind pose, check every pose, keep fixed parts out of the path, speed-driven state controllers.
---

# Transforming parts

Full text: `docs/08-transforming-parts-and-animation.md`.

1. Model the part **open**, its picture facing the camera that will see it. Fold it with the bone's **bind rotation**. The clip **adds** the opening.
2. Hinge at the folded part's top front edge, so its thickness is behind the hinge when it stands.
3. A panel meant for a camera above and behind leans **forward**; test its outward normal.
4. **Nothing fixed in its path**: fixed structure ahead of the hinge, raked steeper than the part leans at its overshoot.
5. List the poses (`folded/rest`, `half`, `open`, `peak`, extremes of loops) in `spec["poses"]`; the forge re-checks z-fighting, the centre line, tyres and intrusion for each. Render each.
6. Left/right mirrors: rotation `[x, -y, -z]`, position `[-x, y, z]`; open/close continuity; never `-0.0`.
7. Effects' locators live in the moving bone if the glowing core moves.
8. Parts that wake with motion: a three-state controller (`parked / driving / stopping`) on a smoothed speed, with hysteresis — not the spawn animation.
