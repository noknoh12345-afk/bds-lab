#!/usr/bin/env node
// osu!'s own skin for the "official assets" sample: the Legacy skin's gameplay elements and hitsounds from ppy/osu-resources
// (osu.Game.Resources/Skins/Legacy, at a fixed commit), kept in bds/geoui/osu/skin-legacy/ with their licence. They are
// CC-BY-NC 4.0 (https://github.com/ppy/osu-resources — LICENCE.md): shared here for a non-commercial lab, attributed, unchanged
// (the pack made from them resizes and tints them: osu.mjs says so in the pack). The "osu!" name and logo are ppy's trademarks
// and not part of that licence: none of the logo is taken, and of the menus only the pause screen's Retry button (shown on the
// fail screen, as osu! does) — the rest are gameplay elements. Its .mp3 sounds are kept as
// .ogg (the game plays .ogg). node bds/geoui/osu/fetch-skin.mjs [--force]  (needs the network: GitHub; ffmpeg for the .mp3)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), OUT = path.join(HERE, 'skin-legacy');
export const COMMIT = '46d344264e5938e168cfbbd2c8fab5f572ebeda4';
const BASE = `https://raw.githubusercontent.com/ppy/osu-resources/${COMMIT}/osu.Game.Resources/Skins/Legacy/`;
export const IMAGES = [
  'hitcircle', 'hitcircleoverlay', 'approachcircle', ...Array.from({ length: 10 }, (_, d) => `default-${d}`),
  'hit0', 'hit50', 'hit100', 'hit300', ...Array.from({ length: 10 }, (_, d) => `sliderb${d}`), 'sliderfollowcircle', 'reversearrow', 'sliderscorepoint', 'followpoint',
  'spinner-circle', 'spinner-approachcircle', 'spinner-clear', 'spinner-spin', 'spinner-rpm',
  ...Array.from({ length: 10 }, (_, d) => `score-${d}`), 'score-x', 'score-percent', 'score-dot', 'scorebar-bg', 'scorebar-colour', 'cursor', 'cursortrail', 'cursormiddle', 'lighting',
  'ranking-X-small', 'ranking-S-small', 'ranking-A-small', 'ranking-B-small', 'ranking-C-small', 'ranking-D-small', 'section-pass', 'section-fail',
  // (the results: the ranking panel and its labels, the big grades — silver XH / SH with HD or FL — the full combo's stamp; the
  //  fail's retry button)
  'ranking-panel', 'ranking-title', 'ranking-maxcombo', 'ranking-accuracy', 'ranking-perfect', 'ranking-X', 'ranking-XH', 'ranking-S', 'ranking-SH', 'ranking-A', 'ranking-B', 'ranking-C', 'ranking-D',
  'pause-retry',
].map((n) => `${n}@2x.png`);
export const SOUNDS = ['normal-hitnormal.wav', 'normal-hitwhistle.wav', 'normal-hitfinish.wav', 'normal-hitclap.wav', 'soft-hitnormal.wav', 'soft-hitwhistle.wav', 'soft-hitfinish.wav', 'soft-hitclap.wav',
  'drum-hitnormal.wav', 'drum-hitwhistle.wav', 'drum-hitfinish.wav', 'drum-hitclap.wav', 'normal-slidertick.wav', 'spinnerbonus.wav', 'combobreak.mp3', 'sectionpass.mp3', 'sectionfail.mp3',
  'failsound.mp3', 'applause.mp3'];

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.mkdirSync(OUT, { recursive: true });
  const get = (name) => { const r = spawnSync('curl', ['-fsSL', `${BASE}${name}`], { maxBuffer: 1 << 26 }); if (r.status !== 0) throw new Error(`${name}: ${r.stderr}`); return r.stdout; };
  // (what is here already stays as it is — the same commit's files; --force takes everything again)
  const force = process.argv.includes('--force'), have = (f) => !force && fs.existsSync(path.join(OUT, f));
  for (const f of IMAGES) if (!have(f)) fs.writeFileSync(path.join(OUT, f), get(f));
  for (const f of SOUNDS) {
    if (have(f.replace(/\.(wav|mp3)$/, '.ogg'))) continue;
    const data = get(f), base = f.replace(/\.(wav|mp3)$/, '');
    const tmp = path.join(OUT, `.tmp-${f}`); fs.writeFileSync(tmp, data);
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', tmp, '-c:a', 'libvorbis', '-q:a', '4', '-map_metadata', '-1', '-fflags', '+bitexact', path.join(OUT, `${base}.ogg`)]);
    fs.rmSync(tmp);
    if (r.status !== 0) throw new Error(`ffmpeg ${f}: ${r.stderr}`);
  }
  fs.writeFileSync(path.join(OUT, 'LICENCE.md'), get('../../../LICENCE.md'));
  fs.writeFileSync(path.join(OUT, 'SOURCE.md'), `# osu! Legacy skin (gameplay elements and hitsounds)

From **ppy/osu-resources** (https://github.com/ppy/osu-resources), \`osu.Game.Resources/Skins/Legacy/\` at commit \`${COMMIT}\`.
Licensed under **Creative Commons Attribution-NonCommercial 4.0** (CC-BY-NC 4.0, LICENCE.md here) © ppy Pty Ltd.

- Kept unchanged, but for the sounds: the .wav and .mp3 are kept as .ogg (libvorbis q4) for Minecraft.
- bds-lab's sample add-on \`geoui_osu_skin\` (bds/geoui/timeline/demo.mjs) resizes and tints them into one texture atlas.
- Non-commercial use only. The "osu!" and "ppy" names and logos are trademarks of ppy and are not covered by this licence:
  no logo is taken here, and of the menus only the pause screen's Retry button (pause-retry, shown on the fail screen as osu!
  does). This lab is not affiliated with or endorsed by ppy.
- Fetched by \`node bds/geoui/osu/fetch-skin.mjs\`.
`);
  console.log(`OK ${path.relative(process.cwd(), OUT)}: ${fs.readdirSync(OUT).length} files, ${(fs.readdirSync(OUT).reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0) / 1024).toFixed(0)} KB`);
}
