# Pinned GeouiStudio contract

[Au12jp/GeouiStudio](https://github.com/Au12jp/GeouiStudio/tree/7fe110f22385b1a44ea8ba01c2a6817b888b6893), commit `7fe110f22385b1a44ea8ba01c2a6817b888b6893` (2026-08-01), Apache-2.0. Source facts below come from static `index.html` analysis, not a Bedrock execution. The upstream source stays in an optional hash-verified research cache. Preserve licensing/attribution when reusing actual source; the patterns described here do not require bundling its editor.

## Display graph

- `GGen.build` (1855–2216) filters enabled layers and generates geometry, atlas texture paths, render controllers, material definitions and transforms.
- `planeGeo` (2230–2255) uses a `geo_ui` root, per-layer bone, zero-depth cube, north-face UV and Y=140 center. Z order is `-0.2*(layer+1)-z` (1933). These are this generator's calibration values.
- `playerClientEntity` (2260–2310) writes `entity/player.entity.json`, keeps vanilla controller branches and `enable_attachables:true`, and attaches generated controllers guarded by `q.is_in_ui`.
- `hudScreen` (2364–2405) writes a `live_player_renderer` within `hud_content`. Its existing controls list is generated wholesale; an integration must preserve the destination HUD's other controls.
- `playerBehaviour` (2409 onward) writes `entities/player.json` with client-synchronized integer properties. Both player files require ownership/merge review.

## Modes and state

`needScript` (1869–1874) depends on script timing, scenes, audio, aspect/calibration, IPC and numeric layers; `rpOnly` suppresses BP entirely. Ordinary loop time uses `q.life_time`; script time uses `gen`, `seek`, `playing` properties (1881–1904). `scene`, score/bar values and explicit `visibleWhen` can still introduce property dependencies, so inspect emitted dependencies even for RP-only mode.

Properties include aspect×1000, scale×100, offsets×10, center correction×10000, alpha0..100, scene -1..128 and v0..v3. Score synchronization runs every two ticks (3255–3265,3427). A custom `scoreProp` must be declared and synchronized; naming it in a layer creates neither property nor producer.

Generated inputs are custom commands, item-use triggers, setup ActionForms and optional IPC (2514–2516,3270–3306,3337–3424). They do not provide arbitrary clickable hit regions on the displayed geometry. An editor button or desktop drag handle is not an exported game interaction.

## Alpha, outline and limits

Materials distinguish cutout, alpha blend and additive; fading layers switch away from cutout (1957–1959,2118–2132). Text outline is rasterized canvas stroke (1541–1542), not a general geometry-outline shader. Shader support, sorting and depth need target-client tests.

RGBA/auto PNG modes preserve alpha bytes; indexed mode reduces alpha to one transparent palette entry (1144–1179). Preserve semi-transparent art with RGBA rather than assuming indexed mode is lossless. The generated `alpha` command uses `Number(arg1)||100` (3410), so literal zero falls back to100; do not copy that conversion.

New editor state uses176 units/screen-height (3705–3713), while generator fallback is22.5 (1653). Device aspect and center values are estimates/calibration, not viewport measurement. The author sets a120-segment key reduction limit (1769), defaults atlases to2048 and warns above that size; these are tool choices, not universal engine limits.
