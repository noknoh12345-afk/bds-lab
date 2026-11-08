# TDS looks: how they are made

Required skills (AGENTS.md): `mcbe-model-*` + `bds-models` for geometry, `pxl-pixel-art` + `bds-pixel-art`
for the models' pixel art, `mcbe-geo-ui` + `mcbe-resource-pack-rendering` for the HUD. This build is the lab's own code following them.

```
python3 tools/art/art.py           # pixel art: faces and emblems the models sample, slot icons, particles, pack icon
python3 tools/models/build.py      # every look, client entities, render controllers, animations, src/looks.ts (--check: stale?)
python3 tools/gen_assets.py        # ghost tints, particles, slot items, behaviour entities (their properties), lang
python3 tools/art/portraits.py     # each tower's own model drawn front 3/4: towers.png (the HUD's tower bar) + towers/<slug>.png (form icons)
node tools/art/hud_art.mjs         # the HUD's pictures, drawn by a browser (not pixel art): hud.png, digits.png, hud_atlas.json
node tools/hud.mjs                 # the GeoUI HUD: a geometry per texture, digits and portraits moved by uv_anim, player properties
node tools/hud_preview.mjs all --out /tmp/hud.png   # the HUD's own Molang run on four states (match, tower, lobby, triumph)
python3 tools/models/test_models.py   # the contract: geometries, textures, gear-vs-vanilla rigs, animated bones, pips, looks.ts
```

## One look per entity of the data

- `roster.py` (144 enemies), `roster_towers.py` (79 towers), `roster_units.py` (64 units): each entity of `data/*.json` gets a
  recipe; `roster.looks(kind)` builds them in the order the client entity indexes them by `tds:skin` (looks of one animation
  together), and `src/looks.ts` tells the script each one's skin, size and (towers) the shot it plays.
- Two layers: a vanilla body referenced by geometry id and texture path (`rigs.py`; nothing of vanilla is copied) and our gear,
  whose bones repeat the rig's names, parents and pivots so one animation moves both; or a body of our own (`bodies.py`,
  `critters.py`, `vehicles.py`, `buildings.py`).
- Enemies wear their theme like clothes (`kitbash.py`: a cap down to the brow, sleeves to the elbow or wrist, a tunic, trousers;
  a whole golem or beast covered; designed patterns per theme) and gear placed by what it covers (a helm takes the cap off and
  has a beak over an illager's nose). Figures (towers, units) are Steve or Alex in clothes made like a skin's layer
  (`tailor.py`), holding weapons designed as props (`arms.py`, `towerkit.py`).
- Upgrades: a bone `lvN_*` shows from level N, `preN_*` below N, `rAtoB_*` from A to below B, `pipK` from K (part_visibility,
  written by `entities.level_rules` from the models of the same build).

## How they move (`motion.py`, `entities.tower_anims`)

- Walkers follow the ground: the script sends `tds:pace` (how fast it goes along the path, studs/s x 10) and `tds:st`
  (1 stunned, 2 frozen, 3 dies, 4 leaves, 5 dies in the air); the client keeps `v.walk` (the gait's phase, advanced by the
  distance walked over the stride of that gait and size), `v.move` (eases the limbs in and out when it starts or stops),
  `v.clock` (stops while frozen), `v.grow` (the pop when it appears) and `v.fade` (shrinking away before the script removes it).
- Gaits: zombie shamble, march, run, boss stomp, hover, vex, phantom, golem, beast, mite, slime hop, floaters; units patrol,
  carry, brawl, ride, drive (wheels turn by their radius), mech stride, sentries, plants, duckies, crab. The body rides each
  gait on its waist (or on the body for rigs without one); a hand holding a weapon or shield swings a quarter as much.
- What happens: stunned (dizzy), frozen (still), killed (topples back about its feet; a slime squashes; a flier falls),
  into the base (a hop as it shrinks), an enemy's ability (`animation.tds_look.cast`), a unit's shot (`.shot`, muzzle flash).
- Towers: aim eases to `tds:yaw` (540 deg/s), the idle breathes and looks about, shots by weapon (auto, minigun spin, snipe,
  shotgun pump, launcher kick, stream, revolver, bow, typing, slash, slam, punch, cast, wrench, throw, a building's recoil
  or pulse), reload, ability, place (drops onto its pedestal), level up (hop and squash), stunned, sold (shrinks).

## Look before saying it looks right

`python3 tools/models/sheet.py <enemy|tower|unit> [--only "A,B"] [--lvl 0|N|top] [--fire] [--per N --cols N --size WxH]`
draws contact sheets (`bds/.lab/render/sheet_roster_*.png`); `--audit --no-render` finds gear buried in the body, poking into
it or on a vanilla face's plane. `python3 tools/models/motion_preview.py <kind> "Name,Name" --clip walk|die|... --times ...`
draws the motion frame by frame (the renderer takes variables as 0: it writes them out in time into a temporary clip).
`node lab.mjs check -a tds` lints every geometry (z-fights, UVs) and type-checks.

Conventions (kit.py): rotation `[rx, ry, rz]` is applied as right-handed `(-rx, ry, -rz)`; the game mirrors models in x
(`east` UV on the low-x side); paint by position; plates (wings, flags, capes) are one zero-thickness cube cut by alpha; keep
gear 0.2+ off every vanilla face, and never two faces on one plane.
