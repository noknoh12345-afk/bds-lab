'use strict';
// プロセスのメモリ/CPU（/proc から、Wine の子プロセス込みで集計）と TPS・人数の時系列
const fsp = require('node:fs/promises');
const os = require('node:os');

const CLK_TCK = 100;
const PAGE = 4096;

async function readStat(pid) {
  try {
    const s = await fsp.readFile(`/proc/${pid}/stat`, 'utf8');
    const rest = s.slice(s.lastIndexOf(')') + 2).split(' ');
    // rest[0]=state, rest[1]=ppid, rest[2]=pgrp, rest[11]=utime, rest[12]=stime, rest[21]=rss(pages)
    return { pid, ppid: +rest[1], pgrp: +rest[2], cpu: +rest[11] + +rest[12], rss: +rest[21] * PAGE };
  } catch {
    return null;
  }
}

/** プロセスグループ(=detached で起動した wine とその子孫)の合計 */
async function groupUsage(pgid) {
  let rss = 0;
  let cpu = 0;
  let n = 0;
  const dirs = await fsp.readdir('/proc').catch(() => []);
  for (const d of dirs) {
    if (!/^\d+$/.test(d)) continue;
    const st = await readStat(d);
    if (st && st.pgrp === pgid) {
      rss += st.rss;
      cpu += st.cpu;
      n++;
    }
  }
  return n ? { rss, cpu } : null;
}

class Metrics {
  constructor(instances, { intervalMs = 15_000, keep = 5760 } = {}) {
    this.instances = instances;
    this.intervalMs = intervalMs;
    this.keep = keep; // 15秒 x 5760 = 24時間
    this.series = {};
    this.prevCpu = {};
    for (const name of Object.keys(instances)) this.series[name] = [];
  }

  start() {
    this.timer = setInterval(() => this.sample().catch(() => {}), this.intervalMs);
    this.timer.unref();
    this.sample().catch(() => {});
  }

  async sample() {
    const now = Date.now();
    const ncpu = os.cpus().length || 1;
    for (const [name, inst] of Object.entries(this.instances)) {
      if (!inst.proc) {
        delete this.prevCpu[name];
        if (name !== 'main') continue;
        this.push(name, { t: now, up: 0, players: 0 });
        continue;
      }
      const u = await groupUsage(inst.proc.pid);
      let cpuPct = null;
      if (u) {
        const prev = this.prevCpu[name];
        if (prev) {
          const dt = (now - prev.t) / 1000;
          cpuPct = Math.max(0, ((u.cpu - prev.cpu) / CLK_TCK / dt / ncpu) * 100);
        }
        this.prevCpu[name] = { t: now, cpu: u.cpu };
      }
      this.push(name, {
        t: now,
        up: inst.state === 'running' ? 1 : 0,
        rss: u ? u.rss : null,
        cpu: cpuPct === null ? null : Math.round(cpuPct * 10) / 10,
        tps: inst.lastStats && now - inst.lastStats.at < 60_000 ? inst.lastStats.tps : null,
        players: inst.players.size,
      });
    }
  }

  push(name, point) {
    const s = this.series[name];
    s.push(point);
    if (s.length > this.keep) s.splice(0, s.length - this.keep);
  }

  get(name, sinceMs = 3600_000) {
    const from = Date.now() - sinceMs;
    return (this.series[name] || []).filter((p) => p.t >= from);
  }
}

module.exports = { Metrics, groupUsage };
