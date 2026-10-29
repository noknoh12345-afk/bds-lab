#!/usr/bin/env node
// app/redroid/scripteval: 素の APK に注入した scripteval(自作 mod)を redroid で確かめるハーネスの、端末なしの検証。
// 注入(Frida)も端末も要らない所 — REPL のプロトコル(probe)、0.3.1 の機能チェックの配線(features)、ワールドの中の
// オフセット探索の論理(world)、.so の封緘鍵の決め方(scripteval 本体)— を、偽 REPL と偽プレイヤーメモリで実走させる。
// どのモジュールも自前の --selftest を持つので、ここは「それらが緑か」と、純粋関数のいくつかを直に確かめる。
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// import しておく(verify の plan が、これらのファイルが変わったときにこのテストを選ぶため)
import * as probe from '../app/redroid/scripteval/probe.mjs';
import * as features from '../app/redroid/scripteval/features.mjs';
import * as explore from '../app/redroid/scripteval/explore.mjs';
import { soVaultKey } from '../app/redroid/scripteval.mjs';
import * as V from '../app/lib/vault.mjs';

const SE = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'app', 'redroid', 'scripteval');
let fails = 0, n = 0;
const ok = (c, m, d = '') => { n++; console.log(`${c ? '✔' : '✘'} ${m}${c || !d ? '' : '\n  ' + String(d).split('\n').slice(-20).join('\n  ')}`); if (!c) fails++; };

// ---- 純粋関数(偽 REPL の応答を解く・本体を包む・.so 鍵の決め方)----
ok(probe.parseTagged('"SE_OK {\\"a\\":1}"').value?.a === 1, 'parseTagged: 引用符つきの結果を解く');
ok(probe.parseTagged('log\nSE_ERR TypeError: x').ok === false, 'parseTagged: SE_ERR は失敗');
ok(/try/.test(probe.wrapJs('return 1;')) && /SE_OK/.test(probe.wrapJs('return 1;')), 'wrapJs: 値は SE_OK、例外は SE_ERR で返す');
ok(features.testPack().bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])), 'testPack: zip(PK..)で作る');
ok(soVaultKey({ SCRIPTEVAL_SO_KEY: 'K1', APP_CACHE_KEY: 'K2' })?.id === V.vaultKey({ APP_CACHE_KEY: 'K1' }).id, 'soVaultKey: SCRIPTEVAL_SO_KEY を APP_CACHE_KEY より優先');
ok(soVaultKey({ APP_CACHE_KEY: 'K2' })?.id === V.vaultKey({ APP_CACHE_KEY: 'K2' }).id, 'soVaultKey: 無ければ従来どおり');
ok(soVaultKey({}) === null, 'soVaultKey: 鍵が無ければ null');

// ---- 各モジュールの --selftest(偽 REPL / 偽プレイヤーメモリで実走)----
ok(explore.PERTURB.length >= 10 && explore.PERTURB.every((p) => p.name && p.on), 'explore: 入力の一覧(押す言葉つき)');

for (const [name, file] of [['probe', 'probe.mjs'], ['features', 'features.mjs'], ['world', 'world.mjs'], ['explore', 'explore.mjs'], ['studio', 'studio.mjs'], ['orchestrator', '../scripteval.mjs']]) {
  const r = spawnSync(process.execPath, [path.join(SE, file), '--selftest'], { encoding: 'utf8', timeout: 120_000 });
  ok(r.status === 0 && /SELFTEST OK/.test(r.stdout || ''), `${name} --selftest`, (r.stdout || '') + (r.stderr || ''));
}

console.log(`\n${fails ? '✘ FAIL' : '✔ OK'} (${n - fails}/${n})`);
process.exit(fails ? 1 : 0);
