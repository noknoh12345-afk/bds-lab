'use strict';
// 参加中のままバックアップ（save hold / save query / save resume）と復元
//
// 保存形式
//   cas (既定): 重複排除ストア。ファイル内容の SHA-256 をキーに1度だけ保存する。
//               LevelDB の .ldb は書き換わらないので、2回目以降は変わったファイルだけが増える
//               → 10分間隔の自動バックアップでもディスクをほとんど使わない
//   tar       : 1バックアップ = 1つの .tar.zst / .tar.gz（アップロードしたものもこの形式）
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { ts, exists, run, which, readJson, writeJsonAtomic, copyDir, sleep, safeName, dirSize } = require('./util');

const FILE_ITEM_RE = /^(.+):(\d+)$/;

/** save query の出力から "パス:長さ" のリストを取り出す */
function parseQuery(lines) {
  const idx = lines.findIndex((l) => /Data saved\.?\s*Files are now ready to be copied/i.test(l));
  if (idx < 0) return null;
  // 同じ行に続いている場合と次の行に出る場合の両方に対応
  const rest = [lines[idx].replace(/^.*Files are now ready to be copied\.?/i, ''), ...lines.slice(idx + 1)];
  const files = [];
  for (const chunk of rest) {
    if (!chunk || !chunk.trim()) continue;
    const parts = chunk.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
    let any = false;
    for (const p of parts) {
      const m = FILE_ITEM_RE.exec(p);
      if (m && /[\\/]/.test(m[1])) {
        files.push({ rel: m[1].replace(/\\/g, '/'), length: parseInt(m[2], 10) });
        any = true;
      }
    }
    if (any) break; // ファイルリストは1行
  }
  return files.length ? files : null;
}

/** ディレクトリ配下の全ファイル（相対パス） */
async function walkFiles(dir, base = dir, skip = () => false) {
  const out = [];
  for (const e of await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, e.name);
    if (skip(p, e)) continue;
    if (e.isDirectory()) out.push(...(await walkFiles(p, base, skip)));
    else if (e.isFile()) out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

/** 先頭 length バイトの SHA-256 */
function hashPrefix(file, length) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    if (length === 0) return resolve(h.digest('hex'));
    const rs = fs.createReadStream(file, { start: 0, end: length - 1 });
    rs.on('data', (d) => h.update(d));
    rs.on('end', () => resolve(h.digest('hex')));
    rs.on('error', reject);
  });
}

function copyPrefix(src, dst, length) {
  return new Promise((resolve, reject) => {
    if (length === 0) return fsp.writeFile(dst, '').then(resolve, reject);
    const rs = fs.createReadStream(src, { start: 0, end: length - 1 });
    const ws = fs.createWriteStream(dst);
    rs.on('error', reject);
    ws.on('error', reject);
    ws.on('finish', resolve);
    rs.pipe(ws);
  });
}

class BackupManager {
  constructor(cfg, log) {
    this.cfg = cfg;
    this.log = log || (() => {});
    this.root = cfg.backup.dir;
    this.store = path.join(this.root, 'store');
    this.objects = path.join(this.store, 'objects');
    this.cacheFile = path.join(this.store, 'hash-cache.json');
    this.cache = null;
    this.compression = null;
    this.lock = Promise.resolve();
  }

  async init() {
    await fsp.mkdir(this.objects, { recursive: true });
    await fsp.mkdir(path.join(this.store, 'tmp'), { recursive: true });
    const want = this.cfg.backup.compression || 'zstd';
    this.compression = want === 'zstd' && (await which('zstd')) ? 'zstd' : 'gzip';
    this.cache = await readJson(this.cacheFile, {});
  }

  format() {
    return this.cfg.backup.format === 'tar' ? 'tar' : 'cas';
  }

  ext() {
    return this.compression === 'zstd' ? '.tar.zst' : '.tar.gz';
  }

  tarCompressFlag(file) {
    if (file.endsWith('.zst')) return ['--zstd'];
    if (file.endsWith('.gz') || file.endsWith('.tgz')) return ['-z'];
    return [];
  }

  instDir(instName) {
    return path.join(this.root, instName);
  }

  objPath(hash) {
    return path.join(this.objects, hash.slice(0, 2), hash);
  }

  /** 同時に1つだけ（GC とバックアップが競合しないように） */
  exclusive(fn) {
    const p = this.lock.then(fn, fn);
    this.lock = p.catch(() => {});
    return p;
  }

  async list(instName) {
    const names = instName ? [instName] : (await fsp.readdir(this.root).catch(() => [])).filter((n) => n !== 'store' && !n.startsWith('.'));
    const out = [];
    for (const n of names) {
      let files = [];
      try {
        files = await fsp.readdir(this.instDir(n));
      } catch {
        continue;
      }
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const meta = await readJson(path.join(this.instDir(n), f), null);
        if (meta && meta.id) {
          const { files: _omit, ...light } = meta;
          out.push({ ...light, fileCount: meta.files ? meta.files.length : undefined });
        }
      }
    }
    out.sort((a, b) => b.createdAt - a.createdAt);
    return out;
  }

  async get(id, full = false) {
    if (!safeName(id)) return null;
    for (const m of await this.list()) {
      if (m.id === id) return full ? readJson(path.join(this.instDir(m.instance), `${m.id}.json`), null) : m;
    }
    return null;
  }

  archivePath(meta) {
    return path.join(this.instDir(meta.instance), meta.file);
  }

  async stats() {
    return { storeBytes: await dirSize(this.store), format: this.format(), compression: this.compression };
  }

  async remove(id, { gc = true } = {}) {
    const meta = await this.get(id);
    if (!meta) throw new Error('バックアップが見つかりません');
    if (meta.file) await fsp.rm(this.archivePath(meta), { force: true });
    await fsp.rm(path.join(this.instDir(meta.instance), `${meta.id}.json`), { force: true });
    if (gc && meta.format === 'cas') await this.gc();
  }

  /** どのバックアップからも参照されていないオブジェクトを削除 */
  async gc() {
    return this.exclusive(async () => {
      const used = new Set();
      for (const m of await this.list()) {
        if (m.format !== 'cas') continue;
        const full = await readJson(path.join(this.instDir(m.instance), `${m.id}.json`), null);
        for (const f of full?.files || []) used.add(f.hash);
      }
      let removed = 0;
      let freed = 0;
      for (const sub of await fsp.readdir(this.objects).catch(() => [])) {
        const d = path.join(this.objects, sub);
        for (const h of await fsp.readdir(d).catch(() => [])) {
          if (used.has(h)) continue;
          const p = path.join(d, h);
          const st = await fsp.stat(p).catch(() => null);
          await fsp.rm(p, { force: true });
          removed++;
          freed += st?.size || 0;
        }
      }
      for (const [k, h] of Object.entries(this.cache)) if (!used.has(h)) delete this.cache[k];
      await writeJsonAtomic(this.cacheFile, this.cache);
      return { removed, freed };
    });
  }

  // ---------- CAS ----------
  /** entries: [{src, rel, length}] をストアへ。新規に書いたバイト数を返す */
  async storeEntries(entries) {
    let newBytes = 0;
    const files = [];
    for (const e of entries) {
      const st = await fsp.stat(e.src);
      const length = Math.min(e.length ?? st.size, st.size);
      const key = `${e.src}|${st.size}|${Math.floor(st.mtimeMs)}|${length}`;
      let hash = this.cache[key];
      if (!hash || !(await exists(this.objPath(hash)))) {
        hash = await hashPrefix(e.src, length);
        const obj = this.objPath(hash);
        if (!(await exists(obj))) {
          await fsp.mkdir(path.dirname(obj), { recursive: true });
          const tmp = path.join(this.store, 'tmp', `${hash}.${process.pid}.${Math.random().toString(36).slice(2)}`);
          await copyPrefix(e.src, tmp, length);
          await fsp.rename(tmp, obj);
          newBytes += length;
        }
        this.cache[key] = hash;
      }
      files.push({ rel: e.rel, hash, size: length });
    }
    await writeJsonAtomic(this.cacheFile, this.cache);
    return { files, newBytes };
  }

  async writeMeta(meta) {
    await fsp.mkdir(this.instDir(meta.instance), { recursive: true });
    await writeJsonAtomic(path.join(this.instDir(meta.instance), `${meta.id}.json`), meta);
    const { files: _omit, ...light } = meta;
    return light;
  }

  /** CAS のバックアップを dst/<world>/ に展開 */
  async materialize(meta, dstParent, worldName = meta.world) {
    const full = await readJson(path.join(this.instDir(meta.instance), `${meta.id}.json`), null);
    if (!full?.files) throw new Error('メタデータが壊れています');
    for (const f of full.files) {
      const rel = f.rel.split('/').slice(1).join('/'); // 先頭のワールド名を差し替える
      const dst = path.join(dstParent, worldName, rel);
      await fsp.mkdir(path.dirname(dst), { recursive: true });
      await fsp.copyFile(this.objPath(f.hash), dst, fs.constants.COPYFILE_FICLONE);
    }
    return path.join(dstParent, worldName);
  }

  // ---------- tar ----------
  async pack(srcParent, worldDirName, meta) {
    const dir = this.instDir(meta.instance);
    await fsp.mkdir(dir, { recursive: true });
    const file = `${meta.id}${this.ext()}`;
    const out = path.join(dir, file);
    await run('tar', [...this.tarCompressFlag(out), '-cf', out, '-C', srcParent, worldDirName]);
    const st = await fsp.stat(out);
    return this.writeMeta({ ...meta, format: 'tar', file, size: st.size, stored: st.size, compression: this.compression });
  }

  /** ワールドフォルダ丸ごと（停止中・退避用） */
  async backupDir(worldDir, worldName, base) {
    if (this.format() === 'tar') {
      // tar はフォルダ名がそのまま入るので、名前が違う場合は一時的に別名で固める
      if (path.basename(worldDir) === worldName) return this.pack(path.dirname(worldDir), worldName, base);
      const tmpParent = path.join(this.root, '.staging', base.id);
      await fsp.mkdir(tmpParent, { recursive: true });
      try {
        await fsp.rename(worldDir, path.join(tmpParent, worldName));
        return await this.pack(tmpParent, worldName, base);
      } finally {
        await fsp.rm(tmpParent, { recursive: true, force: true });
      }
    }
    const rels = await walkFiles(worldDir);
    const entries = rels.map((r) => ({ src: path.join(worldDir, r), rel: `${worldName}/${r}` }));
    const { files, newBytes } = await this.storeEntries(entries);
    const size = files.reduce((a, f) => a + f.size, 0);
    return this.writeMeta({ ...base, format: 'cas', files, size, stored: newBytes });
  }

  /**
   * ホットバックアップ。サーバーが起動中ならプレイヤーが居てもそのまま取得する。
   * 停止中ならワールドフォルダをそのまま保存する。
   */
  async create(inst, { note = '', type } = {}) {
    return this.exclusive(() => this._create(inst, { note, type }));
  }

  async _create(inst, { note, type }) {
    const { level } = await inst.ports();
    const worldDir = path.join(inst.dir, 'worlds', level);
    if (!(await exists(worldDir))) throw new Error(`ワールドがありません: ${worldDir}`);
    const id = `${inst.name}-${ts()}-${Math.random().toString(36).slice(2, 6)}`;
    const base = { id, instance: inst.name, world: level, createdAt: Date.now(), note, players: [...inst.players.keys()] };

    if (inst.state !== 'running') {
      this.log(`停止中のため通常バックアップを作成: ${level}`);
      return this.backupDir(worldDir, level, { ...base, type: type || 'offline' });
    }

    // KitCore に位置・持ち物グループを書き出させる（ワールドフォルダ内 levikit/）
    if (await inst.hasKitCore()) {
      try {
        await inst.capture('levikit save', { until: (m) => /\bok\b|console only|Unknown command/i.test(m), timeout: 4000, settleMs: 50 });
      } catch {
        /* 古い KitCore など */
      }
    }

    const t0 = Date.now();
    let held = false;
    let result;
    const staging = path.join(this.root, '.staging', id);
    try {
      this.log('save hold');
      inst.send('save hold');
      held = true;
      let files = null;
      for (let i = 0; i < 120 && !files; i++) {
        await sleep(i === 0 ? 1000 : 1500);
        let lines;
        try {
          lines = await inst.capture('save query', {
            until: (m) => /Files are now ready to be copied|not been completed|still be in progress|not ready|A previous save/i.test(m),
            settleUntil: (m) => /:\d+(,|\s*$)/.test(m) && /[\\/]/.test(m),
            timeout: 10_000,
            settleMs: 2000,
          });
        } catch (e) {
          this.log(`save query 再試行: ${e.message}`);
          continue;
        }
        files = parseQuery(lines);
      }
      if (!files) throw new Error('save query が完了しませんでした');
      this.log(`対象 ${files.length} ファイル（形式: ${this.format()}）`);

      const listed = new Set(files.map((f) => path.resolve(inst.dir, 'worlds', f.rel)));
      // save query に出ない補助ファイル（dimension_config.json、levikit/ の持ち物データ、パック設定など）
      const extras = await walkFiles(worldDir, worldDir, (p, e) => (e.isDirectory() && path.resolve(p) === path.resolve(worldDir, 'db')) || listed.has(path.resolve(p)));

      if (this.format() === 'cas') {
        const entries = [
          ...files.map((f) => ({ src: path.join(inst.dir, 'worlds', f.rel), rel: f.rel, length: f.length })),
          ...extras.map((r) => ({ src: path.join(worldDir, r), rel: `${level}/${r}` })),
        ];
        const stored = await this.storeEntries(entries);
        result = stored;
      } else {
        await fsp.mkdir(staging, { recursive: true });
        for (const f of files) {
          const dst = path.join(staging, f.rel);
          await fsp.mkdir(path.dirname(dst), { recursive: true });
          await copyPrefix(path.join(inst.dir, 'worlds', f.rel), dst, f.length);
        }
        await copyDir(worldDir, path.join(staging, level), (p, e) => {
          if (listed.has(path.resolve(p))) return false;
          if (e.isDirectory() && path.resolve(p) === path.resolve(worldDir, 'db')) return false;
          return true;
        });
      }
    } finally {
      if (held) {
        try {
          inst.send('save resume');
          this.log(`save resume（書き込み停止 ${((Date.now() - t0) / 1000).toFixed(1)} 秒）`);
        } catch (e) {
          this.log(`save resume 失敗: ${e.message}`);
        }
      }
    }

    if (this.format() === 'cas') {
      const size = result.files.reduce((a, f) => a + f.size, 0);
      this.log(`新規保存 ${(result.newBytes / 1048576).toFixed(2)} MB / 全体 ${(size / 1048576).toFixed(1)} MB（重複排除）`);
      return this.writeMeta({ ...base, type: type || 'hot', format: 'cas', files: result.files, size, stored: result.newBytes });
    }
    try {
      // 圧縮はワールドの保存を再開した後に行う（プレイヤーへの影響を最小にする）
      return await this.pack(staging, level, { ...base, type: type || 'hot' });
    } finally {
      await fsp.rm(staging, { recursive: true, force: true });
    }
  }

  /** バックアップを dstParent の下に展開し、ワールドフォルダのパスを返す */
  async extract(metaLight, dstParent, worldName) {
    const meta = await this.get(metaLight.id || metaLight, true);
    if (!meta) throw new Error('バックアップが見つかりません');
    await fsp.mkdir(dstParent, { recursive: true });
    let extracted;
    if (meta.format === 'cas') {
      extracted = await this.materialize(meta, dstParent, worldName || meta.world);
    } else {
      const arc = this.archivePath(meta);
      await run('tar', [...this.tarCompressFlag(arc), '-xf', arc, '-C', dstParent]);
      const entries = (await fsp.readdir(dstParent, { withFileTypes: true })).filter((e) => e.isDirectory());
      if (entries.length !== 1) throw new Error('アーカイブの中身が不正です（ワールドフォルダが1つではありません）');
      extracted = path.join(dstParent, entries[0].name);
    }
    if (!(await exists(path.join(extracted, 'level.dat')))) throw new Error('level.dat が含まれていません');
    return extracted;
  }

  /** バックアップを worlds/<level> に展開して差し替える（サーバー停止中に呼ぶ） */
  async restoreInto(metaLight, inst) {
    const { level } = await inst.ports();
    const worlds = path.join(inst.dir, 'worlds');
    const tmp = path.join(worlds, `.restore-${ts()}`);
    try {
      const extracted = await this.extract(metaLight, tmp, level);
      const current = path.join(worlds, level);
      let previous = null;
      if (await exists(current)) {
        previous = path.join(worlds, `.pre-restore-${ts()}-${level}`);
        await fsp.rename(current, previous);
      }
      await fsp.rename(extracted, current);
      return { previous };
    } finally {
      await fsp.rm(tmp, { recursive: true, force: true });
    }
  }

  /** 復元前のワールドを安全のためバックアップ化してから削除 */
  async archivePrevious(inst, previousDir) {
    if (!previousDir) return null;
    const { level } = await inst.ports();
    const id = `${inst.name}-${ts()}-prerestore`;
    try {
      const meta = await this.exclusive(() =>
        this.backupDir(previousDir, level, { id, instance: inst.name, world: level, createdAt: Date.now(), type: 'pre-restore', note: '復元直前の自動退避', players: [] })
      );
      await fsp.rm(previousDir, { recursive: true, force: true });
      return meta;
    } catch (e) {
      this.log(`退避バックアップに失敗（${previousDir} に残っています）: ${e.message}`);
      return null;
    }
  }

  /** ダウンロード用に tar ストリームを書き出す */
  async exportTo(id, res) {
    const meta = await this.get(id, true);
    if (!meta) throw new Error('バックアップが見つかりません');
    if (meta.format !== 'cas') {
      const file = this.archivePath(meta);
      const st = await fsp.stat(file);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': st.size, 'Content-Disposition': `attachment; filename="${meta.file}"` });
      fs.createReadStream(file).pipe(res);
      return;
    }
    const staging = path.join(this.root, '.staging', `export-${meta.id}-${Math.random().toString(36).slice(2, 6)}`);
    await this.materialize(meta, staging, meta.world);
    const zstd = this.compression === 'zstd';
    const name = `${meta.id}${zstd ? '.tar.zst' : '.tar.gz'}`;
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${name}"` });
    const tar = spawn('tar', [zstd ? '--zstd' : '-z', '-cf', '-', '-C', staging, meta.world], { stdio: ['ignore', 'pipe', 'ignore'] });
    tar.stdout.pipe(res);
    const cleanup = () => fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
    tar.on('close', cleanup);
    res.on('close', () => {
      if (tar.exitCode === null) tar.kill();
    });
  }

  /** アップロードされたアーカイブを登録（tar 形式のまま保持） */
  async importArchive(instName, tmpFile, originalName) {
    const isZst = /\.zst$/i.test(originalName);
    const isGz = /\.(gz|tgz)$/i.test(originalName);
    if (!isZst && !isGz && !/\.tar$/i.test(originalName)) throw new Error('.tar.zst / .tar.gz / .tar のみ対応');
    const id = `${instName}-${ts()}-upload`;
    const file = `${id}${isZst ? '.tar.zst' : isGz ? '.tar.gz' : '.tar'}`;
    const listing = await run('tar', [...this.tarCompressFlag(file), '-tf', tmpFile]);
    const tops = new Set(
      listing.out
        .split('\n')
        .map((l) => l.replace(/^\.\//, '').split('/')[0])
        .filter(Boolean)
    );
    if (tops.size !== 1) throw new Error('アーカイブ直下にワールドフォルダが1つだけ入っている必要があります');
    const dir = this.instDir(instName);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.rename(tmpFile, path.join(dir, file)).catch(async () => {
      await fsp.copyFile(tmpFile, path.join(dir, file));
      await fsp.rm(tmpFile, { force: true });
    });
    const st = await fsp.stat(path.join(dir, file));
    return this.writeMeta({ id, instance: instName, world: [...tops][0], createdAt: Date.now(), type: 'upload', note: originalName, format: 'tar', file, size: st.size, stored: st.size, players: [] });
  }

  /** 世代管理: keep 件 + 1日1個を keepDaily 日分残す。手動/退避/アップロード/ピン留めは消さない */
  async prune(instName) {
    const keep = this.cfg.backup.keep ?? 48;
    const keepDaily = this.cfg.backup.keepDaily ?? 14;
    const all = (await this.list(instName)).filter((m) => m.type === 'auto' && !m.pinned);
    const keepIds = new Set(all.slice(0, keep).map((m) => m.id));
    const days = new Map();
    for (const m of all) {
      const d = new Date(m.createdAt).toISOString().slice(0, 10);
      if (!days.has(d)) days.set(d, m.id);
    }
    [...days.values()].slice(0, keepDaily).forEach((id) => keepIds.add(id));
    let removed = 0;
    for (const m of all) {
      if (!keepIds.has(m.id)) {
        await this.remove(m.id, { gc: false });
        removed++;
      }
    }
    if (removed) await this.gc();
    return removed;
  }

  async setPinned(id, pinned) {
    const meta = await this.get(id, true);
    if (!meta) throw new Error('バックアップが見つかりません');
    meta.pinned = !!pinned;
    return this.writeMeta(meta);
  }

  async setNote(id, note) {
    const meta = await this.get(id, true);
    if (!meta) throw new Error('バックアップが見つかりません');
    meta.note = String(note || '').slice(0, 200);
    return this.writeMeta(meta);
  }

  /** rclone で外部ストレージへ同期 */
  async offsite(log) {
    const o = this.cfg.backup.offsite;
    if (!o?.enabled || !o.remote) return;
    if (!(await which('rclone'))) {
      log('rclone が無いため外部同期をスキップ (apt install rclone)');
      return;
    }
    if (!/^[A-Za-z0-9_.-]+:[A-Za-z0-9_./ -]*$/.test(o.remote)) throw new Error('rclone remote の書式が不正です');
    log(`外部ストレージへ同期: ${o.remote}`);
    await run('rclone', ['sync', this.root, o.remote, '--exclude', '.staging/**', '--exclude', 'store/tmp/**', '--fast-list'], { onLine: (l) => log(l) });
  }
}

module.exports = { BackupManager, parseQuery, walkFiles };
