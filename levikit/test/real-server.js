#!/usr/bin/env node
'use strict';
// 本物のサーバーを 1 回起動して、levikit-core（LeviLamina）か endstone-levikit（Endstone）がパネルとの約束を守るか確かめる:
//   node test/real-server.js <サーバーのフォルダー> -- <起動コマンド...>
//   @@LEVIKIT READY → `levikit dims` に @@LEVIKIT DIMS（3 つのバニラのワールドを含む）→
//   `levikit players` に @@LEVIKIT PLAYERS [] → `stop` で終わる。
const { spawn } = require('node:child_process');
const path = require('node:path');

const i = process.argv.indexOf('--');
const dir = path.resolve(process.argv[2] || '.');
const cmd = i > 0 ? process.argv.slice(i + 1) : [];
if (!cmd.length) {
  console.error('usage: node test/real-server.js <dir> -- <command...>');
  process.exit(2);
}
const child = spawn(cmd[0], cmd.slice(1), { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ENDSTONE_USE_INTERACTIVE_CONSOLE: '0', PYTHONUNBUFFERED: '1' } });
let out = '';
const seen = (re) => re.test(out.replace(/\x1b\[[0-9;]*m/g, ''));
child.stdout.on('data', (d) => (out += d));
child.stderr.on('data', (d) => (out += d));
child.stdin.on('error', () => {});
let exited = null;
child.on('exit', (code) => (exited = code));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (label, re, ms) => {
  const t0 = Date.now();
  while (!seen(re)) {
    if (exited !== null) throw new Error(`${label}: the server exited (${exited})`);
    if (Date.now() - t0 > ms) throw new Error(`${label}: not seen in ${ms / 1000} s`);
    await sleep(500);
  }
  console.log(`  ✔ ${label}`);
};

(async () => {
  let ok = true;
  try {
    // （「Server started.」の行はローダーによって形が違うので待たない。READY は起動が済んでから出る）
    await until('@@LEVIKIT READY', /@@LEVIKIT READY \{/, 600_000);
    child.stdin.write('levikit dims\n');
    await until('levikit dims → @@LEVIKIT DIMS（overworld・nether・the_end）', /@@LEVIKIT DIMS (?=.*"key":"overworld")(?=.*"key":"nether")(?=.*"key":"the_end")\[/, 30_000);
    child.stdin.write('levikit players\n');
    await until('levikit players → @@LEVIKIT PLAYERS []', /@@LEVIKIT PLAYERS \[\]/, 30_000);
  } catch (e) {
    ok = false;
    console.error(`FAILED: ${e.message}`);
    // 何が出ていたか: 定期の POS / STATS を除いた最初の 200 行
    console.error(out.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/).filter((l) => !/@@LEVIKIT (POS|STATS) /.test(l)).slice(0, 200).join('\n'));
  }
  child.stdin.write('stop\n');
  for (let n = 0; n < 120 && exited === null; n++) await sleep(500);
  if (exited === null) child.kill('SIGKILL');
  console.log(ok ? '\nALL PASSED' : '');
  process.exit(ok ? 0 : 1);
})();
