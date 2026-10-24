// seal-so.mjs — libscripteval.so を bds-lab の金庫(vault)で封緘し、公開リポジトリに置ける .bin にする。
//
// bds-lab は「.so を素のままコミットしない」(app guard)。公開リポジトリなので .so は必ず封緘して置く。
// 封緘には vault 鍵(APP_CACHE_KEY、無ければ GOOGLE_AAS_TOKEN から導出)が要る。鍵は手元の .env.local か環境変数。
// 鍵はあなたの手元にだけあり、ここから外に出ない。出来た .bin を git add してコミットすればよい。
//
//   node app/redroid/scripteval/seal-so.mjs <abi> <libscripteval.so のパス>
//     <abi> = arm64-v8a | x86_64
// 例: node app/redroid/scripteval/seal-so.mjs x86_64 ~/dl/scripteval/0.3.0/x86_64/libscripteval.so
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as V from '../../lib/vault.mjs';
import { parseEnv } from '../../lib/apk.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOP = path.resolve(HERE, '..', '..', '..');

// .env.local(bds-lab のローカル秘密)を読み、未設定の変数だけ埋める(CI/環境が優先)
for (const f of [path.join(TOP, '.env.local'), path.join(TOP, 'app', '.env.local')]) {
  if (fs.existsSync(f)) { const e = parseEnv(fs.readFileSync(f, 'utf8')); for (const k of Object.keys(e)) if (!process.env[k]) process.env[k] = e[k]; }
}

const [abi, soPath] = process.argv.slice(2);
if (!abi || !soPath) { console.error('usage: node app/redroid/scripteval/seal-so.mjs <arm64-v8a|x86_64> <libscripteval.so>'); process.exit(2); }
if (!['arm64-v8a', 'x86_64'].includes(abi)) { console.error(`abi は arm64-v8a か x86_64: ${abi}`); process.exit(2); }
if (!fs.existsSync(soPath)) { console.error(`見つかりません: ${soPath}`); process.exit(2); }

const key = V.vaultKey();
if (!key) { console.error('鍵がありません。APP_CACHE_KEY(無ければ GOOGLE_AAS_TOKEN)を .env.local か環境変数に。'); process.exit(1); }

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'se-seal-'));
const entry = `libscripteval-${abi}.so`;
fs.copyFileSync(soPath, path.join(base, entry));
const outFile = path.join(HERE, `libscripteval-${abi}.so.bin`);

const r = await V.seal({ base, entries: [entry], outFile, key });
fs.rmSync(base, { recursive: true, force: true });
console.log(`封緘しました: ${path.relative(TOP, outFile)} (${Math.round(r.bytes / 1024)} KB, ${r.comp}, AES-256-GCM)`);
console.log(`次: git add ${path.relative(TOP, outFile)} && git commit  (素の .so はコミットしない)`);
