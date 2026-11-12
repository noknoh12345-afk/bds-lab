'use strict';
// プレイヤー履歴（初回参加・最終参加・累計プレイ時間・セッション・ワールド別の滞在時間）と チャットログ
const path = require('node:path');
const { readJson, writeJsonAtomic } = require('./util');

class PlayerDB {
  constructor(root) {
    this.file = path.join(root, 'players.json');
    this.data = { players: {} };
    this.dirty = false;
    this.chat = [];
  }

  async load() {
    this.data = await readJson(this.file, { players: {} });
    if (!this.data.players) this.data.players = {};
    this.timer = setInterval(() => this.flush().catch(() => {}), 30_000);
    this.timer.unref();
  }

  key(name, xuid) {
    return xuid ? `x:${xuid}` : `n:${name}`;
  }

  entry(name, xuid) {
    const k = this.key(name, xuid);
    let e = this.data.players[k];
    if (!e && xuid) {
      // 以前は名前だけで記録されていた場合は統合
      const old = this.data.players[`n:${name}`];
      if (old) {
        delete this.data.players[`n:${name}`];
        e = old;
      }
    }
    if (!e) e = { name, xuid: xuid || '', firstSeen: Date.now(), lastSeen: 0, totalMs: 0, sessions: 0, names: [name] };
    if (e.name !== name) {
      e.name = name;
      if (!e.names.includes(name)) e.names.push(name);
    }
    this.data.players[k] = e;
    return e;
  }

  join({ name, xuid }, instance) {
    const e = this.entry(name, xuid);
    e.lastSeen = Date.now();
    e.online = instance;
    e.sessionStart = Date.now();
    e.sessions++;
    this.dirty = true;
    return e;
  }

  /** 今いるワールドの滞在時間を締める */
  closeWorld(e, now = Date.now()) {
    if (e.world && e.worldSince) {
      e.worldMs ??= {};
      e.worldMs[e.world] = (e.worldMs[e.world] || 0) + Math.max(0, now - e.worldSince);
    }
    e.worldSince = null;
  }

  /** levikit-core の WORLD_CHANGE（名前だけ届く） */
  worldChange(name, to) {
    const e = Object.values(this.data.players).find((x) => x.name === name && x.online) || Object.values(this.data.players).find((x) => x.name === name);
    if (!e) return;
    this.closeWorld(e);
    e.world = to || '';
    e.worldSince = to ? Date.now() : null;
    if (to) {
      e.worldVisits ??= {};
      e.worldVisits[to] = (e.worldVisits[to] || 0) + 1;
    }
    this.dirty = true;
  }

  /** ワールドごとの集計: 累計滞在時間・訪れた人数・訪問回数・今いる人 */
  worldStats() {
    const out = {};
    const now = Date.now();
    for (const e of Object.values(this.data.players)) {
      const ms = { ...(e.worldMs || {}) };
      if (e.world && e.worldSince) ms[e.world] = (ms[e.world] || 0) + (now - e.worldSince);
      for (const [w, v] of Object.entries(ms)) {
        const o = (out[w] ??= { totalMs: 0, visitors: 0, visits: 0, online: 0, top: [] });
        o.totalMs += v;
        o.visitors++;
        o.visits += e.worldVisits?.[w] || 0;
        o.top.push({ name: e.name, ms: v });
      }
      if (e.online && e.world && out[e.world]) out[e.world].online++;
    }
    for (const o of Object.values(out)) o.top = o.top.sort((a, b) => b.ms - a.ms).slice(0, 5);
    return out;
  }

  leave({ name, xuid }) {
    const e = this.entry(name, xuid);
    if (e.sessionStart) e.totalMs += Date.now() - e.sessionStart;
    this.closeWorld(e);
    e.world = '';
    e.sessionStart = null;
    e.online = null;
    e.lastSeen = Date.now();
    this.dirty = true;
    return e;
  }

  addChat(msg) {
    this.chat.push({ t: Date.now(), ...msg });
    if (this.chat.length > 500) this.chat.splice(0, this.chat.length - 500);
  }

  list() {
    const now = Date.now();
    return Object.values(this.data.players)
      .map((e) => {
        const worldMs = { ...(e.worldMs || {}) };
        if (e.world && e.worldSince) worldMs[e.world] = (worldMs[e.world] || 0) + (now - e.worldSince);
        return { ...e, worldMs, totalMs: e.totalMs + (e.sessionStart ? now - e.sessionStart : 0) };
      })
      .sort((a, b) => b.lastSeen - a.lastSeen);
  }

  async flush() {
    if (!this.dirty) return;
    this.dirty = false;
    await writeJsonAtomic(this.file, this.data);
  }

  /** パネル起動時: 前回のオンライン状態を締める */
  closeAll() {
    for (const e of Object.values(this.data.players)) {
      if (e.sessionStart) {
        e.totalMs += Math.max(0, (e.lastSeen || e.sessionStart) - e.sessionStart);
        if (e.world && e.worldSince) this.closeWorld(e, Math.max(e.worldSince, e.lastSeen || e.worldSince));
        e.world = '';
        e.sessionStart = null;
        e.online = null;
        this.dirty = true;
      }
    }
  }
}

module.exports = { PlayerDB };
