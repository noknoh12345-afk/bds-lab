# Tower Defense Simulator

## Request
Reproduce Roblox Tower Defense Simulator's systems in Bedrock from the TDS wiki: data-driven towers/enemies/modes, waves on a path, placement, upgrades, targeting, detections, economy, lobby progression. Vanilla look only (no new models or textures).

## Acceptance (one tests.txt `## ` section each)
- [ ] data from the wiki: every tower, enemy and mode loaded; tower rows match the wiki tables
- [ ] bench: every tower level shoots a dummy at the wiki's Damage ÷ Firerate (±5%), hits inside its range and never outside
- [ ] map from the wiki image: Grass Isle path = 48.67 s at speed 3.5 (≈170 studs); a Normal (2.7) walks it in ≈63 s
- [ ] second map from the wiki image: Crossroads (00:48.44 at speed 3.5 ≈ 170 studs)
- [ ] placement rules: path, cliff/ground, overlap, cost, upgrade and sell (1/3 of spent)
- [ ] detection: a tower without hidden/lead/flying detection lets those enemies pass; with it, they die
- [ ] economy: Easy wave bonus (200 + (w-1)×160)×(1-0.1×p) and the wave-clear bonus (wave bonus formulas, player reductions and start cash per mode page)
- [ ] leaks: an enemy reaching the base removes its remaining health from base HP; HP 0 loses
- [ ] a full Easy match won by the bot (all 20 waves, bosses included)
- [ ] forms: the wand opens the placement menu on a block; a tower opens upgrade, sell and targeting; skip vote
- [ ] support and units: Commander speeds nearby towers, Farm pays its income each wave, Military Base sends units up the path
- [ ] enemy rules from the wiki: defense, Breaker2's one Breaker, Boomer's bile, stuns, Health Regen, Blessed, Aggro
- [ ] tower abilities from the wiki: Commander Call to Arms, Freezer Frost Grenade, Military Base Airstrike (unlock level, cost, cooldown)
- [ ] lobby: profile, shop with coins, loadout, quests, elevator to a match
- [ ] restart: the match, its towers and wave survive a server restart
- [ ] load: 200 enemies and 50 towers keep 20 TPS

## Guessed
<!-- values decided without asking: data/_unknown.json (rule entries) -->
- Map: Grass Isle traced from the wiki's top-down image (tools/map_trace.py, map_build.py); the tunnel under the plateau is a straight line; spawn at the left cave; rocks = cliff; 1 stud = 0.5 block
- Spawn spacing, clear wait, summon counts, unit behaviour, kill-cash owner: see data/_unknown.json
