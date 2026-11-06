# 07 — Creatures, aircraft, weapons, props

*The method of the other documents applied beyond vehicles. Checked with the tools and with `examples/build_demo_drake.py`; **not yet shipped in a product by us** — treat numbers as starting points and verify in the game.*

## Creatures (monsters, dragons, animals, bosses)

**Skeleton: one bone per thing that moves, pivot at the real joint.**

```
root ─ body ─ neck ─ head ─ jaw
            ├ tail ─ tail_tip
            ├ wing_left ─ wingtip_left      (arm, then hand: see below)   wing_right ─ wingtip_right
            └ leg_fl  leg_fr  leg_bl  leg_br      (add knee bones only if the animation bends them)
```

- **A curved body is a chain.** Back, neck and tail are runs of tilted links joined corner to corner in the side profile (`chain`), never stepped boxes. Each chain's end runs **into** the part it joins (neck into chest, tail into hips), so a moving joint never opens a gap.
- **A sideways curve** (a coiled tail, a horn sweeping outward) is the same idea in plan: yawed links (`plank`, `taper_walls`).
- **Limbs**: thigh and shin tilted opposite ways, meeting at the knee; feet flat **on** the ground (leave `ground_clearance` out of the spec).
- **A wing is a jointed limb with a cut-out membrane — build it the way the vanilla Ender Dragon does.** Two of our drafts were rejected: one flat board per wing, then a fan of box panels. The maintainer: *"go to the vanilla resource pack and look at how the Ender Dragon's wing is built and painted."* What is there (`models/entity/ender_dragon.geo.json`, `textures/entity/dragon/dragon.tga`):
  - two jointed segments, `wing` and `wingtip`, each **one leading-edge bone cube plus ONE zero-thickness plane** (56 x 0 x 56) behind it;
  - the membrane's **curved, scalloped trailing edge and its finger bones are painted in the texture; everything outside the outline is transparent**, and the entity material is alpha-tested, so the plane is drawn in that shape;
  - the plane's two faces carry the same picture, one the mirror of the other, so the outline matches from above and from below.
  So, in the forge: a plate `only=("up", "down")` behind each bone, a decal that returns `None` outside the outline, **painted by position** (`p.local()`), material `entity_alphatest` on the client entity. See `membrane()` in `examples/build_demo_drake.py`.
  - **Why "by position" is not optional:** both faces of a plate lie in ONE plane and the alpha-tested material does not cull back faces, so the two are drawn over each other. If they differ at any point — a different outline, a different light — they z-fight. Painting by position makes the second face the mirror of the first; the forge gives both faces the same light, no grain, the same density.
  - A span of two to three body widths; smaller reads as a toy.
- **Wings, frills, crests, fins, jaws**: model them **open / spread**, hold them at rest with the bones' bind poses (arm half raised, hand bent down at the wrist), add the opening in the animation (`docs/08`), and let the hand **lag the arm by a phase** in the flap. List `folded`, `spread` and the extreme of the stroke as poses: the check proves the wing never crosses the centre line or sinks into the body (ours did, at the bottom of the first stroke).
- **The same plate technique** serves fins, ears, frills, leaves, cloth, hair, feathers, cobwebs, grilles, banners: any thin thing with an outline that boxes cannot make.
- **Symmetry**: build the left, `mirror` it. Put asymmetry (a scar, a broken horn) in deliberately and set `symmetric=False` only if the silhouette itself is one-sided.
- **Looping motion** lives in Molang, added to the bind: `"33.0 + math.sin(q.life_time * 540.0) * 20.0"` for a wing, a phase-shifted sine down the tail bones for a sway, `q.modified_distance_moved` for legs.
- **Visibility with free-moving bones**: a bone an animation moves without a listed pose (neck, tail, legs) goes into `spinning`, so only burial inside its own bone may blank a face. Otherwise a swinging leg reveals a one-texel patch.
- **Scale and hitbox**: the collision box is the behaviour pack's; the model may overhang it, but attacks and name tags are placed from it. Keep the head inside a sensible radius of it.

## Aircraft and other machines

Treat them as vehicles (`docs/06`): a closed fuselage from chains and chamfered corners, one bone per control surface, a propeller or rotor as a spinning bone, folding gear checked in both poses, the pilot fitted first.

## Weapons, tools, held cosmetics

- A held item is an **attachable** (`docs/12`): its geometry is bound to a player bone (`rightItem`, `leftItem`) and lives in that bone's frame. Build it around the grip at the bone's pivot.
- **Blades and staves are long thin boxes — tilt them, do not step them.** A curved blade is a chain in the blade's plane; a guard that widens is a splay; an edge bevel is a rolled strip along the edge (`roll_chain_pair`).
- A one-sided item is not symmetric: `symmetric=False`.
- **First person shows the item very close.** Give the faces toward the camera the density; blank the faces buried in the hand.
- Glow (runes, a plasma edge): emissive material or a second bright colour; keep it symmetric unless you verified the orientation in game.

## Props, blocks-as-entities, decorations

Small, static, seen from all sides: the visibility pass saves little, the z-fight and seam rules matter most. If it opens (a chest, a door, a gate), it is a transforming part.

## What carries over unchanged

Rules 1–5, 8–11 and 13–15 of `AGENTS.md`; the loop; the linter; the renderer. What does **not** carry over: a vehicle's numbers (seat, wheel sizes, the 250 cube cap) — set your own.
