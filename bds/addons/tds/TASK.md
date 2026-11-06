# Tower Defense Simulator

## Request
Reproduce Roblox Tower Defense Simulator's systems in Bedrock from the TDS wiki: data-driven towers/enemies/modes, waves on a path, placement, upgrades, targeting, detections, economy, lobby progression. Small original models (role-based shapes, not the game's designs), a stair-rimmed narrow lane, and the original's placement aids (hotbar slots, ghost, range rings); the match and lobby HUD drawn with GeoUI (tools/hud.mjs, original pixel art, ≤ 600 bones, 30 player properties).

## Acceptance (one tests.txt `## ` section each)
- [ ] data from the wiki: every tower, enemy and mode loaded; tower rows match the wiki tables
- [ ] bench: every tower level shoots a dummy at the wiki's Damage ÷ Firerate (±5%), hits inside its range and never outside
- [ ] map from the wiki image: Grass Isle path = 48.67 s at speed 3.5 (≈170 studs); a Normal (2.7) walks it in ≈63 s
- [ ] second map from the wiki image: Crossroads (00:48.44 at speed 3.5 ≈ 170 studs)
- [ ] placement rules: path, cliff/ground, overlap, cost, upgrade and sell (1/3 of spent)
- [ ] detection: a tower without hidden/lead/flying detection lets those enemies pass; with it, they die
- [ ] rewards from the mode pages: R ÷ (1 + [(N ÷ wave) − 1]^k) + triumph bonus for coins/gems, EXP and Tower EXP; XP Boost ×1.5 from 00:00 UTC Friday to 00:00 UTC Sunday (Experience page)
- [ ] economy: Easy wave bonus (200 + (w-1)×160)×(1-0.1×p) and the wave-clear bonus (wave bonus formulas, player reductions and start cash per mode page)
- [ ] leaks: an enemy reaching the base removes its remaining health from base HP; HP 0 loses
- [ ] a full Easy match won by the bot (all 20 waves, bosses included)
- [ ] forms: the wand opens the placement menu on a block; a tower opens upgrade, sell and targeting; skip vote
- [ ] support and units: Commander speeds nearby towers, Farm pays its income each wave, Military Base sends units up the path
- [ ] enemy rules from the wiki: defense, Breaker2's one Breaker, Boomer's bile, stuns, Health Regen, Blessed, Aggro, shield-dependent speed
- [ ] tower abilities from the wiki: Commander Call to Arms, Freezer Frost Grenade, Military Base Airstrike (unlock level, cost, cooldown)
- [ ] two players: kill cash split evenly between players, a share of .5 rounding up (mode pages); Molten/Fallen health +15/25/40% for 2/3/4 players (|health_scale); placement limits per player
- [ ] store and loadout by level (Levels page): 50 coins at level 0, four slots until level 15, towers unlocked by reaching a level, level gates (Hardcore towers 50, Pursuit 100, Gatling Gun 175, Mercenary Base 150), triumph gates (Warden, Cowboy, Saboteur)
- [ ] lobby: profile, shop with coins, loadout, quests, elevators (Survival 4 / Hardcore 3 players, 20 s, party size chosen by the first player, Hardcore map changes every minute) to a match
- [ ] restart: the match, its towers and wave survive a server restart
- [ ] quests (Quests page): 6 of the 10 daily and 4 of the 8 weekly quests, needs scaled by level, progress for the tower's owner, rewards (coins, gems, EXP, crates) once
- [ ] every tower ability from the wiki works: the 27 {{Ability}} templates with their unlock level, cost and cooldown
- [ ] special towers: Accelerator charge and overcharge, Medic heal and shields, Trapper traps, Engineer sentries, Necromancer graves, Mercenary Base units
- [ ] skills from the Skills page: cost round5(floor((base × level)^exponent)), requirements, reset for 95% as credits; effects in matches
- [ ] modes from their pages: Frost and Voidcore (wave bonus, rewards, starting cash, health scale), Sandbox, the Hidden Wave (codes, base at 1, the king within 60 s, waves 41-42)
- [ ] enemy abilities from the infoboxes: health-threshold phases, tower freezes, healing on the path, gifts, revive, random spawns
- [ ] match modifiers from their pages: effects (Glass, Broke, Inflation, Fog, Healthy, Speedy, ...) and the reward boosts
- [ ] placement like the original: loadout slots 1-5 in the hotbar, a ghost and range ring where you look, cost and limit on the bar; the path is a narrow lane rimmed with stairs
- [ ] badges from the mode pages: a triumph badge rewards once
- [ ] the GeoUI match HUD like the original: wave, timer and base health, boss bar, cash, mode and enemies, the tower bar, the selected tower, banners and rewards; the lobby's level, EXP, coins and gems
- [ ] load: 200 enemies and 50 towers keep 20 TPS

## Guessed
<!-- values decided without asking: data/_unknown.json (rule entries) -->
- Maps: Grass Isle and Crossroads traced from the wiki's top-down images (tools/map_trace.py, map_build.py); Grass Isle's tunnel is a straight line; 1 stud = 0.5 block
- Spawn spacing, summon counts, unit behaviour, base health outside Fallen, quest scaling, picks and reset times, elevator departure when full: see data/_unknown.json
- Not reproduced here: the Paradoxum group cash bonus, VIP boosts, Robux prices, skins, maps other than the two traced (Warden, Cowboy and Saboteur need triumphs on maps that are not here), crate opening
