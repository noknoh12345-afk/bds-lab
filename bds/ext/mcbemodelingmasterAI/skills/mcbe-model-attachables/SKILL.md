---
name: mcbe-model-attachables
description: Model Bedrock attachables and wearables: held weapons and tools, a wrist watch, charms, armour pieces. Player-bone frames, slim/wide arm variants, Molang-driven parts, emissive alpha, verifying orientation.
---

# Attachables and wearables

Full text: `docs/12-attachables-and-wearables.md`.

1. Geometry lives in a player bone's frame (`rightItem`, `leftItem`, `head`, `leftArm`...). Build around the grip / the limb at the bone's pivot.
2. Slim and wide arms need separate geometry; share animation and icon.
3. **Verify the orientation of asymmetric art in the game** (text, a dial's 12). Our derivation was 90° off once.
4. Molang-driven parts: `query.time_of_day` for clock hands (`90 - 720*t`, `90 - 8640*t`); swap day/night faces by scaling.
5. `entity_emissive_alpha_one_sided`: alpha 255 = world light, low alpha = self-lit, 0 = cut.
6. First person is very close: density toward the camera; one texel where the hand covers. `symmetric=False`, `seen_from_below=True`.
7. Do not open files the owner marked off limits.
