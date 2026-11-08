// Renders prepared models (geometry + texture, from tools/models/sheet.py prepare) on a key colour, for tools/art/portraits.py.
// usage: node render_batch.mjs <jobs.json>   jobs: [{ geo, tex, out, view, size }]
import fs from 'node:fs';
import { loadGeos, renderModel } from '../../../../../common/model.mjs';

const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let ok = 0;
for (const j of jobs) {
  try {
    const geo = loadGeos(j.geo)[0];
    renderModel(geo, j.tex, j.out, { views: [j.view || 'front34'], size: [j.size, j.size], bg: [255, 0, 255] });
    ok++;
  } catch (e) { console.log(`no render: ${j.out}: ${String(e.message || e).slice(0, 200)}`); }
}
console.log(`rendered ${ok}/${jobs.length}`);
