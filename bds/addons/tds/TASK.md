# Tower Defense Simulator

## Request
Reproduce Roblox Tower Defense Simulator's systems in Bedrock from the TDS wiki: data-driven towers/enemies/modes, waves on a path, placement, upgrades, targeting, detections, economy, lobby progression. Small original models (role-based shapes, not the game's designs), a stair-rimmed narrow lane, and the original's placement aids (hotbar slots, ghost, range rings); the match and lobby HUD drawn with GeoUI (tools/hud.mjs: generated pictures, not pixel art — tools/art/hud_art.mjs and the towers' own portraits; the vanilla hotbar hidden and the tower bar in its place; ≤ 600 bones, 28 player properties).

Expeditions (2026-11-08, the user's request): no built maps for the lobby's matches — each goes to a new place far out in the world and is fought on the land as it is there (a made-up land on a flat world); a road of stair blocks only, two rows back to back whose upper halves make a one-block top the enemies cross; an entrance gate, an exit gate (the base) and a camp in the middle; the original's numbers kept (170 studs). The two traced maps stay as training grounds. Gaps to the original listed in GAPS.md.

## Acceptance (one tests.txt `## ` section each)
- [x] data from the wiki: every tower, enemy and mode loaded; tower rows match the wiki tables
- [x] bench: every tower level shoots a dummy at the wiki's Damage ÷ Firerate (±5%), hits inside its range and never outside
- [x] map from the wiki image: Grass Isle path = 48.67 s at speed 3.5 (≈170 studs); a Normal (2.7) walks it in ≈63 s
- [x] second map from the wiki image: Crossroads (00:48.44 at speed 3.5 ≈ 170 studs)
- [x] placement rules: path, cliff/ground, overlap, cost, upgrade and sell (1/3 of spent)
- [x] detection: a tower without hidden/lead/flying detection lets those enemies pass; with it, they die
- [x] rewards from the mode pages: R ÷ (1 + [(N ÷ wave) − 1]^k) + triumph bonus for coins/gems, EXP and Tower EXP; XP Boost ×1.5 from 00:00 UTC Friday to 00:00 UTC Sunday (Experience page)
- [x] economy: Easy wave bonus (200 + (w-1)×160)×(1-0.1×p) and the wave-clear bonus (wave bonus formulas, player reductions and start cash per mode page)
- [x] leaks: an enemy reaching the base removes its remaining health from base HP; HP 0 loses
- [x] a full Easy match won by the bot (all 20 waves, bosses included)
- [x] forms: the wand opens the placement menu on a block; a tower opens upgrade, sell and targeting; skip vote
- [x] support and units: Commander speeds nearby towers, Farm pays its income each wave, Military Base sends units up the path
- [x] enemy rules from the wiki: defense, Breaker2's one Breaker, Boomer's bile, stuns, Health Regen, Blessed, Aggro, shield-dependent speed
- [x] tower abilities from the wiki: Commander Call to Arms, Freezer Frost Grenade, Military Base Airstrike (unlock level, cost, cooldown)
- [x] two players: kill cash split evenly between players, a share of .5 rounding up (mode pages); Molten/Fallen health +15/25/40% for 2/3/4 players (|health_scale); placement limits per player
- [x] store and loadout by level (Levels page): 50 coins at level 0, four slots until level 15, towers unlocked by reaching a level, level gates (Hardcore towers 50, Pursuit 100, Gatling Gun 175, Mercenary Base 150), triumph gates (Warden, Cowboy, Saboteur)
- [x] lobby: profile, shop with coins, loadout, quests, elevators (Survival 4 / Hardcore 3 players, 20 s, party size chosen by the first player, Hardcore map changes every minute) to a match
- [x] restart: the match, its towers and wave survive a server restart
- [x] quests (Quests page): 6 of the 10 daily and 4 of the 8 weekly quests, needs scaled by level, progress for the tower's owner, rewards (coins, gems, EXP, crates) once
- [x] every tower ability from the wiki works: the 27 {{Ability}} templates with their unlock level, cost and cooldown
- [x] special towers: Accelerator charge and overcharge, Medic heal and shields, Trapper traps, Engineer sentries, Necromancer graves, Mercenary Base units
- [x] skills from the Skills page: cost round5(floor((base × level)^exponent)), requirements, reset for 95% as credits; effects in matches
- [x] modes from their pages: Frost and Voidcore (wave bonus, rewards, starting cash, health scale), Sandbox, the Hidden Wave (codes, base at 1, the king within 60 s, waves 41-42)
- [x] enemy abilities from the infoboxes: health-threshold phases, tower freezes, healing on the path, gifts, revive, random spawns
- [x] match modifiers from their pages: effects (Glass, Broke, Inflation, Fog, Healthy, Speedy, ...) and the reward boosts
- [x] placement like the original: loadout slots 1-5 in the hotbar, a ghost and range ring where you look, cost and limit on the bar; the path is a narrow lane rimmed with stairs
- [x] badges from the mode pages: a triumph badge rewards once
- [x] the GeoUI match HUD like the original: wave, timer and base health, boss bar, cash, mode and enemies, the tower bar in place of the hidden hotbar (each slot the tower's picture, key and price, the held one raised), the selected tower, banners and rewards; the lobby's level, EXP, coins and gems
- [x] looks like the original: vanilla mob bodies with gear, towers turn to their target and recoil
- [x] load: 200 enemies and 50 towers keep 20 TPS
- [x] expeditions: a far place in the world, a road of stair blocks only (170 studs, one step at a time), the gates and the camp; towers on the land's ground and cliffs; a restart keeps the site
- [x] lobby elevators go on an expedition (the place changes every minute) unless the players vote for a training ground
- [x] narrators (Features page): a line at the first wave, at a boss and on the loss screen
- [x] boss badges: the "Defeat X" badges of the mode pages
- [x] team signals (the v2.1.0 communication wheel)
- [x] damage indicators (Features page) and their setting

## Guessed
- Expeditions: 1500-6000 blocks from the origin, 512 apart; the road's layout (straight in, most of a square ring round the camp, straight out; the ring 9-12 from the middle); heights raised over dips, never cut; a height change every other joint at most, none at or beside a corner; ground = standing 2 below to 1 above the road's top, cliff = 2 or more above; rocks added when the land has fewer than 8 cliff spots; the made-up land of a flat world (hills to 6, rocks +3, a stream, trees, flowers); the camp 9×9; themes per mode
<!-- values decided without asking: data/_unknown.json (rule entries) -->
- Maps: Grass Isle and Crossroads traced from the wiki's top-down images (tools/map_trace.py, map_build.py); Grass Isle's tunnel is a straight line; 1 stud = 0.5 block
- Spawn spacing, summon counts, unit behaviour, base health outside Fallen, quest scaling, picks and reset times, elevator departure when full: see data/_unknown.json
- Not reproduced here: the Paradoxum group cash bonus, VIP boosts, Robux prices, skins, maps other than the two traced (Warden, Cowboy and Saboteur need triumphs on maps that are not here), crate opening
