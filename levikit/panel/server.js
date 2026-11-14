#!/usr/bin/env node
'use strict';
// LeviKit 管理パネル（依存パッケージなし / Node.js 20+）
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const { loadConfig, saveConfig, CONFIG_PATH, merge } = require('./lib/config');
const { Instance } = require('./lib/instance');
const { BackupManager } = require('./lib/backup');
const { Orchestrator, syncGlacieConfig } = require('./lib/orchestrator');
const mapper = require('./lib/mapper');
const { texturePack } = require('./lib/textures');
const { extractRegion } = require('./lib/view3d');
const addons = require('./lib/addons');
const { readProps } = require('./lib/props');
const { dimIdInWorld, dimRangeInWorld } = require('./lib/orchestrator');
const { describeProps, writeProps } = require('./lib/props');
const { verifyPassword, hashPassword, Sessions, parseCookies } = require('./lib/auth');
const { readJson, writeJsonAtomic, sleep } = require('./lib/util');
const { Metrics } = require('./lib/metrics');
const { PlayerDB } = require('./lib/players');
const { normalizeTask, isDue, runTask, KINDS } = require('./lib/tasks');
const files = require('./lib/files');
const kitlib = require('./lib/kit');

const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = { '.png': 'image/png', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

const { GENERATORS, LANDINGS, GAMEMODES, PROTECTIONS, MOBSPAWN, CHATMODES, HUBMODES, DIM_KEYS, ACCESS_KEYS, PRESETS } = kitlib;

async function main() {
  const cfg = await loadConfig();
  cfg.tasks = (cfg.tasks || []).map(normalizeTask);
  const persist = () => saveConfig(cfg);

  const instMain = new Instance('main', cfg.instances.main, cfg);
  const instLimbo = new Instance('limbo', cfg.instances.limbo, cfg);
  const instances = { main: instMain, limbo: instLimbo };
  const backups = new BackupManager(cfg);
  await backups.init();
  const orch = new Orchestrator({ cfg, saveCfg: persist, main: instMain, limbo: instLimbo, backups });
  let livePos = { at: 0, players: [] };
  orch.bdsVersion = (await readJson(path.join(cfg.root, 'versions.json'), {})).BDS || '1.26.51';
  const sessions = new Sessions();
  const metrics = new Metrics(instances, { intervalMs: parseInt(process.env.LEVIKIT_METRICS_MS, 10) || 15_000 });
  metrics.start();
  const playerDB = new PlayerDB(cfg.root);
  await playerDB.load();
  playerDB.closeAll();
  const auditFile = path.join(cfg.root, 'audit.log');

  // ---------- SSE ----------
  const clients = new Set();
  const broadcast = (event, data) => {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(payload);
  };
  for (const inst of Object.values(instances)) {
    inst.on('line', (e) => broadcast('line', { inst: inst.name, ...e }));
    inst.on('state', (s) => broadcast('state', s));
    inst.on('players', () => broadcast('state', inst.status()));
    inst.on('join', (p) => playerDB.join(p, inst.name));
    inst.on('leave', (p) => playerDB.leave(p));
  }
  instMain.on('kit', (kind, data) => {
    if (kind === 'CHAT' && data) {
      const msg = { name: data.name, message: data.message, world: data.world || '', inst: 'main' };
      playerDB.addChat(msg);
      broadcast('chat', { t: Date.now(), ...msg });
    } else if (kind === 'DIMS') {
      broadcast('worlds', data);
    } else if (kind === 'POS' && Array.isArray(data)) {
      livePos = { at: Date.now(), players: data };
      broadcast('pos', livePos);
    } else if (kind === 'WORLD_CHANGE' && data?.player) {
      playerDB.worldChange(data.player, data.to);
    }
  });
  orch.on('job', (j) => broadcast('job', j));
  setInterval(() => {
    for (const res of clients) res.write(': ping\n\n');
  }, 20_000).unref();

  // ---------- audit ----------
  const audit = (req, action, detail = '') => {
    const line = JSON.stringify({ t: Date.now(), ip: clientIp(req), action, detail: String(detail).slice(0, 300) });
    fsp.appendFile(auditFile, line + '\n').catch(() => {});
  };

  // ---------- backup job ----------
  const backupJob = (note = '', type = 'manual', title = 'バックアップ作成') =>
    orch.runJob(title, async (log) => {
      backups.log = log;
      const meta = await backups.create(instMain, { note, type });
      log(`作成: ${meta.id} (${(meta.size / 1048576).toFixed(1)} MB, 新規 ${((meta.stored || 0) / 1048576).toFixed(2)} MB)`);
      if (type === 'auto') {
        const n = await backups.prune('main');
        if (n) log(`古い自動バックアップを ${n} 件削除`);
      }
      await backups.offsite(log).catch((e) => log(`外部同期に失敗: ${e.message}`));
    });

  // ---------- scheduler ----------
  let lastAutoBackup = Date.now();
  let lastDailyRestartDay = '';
  const tick = async () => {
    try {
      const b = cfg.backup;
      if (b.intervalMinutes > 0 && Date.now() - lastAutoBackup >= b.intervalMinutes * 60_000 && !orch.busy()) {
        if (instMain.state === 'running' && (!b.onlyWhenPlayers || instMain.players.size > 0)) {
          lastAutoBackup = Date.now();
          backupJob('', 'auto', '自動バックアップ');
        }
      }
      const dr = cfg.schedule.dailyRestart;
      if (dr && /^\d{1,2}:\d{2}$/.test(dr) && instMain.state === 'running' && !orch.busy()) {
        const now = new Date();
        const [h, m] = dr.split(':').map(Number);
        const day = now.toDateString();
        if (now.getHours() === h && now.getMinutes() === m && lastDailyRestartDay !== day) {
          lastDailyRestartDay = day;
          orch.restartMain();
        }
      }
      let changed = false;
      for (const t of cfg.tasks) {
        if (!isDue(t)) continue;
        if (instMain.state !== 'running') continue;
        if (t.onlyWhenPlayers && instMain.players.size === 0) continue;
        if ((t.kind === 'backup' || t.kind === 'restart') && orch.busy()) continue;
        t.lastRun = Date.now();
        changed = true;
        try {
          await runTask(t, { main: instMain, orch, backupJob: (note) => backupJob(note, 'manual', `タスク: ${t.name}`), vars: await taskVars() });
        } catch (e) {
          console.error('task', t.name, e.message);
        }
      }
      if (changed) await persist();
    } catch (e) {
      console.error('scheduler', e);
    }
  };
  setInterval(tick, 20_000).unref();

  async function taskVars() {
    const p = await instMain.props();
    return { online: instMain.players.size, max: p['max-players'] || '', tps: instMain.lastStats?.tps ?? '', name: p['server-name'] || '', time: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) };
  }

  // ---------- helpers ----------
  // Endstone 版に追加ディメンションは無い: 設定に残っていても一覧に出さない
  const readKit = async () => {
    const kit = await kitlib.readKit(instMain.dir);
    if (cfg.engine === 'endstone') kit.dimensions = [];
    return kit;
  };
  const writeKit = (kit) => kitlib.writeKit(instMain.dir, kit);
  const kitReload = () => {
    if (instMain.state === 'running') instMain.send('levikit reload');
  };
  const worldsLive = () => instMain.lastDims || null;
  const resetsInfo = async () => readJson(path.join(instMain.dir, 'worlds', (await instMain.ports()).level, 'levikit', 'resets.json'), {});

  function validateAccess(a) {
    if (!Array.isArray(a.bans)) a.bans = [];
    a.bans = a.bans
      .map((b) => ({ name: String(b.name || '').trim(), xuid: String(b.xuid || '').replace(/\D/g, ''), reason: String(b.reason || '').slice(0, 200), until: Math.max(0, parseInt(b.until, 10) || 0), by: String(b.by || 'panel').slice(0, 40) }))
      .filter((b) => b.name || b.xuid);
    a.maintenanceAllow = (Array.isArray(a.maintenanceAllow) ? a.maintenanceAllow : String(a.maintenanceAllow || '').split(/[\n,]/)).map((s) => String(s).trim()).filter(Boolean);
    a.maintenance = !!a.maintenance;
    a.maintenanceMessage = String(a.maintenanceMessage ?? kitlib.KIT_DEFAULT.maintenanceMessage).slice(0, 300);
    a.welcomeMessage = String(a.welcomeMessage ?? '').slice(0, 300);
  }

  async function listMods(dir) {
    const out = [];
    const pdir = path.join(dir, 'plugins');
    for (const e of await fsp.readdir(pdir, { withFileTypes: true }).catch(() => [])) {
      if (!e.isDirectory()) continue;
      const man = await readJson(path.join(pdir, e.name, 'manifest.json'), null);
      out.push({ dir: e.name, name: man?.name || e.name, version: man?.version || '', type: man?.type || '', description: man?.description || '' });
    }
    return out;
  }

  async function systemInfo() {
    let disk = null;
    try {
      const st = await fsp.statfs(cfg.root);
      disk = { free: st.bavail * st.bsize, total: st.blocks * st.bsize };
    } catch {
      /* ignore */
    }
    return { hostname: os.hostname(), load: os.loadavg(), mem: { free: os.freemem(), total: os.totalmem() }, disk, uptime: os.uptime(), cpus: os.cpus().length };
  }

  async function fullState() {
    const kit = await readKit();
    return {
      instances: { main: instMain.status(), limbo: instLimbo.status() },
      job: orch.job ? orch.job.toJSON() : null,
      history: orch.history,
      config: publicConfig(),
      kitCore: await instMain.hasKitCore(),
      installed: await instMain.isInstalled(),
      seamlessBlocker: await orch.seamlessBlocker(),
      system: await systemInfo(),
      versions: await readJson(path.join(cfg.root, 'versions.json'), {}),
      ports: { main: await instMain.ports(), limbo: await instLimbo.ports().catch(() => null) },
      maintenance: kit.maintenance,
      worlds: worldsLive(),
      chatMode: kit.chatMode,
    };
  }

  function publicConfig() {
    return {
      publicHost: cfg.publicHost,
      backup: { ...cfg.backup, offsite: cfg.backup.offsite || { enabled: false, remote: '' } },
      schedule: cfg.schedule,
      limbo: { mode: cfg.instances.limbo.mode, port: cfg.instances.limbo.port, portv6: cfg.instances.limbo.portv6 },
      main: { autoStart: cfg.instances.main.autoStart, autoRestart: cfg.instances.main.autoRestart },
    };
  }

  // ---------- HTTP ----------
  const send = (res, code, obj, headers = {}) => {
    const body = typeof obj === 'string' ? obj : JSON.stringify(obj);
    res.writeHead(code, { 'Content-Type': typeof obj === 'string' ? 'text/plain; charset=utf-8' : 'application/json', 'Cache-Control': 'no-store', ...headers });
    res.end(body);
  };
  const readBody = (req, limit = 2_000_000) =>
    new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > limit) {
          reject(new Error('body too large'));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => {
        const s = Buffer.concat(chunks).toString('utf8');
        if (!s) return resolve({});
        try {
          resolve(JSON.parse(s));
        } catch {
          reject(new Error('invalid json'));
        }
      });
      req.on('error', reject);
    });
  // trustProxy: 手前のリバースプロキシが足した値（X-Forwarded-For の最後）だけを信じる。先頭は接続してきた側が自由に
  // 書けるので、それを使うとログインの試行回数の制限を IP を偽って回避できてしまう。
  const clientIp = (req) => (cfg.panel.trustProxy && String(req.headers['x-forwarded-for'] || '').split(',').pop().trim()) || req.socket.remoteAddress;

  const routes = [];
  const route = (method, pattern, handler, opts = {}) => routes.push({ method, pattern, handler, auth: opts.auth !== false, audit: opts.audit });

  route('POST', /^\/api\/login$/, async (req, res) => {
    const ip = clientIp(req);
    if (!sessions.allowAttempt(ip)) return send(res, 429, { error: '試行回数が多すぎます。1分後に再試行してください' });
    const body = await readBody(req);
    if (!cfg.panel.passwordHash) return send(res, 500, { error: 'パスワード未設定です。サーバーで levikit-passwd を実行してください' });
    if (!verifyPassword(body.password || '', cfg.panel.passwordHash)) {
      audit(req, 'login-failed');
      await sleep(500);
      return send(res, 401, { error: 'パスワードが違います' });
    }
    audit(req, 'login');
    const sid = sessions.create();
    const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    send(res, 200, { ok: true }, { 'Set-Cookie': `lk_sid=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure}` });
  }, { auth: false, audit: false });

  route('POST', /^\/api\/logout$/, async (req, res) => {
    sessions.destroy(parseCookies(req.headers.cookie).lk_sid);
    send(res, 200, { ok: true }, { 'Set-Cookie': 'lk_sid=; Path=/; Max-Age=0' });
  }, { audit: false });

  route('GET', /^\/api\/me$/, async (req, res) => send(res, 200, { ok: true }));
  route('GET', /^\/api\/state$/, async (req, res) => send(res, 200, await fullState()));
  route('GET', /^\/api\/events$/, async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(`event: hello\ndata: ${JSON.stringify(await fullState())}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
  });
  route('GET', /^\/api\/logs\/(main|limbo)$/, async (req, res, m) => send(res, 200, instances[m[1]].logs.slice(-1500)));
  route('GET', /^\/api\/metrics$/, async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const range = Math.min(86400, Math.max(300, parseInt(u.searchParams.get('range'), 10) || 3600)) * 1000;
    send(res, 200, { main: metrics.get('main', range), limbo: metrics.get('limbo', range) });
  });

  // サーバー操作
  route('POST', /^\/api\/main\/start$/, async (req, res) => send(res, 200, orch.startMain()));
  route('POST', /^\/api\/main\/stop$/, async (req, res) => send(res, 200, orch.stopMain()));
  route('POST', /^\/api\/main\/restart$/, async (req, res) => {
    const b = await readBody(req);
    send(res, 200, orch.restartMain({ standard: !!b.standard }));
  });
  route('POST', /^\/api\/main\/kill$/, async (req, res) => {
    await instMain.stop({ timeout: 1000 });
    send(res, 200, { ok: true });
  });
  route('POST', /^\/api\/(main|limbo)\/command$/, async (req, res, m) => {
    const b = await readBody(req);
    instances[m[1]].send(String(b.command || ''));
    audit(req, `command:${m[1]}`, b.command);
    send(res, 200, { ok: true });
  }, { audit: false });
  route('POST', /^\/api\/limbo\/(start|stop)$/, async (req, res, m) => {
    if (m[1] === 'start') send(res, 200, orch.runJob('待機サーバー起動', (log) => orch.ensureLimboRunning(log)));
    else {
      await instLimbo.stop();
      send(res, 200, { ok: true });
    }
  });
  route('POST', /^\/api\/main\/players\/refresh$/, async (req, res) => send(res, 200, await instMain.refreshPlayers()), { audit: false });
  route('POST', /^\/api\/main\/players\/(kick|op|deop)$/, async (req, res, m) => {
    const b = await readBody(req);
    const name = String(b.name || '').replace(/"/g, '');
    if (!name) return send(res, 400, { error: 'name required' });
    if (m[1] === 'kick') instMain.send(`kick "${name}" ${String(b.reason || '').replace(/[\r\n]/g, ' ')}`);
    else instMain.send(`${m[1]} "${name}"`);
    audit(req, `player:${m[1]}`, name);
    send(res, 200, { ok: true });
  }, { audit: false });
  route('GET', /^\/api\/players\/history$/, async (req, res) => send(res, 200, playerDB.list()));

  // チャット
  route('GET', /^\/api\/chat$/, async (req, res) => send(res, 200, playerDB.chat.slice(-300)));
  route('POST', /^\/api\/chat$/, async (req, res) => {
    const b = await readBody(req);
    const text = String(b.message || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 300);
    if (!text) return send(res, 400, { error: 'empty' });
    const from = String(b.from || '管理者').slice(0, 24);
    instMain.send(`tellraw @a {"rawtext":[{"text":${JSON.stringify(`§d[Web] ${from}§r: ${text}`)}}]}`);
    const msg = { name: `[Web] ${from}`, message: text, inst: 'main' };
    playerDB.addChat(msg);
    broadcast('chat', { t: Date.now(), ...msg });
    send(res, 200, { ok: true });
  }, { audit: false });

  // アクセス制御（BAN / メンテナンス / 参加メッセージ）
  route('GET', /^\/api\/access$/, async (req, res) => {
    const kit = await readKit();
    send(res, 200, Object.fromEntries(ACCESS_KEYS.map((k) => [k, kit[k]])));
  });
  route('PUT', /^\/api\/access$/, async (req, res) => {
    const b = await readBody(req);
    const kit = await readKit();
    const a = Object.fromEntries(ACCESS_KEYS.map((k) => [k, b[k] !== undefined ? b[k] : kit[k]]));
    validateAccess(a);
    Object.assign(kit, a);
    kitlib.validateRoles(kit);
    a.roles = kit.roles;
    await writeKit(kit);
    kitReload();
    send(res, 200, a);
  });
  route('POST', /^\/api\/access\/ban$/, async (req, res) => {
    const b = await readBody(req);
    const kit = await readKit();
    const minutes = Math.max(0, parseInt(b.minutes, 10) || 0);
    const entry = { name: String(b.name || '').trim(), xuid: String(b.xuid || ''), reason: String(b.reason || ''), until: minutes ? Math.floor(Date.now() / 1000) + minutes * 60 : 0, by: 'panel' };
    if (!entry.name && !entry.xuid) return send(res, 400, { error: 'name か xuid が必要です' });
    kit.bans = kit.bans.filter((x) => !((entry.xuid && x.xuid === entry.xuid) || (entry.name && x.name === entry.name)));
    kit.bans.push(entry);
    validateAccess(kit);
    await writeKit(kit);
    kitReload();
    send(res, 200, { ok: true, bans: kit.bans });
  });
  route('POST', /^\/api\/access\/unban$/, async (req, res) => {
    const b = await readBody(req);
    const kit = await readKit();
    kit.bans = kit.bans.filter((x) => !((b.xuid && x.xuid === b.xuid) || (b.name && x.name === b.name)));
    await writeKit(kit);
    kitReload();
    send(res, 200, { ok: true, bans: kit.bans });
  });
  route('POST', /^\/api\/access\/maintenance$/, async (req, res) => {
    const b = await readBody(req);
    const kit = await readKit();
    kit.maintenance = !!b.on;
    await writeKit(kit);
    kitReload();
    send(res, 200, { ok: true, maintenance: kit.maintenance });
  });

  // バックアップ
  route('GET', /^\/api\/backups$/, async (req, res) => send(res, 200, await backups.list()));
  route('GET', /^\/api\/backups\/stats$/, async (req, res) => send(res, 200, await backups.stats()));
  route('POST', /^\/api\/backups$/, async (req, res) => {
    const b = await readBody(req);
    send(res, 200, backupJob(String(b.note || '').slice(0, 200)));
  });
  route('POST', /^\/api\/backups\/gc$/, async (req, res) => send(res, 200, await backups.gc()));
  route('DELETE', /^\/api\/backups\/([A-Za-z0-9._-]+)$/, async (req, res, m) => {
    await backups.remove(m[1]);
    send(res, 200, { ok: true });
  });
  route('POST', /^\/api\/backups\/([A-Za-z0-9._-]+)\/pin$/, async (req, res, m) => {
    const b = await readBody(req);
    send(res, 200, await backups.setPinned(m[1], b.pinned));
  });
  route('POST', /^\/api\/backups\/([A-Za-z0-9._-]+)\/note$/, async (req, res, m) => {
    const b = await readBody(req);
    send(res, 200, await backups.setNote(m[1], b.note));
  });
  route('POST', /^\/api\/backups\/([A-Za-z0-9._-]+)\/restore$/, async (req, res, m) => {
    const b = await readBody(req);
    send(res, 200, orch.restore(m[1], { standard: !!b.standard }));
  });
  route('GET', /^\/api\/backups\/([A-Za-z0-9._-]+)\/download$/, async (req, res, m) => {
    audit(req, 'backup-download', m[1]);
    await backups.exportTo(m[1], res);
  });
  route('POST', /^\/api\/backups\/upload$/, async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const name = url.searchParams.get('name') || 'upload.tar.zst';
    const tmp = path.join(cfg.backup.dir, '.staging', `upload-${crypto.randomBytes(6).toString('hex')}`);
    await fsp.mkdir(path.dirname(tmp), { recursive: true });
    await new Promise((resolve, reject) => {
      const ws = fs.createWriteStream(tmp);
      req.pipe(ws);
      ws.on('finish', resolve);
      ws.on('error', reject);
      req.on('error', reject);
    });
    try {
      send(res, 200, await backups.importArchive('main', tmp, name));
    } catch (e) {
      await fsp.rm(tmp, { force: true });
      throw e;
    }
  });

  // ディメンション / ワールド
  route('GET', /^\/api\/dimensions$/, async (req, res) => {
    const level = (await instMain.ports()).level;
    const registered = await readJson(path.join(instMain.dir, 'worlds', level, 'dimension_config.json'), null);
    // MoreDimensions が実際に使っている generator/seed（作成時の値。変更はリセット時に反映）
    const actual = {};
    for (const [n, info] of Object.entries(registered?.dimensionList || {})) {
      const s = String(info.sNbt || '');
      const seed = /seed"?\s*:\s*(\d+)/.exec(s);
      const gen = /generatorType"?\s*:\s*"?(\w+)/.exec(s);
      actual[n] = { dimId: info.dimId, seed: seed ? Number(seed[1]) : null, generator: gen ? gen[1] : null };
    }
    send(res, 200, {
      kit: await readKit(),
      options: { generators: GENERATORS, landings: LANDINGS, gameModes: GAMEMODES, protections: PROTECTIONS, mobSpawning: MOBSPAWN, chatModes: CHATMODES, hubModes: HUBMODES },
      presets: Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, { label: v.label, dim: kitlib.deepMerge(kitlib.DIM_TEMPLATE, v.dim) }])),
      actual,
      live: worldsLive(),
      resets: await resetsInfo(),
      stats: playerDB.worldStats(),
    });
  });
  route('PUT', /^\/api\/dimensions$/, async (req, res) => {
    const b = await readBody(req);
    const kit = await readKit();
    const before = new Set(kit.dimensions.map((d) => d.name));
    for (const k of DIM_KEYS) if (b.kit?.[k] !== undefined) kit[k] = b.kit[k];
    // 削除したワールドのデータも消す（次の起動で levikit-core が LevelDB と MoreDimensions の記録から削除）
    //   消さないと、同じ ID で作り直したときに前の地形・生成タイプが戻ってくる
    const purge = (Array.isArray(b.purge) ? b.purge : []).map(String).filter((n) => before.has(n) && !(kit.dimensions || []).some((d) => d.name === n));
    if (purge.length) kit.pendingResets = [...new Set([...(kit.pendingResets || []), ...purge])];
    const next = kitlib.normalizeKit(kit);
    kitlib.validateDims(next);
    kitlib.validatePortals(next);
    await writeKit(next);
    let job = null;
    if (b.apply === 'restart') job = orch.applyDimensions({ standard: !!b.standard });
    else if (b.apply === 'reload') kitReload();
    send(res, 200, { ok: true, job });
  });
  route('POST', /^\/api\/dimensions\/reset$/, async (req, res) => {
    const b = await readBody(req);
    const names = (Array.isArray(b.names) ? b.names : [b.name]).filter(Boolean).map(String);
    if (!names.length) throw new Error('name が必要です');
    const kit = await readKit();
    for (const n of names) if (!kit.dimensions.some((d) => d.name === n)) throw new Error(`カスタムディメンションのみリセットできます: ${n}`);
    send(res, 200, orch.resetWorlds(names, { seed: b.seed ?? 'keep', standard: !!b.standard, backup: b.backup !== false }));
  });
  route('GET', /^\/api\/warps$/, async (req, res) => {
    const kit = await readKit();
    send(res, 200, { warps: kit.warps, portals: kit.portals, worlds: ['overworld', 'nether', 'the_end', ...kit.dimensions.map((d) => d.name)] });
  });
  route('PUT', /^\/api\/warps$/, async (req, res) => {
    const b = await readBody(req);
    const kit = await readKit();
    if (Array.isArray(b.warps)) kit.warps = b.warps;
    if (Array.isArray(b.portals)) kit.portals = b.portals;
    const next = kitlib.normalizeKit(kit);
    kitlib.validateWarps(next);
    kitlib.validatePortals(next);
    kitlib.validateDims(next);
    await writeKit(next);
    kitReload();
    send(res, 200, { ok: true, warps: next.warps, portals: next.portals });
  });
  route('POST', /^\/api\/worlds\/(open|close)$/, async (req, res, m) => {
    const b = await readBody(req);
    const kit = await readKit();
    const key = String(b.key || '');
    const map = { overworld: 'overworld', nether: 'nether', the_end: 'theEnd' };
    const target = map[key] ? kit[map[key]] : kit.dimensions.find((d) => d.name === key);
    if (!target) throw new Error('ワールドがありません');
    target.rules.open = m[1] === 'open';
    await writeKit(kit);
    kitReload();
    send(res, 200, { ok: true });
  });
  route('POST', /^\/api\/worlds\/send$/, async (req, res) => {
    // 全員（または指定の人）を指定ワールドへ。tpdim を使う
    const b = await readBody(req);
    const key = String(b.key || '');
    if (!/^[a-z0-9_.:-]+$/.test(key)) throw new Error('key が不正');
    const who = b.player ? `"${String(b.player).replace(/"/g, '')}"` : '@a';
    const kit = await readKit();
    const sp = key === 'overworld' ? kit.overworld.spawn : key === 'nether' ? kit.nether.spawn : key === 'the_end' ? kit.theEnd.spawn : kit.dimensions.find((d) => d.name === key)?.spawn;
    if (!sp) throw new Error('ワールドがありません');
    instMain.send(`tpdim ${who} ${sp.x} ${sp.y} ${sp.z} ${key}`);
    send(res, 200, { ok: true });
  });

  // ワールドの取り込み・複製・ワールド単位の復元・書き出し
  route('POST', /^\/api\/worlds\/import$/, async (req, res) => {
    // 本体は .mcworld そのもの（application/octet-stream）。設定はクエリで受け取る
    const u = new URL(req.url, 'http://x');
    const q = (k, d = '') => u.searchParams.get(k) ?? d;
    if (orch.busy()) {
      req.resume();
      return send(res, 409, { error: `実行中のジョブがあります: ${orch.job.title}` });
    }
    const maxBytes = (cfg.panel.maxUploadMB || 2048) * 1048576;
    const dir = path.join(cfg.root, 'uploads');
    await fsp.mkdir(dir, { recursive: true });
    const tmp = path.join(dir, `import-${crypto.randomBytes(6).toString('hex')}.mcworld`);
    let size = 0;
    try {
      await new Promise((resolve, reject) => {
        const ws = fs.createWriteStream(tmp);
        req.on('data', (c) => {
          size += c.length;
          if (size > maxBytes) {
            reject(new Error(`ファイルが大きすぎます（${cfg.panel.maxUploadMB || 2048} MB まで）`));
            req.destroy();
            ws.destroy();
          }
        });
        req.pipe(ws);
        ws.on('finish', resolve);
        ws.on('error', reject);
        req.on('error', reject);
      });
      if (size < 22) throw new Error('ファイルが空です');
      const job = orch.importWorld({
        file: tmp,
        originalName: q('file').slice(0, 120),
        name: q('name').trim(),
        displayName: q('displayName').trim().slice(0, 40),
        generator: q('generator', 'Void'),
        sourceDim: [0, 1, 2].includes(Number(q('sourceDim', '0'))) ? Number(q('sourceDim', '0')) : 0,
        seedMode: ['keep', 'random', 'zero'].includes(q('seedMode')) ? q('seedMode') : 'keep',
        replace: q('replace') === '1',
        standard: q('standard') === '1',
      });
      audit(req, 'world-import', `${q('name')} ← ${q('file')} (${size} bytes)`);
      send(res, 200, job);
    } catch (e) {
      await fsp.rm(tmp, { force: true });
      throw e;
    }
  }, { audit: false });
  route('POST', /^\/api\/worlds\/clone$/, async (req, res) => {
    const b = await readBody(req);
    send(res, 200, orch.cloneWorld(String(b.from || ''), String(b.to || '').trim(), { displayName: String(b.displayName || '').trim(), standard: !!b.standard }));
  });
  route('POST', /^\/api\/worlds\/restore$/, async (req, res) => {
    const b = await readBody(req);
    if (!/^[A-Za-z0-9._-]+$/.test(String(b.backupId || ''))) throw new Error('backupId が不正');
    send(res, 200, orch.restoreWorld(String(b.name || ''), String(b.backupId), { standard: !!b.standard }));
  });
  route('POST', /^\/api\/worlds\/export$/, async (req, res) => {
    const b = await readBody(req);
    if (b.backupId && !/^[A-Za-z0-9._-]+$/.test(String(b.backupId))) throw new Error('backupId が不正');
    send(res, 200, orch.exportWorld(String(b.key || ''), { backupId: b.backupId ? String(b.backupId) : null }));
  });
  route('GET', /^\/api\/exports\/([^/]+)$/, async (req, res, m) => {
    const name = decodeURIComponent(m[1]);
    if (!/^[^/\\]+\.mcworld$/.test(name) || name.startsWith('.')) return send(res, 400, { error: 'bad name' });
    const file = path.join(cfg.root, 'exports', name);
    const st = await fsp.stat(file).catch(() => null);
    if (!st) return send(res, 404, { error: '見つかりません（書き出しから24時間で削除されます）' });
    audit(req, 'world-export-download', name);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': st.size,
      'Content-Disposition': `attachment; filename="world.mcworld"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(file).pipe(res);
  });
  route('GET', /^\/api\/worlds\/stats$/, async (req, res) => send(res, 200, playerDB.worldStats()));

  // ---- マップ / タイムマシン ----
  const mapsDir = path.join(cfg.root, 'maps');
  route('GET', /^\/api\/maps$/, async (req, res) => {
    const out = [];
    const known = new Set((await backups.list()).map((b) => b.id));
    for (const d of await fsp.readdir(mapsDir, { withFileTypes: true }).catch(() => [])) {
      if (!d.isDirectory()) continue;
      if (!known.has(d.name)) {
        await fsp.rm(path.join(mapsDir, d.name), { recursive: true, force: true }); // バックアップが消えたマップは掃除
        continue;
      }
      for (const f of await fsp.readdir(path.join(mapsDir, d.name))) {
        if (!f.endsWith('.json')) continue;
        const m = await readJson(path.join(mapsDir, d.name, f), null);
        if (m) out.push({ backupId: m.backupId, world: m.world, createdAt: m.createdAt, renderedAt: m.renderedAt, chunks: m.chunks, minCX: m.minCX, minCZ: m.minCZ, widthChunks: m.widthChunks, heightChunks: m.heightChunks });
      }
    }
    send(res, 200, out.sort((a, b) => b.createdAt - a.createdAt));
  });
  route('GET', /^\/api\/maps\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\.(png|json)$/, async (req, res, m) => {
    const file = path.join(mapsDir, m[1], `${m[2]}.${m[3]}`);
    const st = await fsp.stat(file).catch(() => null);
    if (!st) return send(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': m[3] === 'png' ? 'image/png' : 'application/json', 'Content-Length': st.size, 'Cache-Control': 'private, max-age=86400' });
    fs.createReadStream(file).pipe(res);
  });
  route('GET', /^\/api\/maps\/diff$/, async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const world = u.searchParams.get('world') || '';
    const load = (id) => readJson(path.join(mapsDir, Orchestrator.mapFile(String(id).replace(/[^A-Za-z0-9._-]/g, ''), world, 'json')), null);
    const a = await load(u.searchParams.get('a'));
    const b = await load(u.searchParams.get('b'));
    if (!a || !b) return send(res, 404, { error: '比べる2つのマップを先に描画してください' });
    send(res, 200, mapper.diffFingerprints(a.fingerprints, b.fingerprints));
  });
  route('POST', /^\/api\/maps\/render$/, async (req, res) => {
    const b = await readBody(req);
    if (b.backupId && !/^[A-Za-z0-9._-]+$/.test(String(b.backupId))) throw new Error('backupId が不正');
    send(res, 200, orch.renderMap(String(b.world || 'overworld'), { backupId: b.backupId || null }));
  });
  route('POST', /^\/api\/maps\/rollback$/, async (req, res) => {
    const b = await readBody(req);
    if (!/^[A-Za-z0-9._-]+$/.test(String(b.backupId || ''))) throw new Error('backupId が不正');
    const chunks = (Array.isArray(b.chunks) ? b.chunks : []).filter((c) => Array.isArray(c) && Number.isInteger(c[0]) && Number.isInteger(c[1])).map((c) => [c[0], c[1]]);
    send(res, 200, orch.rollbackRegion(String(b.world || ''), String(b.backupId), chunks, { standard: !!b.standard }));
  });
  route('GET', /^\/api\/pos$/, async (req, res) => send(res, 200, livePos));

  // ---- アドオン（BDS 標準のビヘイビア/リソースパック）・実験的機能・Script API ----
  const levelOf = async () => (await instMain.ports()).level;
  route('GET', /^\/api\/addons$/, async (req, res) => {
    const level = await levelOf();
    const worldDir = path.join(instMain.dir, 'worlds', level);
    const { packs } = await addons.listPacks(instMain.dir, level);
    const props = (await readProps(path.join(instMain.dir, 'server.properties'))).map;
    send(res, 200, {
      level,
      packs,
      experiments: await addons.readExperiments(worldDir).catch(() => ({})),
      knownExperiments: addons.KNOWN_EXPERIMENTS,
      permissions: (await addons.readPermissions(instMain.dir)).allowed_modules || [],
      scriptModules: addons.SCRIPT_MODULES,
      texturepackRequired: String(props['texturepack-required'] || '').trim() === 'true',
    });
  });
  route('POST', /^\/api\/addons\/upload$/, async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const dir = path.join(cfg.root, 'uploads');
    await fsp.mkdir(dir, { recursive: true });
    const tmp = path.join(dir, `addon-${crypto.randomBytes(6).toString('hex')}.zip`);
    let size = 0;
    try {
      await new Promise((resolve, reject) => {
        const ws = fs.createWriteStream(tmp);
        req.on('data', (c) => {
          size += c.length;
          if (size > 1024 * 1048576) {
            reject(new Error('ファイルが大きすぎます（1 GB まで）'));
            req.destroy();
          }
        });
        req.pipe(ws);
        ws.on('finish', resolve);
        ws.on('error', reject);
      });
      const installed = await addons.installArchive(tmp, instMain.dir, { workDir: dir });
      if (u.searchParams.get('enable') === '1') {
        const level = await levelOf();
        const { enabled } = await addons.listPacks(instMain.dir, level);
        for (const t of ['behavior', 'resource']) {
          const add = installed.filter((p) => p.type === t);
          if (!add.length) continue;
          const keep = enabled[t].filter((e) => !add.some((a) => a.uuid === e.pack_id)).map((e) => ({ uuid: e.pack_id, version: e.version }));
          // 先頭ほど優先（上に重なる）
          await addons.writeEnabled(instMain.dir, level, t, [...add.map((a) => ({ uuid: a.uuid, version: a.version })), ...keep]);
        }
      }
      audit(req, 'addon-install', installed.map((p) => `${p.type}:${p.name}`).join(', '));
      send(res, 200, { installed });
    } finally {
      await fsp.rm(tmp, { force: true });
    }
  }, { audit: false });
  route('PUT', /^\/api\/addons\/enabled$/, async (req, res) => {
    const b = await readBody(req);
    send(res, 200, { list: await addons.writeEnabled(instMain.dir, await levelOf(), String(b.type), Array.isArray(b.list) ? b.list : []) });
  });
  route('POST', /^\/api\/addons\/remove$/, async (req, res) => {
    const b = await readBody(req);
    await addons.removePack(instMain.dir, await levelOf(), String(b.type), String(b.dir));
    send(res, 200, { ok: true });
  });
  route('PUT', /^\/api\/addons\/permissions$/, async (req, res) => {
    const b = await readBody(req);
    send(res, 200, { modules: await addons.writePermissions(instMain.dir, Array.isArray(b.modules) ? b.modules : []) });
  });
  route('POST', /^\/api\/addons\/apply$/, async (req, res) => {
    const b = await readBody(req);
    if (typeof b.texturepackRequired === 'boolean') await writeProps(path.join(instMain.dir, 'server.properties'), { 'texturepack-required': String(b.texturepackRequired) });
    const ex = b.experiments && typeof b.experiments === 'object' ? Object.fromEntries(Object.entries(b.experiments).map(([k, v]) => [String(k), !!v])) : null;
    send(res, 200, orch.applyAddons({ experiments: ex, standard: !!b.standard }));
  });

  // ---- PapyrusCS（高品質タイル地図） ----
  const papyrusRoot = path.join(cfg.root, 'papyrus');
  route('GET', /^\/api\/papyrus$/, async (req, res) => {
    const out = [];
    for (const d of await fsp.readdir(papyrusRoot).catch(() => [])) {
      const m = await readJson(path.join(papyrusRoot, d, 'levikit.json'), null);
      if (m) out.push({ ...m, url: `/api/papyrus/${encodeURIComponent(d)}/map/map.html` });
    }
    send(res, 200, { installed: await fs.promises.access(orch.papyrusBin().bin).then(() => true, () => false), maps: out });
  });
  route('POST', /^\/api\/papyrus\/render$/, async (req, res) => {
    const b = await readBody(req);
    if (b.backupId && !/^[A-Za-z0-9._-]+$/.test(String(b.backupId))) throw new Error('backupId が不正');
    send(res, 200, orch.renderPapyrus(String(b.world || 'overworld'), { backupId: b.backupId || null }));
  });
  route('GET', /^\/api\/papyrus\/([A-Za-z0-9_.-]+)\/(.+)$/, async (req, res, m) => {
    const base = path.join(papyrusRoot, m[1]);
    const file = path.resolve(base, decodeURIComponent(m[2]));
    if (!file.startsWith(base + path.sep)) return send(res, 403, { error: 'forbidden' });
    const st = await fsp.stat(file).catch(() => null);
    if (!st || !st.isFile()) return send(res, 404, { error: 'not found' });
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json' };
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'private, max-age=300' });
    fs.createReadStream(file).pipe(res);
  });

  // ---- 観察ビュー（3D） / テクスチャ ----
  const viewRoot = () => orch.viewCacheDir();
  async function viewWorld(id) {
    if (!/^[A-Za-z0-9._-]+$/.test(String(id))) throw new Error('時点が不正');
    const ready = await readJson(path.join(viewRoot(), id, 'ready'), null);
    if (!ready) return null;
    return path.join(viewRoot(), id, ready.worldDir);
  }
  route('GET', /^\/api\/view3d\/list$/, async (req, res) => {
    const out = [];
    for (const d of await fsp.readdir(viewRoot()).catch(() => [])) {
      const r = await readJson(path.join(viewRoot(), d, 'ready'), null);
      if (r) out.push({ backupId: d, createdAt: r.createdAt });
    }
    send(res, 200, { list: out.sort((a, b) => b.createdAt - a.createdAt), textures: texturePack(orch.assetsDir()).ok, pos: livePos });
  });
  route('POST', /^\/api\/view3d\/prepare$/, async (req, res) => {
    const b = await readBody(req);
    if (b.backupId && !/^[A-Za-z0-9._-]+$/.test(String(b.backupId))) throw new Error('backupId が不正');
    send(res, 200, orch.prepareView({ backupId: b.backupId || null }));
  });
  route('GET', /^\/api\/view3d\/region$/, async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const wd = await viewWorld(u.searchParams.get('b') || '');
    if (!wd) return send(res, 409, { error: 'この時点はまだ準備されていません' });
    const world = u.searchParams.get('w') || 'overworld';
    const dimId = await dimIdInWorld(wd, world);
    if (dimId === null) return send(res, 404, { error: `この時点には ${world} がありません` });
    const range = await dimRangeInWorld(wd, world);
    const r = await extractRegion(path.join(wd, 'db'), dimId, { cx: Number(u.searchParams.get('cx')) | 0, cz: Number(u.searchParams.get('cz')) | 0, r: Number(u.searchParams.get('r')) || 4, textures: texturePack(orch.assetsDir()) });
    const body = Buffer.from(JSON.stringify({ ...r, world, minY: range.minY, height: range.height }));
    if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      const z = require('node:zlib').gzipSync(body, { level: 4 });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Content-Length': z.length });
      return res.end(z);
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': body.length });
    res.end(body);
  });
  route('GET', /^\/api\/tex\/(textures\/[A-Za-z0-9_\/.-]+)\.png$/, async (req, res, m) => {
    const png = texturePack(orch.assetsDir()).png(m[1]);
    if (!png) return send(res, 404, { error: 'no texture' });
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length, 'Cache-Control': 'private, max-age=604800' });
    res.end(png);
  });

  // server.properties
  route('GET', /^\/api\/properties$/, async (req, res) => send(res, 200, await describeProps(path.join(instMain.dir, 'server.properties'))));
  route('PUT', /^\/api\/properties$/, async (req, res) => {
    const b = await readBody(req);
    const updates = {};
    for (const [k, v] of Object.entries(b.updates || {})) {
      if (!/^[a-z0-9-]+$/.test(k)) throw new Error(`不正なキー: ${k}`);
      updates[k] = String(v);
    }
    await writeProps(path.join(instMain.dir, 'server.properties'), updates);
    audit(req, 'properties', Object.keys(updates).join(','));
    send(res, 200, { ok: true });
  }, { audit: false });

  // ファイル編集
  route('GET', /^\/api\/files$/, async (req, res) => send(res, 200, await files.list(instMain.dir, new URL(req.url, 'http://x').searchParams.get('path') || '')));
  route('GET', /^\/api\/file$/, async (req, res) => send(res, 200, await files.read(instMain.dir, new URL(req.url, 'http://x').searchParams.get('path'))));
  route('PUT', /^\/api\/file$/, async (req, res) => {
    const b = await readBody(req);
    const r = await files.write(instMain.dir, b.path, b.content, b.mtime);
    audit(req, 'file-write', b.path);
    send(res, 200, r);
  }, { audit: false });

  // Mod / lip
  route('GET', /^\/api\/mods$/, async (req, res) => send(res, 200, await listMods(instMain.dir)));
  route('POST', /^\/api\/lip$/, async (req, res) => {
    const b = await readBody(req);
    const action = b.action;
    const pkg = String(b.package || '').trim();
    if (!['install', 'update', 'uninstall'].includes(action)) throw new Error('action は install/update/uninstall');
    if (!/^github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(@[A-Za-z0-9._*^~<>=-]+)?(#[a-z]+)?$/.test(pkg)) throw new Error('パッケージ名は github.com/owner/repo[@version] 形式');
    if (/^github\.com\/LiteLDev\/LeviLamina\b/i.test(pkg)) throw new Error('LeviLamina 本体はパネルから変更できません（MoreDimensions が 26.51 系専用のため）');
    const args = [action, pkg];
    send(res, 200, instMain.state === 'stopped' ? orch.lipOffline(args) : orch.lip(args, { standard: !!b.standard }));
  });

  // スケジュールタスク
  route('GET', /^\/api\/tasks$/, async (req, res) => send(res, 200, { tasks: cfg.tasks, kinds: KINDS }));
  route('PUT', /^\/api\/tasks$/, async (req, res) => {
    const b = await readBody(req);
    if (!Array.isArray(b.tasks)) throw new Error('tasks は配列');
    if (b.tasks.length > 50) throw new Error('タスクは50件まで');
    const prev = new Map(cfg.tasks.map((t) => [t.id, t]));
    cfg.tasks = b.tasks.map((t) => normalizeTask({ ...t, lastRun: prev.get(t.id)?.lastRun || Date.now(), rotateIndex: prev.get(t.id)?.rotateIndex || 0 }));
    await persist();
    send(res, 200, { tasks: cfg.tasks });
  });
  route('POST', /^\/api\/tasks\/([a-z0-9]+)\/run$/, async (req, res, m) => {
    const t = cfg.tasks.find((x) => x.id === m[1]);
    if (!t) return send(res, 404, { error: 'not found' });
    if (instMain.state !== 'running') throw new Error('サーバーが起動していません');
    await runTask(t, { main: instMain, orch, backupJob: (note) => backupJob(note, 'manual', `タスク: ${t.name}`), vars: await taskVars() });
    t.lastRun = Date.now();
    await persist();
    send(res, 200, { ok: true });
  });

  // 監査ログ
  route('GET', /^\/api\/audit$/, async (req, res) => {
    const text = await fsp.readFile(auditFile, 'utf8').catch(() => '');
    const lines = text.trim().split('\n').filter(Boolean).slice(-400).reverse().map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    });
    send(res, 200, lines.filter(Boolean));
  });

  // 設定
  route('GET', /^\/api\/settings$/, async (req, res) => send(res, 200, publicConfig()));
  route('PUT', /^\/api\/settings$/, async (req, res) => {
    const b = await readBody(req);
    if (typeof b.publicHost === 'string') {
      if (b.publicHost && !/^[A-Za-z0-9.-]+$/.test(b.publicHost)) throw new Error('publicHost はドメインか IPv4 で指定してください');
      cfg.publicHost = b.publicHost.trim();
    }
    if (b.backup) {
      const bk = b.backup;
      if (bk.intervalMinutes !== undefined) cfg.backup.intervalMinutes = Math.max(0, parseInt(bk.intervalMinutes, 10) || 0);
      if (bk.keep !== undefined) cfg.backup.keep = Math.max(1, parseInt(bk.keep, 10) || 1);
      if (bk.keepDaily !== undefined) cfg.backup.keepDaily = Math.max(0, parseInt(bk.keepDaily, 10) || 0);
      if (bk.onlyWhenPlayers !== undefined) cfg.backup.onlyWhenPlayers = !!bk.onlyWhenPlayers;
      if (bk.format !== undefined) cfg.backup.format = bk.format === 'tar' ? 'tar' : 'cas';
      if (bk.offsite) {
        const remote = String(bk.offsite.remote || '').trim();
        if (remote && !/^[A-Za-z0-9_.-]+:[A-Za-z0-9_./ -]*$/.test(remote)) throw new Error('rclone remote は "名前:パス" 形式');
        cfg.backup.offsite = { enabled: !!bk.offsite.enabled, remote };
      }
    }
    if (b.schedule) {
      if (b.schedule.dailyRestart !== undefined) {
        const v = String(b.schedule.dailyRestart).trim();
        if (v && !/^\d{1,2}:\d{2}$/.test(v)) throw new Error('時刻は HH:MM');
        cfg.schedule.dailyRestart = v;
      }
      if (b.schedule.restartWarnSeconds !== undefined) cfg.schedule.restartWarnSeconds = Math.max(0, Math.min(600, parseInt(b.schedule.restartWarnSeconds, 10) || 0));
    }
    if (b.limbo?.mode) {
      if (!['ondemand', 'always', 'disabled'].includes(b.limbo.mode)) throw new Error('mode が不正');
      cfg.instances.limbo.mode = b.limbo.mode;
    }
    if (b.main) {
      if (b.main.autoStart !== undefined) cfg.instances.main.autoStart = !!b.main.autoStart;
      if (b.main.autoRestart !== undefined) cfg.instances.main.autoRestart = !!b.main.autoRestart;
    }
    await persist();
    send(res, 200, publicConfig());
  });
  route('POST', /^\/api\/password$/, async (req, res) => {
    const b = await readBody(req);
    if (!verifyPassword(b.current || '', cfg.panel.passwordHash)) return send(res, 401, { error: '現在のパスワードが違います' });
    if (!b.next || String(b.next).length < 10) return send(res, 400, { error: '新しいパスワードは10文字以上' });
    cfg.panel.passwordHash = hashPassword(String(b.next));
    await persist();
    sessions.destroyAll();
    audit(req, 'password-change');
    send(res, 200, { ok: true });
  }, { audit: false });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      if (url.pathname.startsWith('/api/')) {
        for (const r of routes) {
          if (r.method !== req.method) continue;
          const m = r.pattern.exec(url.pathname);
          if (!m) continue;
          if (r.auth && !sessions.valid(parseCookies(req.headers.cookie).lk_sid)) return send(res, 401, { error: 'login required' });
          // CSRF 対策: 状態を変える要求はカスタムヘッダー必須
          if (req.method !== 'GET' && req.headers['x-levikit'] !== '1') return send(res, 403, { error: 'missing header' });
          if (req.method !== 'GET' && r.audit !== false) audit(req, `${req.method} ${url.pathname}`);
          return await r.handler(req, res, m);
        }
        return send(res, 404, { error: 'not found' });
      }
      // static
      let p = url.pathname === '/' ? '/index.html' : url.pathname;
      p = path.normalize(p).replace(/^(\.\.[/\\])+/, '');
      const file = path.join(PUBLIC_DIR, p);
      if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'forbidden');
      const data = await fsp.readFile(file).catch(() => null);
      if (!data) return send(res, 404, 'not found');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    } catch (e) {
      if (!res.headersSent) send(res, 400, { error: e.message });
      else res.end();
    }
  });

  server.listen(cfg.panel.port, cfg.panel.host, () => {
    console.log(`[levikit-panel] http://${cfg.panel.host}:${cfg.panel.port}/  (config: ${CONFIG_PATH})`);
  });

  if (cfg.instances.main.autoStart && (await instMain.isInstalled())) {
    try {
      orch.startMain();
    } catch (e) {
      console.error(e);
    }
  }

  // 終了時はサーバーを正しく stop する（ワールド破損防止）
  let shuttingDown = false;
  const shutdown = async (sig) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[levikit-panel] ${sig}: サーバーを停止しています…`);
    server.close();
    await Promise.allSettled([instMain.stop(), instLimbo.stop()]);
    await playerDB.flush().catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

module.exports = { syncGlacieConfig };
