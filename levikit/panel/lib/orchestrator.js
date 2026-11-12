'use strict';
// 「参加したまま」系の操作をまとめる
//   - シームレス再起動 / 復元 / Mod更新: 待機サーバー(limbo)へ TransferPacket で退避 → 作業 → 自動で戻す
//   - 待機サーバーの自動構築・同期
//   - ジョブ管理（同時に1つ）
const path = require('node:path');
const fsp = require('node:fs/promises');
const { EventEmitter } = require('node:events');
const { sleep, exists, run, which, readJson, writeJsonAtomic, ts } = require('./util');
const { readProps, writeProps } = require('./props');
const kitlib = require('./kit');
const wio = require('./worldio');
const mapper = require('./mapper');
const { rollbackChunks } = require('./chronicle');
const { texturePack } = require('./textures');
const addons = require('./addons');

const { readKit, writeKit } = kitlib;
const VANILLA_IDS = { overworld: 0, nether: 1, the_end: 2 };
const VANILLA_KEYS = { overworld: 'overworld', nether: 'nether', the_end: 'theEnd' };
const VANILLA_GENERATORS = { overworld: 'Overworld', nether: 'Nether', the_end: 'TheEnd' };
const mb = (n) => `${((n || 0) / 1048576).toFixed(1)} MB`;

/** ワールドフォルダ内でのディメンション ID（カスタムは MoreDimensions の記録から） */
async function dimIdInWorld(worldDir, name) {
  if (name in VANILLA_IDS) return VANILLA_IDS[name];
  const dc = await readJson(path.join(worldDir, 'dimension_config.json'), null);
  const id = dc?.dimensionList?.[name]?.dimId;
  return Number.isInteger(id) ? id : null;
}

/**
 * 次元の高さの範囲 { minY, height }（MoreDimensions: ネザー型 0/128, エンド型 0/256, それ以外 -64/384）
 *   カスタムは dimension_config.json に記録された値
 */
async function dimRangeInWorld(worldDir, name) {
  if (name === 'overworld') return { minY: -64, height: 384 };
  if (name === 'nether') return { minY: 0, height: 128 };
  if (name === 'the_end') return { minY: 0, height: 256 };
  const dc = await readJson(path.join(worldDir, 'dimension_config.json'), null);
  const snbt = String(dc?.dimensionList?.[name]?.sNbt || '');
  const minY = /dimensionMinY:(-?\d+)/.exec(snbt);
  const h = /dimensionHeightRange:(-?\d+)/.exec(snbt);
  if (minY && h) return { minY: Number(minY[1]), height: Number(h[1]) };
  const gen = /generatorType:"?(\w+)/.exec(snbt)?.[1];
  return gen === 'Nether' ? { minY: 0, height: 128 } : gen === 'TheEnd' ? { minY: 0, height: 256 } : { minY: -64, height: 384 };
}
const sameRange = (a, b) => a.minY === b.minY && a.height === b.height;
const rangeTargetDim = (r) => (r.minY === -64 ? 0 : r.height === 128 ? 1 : 2);
const rangeJa = (r) => `Y ${r.minY}〜${r.minY + r.height}`;

/** 進捗ログを間引く */
function throttled(log, ms = 2000) {
  let last = 0;
  return (msg) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      log(msg);
    }
  };
}

class Job {
  constructor(id, title) {
    this.id = id;
    this.title = title;
    this.status = 'running';
    this.log = [];
    this.startedAt = Date.now();
    this.endedAt = null;
    this.error = null;
    this.result = null;
  }
  toJSON() {
    return {
      id: this.id,
      title: this.title,
      status: this.status,
      log: this.log.slice(-300),
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      error: this.error,
      result: this.result,
    };
  }
}

class Orchestrator extends EventEmitter {
  constructor({ cfg, saveCfg, main, limbo, backups }) {
    super();
    this.cfg = cfg;
    this.saveCfg = saveCfg;
    this.main = main;
    this.limbo = limbo;
    this.backups = backups;
    this.job = null;
    this.history = [];
    this.jobSeq = 0;
  }

  // ---------- jobs ----------
  busy() {
    return this.job && this.job.status === 'running';
  }

  runJob(title, fn) {
    if (this.busy()) throw new Error(`実行中のジョブがあります: ${this.job.title}`);
    const job = new Job(`${ts()}-${++this.jobSeq}`, title);
    this.job = job;
    const log = (msg) => {
      const line = `[${new Date().toLocaleTimeString('ja-JP')}] ${msg}`;
      job.log.push(line);
      this.emit('job', job.toJSON());
    };
    this.emit('job', job.toJSON());
    (async () => {
      try {
        await fn(log, job);
        job.status = 'done';
        log('完了');
      } catch (e) {
        job.status = 'failed';
        job.error = e.message;
        log(`失敗: ${e.message}`);
      } finally {
        job.endedAt = Date.now();
        this.history.unshift(job.toJSON());
        this.history = this.history.slice(0, 30);
        this.emit('job', job.toJSON());
      }
    })();
    return job.toJSON();
  }

  // ---------- helpers ----------
  /** Endstone には追加ディメンションと lip が無い: その操作は理由を言って断る */
  needsLeviLamina(what) {
    if (this.cfg.engine === 'endstone') throw new Error(`${what}は LeviLamina 版だけの機能です（Endstone 版のワールドはオーバーワールド・ネザー・ジ・エンドの 3 つです）`);
  }

  limboEnabled() {
    return (this.cfg.instances.limbo?.mode || 'ondemand') !== 'disabled';
  }

  async say(inst, text) {
    if (inst.state !== 'running') return;
    try {
      inst.send(`say ${text}`);
    } catch {
      /* ignore */
    }
  }

  async countdown(inst, seconds, what, log) {
    if (inst.state !== 'running' || inst.players.size === 0 || seconds <= 0) return;
    const marks = [300, 120, 60, 30, 10, 5, 4, 3, 2, 1].filter((s) => s <= seconds);
    let remaining = seconds;
    log(`${seconds}秒前から告知します`);
    for (const m of marks) {
      await sleep((remaining - m) * 1000);
      remaining = m;
      await this.say(inst, `§e${what}まであと ${m >= 60 ? `${m / 60}分` : `${m}秒`}`);
    }
    await sleep(remaining * 1000);
  }

  hostForTransfer() {
    const h = (this.cfg.publicHost || '').trim();
    if (!h) return null;
    if (!/^[A-Za-z0-9.-]+$/.test(h)) return null;
    return h;
  }

  /** シームレスに出来るか。出来ない理由を返す */
  async seamlessBlocker() {
    if (!this.limboEnabled()) return '待機サーバーが無効になっています（設定 → 待機サーバー）';
    if (!this.hostForTransfer()) return '公開ホスト(publicHost)が未設定です（設定画面で VPS の IP かドメインを入力）';
    if (!(await this.main.hasKitCore())) return 'levikit-core Mod が未導入です（TransferPacket を送れません）';
    return null;
  }

  // ---------- limbo ----------
  /** main から待機サーバー用ディレクトリを作成/同期する（limbo 停止中に呼ぶ） */
  async prepareLimbo(log) {
    const src = this.main.dir;
    const dst = this.limbo.dir;
    if (this.limbo.cfg.cmd) return; // テスト用
    const exeName = path.basename(this.main.exe); // LeviLamina: bedrock_server_mod.exe / Endstone: bedrock_server
    if (!(await exists(path.join(src, exeName)))) throw new Error('main が未インストールです');
    await fsp.mkdir(dst, { recursive: true });
    const stampFile = path.join(src, '.levikit-stamp');
    const stamp = (await readJson(stampFile, { v: 0 })).v;
    const limboStamp = (await readJson(path.join(dst, '.levikit-stamp'), { v: -1 })).v;
    if (stamp !== limboStamp || !(await exists(path.join(dst, exeName)))) {
      log('待機サーバーへ本体/Mod を同期中 (rsync)…');
      if (!(await which('rsync'))) throw new Error('rsync がありません (apt install rsync)');
      await run('rsync', [
        '-a',
        '--delete',
        '--exclude=/worlds/',
        '--exclude=/server.properties',
        '--exclude=/logs/',
        '--exclude=/plugins/levikit-core/config/',
        '--exclude=/plugins/levikit-core/data/',
        '--exclude=/.levikit-stamp',
        `${src}/`,
        `${dst}/`,
      ]);
      await writeJsonAtomic(path.join(dst, '.levikit-stamp'), { v: stamp });
    }

    // server.properties: main をベースに待機用の上書き
    const mainProps = (await readProps(path.join(src, 'server.properties'))).map;
    const limboPropsFile = path.join(dst, 'server.properties');
    if (!(await exists(limboPropsFile))) await fsp.copyFile(path.join(src, 'server.properties'), limboPropsFile);
    const lp = this.cfg.instances.limbo;
    await writeProps(limboPropsFile, {
      'server-name': `${mainProps['server-name'] || 'LeviKit'} (待機中)`,
      'server-port': lp.port || 19134,
      'server-portv6': lp.portv6 || 19135,
      'level-name': 'limbo',
      'level-type': 'FLAT',
      gamemode: 'adventure',
      'force-gamemode': 'true',
      difficulty: 'peaceful',
      'allow-cheats': 'false',
      'view-distance': '6',
      'tick-distance': '4',
      'max-players': mainProps['max-players'] || '10',
      'online-mode': mainProps['online-mode'] || 'true',
      'allow-list': mainProps['allow-list'] || 'false',
      'enable-lan-visibility': 'false',
      'block-network-ids-are-hashes': mainProps['block-network-ids-are-hashes'] || 'true',
    });
    for (const f of ['allowlist.json', 'permissions.json']) {
      if (await exists(path.join(src, f))) await fsp.copyFile(path.join(src, f), path.join(dst, f));
    }
    // KitCore を待機モードに
    const kitCfgFile = path.join(dst, 'plugins', 'levikit-core', 'config', 'config.json');
    if (this.cfg.engine === 'endstone' || (await exists(path.join(dst, 'plugins', 'levikit-core')))) {
      const kc = await readJson(kitCfgFile, { version: 1 });
      kc.limboMode = true;
      kc.dimensions = [];
      await writeJsonAtomic(kitCfgFile, kc);
    }
    await syncGlacieConfig(dst, lp.port || 19134, lp.portv6 || 19135, log);
  }

  async ensureLimboRunning(log) {
    if (this.limbo.state === 'running') return;
    if (this.limbo.state === 'stopped') {
      await this.prepareLimbo(log);
      log('待機サーバーを起動中…');
      await this.limbo.start();
    }
    await this.limbo.waitStarted(240_000);
    log('待機サーバー起動完了');
  }

  async maybeStopLimbo(log) {
    if ((this.cfg.instances.limbo?.mode || 'ondemand') !== 'ondemand') return;
    const t0 = Date.now();
    while (this.limbo.players.size > 0 && Date.now() - t0 < 90_000) await sleep(2000);
    if (this.limbo.players.size > 0) {
      log(`待機サーバーに ${this.limbo.players.size} 人残っているため起動したままにします`);
      return;
    }
    log('待機サーバーを停止');
    await this.limbo.stop();
  }

  async transfer(from, toPort, log) {
    const host = this.hostForTransfer();
    const n = from.players.size;
    log(`${from.name} の ${n} 人を ${host}:${toPort} へ転送`);
    from.send(`levikit transfer ${host} ${toPort}`);
    const t0 = Date.now();
    while (from.players.size > 0 && Date.now() - t0 < 25_000) await sleep(500);
    if (from.players.size > 0) log(`転送されなかったプレイヤー: ${[...from.players.keys()].join(', ')}`);
  }

  /**
   * メインサーバーを止めて action() を実行し、再起動する。
   * 可能なら参加者を待機サーバーへ退避して自動で戻す。
   */
  async cycleMain(log, title, action, { forceStandard = false } = {}) {
    const main = this.main;
    const blocker = await this.seamlessBlocker();
    const hasPlayers = main.state === 'running' && main.players.size > 0;
    const seamless = hasPlayers && !blocker && !forceStandard;

    if (hasPlayers && !seamless) {
      log(`通常モードで実行（理由: ${forceStandard ? '指定' : blocker}）`);
      await this.countdown(main, this.cfg.schedule?.restartWarnSeconds ?? 30, title, log);
    }

    if (seamless) {
      await this.ensureLimboRunning(log);
      const { port: limboPort } = await this.limbo.ports();
      await this.say(main, `§e[LeviKit] ${title}のため一時的に待機サーバーへ移動します（自動で戻ります）`);
      await sleep(2000);
      await this.transfer(main, limboPort, log);
    }

    if (main.state !== 'stopped') {
      log('メインサーバーを停止');
      await main.stop();
    }
    let actionError = null;
    if (action) {
      try {
        await action(log);
      } catch (e) {
        actionError = e;
        log(`作業に失敗: ${e.message} → 変更前の状態でサーバーを起動し直します`);
      }
    }

    const { port, portv6 } = await main.ports();
    await syncGlacieConfig(main.dir, port, portv6, log);
    log('メインサーバーを起動');
    try {
      await main.start();
      await main.waitStarted(300_000);
    } catch (e) {
      await this.say(this.limbo, '§c[LeviKit] メインサーバーの起動に失敗しました。管理者が対応中です');
      throw e;
    }
    log('メインサーバー起動完了');

    if (seamless || this.limbo.players.size > 0) {
      await sleep(3000);
      if (this.limbo.state === 'running' && this.limbo.players.size > 0) {
        await this.transfer(this.limbo, port, log);
      }
      await this.maybeStopLimbo(log);
    }
    if (actionError) throw actionError;
  }

  /** fn の実行中に main が出した levikit-core のイベント（kinds）を集める */
  async withKitEvents(kinds, fn) {
    const seen = [];
    const on = (kind, data) => {
      if (kinds.includes(kind)) seen.push({ kind, data: data || {} });
    };
    this.main.on('kit', on);
    try {
      await fn();
    } finally {
      this.main.off('kit', on);
    }
    return seen;
  }

  importsDir() {
    return path.join(this.main.dir, 'plugins', 'levikit-core', 'data', 'imports');
  }

  workDir(tag) {
    return path.join(this.cfg.root, 'tmp', `${tag}-${ts()}-${Math.random().toString(36).slice(2, 6)}`);
  }

  serverVersion() {
    return this.cfg.bdsVersion || '1.26.51';
  }

  /** pendingImports を書いて再起動し、結果を確かめる */
  async runImport(log, kit, name, pkgRel, standard, title) {
    kit.pendingImports = [...(kit.pendingImports || []).filter((x) => x.name !== name), { name, file: pkgRel, clearFirst: true }];
    const next = kitlib.normalizeKit(kit);
    kitlib.validateDims(next);
    await writeKit(this.main.dir, next);
    const events = await this.withKitEvents(['IMPORT', 'IMPORT_FAILED'], () => this.cycleMain(log, title, null, { forceStandard: standard }));
    const ev = events.find((e) => e.data.name === name);
    if (!ev) {
      log('警告: 取り込み完了の通知がありません（levikit-core が古い可能性）');
      return null;
    }
    if (ev.kind === 'IMPORT_FAILED') throw new Error(`levikit-core が取り込みに失敗: ${ev.data.error}`);
    log(`取り込み完了: ${ev.data.written} 件を書き込み${ev.data.deleted ? ` / 既存 ${ev.data.deleted} 件を削除` : ''}（${ev.data.ms} ms）`);
    return ev.data;
  }

  /**
   * .mcworld を新しいワールド（カスタムディメンション）として取り込む
   *   既存のワールドを置き換えることもできる（その場合は先にバックアップ）
   */
  importWorld({ file, originalName = '', name, displayName = '', generator = 'Void', sourceDim = 0, seedMode = 'keep', replace = false, standard = false }) {
    this.needsLeviLamina('ワールドの取り込み');
    return this.runJob(`ワールド取り込み: ${displayName || name}`, async (log, job) => {
      const cleanup = () => fsp.rm(file, { force: true }).catch(() => {});
      try {
        if (!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(name || '') || name.startsWith('minecraft:')) throw new Error('ID は "namespace:name" 形式（小文字英数、minecraft: 以外）');
        if (!kitlib.GENERATORS.includes(generator)) throw new Error(`生成タイプが不正: ${generator}`);
        // 高さの範囲を合わせる（ネザーは 0〜128、エンドは 0〜256 の次元にしか正しく入らない）
        const forced = { 1: 'Nether', 2: 'TheEnd' }[sourceDim];
        if (forced && generator !== forced) {
          log(`取り込む次元に合わせて生成タイプを ${forced} にします（高さの範囲を揃えるため）`);
          generator = forced;
        } else if (!forced && ['Nether', 'TheEnd'].includes(generator)) {
          log('オーバーワールドの地形は高さの範囲が違う Nether/TheEnd 型には入らないため、Void にします');
          generator = 'Void';
        }
        const kit = await readKit(this.main.dir);
        const existing = kit.dimensions.find((d) => d.name === name);
        if (existing && !replace) throw new Error(`ID ${name} のワールドはすでにあります（置き換えるには「既存のワールドを置き換える」を選択）`);
        if (existing) {
          const { level } = await this.main.ports();
          const live = await dimRangeInWorld(path.join(this.main.dir, 'worlds', level), name);
          const want = sourceDim === 1 ? { minY: 0, height: 128 } : sourceDim === 2 ? { minY: 0, height: 256 } : { minY: -64, height: 384 };
          if (!sameRange(live, want)) throw new Error(`${name} の高さの範囲（${rangeJa(live)}）と取り込む次元（${rangeJa(want)}）が違うため置き換えられません。新しい ID で取り込んでください`);
        }

        const dir = this.importsDir();
        await fsp.mkdir(dir, { recursive: true });
        const pkgName = `${name.replace(/[^a-z0-9_.-]/g, '_')}-${ts()}.lkdim`;
        const pkgFile = path.join(dir, pkgName);
        log(`${originalName || 'アップロードされたファイル'} を解析中…`);
        const info = await wio.importMcworld(file, pkgFile, { sourceDim, workDir: dir, onProgress: throttled(log) });
        await cleanup();
        log(`「${info.levelName}」 保存バージョン ${info.version || '不明'} / ${info.chunks} チャンク / エンティティ ${info.actors} 体 / パッケージ ${mb(info.packageSize)}`);
        if (info.bounds) log(`範囲: X ${info.bounds.minX}〜${info.bounds.maxX} / Z ${info.bounds.minZ}〜${info.bounds.maxZ}`);
        if (info.version && wio.cmpVersion(info.version, this.serverVersion()) > 0) {
          log(`警告: サーバー(${this.serverVersion()})より新しいバージョンで保存されたワールドです。新しいブロックは正しく読み込まれない場合があります`);
        }
        if (info.actorsDropped) log(`読めないエンティティ ${info.actorsDropped} 体は取り込みません`);

        if (existing) {
          this.backups.log = log;
          const pre = await this.backups.create(this.main, { type: 'pre-import', note: `取り込み前: ${name}` });
          log(`置き換え前のバックアップ: ${pre.id}`);
        } else {
          const unknownY = !Number.isFinite(info.spawn.y) || info.spawn.y >= 32767 || info.spawn.y <= -32768;
          let seed = 0;
          if (seedMode === 'keep' && info.seed !== '') seed = Number(BigInt.asUintN(32, BigInt(info.seed)));
          else if (seedMode === 'random') seed = Math.floor(Math.random() * 4294967295);
          kit.dimensions.push(
            kitlib.deepMerge(kitlib.DIM_TEMPLATE, {
              name,
              displayName: String(displayName || info.levelName || name).slice(0, 40),
              description: `取り込み: ${info.levelName || originalName}`.slice(0, 80),
              icon: 'textures/items/map_filled',
              generator,
              seed,
              // ネザー/エンドの取り込みは level.dat のスポーン（オーバーワールド用）が使えないので原点付近に足場
              spawn: ['Nether', 'TheEnd'].includes(generator) ? { x: 0.5, y: 64, z: 0.5 } : { x: info.spawn.x + 0.5, y: unknownY ? 100 : Math.min(318, Math.max(-63, info.spawn.y)), z: info.spawn.z + 0.5 },
              landing: ['Nether', 'TheEnd'].includes(generator) ? 'platform' : unknownY ? 'surface' : 'fixed',
            })
          );
          log(`ワールド ${name} を追加（範囲外は ${generator === 'Void' ? '何もない空間' : `${generator} で生成`}）`);
        }
        const r = await this.runImport(log, kit, name, `imports/${pkgName}`, standard, 'ワールド取り込み');
        job.result = { name, info: { ...info, seed: String(info.seed ?? '') }, written: r?.written ?? null };
      } finally {
        await cleanup();
      }
    });
  }

  /**
   * バックアップから1つのワールドだけを復元する。他のワールド・プレイヤーデータはそのまま
   *   どのワールドでも可（オーバーワールド・ネザー・エンドも）。参加者は待機サーバーへ移し、
   *   メインサーバー停止中にその次元のキーだけを LevelDB で入れ替える
   */
  restoreWorld(name, backupId, { standard = false } = {}) {
    return this.runJob(`ワールド単位の復元: ${name}`, async (log, job) => {
      const kit = await readKit(this.main.dir);
      if (!(name in VANILLA_IDS) && !kit.dimensions.some((d) => d.name === name)) throw new Error(`ワールドがありません: ${name}`);
      const meta = await this.backups.get(backupId);
      if (!meta) throw new Error('バックアップが見つかりません');
      const { level } = await this.main.ports();
      const liveWorld = path.join(this.main.dir, 'worlds', level);
      const work = this.workDir('world-restore');
      try {
        log(`バックアップ ${meta.id}（${new Date(meta.createdAt).toLocaleString('ja-JP')}）を展開中…`);
        const bkWorld = await this.backups.extract(meta, work);
        const backupDim = await dimIdInWorld(bkWorld, name);
        if (backupDim === null) throw new Error(`このバックアップには ${name} が含まれていません（ワールドを追加する前のバックアップ？）`);
        const liveDim = await dimIdInWorld(liveWorld, name);
        if (liveDim === null) throw new Error(`${name} はまだ作成されていません（一度起動して登録してから復元してください）`);
        const was = await dimRangeInWorld(bkWorld, name);
        const now = await dimRangeInWorld(liveWorld, name);
        if (!sameRange(was, now)) throw new Error(`バックアップ時（${rangeJa(was)}）と今（${rangeJa(now)}）で高さの範囲が違います（生成タイプを変えてリセットした？）。この組み合わせは復元できません`);
        this.backups.log = log;
        const pre = await this.backups.create(this.main, { type: 'pre-restore', note: `ワールド単位の復元前: ${name}` });
        log(`現在の状態のバックアップ: ${pre.id}`);
        await this.cycleMain(
          log,
          'ワールド復元',
          async (l) => {
            const r = await rollbackChunks({ liveDb: path.join(liveWorld, 'db'), backupDb: path.join(bkWorld, 'db'), liveDim, backupDim, chunks: 'all', log: l });
            if (!(name in VANILLA_IDS)) await bumpEpochFile(liveWorld, name, 'restore');
            l(`復元完了: ${r.chunks} チャンク / エンティティ ${r.actors} 体（削除 ${r.removedKeys} キー）`);
            job.result = { name, backup: meta.id, chunks: r.chunks, actors: r.actors, preBackup: pre.id };
          },
          { forceStandard: standard }
        );
        if (!job.result) throw new Error('復元に失敗しました（ワールドは元のまま）');
      } finally {
        await fsp.rm(work, { recursive: true, force: true });
      }
    });
  }

  /** ワールドを複製して新しいワールドにする（建築のコピー・イベント用の複製など） */
  cloneWorld(from, to, { displayName = '', standard = false } = {}) {
    this.needsLeviLamina('ワールドの複製');
    return this.runJob(`ワールド複製: ${from} → ${to}`, async (log, job) => {
      if (!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(to || '') || to.startsWith('minecraft:')) throw new Error('複製先の ID は "namespace:name" 形式（小文字英数、minecraft: 以外）');
      const kit = await readKit(this.main.dir);
      if (kit.dimensions.some((d) => d.name === to)) throw new Error(`ID ${to} のワールドはすでにあります`);
      const vanilla = from in VANILLA_KEYS;
      const src = vanilla ? kit[VANILLA_KEYS[from]] : kit.dimensions.find((d) => d.name === from);
      if (!src) throw new Error(`複製元のワールドがありません: ${from}`);
      let entry;
      if (vanilla) {
        let seed = 0;
        try {
          const { level } = await this.main.ports();
          const li = wio.levelInfo(await fsp.readFile(path.join(this.main.dir, 'worlds', level, 'level.dat')));
          if (li.seed !== '') seed = Number(BigInt.asUintN(32, BigInt(li.seed)));
        } catch {
          /* シードが読めなければ 0 */
        }
        entry = { name: to, displayName: '', description: '', icon: src.icon, generator: VANILLA_GENERATORS[from], seed, spawn: structuredClone(src.spawn), landing: src.landing, rules: structuredClone(src.rules) };
      } else {
        entry = { ...structuredClone(src), name: to };
      }
      entry.displayName = String(displayName || `${src.displayName || from} のコピー`).slice(0, 40);
      entry.description = `${src.displayName || from} から複製`.slice(0, 80);
      entry.enabled = true;
      kit.dimensions.push(kitlib.deepMerge(kitlib.DIM_TEMPLATE, entry));
      kit.pendingClones = [...(kit.pendingClones || []), { from, to }];
      const next = kitlib.normalizeKit(kit);
      kitlib.validateDims(next);
      await writeKit(this.main.dir, next);
      log(`${to} を追加して ${from} の中身を複製します`);
      const events = await this.withKitEvents(['CLONE', 'CLONE_FAILED'], () => this.cycleMain(log, 'ワールド複製', null, { forceStandard: standard }));
      const ev = events.find((e) => e.data.to === to);
      if (!ev) log('警告: 複製完了の通知がありません（levikit-core が古い可能性）');
      else if (ev.kind === 'CLONE_FAILED') throw new Error(`levikit-core が複製に失敗: ${ev.data.error}`);
      else log(`複製完了: ${ev.data.written} 件（${ev.data.ms} ms）`);
      job.result = { from, to, written: ev?.data?.written ?? null };
    });
  }

  /**
   * 1つのワールドを単独の .mcworld に書き出す（参加したまま）
   *   backupId を指定しなければ、その場でホットバックアップを取ってから書き出す
   */
  exportWorld(key, { backupId = null } = {}) {
    return this.runJob(`ワールド書き出し: ${key}`, async (log, job) => {
      const kit = await readKit(this.main.dir);
      const entry = key in VANILLA_KEYS ? kit[VANILLA_KEYS[key]] : kit.dimensions.find((d) => d.name === key);
      if (!entry) throw new Error(`ワールドがありません: ${key}`);
      let meta;
      let temporary = false;
      if (backupId) {
        meta = await this.backups.get(backupId);
        if (!meta) throw new Error('バックアップが見つかりません');
      } else {
        this.backups.log = log;
        meta = await this.backups.create(this.main, { type: 'export', note: `書き出し用: ${key}` });
        temporary = true;
      }
      const work = this.workDir('export');
      try {
        log(`バックアップ ${meta.id} を展開中…`);
        const worldDir = await this.backups.extract(meta, work);
        const dimId = await dimIdInWorld(worldDir, key);
        if (dimId === null) throw new Error(`このバックアップには ${key} が含まれていません`);
        const outDir = path.join(this.cfg.root, 'exports');
        await fsp.mkdir(outDir, { recursive: true });
        await cleanupExports(outDir);
        const label = String(entry.displayName || key);
        const fileName = `${label.replace(/[^\p{L}\p{N}_.-]+/gu, '_').slice(0, 40) || 'world'}-${ts()}.mcworld`;
        const range = await dimRangeInWorld(worldDir, key);
        const targetDim = rangeTargetDim(range);
        if (targetDim) log(`高さの範囲が ${rangeJa(range)} のため、書き出したワールドの${targetDim === 1 ? 'ネザー' : 'ジ・エンド'}に入れます（オーバーワールドは何もない空間）`);
        const r = await wio.exportMcworld(worldDir, dimId, path.join(outDir, fileName), {
          targetDim,
          levelName: label,
          spawn: { x: Math.floor(entry.spawn.x), y: Math.floor(entry.spawn.y), z: Math.floor(entry.spawn.z) },
          onProgress: throttled(log),
        });
        log(`書き出し完了: ${fileName}（${mb(r.size)} / ${r.chunks} チャンク / エンティティ ${r.actors} 体）`);
        job.result = { download: `/api/exports/${encodeURIComponent(fileName)}`, file: fileName, size: r.size, chunks: r.chunks };
      } finally {
        await fsp.rm(work, { recursive: true, force: true });
        if (temporary) await this.backups.remove(meta.id).catch(() => {});
      }
    });
  }

  assetsDir() {
    return this.cfg.assetsDir || path.join(this.cfg.root, 'assets', 'resource_pack');
  }

  viewCacheDir() {
    return path.join(this.cfg.root, 'view-cache');
  }

  /**
   * 観察ビュー用にワールドを用意する（backupId 無し = 今の状態をスナップショット。参加したまま）
   *   展開したワールドを view-cache/<バックアップID>/ に置く（最新 3 つまで）。古いスナップショット型バックアップは 5 つまで
   */
  prepareView({ backupId = null } = {}) {
    return this.runJob('観察ビューの準備', async (log, job) => {
      let meta;
      if (backupId) {
        meta = await this.backups.get(backupId);
        if (!meta) throw new Error('バックアップが見つかりません');
      } else {
        this.backups.log = log;
        meta = await this.backups.create(this.main, { type: 'snapshot', note: '観察ビュー' });
      }
      const root = this.viewCacheDir();
      const dst = path.join(root, meta.id);
      if (!(await exists(path.join(dst, 'ready')))) {
        await fsp.rm(dst, { recursive: true, force: true });
        const wd = await this.backups.extract(meta, dst, 'world');
        await fsp.writeFile(path.join(dst, 'ready'), JSON.stringify({ worldDir: path.relative(dst, wd), createdAt: meta.createdAt }));
      }
      // 古いキャッシュ・スナップショットの掃除
      const cached = [];
      for (const d of await fsp.readdir(root).catch(() => [])) {
        const st = await fsp.stat(path.join(root, d, 'ready')).catch(() => null);
        if (st) cached.push({ d, t: st.mtimeMs });
      }
      for (const { d } of cached.sort((a, b) => b.t - a.t).slice(3)) await fsp.rm(path.join(root, d), { recursive: true, force: true });
      const snaps = (await this.backups.list(this.main.name)).filter((b) => b.type === 'snapshot' && !b.pinned).sort((a, b) => b.createdAt - a.createdAt);
      for (const b of snaps.slice(5)) if (b.id !== meta.id) await this.backups.remove(b.id).catch(() => {});
      log(`準備完了: ${new Date(meta.createdAt).toLocaleString('ja-JP')} の状態`);
      job.result = { backupId: meta.id, view: true };
    });
  }

  papyrusBin() {
    const dir = this.cfg.papyrusDir || path.join(this.cfg.root, 'papyrus-bin');
    return { dir, bin: path.join(dir, 'PapyrusCs') };
  }

  /**
   * PapyrusCS（Bedrock 用の定番マップレンダラー、Apache-2.0）で高品質なタイル地図を作る
   *   スナップショット → その次元だけのワールドを作る → PapyrusCs → papyrus/<ワールド>/map/map.html
   *   2回目以降は変わったチャンクだけ描き直す（Papyrus の差分機能）
   */
  renderPapyrus(world, { backupId = null } = {}) {
    return this.runJob(`高品質マップ (Papyrus): ${world}`, async (log, job) => {
      const { dir, bin } = this.papyrusBin();
      if (!(await exists(bin))) throw new Error('PapyrusCS が入っていません（install.sh --papyrus-url / --papyrus-zip で導入）');
      let meta;
      if (backupId) {
        meta = await this.backups.get(backupId);
        if (!meta) throw new Error('バックアップが見つかりません');
      } else {
        this.backups.log = log;
        meta = await this.backups.create(this.main, { type: 'snapshot', note: `Papyrus: ${world}` });
      }
      const work = this.workDir('papyrus');
      try {
        const worldDir = await this.backups.extract(meta, work);
        const dimId = await dimIdInWorld(worldDir, world);
        if (dimId === null) throw new Error(`このバックアップには ${world} が含まれていません`);
        const range = await dimRangeInWorld(worldDir, world);
        const targetDim = rangeTargetDim(range);
        const single = path.join(work, 'single');
        await wio.writeDimensionWorld(worldDir, dimId, single, { targetDim, onProgress: throttled(log) });
        const out = path.join(this.cfg.root, 'papyrus', world.replace(/[^a-zA-Z0-9_.-]/g, '_'));
        await fsp.mkdir(out, { recursive: true });
        log('PapyrusCs で描画中…');
        const args = ['-w', path.join(single, 'db'), '-o', out, '-d', String(targetDim), '--threads', String(Math.max(1, Math.min(4, require('node:os').cpus().length - 1))), '--deleteexistingupdatefolder'];
        await run(bin, args, { cwd: dir, onLine: throttled(log, 3000), timeout: 6 * 3600_000 });
        log(`描画完了（${new Date(meta.createdAt).toLocaleString('ja-JP')} の状態）`);
        await writeJsonAtomic(path.join(out, 'levikit.json'), { world, backupId: meta.id, createdAt: meta.createdAt, renderedAt: Date.now() });
        job.result = { papyrus: `/api/papyrus/${encodeURIComponent(path.basename(out))}/map/map.html`, world };
      } finally {
        await fsp.rm(work, { recursive: true, force: true });
        if (!backupId) await this.backups.remove(meta.id).catch(() => {});
      }
    });
  }

  /** アドオン・実験的機能の変更を反映（参加したまま再起動。実験的機能は停止中に level.dat を書き換え） */
  applyAddons({ experiments = null, standard = false } = {}) {
    return this.runJob('アドオンを反映', async (log) => {
      const { level } = await this.main.ports();
      const worldDir = path.join(this.main.dir, 'worlds', level);
      const action = experiments && Object.keys(experiments).length
        ? async (l) => {
            await addons.writeExperiments(worldDir, experiments);
            l(`実験的機能: ${Object.entries(experiments).map(([k, v]) => `${k}=${v ? 'オン' : 'オフ'}`).join(', ')}`);
          }
        : null;
      if (this.main.state === 'running') await this.cycleMain(log, 'アドオンの反映', action, { forceStandard: standard });
      else if (action) await action(log);
      log('反映しました');
    });
  }

  mapsDir() {
    return path.join(this.cfg.root, 'maps');
  }

  static mapFile(backupId, world, ext) {
    return `${backupId}/${String(world).replace(/[^a-zA-Z0-9_.-]/g, '_')}.${ext}`;
  }

  /** ワールドの上空マップを描く（backupId 無し = 今の状態をスナップショットして描く。参加したまま） */
  renderMap(world, { backupId = null } = {}) {
    return this.runJob(`マップ描画: ${world}`, async (log, job) => {
      let meta;
      if (backupId) {
        meta = await this.backups.get(backupId);
        if (!meta) throw new Error('バックアップが見つかりません');
      } else {
        this.backups.log = log;
        meta = await this.backups.create(this.main, { type: 'snapshot', note: `マップ用スナップショット: ${world}` });
      }
      const work = this.workDir('map');
      try {
        const worldDir = await this.backups.extract(meta, work);
        const dimId = await dimIdInWorld(worldDir, world);
        if (dimId === null) throw new Error(`このバックアップには ${world} が含まれていません`);
        log('描画中…');
        const t0 = Date.now();
        const range = await dimRangeInWorld(worldDir, world);
        const textures = texturePack(this.assetsDir());
        if (!textures.ok) log('バニラのテクスチャが無いため、近似色で描きます（install.sh で取得できます）');
        const r = await mapper.renderDimension(path.join(worldDir, 'db'), dimId, { onProgress: throttled(log), minY: range.minY, roof: range.height === 128, textures });
        const png = path.join(this.mapsDir(), Orchestrator.mapFile(meta.id, world, 'png'));
        await fsp.mkdir(path.dirname(png), { recursive: true });
        await fsp.writeFile(png, r.png);
        await writeJsonAtomic(path.join(this.mapsDir(), Orchestrator.mapFile(meta.id, world, 'json')), { ...r.meta, world, backupId: meta.id, createdAt: meta.createdAt, renderedAt: Date.now() });
        log(`描画完了: ${r.meta.chunks} チャンク（${r.meta.widthChunks}×${r.meta.heightChunks}）${Date.now() - t0} ms`);
        job.result = { backupId: meta.id, world };
      } finally {
        await fsp.rm(work, { recursive: true, force: true });
      }
    });
  }

  /**
   * 範囲ロールバック: 選んだチャンクだけをバックアップの状態に戻す（荒らしの修復など）
   *   メインサーバー停止中（参加者は待機サーバー）に LevelDB を書き換えるので、オーバーワールドも可
   */
  rollbackRegion(world, backupId, chunks, { standard = false } = {}) {
    return this.runJob(`範囲ロールバック: ${world} (${chunks.length} チャンク)`, async (log, job) => {
      if (!Array.isArray(chunks) || !chunks.length) throw new Error('チャンクが選ばれていません');
      if (chunks.length > 16384) throw new Error('一度に戻せるのは 16384 チャンクまでです');
      const meta = await this.backups.get(backupId);
      if (!meta) throw new Error('バックアップが見つかりません');
      const { level } = await this.main.ports();
      const liveWorld = path.join(this.main.dir, 'worlds', level);
      const work = this.workDir('rollback');
      try {
        log(`バックアップ ${meta.id}（${new Date(meta.createdAt).toLocaleString('ja-JP')}）を展開中…`);
        const bkWorld = await this.backups.extract(meta, work);
        const backupDim = await dimIdInWorld(bkWorld, world);
        if (backupDim === null) throw new Error(`このバックアップには ${world} が含まれていません`);
        const liveDim = await dimIdInWorld(liveWorld, world);
        if (liveDim === null) throw new Error(`${world} はまだ作成されていません`);
        const was = await dimRangeInWorld(bkWorld, world);
        const now = await dimRangeInWorld(liveWorld, world);
        if (!sameRange(was, now)) throw new Error(`バックアップ時（${rangeJa(was)}）と今（${rangeJa(now)}）で高さの範囲が違うため戻せません`);
        this.backups.log = log;
        const pre = await this.backups.create(this.main, { type: 'pre-restore', note: `範囲ロールバック前: ${world}` });
        log(`今の状態のバックアップ: ${pre.id}`);
        await this.cycleMain(
          log,
          '範囲ロールバック',
          async (l) => {
            const r = await rollbackChunks({ liveDb: path.join(liveWorld, 'db'), backupDb: path.join(bkWorld, 'db'), liveDim, backupDim, chunks, log: l });
            l(`ロールバック完了: ${r.chunks} チャンク（書き込み ${r.restoredKeys} / 削除 ${r.removedKeys} キー、エンティティ ${r.actors} 体）`);
            job.result = { ...r, world, backupId: meta.id, preBackup: pre.id };
          },
          { forceStandard: standard }
        );
        if (!job.result) throw new Error('ロールバックに失敗しました（ワールドは元のまま）');
      } finally {
        await fsp.rm(work, { recursive: true, force: true });
      }
    });
  }

  // ---------- public operations ----------
  startMain() {
    return this.runJob('起動', async (log) => {
      const { port, portv6 } = await this.main.ports();
      await syncGlacieConfig(this.main.dir, port, portv6, log);
      await this.main.start();
      await this.main.waitStarted();
      if (this.cfg.instances.limbo?.mode === 'always' && this.limbo.state === 'stopped') {
        await this.ensureLimboRunning(log);
      }
    });
  }

  stopMain() {
    return this.runJob('停止', async (log) => {
      await this.countdown(this.main, this.cfg.schedule?.restartWarnSeconds ?? 30, 'サーバー停止', log);
      await this.main.stop();
      log('停止しました');
    });
  }

  restartMain({ standard = false } = {}) {
    return this.runJob(standard ? '再起動' : 'シームレス再起動', (log) =>
      this.cycleMain(log, '再起動', null, { forceStandard: standard })
    );
  }

  backupNow(note = '') {
    return this.runJob('バックアップ作成', async (log) => {
      this.backups.log = log;
      const meta = await this.backups.create(this.main, { note, type: 'manual' });
      log(`作成: ${meta.id} (${(meta.size / 1048576).toFixed(1)} MB, ${meta.type === 'manual' ? 'ホット' : meta.type})`);
    });
  }

  restore(id, { standard = false } = {}) {
    return this.runJob('バックアップ復元', async (log) => {
      const meta = await this.backups.get(id);
      if (!meta) throw new Error('バックアップが見つかりません');
      this.backups.log = log;
      let previous = null;
      await this.cycleMain(
        log,
        'ワールド復元',
        async () => {
          log(`展開・差し替え: ${meta.id}`);
          const r = await this.backups.restoreInto(meta, this.main);
          previous = r.previous;
        },
        { forceStandard: standard }
      );
      if (previous) {
        log('復元前のワールドを退避バックアップとして保存中…');
        const saved = await this.backups.archivePrevious(this.main, previous);
        if (saved) log(`退避: ${saved.id}`);
      }
    });
  }

  applyDimensions({ standard = false } = {}) {
    return this.runJob('ディメンション設定の適用', (log) =>
      this.cycleMain(log, 'ワールド追加/変更', null, { forceStandard: standard })
    );
  }

  /** lip 操作（Mod の追加・更新）。参加者は待機サーバーで待ってもらう */
  lip(args, { standard = false } = {}) {
    this.needsLeviLamina('Mod の更新');
    return this.runJob(`lip ${args.join(' ')}`, (log) =>
      this.cycleMain(
        log,
        'Mod更新',
        async () => {
          await runLip(this.cfg, this.main.dir, args, log);
          await bumpStamp(this.main.dir);
        },
        { forceStandard: standard }
      )
    );
  }

  /**
   * ワールド(ディメンション)をリセット。
   *   1) 念のためバックアップ（参加したまま）
   *   2) config.json の pendingResets に書く（必要なら新しいシード）
   *   3) 参加したまま再起動 → levikit-core が起動直後にチャンクを削除して作り直す
   */
  resetWorlds(names, { seed = 'keep', standard = false, backup = true } = {}) {
    this.needsLeviLamina('ワールドのリセット');
    return this.runJob(`ワールドリセット: ${names.join(', ')}`, async (log) => {
      const kit = await readKit(this.main.dir);
      for (const n of names) {
        const d = kit.dimensions.find((x) => x.name === n);
        if (!d) throw new Error(`ディメンションがありません: ${n}`);
        if (seed === 'random') d.seed = Math.floor(Math.random() * 4294967295);
        else if (seed !== 'keep' && seed !== undefined && seed !== null && seed !== '') d.seed = Math.max(0, Math.min(4294967295, parseInt(seed, 10) || 0));
        log(`${n}: シード ${d.seed} / ${d.generator} で作り直します`);
      }
      if (backup) {
        this.backups.log = log;
        const meta = await this.backups.create(this.main, { type: 'pre-reset', note: `リセット前: ${names.join(', ')}` });
        log(`リセット前バックアップ: ${meta.id}`);
      }
      kit.pendingResets = [...new Set([...(kit.pendingResets || []), ...names])];
      await writeKit(this.main.dir, kit);
      const seen = (await this.withKitEvents(['RESET'], () => this.cycleMain(log, 'ワールドリセット', null, { forceStandard: standard }))).map((e) => e.data);
      for (const n of names) {
        const ev = seen.find((x) => x.name === n);
        if (ev) log(`リセット完了: ${n}（削除 ${ev.deletedKeys} キー / ${ev.ms} ms, リセット回数 ${ev.epoch}）`);
        else log(`警告: ${n} のリセット完了通知がありません（levikit-core が古い可能性）`);
      }
    });
  }

  /** 停止中にだけ実行（main が止まっている状態で lip を叩く） */
  lipOffline(args) {
    this.needsLeviLamina('Mod の更新');
    return this.runJob(`lip ${args.join(' ')}`, async (log) => {
      if (this.main.state !== 'stopped') throw new Error('メインサーバーを停止してから実行してください');
      await runLip(this.cfg, this.main.dir, args, log);
      await bumpStamp(this.main.dir);
    });
  }
}

/**
 * levikit/resets.json の epoch を上げる（levikit-core と同じ形式）
 *   → そのワールドでログアウトしていた人・記憶していた位置は、次に入ったときスポーンへ（埋まり防止）
 */
async function bumpEpochFile(worldDir, name, kind) {
  const f = path.join(worldDir, 'levikit', 'resets.json');
  const all = await readJson(f, {});
  const epoch = (all[name]?.epoch || 0) + 1;
  all[name] = { ...(all[name] || {}), epoch, resetAt: Math.floor(Date.now() / 1000), kind };
  await fsp.mkdir(path.dirname(f), { recursive: true });
  await writeJsonAtomic(f, all);
  return epoch;
}

/** 書き出したファイルは 24 時間で消す */
async function cleanupExports(dir, maxAgeMs = 24 * 3600_000) {
  for (const e of await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (!e.isFile() || !e.name.endsWith('.mcworld')) continue;
    const p = path.join(dir, e.name);
    const st = await fsp.stat(p).catch(() => null);
    if (st && Date.now() - st.mtimeMs > maxAgeMs) await fsp.rm(p, { force: true });
  }
}

async function bumpStamp(dir) {
  const f = path.join(dir, '.levikit-stamp');
  const cur = await readJson(f, { v: 0 });
  await writeJsonAtomic(f, { v: (cur.v || 0) + 1, at: Date.now() });
}

async function runLip(cfg, cwd, args, log) {
  for (const a of args) {
    if (!/^[A-Za-z0-9@._:/#=<>*~^+-]+$/.test(a)) throw new Error(`不正な引数: ${a}`);
  }
  const wine = cfg.wine?.bin || 'wine';
  const lipExe = cfg.lipExe || '/opt/levikit/lip/lip.exe';
  log(`$ lip ${args.join(' ')}`);
  await run(wine, [lipExe, ...args], {
    cwd,
    env: { WINEDEBUG: '-all', WINEPREFIX: cfg.wine?.prefix || process.env.WINEPREFIX },
    onLine: (l) => log(l),
  });
}

/**
 * Glacie の設定ファイルに raknet-port / raknet-portv6 があれば server.properties と揃える。
 * (Glacie 3.10.2 から独自の待受ポート設定を持つため、待機サーバーとポートが衝突しないようにする)
 */
async function syncGlacieConfig(dir, port, portv6, log = () => {}) {
  const root = path.join(dir, 'plugins', 'Glacie');
  if (!(await exists(root))) return;
  const files = [];
  const walk = async (d, depth) => {
    if (depth > 3) return;
    for (const e of await fsp.readdir(d, { withFileTypes: true }).catch(() => [])) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p, depth + 1);
      else if (e.name.endsWith('.json') && e.name !== 'manifest.json') files.push(p);
    }
  };
  await walk(root, 0);
  for (const f of files) {
    const j = await readJson(f, null);
    if (!j || typeof j !== 'object') continue;
    let changed = false;
    const visit = (o) => {
      for (const k of Object.keys(o)) {
        if (k === 'raknet-port' && o[k] !== 0 && o[k] !== port) {
          o[k] = port;
          changed = true;
        } else if (k === 'raknet-portv6' && o[k] !== 0 && o[k] !== portv6) {
          o[k] = portv6;
          changed = true;
        } else if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) visit(o[k]);
      }
    };
    visit(j);
    if (changed) {
      await writeJsonAtomic(f, j);
      log(`Glacie のポート設定を ${port}/${portv6} に合わせました (${path.relative(dir, f)})`);
    }
  }
}

module.exports = { Orchestrator, syncGlacieConfig, runLip, bumpStamp, dimIdInWorld, dimRangeInWorld, cleanupExports };
