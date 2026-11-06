# 12 — Attachables and wearables

*Partly field-proven: a wrist watch (slim- and wide-arm versions) and a left-hand charm shipped. Weapons and armour follow the same mechanics but were not shipped by us.*

## Mechanics

- An attachable's geometry is parented to a **player bone** (`rightItem`, `leftItem`, `head`, `body`, `leftArm`, ...). Its cubes live in that bone's frame; the bone's animations carry it.
- **Slim and wide player arms need separate geometry** (the forearm is 3 or 4 wide); share the animation and the icon.
- Rotation and the x mirror are as everywhere else (`docs/01`, `02`). A strap built from ±90° segments closes into a loop only under the correct rotation reading — a good self-test.

## Orientation: verify, do not derive

We derived which way a dial's "12" pointed from the UV rules, shipped it, and it was 90° off; the maintainer set it right in Blockbench. **Asymmetric art (numbers, text, a clock face, a crest) must be seen once in the game or in the author's editor before you call it done.** Until then, prefer symmetric designs.

## A working clock, as an example of Molang-driven parts

`query.time_of_day` runs 0 → 1 over a day (0 = midnight... check your version: 0.25 sunrise, 0.5 noon). Seen from below the wrist, a **decreasing** y angle turns clockwise:

```
hour hand    rotation y = 90 - 720  * q.time_of_day      (two turns a day)
minute hand  rotation y = 90 - 8640 * q.time_of_day      (twenty-four turns a day)
```

A day face and a luminous night face swap by scaling one to 0 inside a time window.

## Light

With `entity_emissive_alpha_one_sided`, the texture's **alpha is the light**: 255 = lit by the world, a low value (we used 8) = self-lit, 0 = cut out. That is how a dial glows at night without a second texture.

## Held items, first person

- Build around the grip at the bone's pivot; test the third-person pose and first person separately (first person is very close: density toward the camera, one texel where the hand covers).
- A one-sided item is `symmetric=False`.
- Blades: tilted, not stepped; a bevel is a rolled strip along the edge.

## Do not read what you were told not to read

Projects contain third-party or licensed models. If the owner says a file is off limits, it is off limits — work from the template they give you.
