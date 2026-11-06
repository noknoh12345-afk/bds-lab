# 03 — Shape rules

*Field-proven. These are the art director's rules, in the order they were taught — each one after a rejected model.*

A Bedrock model is made of boxes, but it must not look like it was made of boxes stacked on a grid.

## 1. No stair steps

A curve or a diagonal made of axis-aligned boxes of decreasing size reads as a staircase. Make it from **tilted boxes joined corner to corner**: the top corner where one link ends is exactly where the next begins.

```python
# a back, a bonnet, a fender, a neck, a tail: points in the side profile (z, y), front to rear
model.chain("body", "back", -3.2, 3.2, [(-7.0, 12.6), (-2.5, 13.6), (3.0, 13.0), (8.0, 11.0)], 5.4, "paint")
```

`slope` makes one link (its TOP face runs from point to point, the thickness hangs below), `chain` a centred run, `chain_pair` a mirrored left/right run, `plank` a link in any plane, `arch`-style point lists give wheel arches and domes.

## 2. Where a width steps, splay

When a narrow part meets a wide one, do not leave a shoulder. Put a box with the narrow link's own tilt at the narrow corner and **splay it outward** (yaw it) until its far corner meets the wide link's corner. `taper_walls` builds such walls in plan; chamfered corners of a vehicle, a snout widening into a skull, a blade widening into a guard are all this. Small wedge-shaped gaps behind a splay are acceptable **if they cannot be seen from outside**.

## 3. Fill the valleys

Two links meeting corner to corner in a *concave* bend leave a wedge-shaped gap underneath. Run **both links on past the corner** (`chain` and `chain_pair` do this automatically: `extend`), so the gap is filled by overlap.

## 4. A tilted part's end runs into what it meets

If a raked part stops at its top line, its slanted end face leaves a gap at its foot. Extend it into the neighbour. (The drake's neck runs *into* the chest; a kart's nose wall runs *into* the splitter.)

## 5. Pieces that read as one share ONE pivot

A cowl made of a centre plate and two cheeks, a jaw with its teeth, a wing with its ribs: give them the same pivot, so that any later tilt keeps them together. Things that hang on a raked surface (an instrument panel, a badge) take that surface's rake.

## 6. Covers are narrower and steeper

A cover, lid or cowl over a body is narrower than the line beneath it and stands more upright — otherwise its corners overhang.

## 7. The design flows as one piece

The most original part of a design sets its language; **carry that language through the whole model**. Two rejections came from ignoring this: a snake's head stuck on a roadster's nose ("it looks like a lizard; the front and the sides play apart"), and a front end copied from an earlier kart. Make the vehicle's own face the animal's face; make the creature's horn line return in its spines and tail.

## 8. Closed, balanced, nothing floating

- A face (a front fascia, a snout plate) must not show its own flat sides: run corner panels back from its ends.
- No block hangs in the air over another part to "suggest" a volume.
- No inside is visible from where the player looks.
- If one end is raised, raise the rest. The whole silhouette is judged from the side.

## 9. Fix what was pointed at

When the art director marks a defect, repair that defect in the way they described. Replacing the whole part with a different design — even a better one — is rejected, because they were happy with everything they did not mark.

## 10. Names

Name things with familiar words. (A kart called *Kestrel* was renamed *Falcon*.)
