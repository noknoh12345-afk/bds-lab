---
name: bds-pixel-art
description: Draw and animate pixel art for an addon: item icons, particle sheets, pack icons, texture details, HUD sprites, frame strips. Use when asked for ドット絵, a sprite, an icon, a pixel animation, or an animated GeoUI element.
---

# Pixel art

Not for model geometry or entity animation (`bds-models`) or JSON UI layout (`bds-json-ui`).

1. Draw as code: `node bds/ext/claude-pxl/bin/pxl.js build art.px.js --only coin` (skill `pxl-pixel-art`): one-character palette keys, write the left half and mirror it (`mx: true`), let `outline: "k"` draw outlines, 2-4 tones per material, no filler noise.
2. Look before judging: read `out/_preview/coin.png` (checkerboard = transparent), or `node bds/ext/claude-pxl/bin/pxl.js ascii art.px.js coin` for exact pixels; fix one op, rebuild.
3. Animate as frames (skill `pixel-art-animator`): `anim("coin", { fps: 10 }, frame(), frame(...))`, each frame a patch over shared pixels; 100 ms (10 fps) by default, idle 2-4 slow frames, a walk 4-8, an impact one short frame; the last frame of a loop leads into the first. Build writes `anims/coin.png` (a strip), `.json` (durations) and `.gif`.
4. Only GeoUI animates: stack the frames vertically in one texture, give its material `"+defines": ["USE_UV_ANIM"]` and its render controller `"uv_anim": { "offset": [0, "math.mod(math.floor(q.life_time * 10), 8) / 8"], "scale": [1, 0.125] }` (8 frames at 10 fps; source: Bedrock Wiki, animated entity texture). Entity and item textures stay one frame.
5. Ship RGBA PNGs (indexed PNGs lose partial alpha): item icons 16x16 named in `rp/textures/item_texture.json`, particle sheets white so the emitter's tint colours them; then `node lab.mjs check` and `node lab.mjs pack`.

Done when every preview was read and `check` passes. Report: the previews you read, frames and fps per animation, and that a flipbook's look in the client is unverified until a screenshot shows it.

<!-- rules:begin (node lab.mjs skill build writes these from skills/knowledge.json) -->
<!-- rules:end -->
