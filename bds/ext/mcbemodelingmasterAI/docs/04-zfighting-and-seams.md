# 04 — Z-fighting and seams

*Field-proven.*

## Z-fighting

Two faces that **look the same way, lie in one plane and overlap** flicker in the game. Editors rarely show it; players always see it.

- It is not only axis-aligned boxes. Two links tilted by the same angle share a plane just as well; so do a yawed wall and the yawed plank above it; so do two little wedges a person dropped in by hand. The check must compare **face polygons in model space**, rotated cubes included, **at rest and in every animated pose** (`forge.checks.coplanar_faces`, `tools/inspect_model.py`).
- Faces that look *opposite* ways on one plane are harmless (one is hidden).
- The cure: move one part **0.02–0.05** along the normal, or make it that much smaller. Build the habit in: alternate links of a chain 0.03 narrower, tyre slabs each their own width, a rail 0.04 above the lid beside it, a panel 0.06 inside the shoulder above it (which also gives a shadow line).
- Near-coplanar faces that *cross* are fine; only parallel ones fight.

## Seams: the other half of the rule

Setting parts a hair apart creates **thin step faces** between them. If those steps keep their cube's default colour, they read as **cracks** (the art director circled four of them on one tyre).

> Paint the step so that it continues its neighbour.

- A tyre or a wheel disc made of rotated slabs: paint the slabs' chord faces with the same rings **by radius from the hub**, not per cube.
- A chain link's end face that shows past the next link: give it the side face's colour *and brightness* (faces are shaded by direction; compensate: `colour * light[side] / light[this face]`).
- A line that runs along several cubes (a pinstripe, a shut line, a waist strip): place it **by position in model space**, so it crosses cube boundaries unbroken.

What remains after this is a hairline of different lighting at run time. That is acceptable; a dark crack is not.

## Collapsed cubes

Dragging an edge past its opposite face in an editor leaves a cube with a **negative or zero size**, usually on one side only. It is invisible in the editor and z-fights in the game. `tools/inspect_model.py` reports it; delete it.

## Gaps

- A stray cube that touches nothing is a mistake: inside each assembly every cube must touch another (`groups` in the spec).
- Slivers between a round opening and a straight part (a wheel arch meeting a door) are closed by running the curved links on into the straight part.
