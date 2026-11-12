#!/usr/bin/env node
'use strict';
// ワールド操作ツールキットのテスト（LevelDB / NBT / パッケージ / 取り込み・書き出し）
//   node test/toolkit.js
// g++ と zlib の開発ヘッダーがあれば、levikit-core の Format.h（C++）もビルドして JS と突き合わせる
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const { LevelDBReader, writeDatabase } = require('../panel/lib/leveldb');
const nbt = require('../panel/lib/nbt');
const wio = require('../panel/lib/worldio');
const { zipDir, extractZip } = require('../panel/lib/zip');
const { makeWorld, actorNbt, rest } = require('./lib/synthworld');

let pass = 0;
let fail = 0;
const check = (cond, msg) => {
  if (cond) pass++;
  else {
    fail++;
    console.log(`  ✗ ${msg}`);
  }
};
const section = (t) => console.log(`■ ${t}`);

const fnv64 = (buf) => {
  let h = 1469598103934665603n;
  for (const c of buf) {
    h ^= BigInt(c);
    h = (h * 1099511628211n) & 0xffffffffffffffffn;
  }
  return h.toString(16);
};

async function readAllEntries(dbDir) {
  const r = await new LevelDBReader(dbDir).open();
  return r.collect(() => true);
}

/** levikit-core の取り込み処理を JS で再現（テスト用: パッケージ → 既存 DB に dim を付けて追加） */
async function applyPackage(dbDir, pkgFile, dim, outDir) {
  const pkg = await wio.readPackage(pkgFile);
  const entries = new Map();
  for (const { key, value } of (await readAllEntries(dbDir)).values()) if (value) entries.set(key.toString('hex'), { key, value });
  const put = (key, value) => entries.set(key.toString('hex'), { key, value });
  for (const c of pkg.chunks) put(wio.chunkKey(c.rest, dim), c.value);
  for (const d of pkg.digps) put(wio.digpKey(d.xz, dim), d.value);
  for (const a of pkg.actors.values()) put(Buffer.concat([Buffer.from('actorprefix'), a.id]), a.value);
  await writeDatabase(outDir, [...entries.values()], { compression: 'zlibraw' });
}

function actorInvariants(actors, label) {
  let ok = true;
  const uids = new Set();
  for (const [hex, a] of actors) {
    const t = nbt.readRoot(a.value).tag.value;
    const uid = t.UniqueID.value;
    uids.add(uid.toString());
    const sk = t.internalComponents?.value?.EntityStorageKeyComponent?.value?.StorageKey?.value;
    const skHex = Buffer.isBuffer(sk) ? sk.toString('hex') : Buffer.from(String(sk), 'utf8').toString('hex');
    if (wio.storageKeyOf(uid).toString('hex') !== hex || skHex !== hex) ok = false;
  }
  check(ok, `${label}: キー = storageKeyOf(UniqueID) = StorageKey`);
  return uids;
}

async function main() {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'levikit-toolkit-'));
  try {
    // ---------------------------------------------------------------
    section('NBT: 任意のバイト列の文字列も壊さずに往復');
    {
      const raw = Buffer.from([0xc0, 0x00, 0xff, 0x80, 0x01, 0xfe, 0x7f, 0x90]);
      const tag = { type: 'compound', value: { s: { type: 'string', value: raw }, t: { type: 'string', value: '日本語テキスト' } } };
      const b = nbt.writeRoot(tag, '');
      const r = nbt.readRoot(b);
      check(Buffer.isBuffer(r.tag.value.s.value) && r.tag.value.s.value.equals(raw), 'バイナリ文字列が Buffer のまま');
      check(r.tag.value.t.value === '日本語テキスト', 'UTF-8 文字列は string');
      check(nbt.writeRoot(r.tag, r.name).equals(b), '書き戻すと同じバイト列');
    }

    // ---------------------------------------------------------------
    section('ストレージキーの規則（実ワールドの値）');
    {
      // 1.21.72 / 1.19.70 で保存された実ワールドの actorprefix キーと UniqueID の組
      check(wio.storageKeyOf(-8589934591n).toString('hex') === '0000000200000001', 'worldStartCount=-2, counter=1');
      check(wio.storageKeyOf(-4294967294n).toString('hex') === '0000000100000002', 'worldStartCount=-1, counter=2');
    }

    // ---------------------------------------------------------------
    section('合成ワールド: 取り出し・ID 振り直し・パッケージ');
    const worldA = path.join(tmp, 'A');
    const worldB = path.join(tmp, 'B');
    const grid = (n, ox = 0, oz = 0) => {
      const out = [];
      for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) out.push([x + ox, z + oz]);
      return out;
    };
    const A = await makeWorld(worldA, { name: 'ワールドA', seed: 11, worldStartCount: -2, dims: { 0: { chunks: grid(3), actorsPerChunk: 2 }, 1000: { chunks: grid(2, -5, 7), actorsPerChunk: 1 } } });
    // B は A と同じ worldStartCount → 元の ID は A とぶつかる（振り直しが必要な状況）
    const B = await makeWorld(worldB, { name: '取り込み元', seed: 22, worldStartCount: -2, spawn: { x: 20, y: 80, z: -4 }, dims: { 0: { chunks: grid(4, -2, -2), actorsPerChunk: 3 }, 1: { chunks: grid(1), actorsPerChunk: 0 } } });

    const exB = await wio.extractDimension(path.join(worldB, 'db'), 0);
    check(exB.chunks.length === B.expected[0].chunks.size, `チャンクキー数 ${exB.chunks.length}`);
    check(exB.chunks.every((c) => B.expected[0].chunks.get(c.rest.toString('hex')) === c.value.toString('hex')), 'チャンクの中身が一致');
    check(exB.actors.size === B.expected[0].actors.length, `エンティティ数 ${exB.actors.size}`);
    check(exB.stats.chunks === 16, `チャンク数 ${exB.stats.chunks}`);
    const exB1 = await wio.extractDimension(path.join(worldB, 'db'), 1);
    check(exB1.chunks.length === B.expected[1].chunks.size && exB1.actors.size === 0, 'ネザー側は別に取り出せる');

    const remapped = wio.remapEntities(exB);
    const newUids = actorInvariants(remapped.actors, '振り直し後');
    check([...remapped.actors.values()].every((a) => (nbt.readRoot(a.value).tag.value.UniqueID.value >> 32n) >= 0x10000000n), '上位32bit が正（ゲームの ID と衝突しない）');
    const aKeys = new Set(A.expected[0].actors.map((a) => a.key));
    check(![...remapped.actors.keys()].some((k) => aKeys.has(k)), 'A のエンティティとキーが衝突しない');
    {
      // 乗り物・リードの参照が新しい ID を指す / 他のフィールドは同じ
      let links = 0;
      let linkOk = true;
      for (const a of remapped.actors.values()) {
        const t = nbt.readRoot(a.value).tag.value;
        for (const l of t.LinksTag?.value.items || []) {
          links++;
          if (!newUids.has(l.entityID.value.toString())) linkOk = false;
        }
        if (t.LeasherID && !newUids.has(t.LeasherID.value.toString())) linkOk = false;
      }
      check(links === 32 && linkOk, `LinksTag / LeasherID が付け替わる (${links})`);
      const strip = (t) => {
        const c = { ...t };
        delete c.UniqueID;
        delete c.LinksTag;
        delete c.LeasherID;
        delete c.internalComponents;
        return JSON.stringify(c, (k, v) => (typeof v === 'bigint' ? v.toString() : v));
      };
      const before = [...exB.actors.values()].map((a) => strip(nbt.readRoot(a.value).tag.value)).sort();
      const after = [...remapped.actors.values()].map((a) => strip(nbt.readRoot(a.value).tag.value)).sort();
      check(JSON.stringify(before) === JSON.stringify(after), 'ID 以外のフィールドは変わらない');
      let refs = 0;
      let refOk = true;
      for (const d of remapped.digps) {
        for (let o = 0; o + 8 <= d.value.length; o += 8) {
          refs++;
          if (!remapped.actors.has(d.value.subarray(o, o + 8).toString('hex'))) refOk = false;
        }
      }
      check(refOk && refs === remapped.actors.size, 'digp の ID はすべて実体がある');
    }

    const pkgFile = path.join(tmp, 'b.lkdim');
    await wio.writePackage(remapped, pkgFile, { frameSize: 4096 }); // 小さなフレームで複数フレームを試す
    const back = await wio.readPackage(pkgFile);
    check(back.chunks.length === remapped.chunks.length && back.digps.length === remapped.digps.length && back.actors.size === remapped.actors.size, 'パッケージ往復');

    // ---------------------------------------------------------------
    section('.mcworld 取り込み → 別ワールドの新ディメンションへ → .mcworld 書き出し');
    {
      const mc = path.join(tmp, 'B.mcworld');
      await zipDir(worldB, mc);
      const pkg2 = path.join(tmp, 'b2.lkdim');
      const info = await wio.importMcworld(mc, pkg2, { workDir: tmp });
      check(info.levelName === '取り込み元' && info.spawn.x === 20 && info.spawn.y === 80, 'level.dat の情報');
      check(info.chunks === 16 && info.actors === 48, `統計 (${info.chunks} チャンク / ${info.actors} 体)`);
      const merged = path.join(tmp, 'merged');
      await fsp.mkdir(merged, { recursive: true });
      await fsp.copyFile(path.join(worldA, 'level.dat'), path.join(merged, 'level.dat'));
      await applyPackage(path.join(worldA, 'db'), pkg2, 1005, path.join(merged, 'db'));
      const all = await readAllEntries(path.join(merged, 'db'));
      const actorKeys = [...all.values()].filter((e) => wio.classifyKey(e.key).kind === 'actor').length;
      check(actorKeys === A.expected[0].actors.length + A.expected[1000].actors.length + 48, `エンティティが上書きされずに共存 (${actorKeys})`);
      const exA0 = await wio.extractDimension(path.join(merged, 'db'), 0);
      check(exA0.chunks.every((c) => A.expected[0].chunks.get(c.rest.toString('hex')) === c.value.toString('hex')) && exA0.chunks.length === A.expected[0].chunks.size, '元のオーバーワールドは変わらない');
      const exN = await wio.extractDimension(path.join(merged, 'db'), 1005);
      check(exN.chunks.length === B.expected[0].chunks.size && exN.actors.size === 48, '新ディメンションに取り込まれた');

      const out = path.join(tmp, 'export.mcworld');
      const r = await wio.exportMcworld(merged, 1005, out, { levelName: '書き出し', spawn: { x: 1, y: 90, z: 2 } });
      check(r.chunks === 16 && fs.existsSync(out), '書き出し');
      const ex = path.join(tmp, 'export');
      await extractZip(out, ex);
      const li = wio.levelInfo(await fsp.readFile(path.join(ex, 'level.dat')));
      check(li.levelName === '書き出し' && li.spawn.y === 90 && li.generator === 2, '書き出した level.dat');
      const e0 = await wio.extractDimension(path.join(ex, 'db'), 0);
      check(e0.chunks.length === B.expected[0].chunks.size && e0.chunks.every((c) => B.expected[0].chunks.get(c.rest.toString('hex')) === c.value.toString('hex')), '書き出したワールドのチャンク = 取り込み元');
      check(e0.actors.size === 48, '書き出したワールドのエンティティ');
      const keys = [...(await readAllEntries(path.join(ex, 'db'))).values()].map((e) => wio.classifyKey(e.key));
      check(keys.every((k) => k.kind === 'actor' || k.dim === 0), '書き出したワールドは dim 0 だけ');
    }

    // ---------------------------------------------------------------
    section('C++ (levikit-core/Format.h) との突き合わせ');
    const gxx = spawnSync('g++', ['--version']).status === 0;
    const zlibHeader = fs.existsSync('/usr/include/zlib.h');
    if (!gxx || !zlibHeader) {
      console.log('  (g++ / zlib.h が無いためスキップ)');
    } else {
      const bin = path.join(tmp, 'format_test');
      execFileSync('g++', ['-std=c++20', '-O1', '-Wall', '-Wextra', '-Werror', '-I', path.join(__dirname, '..', 'mods', 'levikit-core', 'src'), path.join(__dirname, 'native', 'format_test.cpp'), '-o', bin, '-lz'], { stdio: 'inherit' });
      const runNative = (args, input = '') => execFileSync(bin, args, { input, maxBuffer: 256 * 1024 * 1024 }).toString().trim().split('\n');

      // パッケージの読み込み（JS で書いたものを C++ が同じ内容として読む）
      const lines = runNative(['pkg', pkgFile]);
      const last = lines.pop();
      const js = [];
      for (const c of back.chunks) js.push(`1 ${c.rest.toString('hex')} ${fnv64(c.value)} ${c.value.length}`);
      for (const d of back.digps) js.push(`2 ${d.xz.toString('hex')} ${fnv64(d.value)} ${d.value.length}`);
      for (const a of back.actors.values()) js.push(`3 ${a.id.toString('hex')} ${fnv64(a.value)} ${a.value.length}`);
      check(last === `OK ${js.length} ${js.length}`, `C++ がパッケージを最後まで読める (${last})`);
      check(JSON.stringify(lines) === JSON.stringify(js), 'C++ と JS でエントリ（種類・キー・値）が一致');
      // 壊れたパッケージは途中で止まる
      const broken = path.join(tmp, 'broken.lkdim');
      const buf = await fsp.readFile(pkgFile);
      await fsp.writeFile(broken, buf.subarray(0, buf.length - 10));
      const br = spawnSync(bin, ['pkg', broken]);
      check(br.status === 1 && /ERR/.test(br.stdout.toString()), '切れたパッケージはエラー');

      // ストレージキー
      const uids = [-8589934591n, -4294967294n, 1n, -1n, 0x123456789abcdefn, -0x7fffffffffffffffn];
      for (let i = 0; i < 300; i++) uids.push(BigInt.asIntN(64, BigInt('0x' + require('node:crypto').randomBytes(8).toString('hex'))));
      const sk = runNative(['skey'], uids.map(String).join('\n') + '\n');
      check(sk.every((h, i) => h === wio.storageKeyOf(uids[i]).toString('hex')), 'storageKeyOf が一致 (306件)');

      // キーの分類
      const keys = [];
      for (const c of exB.chunks.slice(0, 20)) keys.push(wio.chunkKey(c.rest, 0), wio.chunkKey(c.rest, 1005), wio.chunkKey(c.rest, -3));
      for (const d of exB.digps.slice(0, 5)) keys.push(wio.digpKey(d.xz, 0), wio.digpKey(d.xz, 1005));
      for (const s of ['~local_player', 'game_flatworldlayers', 'mobevents', 'BiomeData', 'Overworld', 'scoreboard', 'portals', 'dimension0', 'actorprefix12345678']) keys.push(Buffer.from(s));
      for (let i = 0; i < 200; i++) keys.push(require('node:crypto').randomBytes([9, 10, 13, 14, 12, 16][i % 6]));
      keys.push(rest(-1875001, 0, 47, 0), rest(5, 5, 47, -1), rest(5, 5, 44), Buffer.concat([rest(1, 2, 44), Buffer.from([0])]));
      const cls = runNative(['classify'], keys.map((k) => k.toString('hex')).join('\n') + '\n');
      let clsOk = true;
      keys.forEach((k, i) => {
        const c = wio.classifyKey(k);
        const want = `${c.kind === 'chunk' ? c.dim : '-'} ${c.kind === 'digp' ? c.dim : '-'}`;
        if (cls[i] !== want) {
          clsOk = false;
          console.log(`    ${k.toString('hex')}: C++ "${cls[i]}" / JS "${want}"`);
        }
      });
      check(clsOk, `チャンク/digp キーの判定が一致 (${keys.length}件)`);

      // withDim / digpWithDim
      const wd = [];
      const wdWant = [];
      for (const c of exB.chunks.slice(0, 30)) {
        for (const dim of [0, 1, 1005, -7]) {
          wd.push(`c ${c.rest.toString('hex')} ${dim}`);
          wdWant.push(wio.chunkKey(c.rest, dim).toString('hex'));
        }
      }
      for (const d of exB.digps) {
        wd.push(`d ${d.xz.toString('hex')} 1005`);
        wdWant.push(wio.digpKey(d.xz, 1005).toString('hex'));
      }
      check(JSON.stringify(runNative(['withdim'], wd.join('\n') + '\n')) === JSON.stringify(wdWant), 'キーの組み立てが一致');

      // 新しい ID
      const ids = runNative(['newids', '20000']).map((l) => l.split(' '));
      const set = new Set(ids.map((x) => x[0]));
      check(set.size === 20000, 'C++ の新しい ID が重複しない');
      check(ids.every(([u, k]) => wio.storageKeyOf(BigInt(u)).toString('hex') === k && BigInt(u) >> 32n >= 0x10000000n && BigInt(u) >> 32n <= 0x3fffffffn), 'C++ の新しい ID: 上位が正・キー規則が JS と一致');

      // 旧形式の UniqueID 書き換え
      const roots = [1n, 2n, 3n].map((u) => actorNbt({ uid: u, key: wio.storageKeyOf(u), identifier: 'minecraft:cow', pos: [0, 0, 0] }));
      const legacy = Buffer.concat(roots);
      const patched = Buffer.from(runNative(['legacy'], legacy.toString('hex') + '\n')[0], 'hex');
      const pr = nbt.readAll(patched);
      check(pr.length === 3 && new Set(pr.map((r) => r.tag.value.UniqueID.value.toString())).size === 3 && pr.every((r) => r.tag.value.UniqueID.value > 3n), '旧形式: すべての UniqueID が新しい値に');
      check(pr.every((r) => r.tag.value.identifier.value === 'minecraft:cow') && patched.length === legacy.length, '旧形式: 他は変わらない');
    }

    // ---------------------------------------------------------------
    section('マップ描画（サブチャンク v9 のパレット・高さマップ）');
    {
      const mapper = require('../panel/lib/mapper');
      // y=0..15 のサブチャンク: y<4 は stone、y=4 は grass_block、それ以上は air（4bit/ブロック）
      const pal = ['minecraft:air', 'minecraft:stone', 'minecraft:grass_block'].map((n) => nbt.writeRoot({ type: 'compound', value: { name: { type: 'string', value: n }, states: { type: 'compound', value: {} }, version: { type: 'int', value: 18100000 } } }, ''));
      const bits = 4;
      const perWord = 8;
      const words = Buffer.alloc((4096 / perWord) * 4);
      for (let i = 0; i < 4096; i++) {
        const y = i & 15;
        const v = y < 4 ? 1 : y === 4 ? 2 : 0;
        const w = Math.floor(i / perWord);
        words.writeUInt32LE((words.readUInt32LE(w * 4) | (v << ((i % perWord) * bits))) >>> 0, w * 4);
      }
      const cnt = Buffer.alloc(4);
      cnt.writeInt32LE(3);
      const sub = Buffer.concat([Buffer.from([9, 1, 0, bits << 1]), words, cnt, ...pal]);
      const dec = mapper.decodeSubchunk(sub, 0);
      check(dec.y === 0 && dec.storages[0].palette[dec.storages[0].idx[4]] === 'minecraft:grass_block', 'サブチャンクを読める');
      const h = Buffer.alloc(512 + 256);
      for (let i = 0; i < 256; i++) h.writeInt16LE(5 + 64, i * 2); // 高さ = y4 の上 (min -64)
      const dbm = path.join(tmp, 'mapdb');
      const { writeDatabase: wd } = require('../panel/lib/leveldb');
      await wd(dbm, [{ key: rest(0, 0, 47, 0), value: sub }, { key: rest(0, 0, 43), value: h }, { key: rest(1, 0, 44), value: Buffer.from([40]) }]);
      const r = await mapper.renderDimension(dbm, 0);
      check(r.meta.decoded === 1 && r.meta.widthChunks === 2 && Object.keys(r.meta.fingerprints).length === 2, '描画の範囲・指紋');
      check(r.png.subarray(1, 4).toString() === 'PNG', 'PNG を出力');
      const d = mapper.diffFingerprints({ '0,0': 'a', '1,0': 'b' }, { '0,0': 'a', '1,0': 'c', '2,0': 'd' });
      check(d.changed.join() === '1,0' && d.added.join() === '2,0' && !d.removed.length, '時点の差分');
    }

    // ---------------------------------------------------------------
    const real = (process.env.LEVIKIT_REAL_WORLDS || '').split(path.delimiter).filter(Boolean);
    if (real.length) {
      section('実ワールド（LEVIKIT_REAL_WORLDS）');
      for (const w of real) {
        for (const dim of [0, 1, 2]) {
          const ex = await wio.extractDimension(path.join(w, 'db'), dim);
          if (!ex.chunks.length) continue;
          const rm = wio.remapEntities(ex);
          if (rm.actors.size) actorInvariants(rm.actors, `${path.basename(w)} dim${dim} (${rm.actors.size} 体)`);
          check(rm.chunks.length === ex.chunks.length, `${path.basename(w)} dim${dim}: ${ex.stats.chunks} チャンク`);
          const mr = await require('../panel/lib/mapper').renderDimension(path.join(w, 'db'), dim);
          check(mr.meta.decoded > 0, `${path.basename(w)} dim${dim}: 地図 ${mr.meta.decoded}/${mr.meta.chunks} チャンクを描画`);
        }
      }
    }
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
  console.log(fail ? `\n${fail} 件失敗 / ${pass} 件成功` : `\nすべて成功 (${pass} 件)`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
