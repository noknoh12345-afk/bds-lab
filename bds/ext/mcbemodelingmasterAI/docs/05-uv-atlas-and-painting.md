# 05 — UV atlas and painting by function

*Field-proven.*

## Layout

- **Every face owns its own rectangle** in one atlas, with a one-texel gutter. No face shares texels with another, so any face can carry its own picture and nothing bleeds.
- **Density is texels per model unit**, chosen per model (2 for a plain 256 atlas, 4 for a premium 512 one) and **overridden per face** where a picture must read: `dens={"west": 8}` for a wheel's outer face, a display, an instrument panel. Undersides and rough materials get half.
- Remember rule 1 of `AGENTS.md`: for a part on the +x side the **outer** face is labelled `west`. Spend the density there, not on the inner face.
- A face that is buried or that no view can ever show gets **one texel** (`docs/09`).
- The atlas may be non-square (`atlas=(512, 384)`): the height is whatever the faces need. VRAM is width × height × 4 × the number of liveries.

## Painting

A texture is a function `decal(p)` of the texel:

| field | meaning |
| --- | --- |
| `p.cube`, `p.face` | the cube (name, size, material, decal name) and face label |
| `p.u`, `p.v`, `p.i`, `p.j`, `p.w`, `p.h` | position in the face, 0..1 and in texels |
| `p.local()` | the texel's exact point in the cube's own frame, **as the game draws it** |
| `p.col` | the colour the material gives; `p.palette`, `p.fixed` the livery and the fixed colours |

Returning `None` cuts the texel out (the entity material must be alpha-tested).

Rules that came from rejections:

- **Place by position, not by index.** A scale lattice, a pinstripe at one height, a door's shut line, a plank seam: compute them from `p.local()` (add the cube's rotation for model space), so they keep their pitch and run on across cubes.
- **Radial pictures for round things.** A wheel is eight rotated slabs; a picture that depends only on the radius (and repeats with the slabs' angle) shows no seams and survives the left/right mirror.
- **Keep asymmetric art off faces whose orientation you have not verified** (text, numbers, a clock's 12). Derivation has been wrong before; one look in the game settles it.
- **Shade the body by height, not per cube.** A per-cube gradient bands where cubes meet. Give the body its own material and shade it by model y.
- **No grain on a large atlas.** Per-texel noise made seventeen 512 × 512 liveries weigh 3.7 MB; without it 680 KB, visually identical in the game. A palette PNG was tried and rejected: it steps in gradients.
- **Liveries**: the palette may override any material per variant (the paint always; glowing eyes only on the white one). Make every variant byte-distinct, and test that.

## Cut-out plates (the vanilla way to make anything thin)

A zero-thickness cube with `only=("up", "down")` (or one face) and a decal that returns `None` outside an outline is how the vanilla Ender Dragon makes its wing membranes. The client entity must use an alpha-tested material (`entity_alphatest`). Because that material draws both faces of the plane over each other, **the two faces must agree at every point**: paint by `p.local()`, never by `p.i / p.j`; the forge lights both alike and gives both the same density. Look at the atlas with a magenta background to check the outline (`docs/10`).

## Emissive and cut-out (entity materials)

- `entity_alphatest`: alpha below the threshold is cut. Use it for plates, grilles, cut-out ornaments.
- `entity_emissive_alpha_one_sided`: alpha 255 = lit by the world, low alpha (we used 8) = self-lit, 0 = cut. Useful for a watch face that glows at night.
- A second geometry on the same entity with its own texture and render controller is the clean way to add a shared badge to models whose atlas is full.
