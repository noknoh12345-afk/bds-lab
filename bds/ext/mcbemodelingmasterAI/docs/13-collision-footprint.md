# 13 — Measuring a collision footprint

*Field-proven. The first footprint we eyeballed was inside the body on all three sides.*

Bedrock's own collision box is one axis-aligned box from the behaviour pack. A game that needs more (karts pushing each other, walls scraped at an angle) computes its own shape in script — ours is a **compound of three capsules**. Whatever the shape, fit it to the model by measurement.

## Method

1. Take the **structural bones only**: the fixed body. Leave out wheels, steering, transforming parts, and trim such as mirrors.
2. Transform every cube corner to its **rest pose** (cube rotation, then bone rotations; the game's rotation reading).
3. Project to the ground plane (x, forward) and take the **convex hull**.
4. Sample the hull's half-width in **101 slices** from tail to nose: the envelope.
5. Fit the shape with two constraints and two objectives:
   - the shape's **support** to the side, ahead and behind must be **0 to 0.03 blocks outside** the measured extreme — never inside (parts would clip through walls), never far outside (invisible bumpers);
   - minimise how far the envelope sticks out of the shape anywhere, then how far the shape stands off the envelope.
6. Re-measure whenever the body changes. A rebuilt body with chamfered corners left 0.37 blocks of envelope outside the old capsules; the refit brought it to 0.05.

For our three capsules: one long capsule along the body gives all three supports; a short transverse capsule at each end squares off the corners the long one rounds away. A search over a few thousand parameter sets takes a second.

## Test it

Recompute the measured extremes **from the geometry inside the test**, so the test follows the model; assert each margin is within 0–0.03 and that the shape's reach holds at several stations along the length. Then shrink a radius on purpose and watch it fail.
