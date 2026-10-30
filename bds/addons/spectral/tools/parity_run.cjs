// node tools/parity_run.cjs <audio.f32> <voices> <analysis> <out.json>: web/core.js on raw mono 44.1 kHz float32 samples
const fs = require('fs'); const core = require('../web/core.js');
const [f32, voices, analysis, out] = process.argv.slice(2);
const buf = fs.readFileSync(f32); const x = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
(async () => {
  const t0 = Date.now();
  const r = await core.convert(x, { voices: Number(voices), analysis, title: 't', artist: '', id: 't' });
  fs.writeFileSync(out, JSON.stringify({ meta: r.meta, data: core.toB64(r.bytes), stats: r.stats, ms: Date.now() - t0 }));
})();
