# Tower Defense Simulator

## Request
Reproduce Roblox Tower Defense Simulator's systems in Bedrock from the TDS wiki: data-driven towers/enemies/modes, waves on a path, placement, upgrades, targeting, detections, economy, lobby progression. Vanilla look only (no new models or textures).

## Acceptance (one tests.txt `## ` section each)
- [ ] data from the wiki: every tower, enemy and mode loaded; tower rows match the wiki tables
- [ ] bench: every tower level shoots a dummy at the wiki's Damage ÷ Firerate (±5%), hits inside its range and never outside
- [ ] placement rules: path, cliff/ground, overlap, cost, upgrade and sell (1/3 of spent)
- [ ] detection: a tower without hidden/lead/flying detection lets those enemies pass; with it, they die
- [ ] economy: Easy wave bonus (200 + (w-1)×160)×(1-0.1×p) and the wave-clear bonus
- [ ] leaks: an enemy reaching the base removes its remaining health from base HP; HP 0 loses
- [ ] a full Easy match won by the bot (all 20 waves, bosses included)
- [ ] lobby: profile, shop with coins, loadout, quests, elevator to a match
- [ ] restart: the match, its towers and wave survive a server restart
- [ ] load: 200 enemies and 50 towers keep 20 TPS

## Guessed
<!-- values decided without asking: data/_unknown.json (rule entries) -->
- Map: a lab layout (232-stud path, 4 cliffs), 1 stud = 0.5 block
- Spawn spacing, clear wait, summon counts, unit behaviour, kill-cash owner: see data/_unknown.json
