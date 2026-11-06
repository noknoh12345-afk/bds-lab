# 06 — Vehicles

*Field-proven on four karts. The numbers are one project's; the method carries to cars, boats, aircraft, mounts and anything else a player sits in.*

## Skeleton

```
root
 ├─ body                (everything fixed; pivot near the centre of mass)
 │   ├─ steering_column ─ steering_wheel
 │   └─ <transforming parts, left / right>
 ├─ A  B  C  D          (wheels: A front-left (+x), B rear-left, C front-right, D rear-right; A and C steer)
 └─ <anchor bones with locators for particles: skid marks, exhausts, trails>
```

- Wheels are their own bones at the hub, children of `root`, so the body can lean without them.
- **Locators** mark where effects appear. Put each where the effect *belongs*: an exhaust flame at the nozzle that lights up — and if a transforming part carries the glowing core, the locator lives **in that part's bone** so it moves with it. A trail whose path is computed by the server from fixed offsets must stay on a bone that does not move.
- A part that wakes when the vehicle drives (pop-up lamps) belongs to a small state controller keyed on speed, not to the spawn animation.

## The rider comes first

Decide the seat, then build around the **pose the game will show** (`hip` in the spec; `rider_parts` in `forge/checks.py` is an example seated player with arms forward). The check fails when any part of the rider sinks more than 0.35 into a cube.

- Hands reach further than you think (in our pose: x 4–8, down to y ≈ 9.7, forward to z ≈ −8.5). A windscreen wider than the gap between the arms must stand forward of the hands; a door top under the arms must stay below them.
- The **steering column** must stay buried in the cowl for its first quarter (`shaft_buried`). Twice it poked out in front of the windscreen and was fixed by hand.

## A closed body (the Vega lesson, `docs/16`)

1. Put the body side **flush with the tyres' outer faces** and cut a **wheel arch** over each wheel: a polygon of tilted lips 0.4–0.5 off the tyre, a hair proud of the side.
2. **Chamfer the corners in plan**: yawed panels from the ends of the front (and rear) face back to the arches. The face then never shows its flat sides, and nothing needs to "float" over the wheel to hide a hole.
3. Mind the **steering sweep**: a tyre of radius r and width w turned 30° reaches `w/2·cos30 + r·sin30` sideways (inward too) and `r·cos30 + w/2·sin30` forward. Keep corner panels, the engine bay's walls and arch ends outside it.
4. **Wall off the cockpit**: tub walls from the scuttle to the rear bulkhead, doors from arch to arch. Test it with sight lines from the seat to each tyre's inner face.
5. **One shoulder line** from nose to tail, fender peaks a little above it, the deck between the haunches. If the nose is raised, the sides and the tail follow.
6. Panels under the shoulder stand 0.05 inside it: a shadow line instead of a z-fight.

## Wheels

Eight slabs rotated 22.5° apart make a 16-sided tyre; each slab its own width (steps of 0.07) so no two share a side plane. A disc of four slabs carries the rim picture. Pictures are radial. The outer face of a +x wheel is labelled `west`.

## Smaller than you think

A kart that is slimmer and shorter than its neighbours reads as *designed*. Ours: about 20 × 41–43 units against 28 × 45 for the earlier ones, under a 250 cube cap.

## Aircraft, boats, mounts

The same skeleton with other moving bones: control surfaces, propellers (a spinning bone: list it in `spinning`), landing gear that folds (model it down, fold with the bind pose, check both poses against the fuselage), a sail, a rudder. *Not yet shipped by us; the method is the kart's.*
