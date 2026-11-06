# Outline ownership

First identify the requested effect and read the source that implements it:

| Appearance | Verify |
| --- | --- |
| Pixel icon/panel border | Texture alpha, integer scale, nine-slice corners and all button states |
| Rasterized text outline | Text is stroked into an RGBA image; verify glyph padding, scale and alpha. GeouiStudio uses this path for its text outline. |
| Geometry silhouette | Separate visible geometry, bone transforms, overlap, culling and camera projection |
| Glow-like edge | Material/texture effect, background contrast and actual graphics mode |
| Through-wall or stencil outline | Concrete target-client evidence for the required renderer behavior |

Do not translate a JSON UI border into a model shader or a geometry layer into a clickable control. A duplicated/inflated model may change silhouette but can produce seams, clipping and depth artifacts. Treat it as a design candidate to inspect at the required angles, not a universal recipe.

For GeouiStudio, inspect the generated material, render controller and geometry together with the camera/player integration. Record whether the effect is visible in first person, third person and with overlapping panels. For equipment attachables, also check both hands. Check distant/near backgrounds and animated poses. Keep the source version and observed failure beside the result; the mere presence of an outline option in an editor is insufficient.

Use the material audit for unsupported/deprecated-key warnings and the attachable graph for dependencies. Neither tool certifies silhouette quality or visibility through other geometry.
