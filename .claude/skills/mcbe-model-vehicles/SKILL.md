---
name: mcbe-model-vehicles
description: Model a Bedrock vehicle the player rides: kart, car, boat, aircraft, mount with a seat. Covers the skeleton, rider fit, a closed body with wheel arches and chamfered corners, steering sweep, wheels, locators.
---

> Vendored from iMasterProX/mcbemodelingmasterAI (MIT). Every path below (`docs/`, `tools/`, `examples/`, `data/`) is relative to `bds/ext/mcbemodelingmasterAI/`. In this lab also: `node lab.mjs render <id> --anim <clip>@0|@end` and `node lab.mjs check` (skill `bds-models`).

# Vehicles

Full text: `docs/06-vehicles.md` (field-proven on four karts).

1. Skeleton: `root` → `body` (fixed) → `steering_column` → `steering_wheel`, transforming parts; wheels `A B C D` as children of `root`; anchor bones with particle locators.
2. **Rider first**: set `hip`, build the seat, run the rider check, render with `--rider`. Hands reach further than you think; a wide screen stands forward of them; the steering column stays buried (`shaft_buried`).
3. **Closed body**: sides flush with the tyres, a wheel arch over each wheel (lips 0.4–0.5 off the tyre), **chamfered corners in plan** from the ends of the front/rear face back to the arches, tub walls from scuttle to bulkhead, doors from arch to arch.
4. **Steering sweep**: a tyre (radius r, width w) at 30° reaches `w/2·cos30 + r·sin30` sideways and `r·cos30 + w/2·sin30` forward. Keep panels and inner walls outside it.
5. **One shoulder line** nose to tail; if one end is raised, raise the rest.
6. Wheels: eight slabs, each its own width; pictures radial; outer face of a +x wheel is `west`.
7. Locators sit where the effect belongs — in the transforming bone, if the glowing core rides it.
8. Set `ground_clearance` in the spec; measure the physics footprint (`mcbe-model-collision-footprint`).
