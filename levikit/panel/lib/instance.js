'use strict';
// BDS(LeviLamina) プロセスの起動・停止・コンソール入出力・プレイヤー追跡
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { stripAnsi, stripLogPrefix, sleep, exists } = require('./util');
const { readProps } = require('./props');

const LOG_LIMIT = 3000;

class Instance extends EventEmitter {
  constructor(name, cfg, globalCfg) {
    super();
    this.name = name;
    this.cfg = cfg;
    this.global = globalCfg;
    this.dir = cfg.dir;
    this.state = 'stopped';
    this.proc = null;
    this.logs = [];
    this.players = new Map(); // name -> {name, xuid, since}
    this.collectors = new Set();
    this.startedAt = null;
    this.lastExit = null;
    this.crashCount = 0;
    this.wantRunning = false;
    this.restartTimer = null;
    this.kitReady = false;
  }

  get endstone() {
    return this.global.engine === 'endstone';
  }

  get exe() {
    return path.join(this.dir, this.endstone ? 'bedrock_server' : 'bedrock_server_mod.exe');
  }

  async props() {
    return (await readProps(path.join(this.dir, 'server.properties'))).map;
  }

  async ports() {
    const p = await this.props();
    return {
      port: parseInt(p['server-port'] || '19132', 10),
      portv6: parseInt(p['server-portv6'] || '19133', 10),
      level: p['level-name'] || 'Bedrock level',
    };
  }

  async hasKitCore() {
    // Endstone 版: endstone-levikit プラグイン（.whl）が plugins/ にあるか
    if (this.endstone && !this.cfg.cmd) {
      const names = await require('node:fs/promises').readdir(path.join(this.dir, 'plugins')).catch(() => []);
      return names.some((n) => /^endstone_levikit-.*\.whl$/.test(n));
    }
    return exists(path.join(this.dir, 'plugins', 'levikit-core', 'manifest.json'));
  }

  async isInstalled() {
    if (this.cfg.cmd) return true;
    return exists(this.exe);
  }

  status() {
    return {
      name: this.name,
      state: this.state,
      startedAt: this.startedAt,
      players: [...this.players.values()],
      crashCount: this.crashCount,
      lastExit: this.lastExit,
      kitReady: this.kitReady,
      tps: this.lastStats && Date.now() - this.lastStats.at < 60_000 ? this.lastStats.tps : null,
      pid: this.proc ? this.proc.pid : null,
    };
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.emit('state', this.status());
  }

  pushLog(text, kind = 'out') {
    const entry = { t: Date.now(), text, kind };
    this.logs.push(entry);
    if (this.logs.length > LOG_LIMIT) this.logs.splice(0, this.logs.length - LOG_LIMIT);
    this.emit('line', entry);
  }

  /** 起動 */
  async start() {
    if (this.proc) return;
    if (!(await this.isInstalled())) throw new Error(`${this.name}: ${this.exe} がありません（install.sh を実行してください）`);
    clearTimeout(this.restartTimer);
    this.wantRunning = true;
    this.players.clear();
    this.kitReady = false;
    this.lastDims = null;
    this.setState('starting');

    let cmd;
    let args;
    if (this.cfg.cmd) {
      [cmd, ...args] = this.cfg.cmd;
    } else if (this.endstone) {
      cmd = this.global.endstone?.bin || 'endstone';
      args = ['--server-folder', this.dir, '--no-confirm', '--no-interactive'];
    } else {
      cmd = this.global.wine?.bin || 'wine';
      args = ['bedrock_server_mod.exe'];
    }
    const env = {
      ...process.env,
      WINEDEBUG: process.env.WINEDEBUG || '-all',
      WINEPREFIX: this.global.wine?.prefix || process.env.WINEPREFIX,
      // Wine の GUI 系を使わない
      DISPLAY: '',
      // Endstone: 対話コンソールを使わず、ログをすぐ流す
      ENDSTONE_USE_INTERACTIVE_CONSOLE: '0',
      PYTHONUNBUFFERED: '1',
    };
    this.pushLog(`[panel] 起動: ${cmd} ${args.join(' ')} (cwd=${this.dir})`, 'sys');
    const child = spawn(cmd, args, { cwd: this.dir, env, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    this.proc = child;
    this.startedAt = Date.now();

    let buf = '';
    const onData = (d) => {
      buf += d.toString('utf8');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const raw = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        this.handleLine(stripAnsi(raw));
      }
      if (buf.length > 65536) {
        this.handleLine(stripAnsi(buf));
        buf = '';
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.stdin.on('error', () => {});
    child.on('error', (e) => this.pushLog(`[panel] 起動エラー: ${e.message}`, 'err'));
    child.on('exit', (code, signal) => this.onExit(code, signal));
  }

  handleLine(line) {
    if (!line.trim()) return;
    const msg = stripLogPrefix(line);
    // 定期的な機械向け行（位置・統計）はコンソールに流さない
    if (!/@@LEVIKIT (POS|STATS) /.test(msg)) this.pushLog(line);
    for (const c of this.collectors) c(msg, line);

    // BDS / Endstone: "Server started."  LeviLamina: "Server started in (1.9s)! For help, type …"
    if (/Server started(\.| in \()/.test(msg)) {
      this.setState('running');
      this.emit('started');
    }
    let m;
    if ((m = /Player connected:\s*(.+?),\s*xuid:\s*(\d*)/.exec(msg))) {
      const known = this.players.has(m[1]);
      this.players.set(m[1], { name: m[1], xuid: m[2], since: Date.now() });
      if (!known) this.emit('join', { name: m[1], xuid: m[2] });
      this.emit('players', [...this.players.values()]);
    } else if ((m = /Player disconnected:\s*(.+?),\s*xuid:\s*(\d*)/.exec(msg))) {
      const p = this.players.get(m[1]);
      this.players.delete(m[1]);
      if (p) this.emit('leave', { name: m[1], xuid: m[2], since: p.since });
      this.emit('players', [...this.players.values()]);
    } else if ((m = /@@LEVIKIT (\w+) (.*)$/.exec(msg))) {
      let data = null;
      try {
        data = JSON.parse(m[2]);
      } catch {
        /* ignore */
      }
      if (m[1] === 'READY') this.kitReady = true;
      if (m[1] === 'STATS' && data) {
        this.lastStats = { ...data, at: Date.now() };
        // ワールド別の人数を一覧へ反映
        if (Array.isArray(this.lastDims) && data.worlds && typeof data.worlds === 'object') {
          for (const w of this.lastDims) w.players = data.worlds[w.key] || 0;
          this.emit('kit', 'DIMS', this.lastDims);
        }
      }
      if (m[1] === 'DIMS' && Array.isArray(data)) this.lastDims = data;
      if (m[1] === 'PLAYERS' && Array.isArray(data)) {
        this.players = new Map(
          data.filter((p) => !p.simulated).map((p) => [p.name, { ...p, since: this.players.get(p.name)?.since || Date.now() }])
        );
        this.emit('players', [...this.players.values()]);
      }
      this.emit('kit', m[1], data);
    }
  }

  onExit(code, signal) {
    const wasStopping = this.state === 'stopping';
    this.proc = null;
    this.lastExit = { code, signal, at: Date.now() };
    for (const p of this.players.values()) this.emit('leave', { name: p.name, xuid: p.xuid, since: p.since });
    this.players.clear();
    this.kitReady = false;
    this.pushLog(`[panel] プロセス終了 code=${code} signal=${signal || '-'}`, 'sys');
    for (const c of this.collectors) c(null, null);
    this.setState('stopped');
    this.emit('exit', this.lastExit);

    if (!wasStopping && this.wantRunning && this.cfg.autoRestart !== false) {
      const uptime = Date.now() - (this.startedAt || 0);
      if (uptime > 10 * 60_000) this.crashCount = 0;
      this.crashCount++;
      const delay = Math.min(60_000, 5_000 * this.crashCount);
      this.pushLog(`[panel] 異常終了を検知。${delay / 1000}秒後に自動再起動します (${this.crashCount}回目)`, 'err');
      this.emit('crash', this.lastExit);
      this.restartTimer = setTimeout(() => this.start().catch((e) => this.pushLog(String(e), 'err')), delay);
    }
  }

  /** コンソールへコマンド送信 */
  send(cmd) {
    if (!this.proc || !this.proc.stdin.writable) throw new Error(`${this.name} は起動していません`);
    const clean = String(cmd).replace(/[\r\n]+/g, ' ').trim();
    if (!clean) return;
    this.pushLog(`> ${clean}`, 'cmd');
    this.proc.stdin.write(clean + '\n');
  }

  /**
   * コマンドを送り、出力行を集める。
   * until(msg) が true を返した後、settleMs だけ追加の行を待ってから返す。
   */
  capture(cmd, { until, timeout = 10_000, settleMs = 800, settleUntil } = {}) {
    return new Promise((resolve, reject) => {
      const lines = [];
      let matched = false;
      let settleTimer = null;
      const finish = (err) => {
        this.collectors.delete(collector);
        clearTimeout(timer);
        clearTimeout(settleTimer);
        if (err) reject(err);
        else resolve(lines);
      };
      const collector = (msg) => {
        if (msg === null) return finish(new Error('サーバーが終了しました'));
        lines.push(msg);
        if (!matched && until(msg)) {
          matched = true;
          settleTimer = setTimeout(() => finish(), settleMs);
          return;
        }
        if (matched && settleUntil && settleUntil(msg)) finish();
      };
      const timer = setTimeout(() => finish(new Error(`timeout: ${cmd}`)), timeout);
      this.collectors.add(collector);
      try {
        this.send(cmd);
      } catch (e) {
        finish(e);
      }
    });
  }

  waitFor(predicate, timeout = 300_000) {
    return new Promise((resolve, reject) => {
      const collector = (msg) => {
        if (msg === null) {
          cleanup();
          reject(new Error(`${this.name} が終了しました`));
        } else if (predicate(msg)) {
          cleanup();
          resolve(msg);
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`${this.name}: 待機タイムアウト`));
      }, timeout);
      const cleanup = () => {
        clearTimeout(timer);
        this.collectors.delete(collector);
      };
      this.collectors.add(collector);
    });
  }

  async waitStarted(timeout = 300_000) {
    if (this.state === 'running') return;
    if (!this.proc) throw new Error(`${this.name} は起動していません`);
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        cleanup();
        reject(new Error(`${this.name}: 起動待ちタイムアウト`));
      }, timeout);
      const onState = (s) => {
        if (s.state === 'running') {
          cleanup();
          resolve();
        } else if (s.state === 'stopped') {
          cleanup();
          reject(new Error(`${this.name}: 起動中に終了しました`));
        }
      };
      const cleanup = () => {
        clearTimeout(t);
        this.off('state', onState);
      };
      this.on('state', onState);
    });
    // KitCore のディメンション登録完了(READY)を少し待つ
    if (await this.hasKitCore()) {
      const t0 = Date.now();
      while (!this.kitReady && Date.now() - t0 < 15_000 && this.proc) await sleep(250);
    }
  }

  /** 停止（stop → 待機 → 強制終了） */
  async stop({ timeout = 90_000 } = {}) {
    this.wantRunning = false;
    clearTimeout(this.restartTimer);
    if (!this.proc) {
      this.setState('stopped');
      return;
    }
    this.setState('stopping');
    const proc = this.proc;
    const exited = new Promise((r) => proc.once('exit', r));
    try {
      this.send('stop');
    } catch {
      /* ignore */
    }
    const ok = await Promise.race([exited.then(() => true), sleep(timeout).then(() => false)]);
    if (!ok && this.proc === proc) {
      this.pushLog('[panel] 停止しないため強制終了します', 'err');
      try {
        process.kill(-proc.pid, 'SIGKILL');
      } catch {
        try {
          proc.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      }
      await Promise.race([exited, sleep(10_000)]);
    }
  }

  async restart() {
    await this.stop();
    await this.start();
  }

  /** プレイヤー一覧を KitCore から取り直す（ログ解析のずれ補正） */
  async refreshPlayers() {
    if (this.state !== 'running' || !(await this.hasKitCore())) return [...this.players.values()];
    try {
      await this.capture('levikit players', { until: (m) => /@@LEVIKIT PLAYERS/.test(m), timeout: 5000, settleMs: 100 });
    } catch {
      /* ignore */
    }
    return [...this.players.values()];
  }
}

module.exports = { Instance };
