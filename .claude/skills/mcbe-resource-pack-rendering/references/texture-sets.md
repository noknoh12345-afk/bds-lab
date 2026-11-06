# Texture sets and graphics modes

Verify each `*.texture_set.json` in its owning RP. The color layer is required; normal/heightmap and MER/MERS are mutually exclusive pairs. Image references must resolve in that same pack. When several extensions exist, the documented preference is TGA, PNG, JPG, JPEG.

Uniform values use 0–255 channels, not JSON UI's normalized colors. Inspect actual image channels and decoding separately. Classic rendering uses color; RTX does not use MERS subsurface. For Vibrant Visuals, texture-based objects such as items require normals instead of heightmaps.

The current documented Vibrant Visuals manifest requirement is `pbr` capability (or `raytraced`) and `min_engine_version` at least `[1,21,120]`. Confirm the actual client and selected graphics mode. A PBR map does not by itself prove emitted world lighting or the requested appearance.

Sources: [Texture sets](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/texturesetsreference/texturesetsconcepts/texturesetsintroduction?view=minecraft-bedrock-stable), [Vibrant Visuals packs](https://learn.microsoft.com/en-us/minecraft/creator/documents/vibrantvisuals/vvresourcepacks?view=minecraft-bedrock-stable). Exact source files and hashes are pinned in the design research lock; authored checks cover structure, not a full engine schema.
