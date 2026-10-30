// Recordings a redroid run sent out through its job log, put together and opened (the app scenario's `audio export`: Opus,
// AES-256-GCM, its key sealed by RSA-OAEP SHA-256 to tools/rig/rec_public.pem — the log carries ciphertext only).
//   gh api repos/<owner>/<repo>/actions/jobs/<job>/logs > job.log
//   node tools/rig/rec_decode.mjs job.log <private key .pem> <out dir>   → <out dir>/<name>.opus for each recording
// The private key never goes into the repository: whoever wants the recordings makes a key pair, commits only the public
// half as tools/rig/rec_public.pem (openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out k.pem;
// openssl pkey -in k.pem -pubout -out tools/rig/rec_public.pem) and keeps k.pem to themselves.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [logFile, keyFile, outDir] = process.argv.slice(2);
if (!outDir) { console.error('usage: node tools/rig/rec_decode.mjs <job log> <private key .pem> <out dir>'); process.exit(2); }
const priv = fs.readFileSync(keyFile, 'utf8');
const recs = new Map();
for (const line of fs.readFileSync(logFile, 'utf8').split('\n')) {
  const m = /\[spectral rec\] ([\w.-]+) (\d+)\/(\d+) ([A-Za-z0-9+/=]+)\s*$/.exec(line);
  if (!m) continue;
  const [, name, i, n, b64] = m;
  const r = recs.get(name) ?? { n: Number(n), chunks: new Map() };
  if (r.n !== Number(n)) r.chunks.clear(), r.n = Number(n);    // (a name exported twice: the later one)
  r.chunks.set(Number(i), b64);
  recs.set(name, r);
}
fs.mkdirSync(outDir, { recursive: true });
const out = [];
for (const [name, r] of recs) {
  if (r.chunks.size !== r.n) { out.push({ name, error: `${r.chunks.size}/${r.n} lines` }); continue; }
  const buf = Buffer.from(Array.from({ length: r.n }, (_, k) => r.chunks.get(k + 1)).join(''), 'base64');
  if (buf.subarray(0, 4).toString() !== 'SPR1') { out.push({ name, error: 'not an export' }); continue; }
  const ekLen = buf.readUInt16BE(4), ek = buf.subarray(6, 6 + ekLen), iv = buf.subarray(6 + ekLen, 18 + ekLen), tag = buf.subarray(18 + ekLen, 34 + ekLen);
  try {
    const key = crypto.privateDecrypt({ key: priv, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, ek);
    const d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag);
    const data = Buffer.concat([d.update(buf.subarray(34 + ekLen)), d.final()]);
    const file = path.join(outDir, `${name}.opus`);
    fs.writeFileSync(file, data);
    out.push({ name, file, kb: Math.round(data.length / 1024), sha256: crypto.createHash('sha256').update(data).digest('hex') });
  } catch (e) { out.push({ name, error: `${e.message}` }); }
}
console.log(JSON.stringify(out, null, 1));
