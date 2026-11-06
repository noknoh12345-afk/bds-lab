# 14 — Failure modes

*Every entry happened. `data/failure-modes.json` is the same list for machines.*

| # | Symptom (what the person said) | Cause | Cure |
| --- | --- | --- | --- |
| F01 | "One grey square on every wheel hub; the star is missing" | the forge took `east` for the high-x side and blanked the *outer* face | `docs/02`; the outer face of a +x part is `west` |
| F02 | "It looks perfect in your render, wrong in Blockbench" | a renderer that draws the JSON as written | use `tools/preview/render_model.py`, or mirror x + reverse u |
| F03 | "The curve still has stair steps" | axis-aligned boxes of shrinking size | tilted links joined corner to corner |
| F04 | "One edge matches but there is a gap beside it" | a width step left open / a valley not filled | splay box; run both links past the corner |
| F05 | "I asked you to smooth the steps, not to redesign the nose" | over-reach | fix what was pointed at; keep the rest |
| F06 | "It flickers" | parallel coplanar faces, often between *tilted* parts or hand-placed wedges | offset 0.02–0.05; the checker works on face polygons in every pose |
| F07 | "There are cracks in the whitewall" | step faces left in the cube's default colour | paint steps to continue the neighbour (by radius / position; match the face lighting) |
| F08 | "You painted it nicely but it is hidden" | texture on buried or never-visible faces; or a picture that *should* show is covered | visibility passes; move what must be seen |
| F09 | "The front looks like the last kart" / "it looks like a lizard, the head plays apart" | reused parts; a motif bolted on | one design language through the whole body |
| F10 | "The grille sticks out past the tyres and shows its sides" | a face block with nothing joining its ends to the body | flush sides, chamfered corner panels |
| F11 | "A big cube hangs over the front wheel" | a volume faked with a floating box | real fender + arch lips |
| F12 | "From the seat I can see the rear wheel through a hole" | cockpit not walled off | tub walls to the bulkhead; sight-line test |
| F13 | "Only the nose got higher; now it is unbalanced" | a local fix to a global proportion | one shoulder line; raise the rest |
| F14 | "Pipe stays cross the booster panels when they open" | fixed parts in a moving part's path | everything ahead of the hinge, steeper than the open lean; check every pose |
| F15 | "The open lid shows its picture to the ground" | leaned back instead of forward | lean forward; test the outward normal |
| F16 | "The steering column pokes out in front of the windscreen" | cowl too far forward | cowl over the shaft; `shaft_buried` checks the first quarter, not only the tip |
| F17 | "The dial's 12 points the wrong way" | asymmetric art placed by derivation | verify orientation in game first |
| F18 | "The physics box is inside the body" | eyeballed footprint | measure (`docs/13`) |
| F19 | "A dragon's wing is not drawn like that — look at the Ender Dragon" (twice: a flat board, then a fan of boxes) | not looking at how vanilla does it | two jointed segments, each a bone + ONE zero-thickness plate whose scalloped outline and fingers are painted, the rest transparent; `entity_alphatest` |
| F19b | a two-faced plate flickers | its two faces differ at some point (outline, light, density) and the material draws both | paint by position; same light, density, no grain on both faces |
| F19c | "Look more closely — what is this?" (square board corners on the folded wing, the membrane cutting through the body, spikes seen edge-on) | each plate was turned with its swept bone, so plates left the wing plane and their uncut corners showed | both plates in ONE wing plane, inner edge exactly on the hinge line, turning about that axis only; cut everything ahead of the bone and outside a deeply scalloped outline; then look at the *folded* pose up close |
| F19d | the wing is a solid board from below | the visibility pass blanked one face of a two-faced plate to one texel | never blank either face of such a plate; `seen_from_below=True`; the linter reports unequal faces as an error |
| F20 | "The effect comes out of the wrong place" | locators left at ordinary exhausts while the glowing core rides the transforming part | put the locator in that part's bone, at the core |
| F21 | a test passes on the defect it was written for | the test measured the wrong thing | break the model and watch the test fail |
| F22 | "You said eleven fixed; two were not" | reporting from memory | report from the diff |
| F23 | a save with a cube of size −0.04 on one side | an edge dragged past its opposite face | linter; delete it |
| F24 | the build takes minutes | per-pixel loops in Python | Node / vectorise; parallel liveries |
| F25 | seventeen textures weigh megabytes | per-texel grain on a big atlas | `grain=0`; crop the atlas height |
