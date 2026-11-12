'use strict';
// スケジュールタスク（定期コマンド・告知・タイトル表示・MOTD ローテーション・バックアップ・再起動）
const crypto = require('node:crypto');

const KINDS = ['command', 'say', 'title', 'motd', 'backup', 'restart', 'resetWorld'];

function normalizeTask(t) {
  const kind = KINDS.includes(t.kind) ? t.kind : 'say';
  const sch = t.schedule || {};
  const schedule =
    sch.type === 'daily'
      ? { type: 'daily', time: /^\d{1,2}:\d{2}$/.test(sch.time || '') ? sch.time : '05:00', days: Array.isArray(sch.days) ? sch.days.filter((d) => d >= 0 && d <= 6) : [] }
      : { type: 'interval', minutes: Math.max(1, Math.min(10080, parseInt(sch.minutes, 10) || 30)) };
  return {
    id: typeof t.id === 'string' && /^[a-z0-9]{6,20}$/.test(t.id) ? t.id : crypto.randomBytes(5).toString('hex'),
    name: String(t.name || kind).slice(0, 60),
    enabled: t.enabled !== false,
    kind,
    value: String(t.value ?? '').slice(0, 2000),
    onlyWhenPlayers: !!t.onlyWhenPlayers,
    schedule,
    lastRun: t.lastRun || 0,
    rotateIndex: t.rotateIndex || 0,
  };
}

function isDue(task, now = new Date()) {
  if (!task.enabled) return false;
  const s = task.schedule;
  if (s.type === 'interval') return now.getTime() - (task.lastRun || 0) >= s.minutes * 60_000;
  const [h, m] = s.time.split(':').map(Number);
  if (now.getHours() !== h || now.getMinutes() !== m) return false;
  if (s.days.length && !s.days.includes(now.getDay())) return false;
  return now.getTime() - (task.lastRun || 0) > 90_000;
}

function fill(text, vars) {
  return text.replace(/\{(\w+)\}/g, (all, k) => (k in vars ? String(vars[k]) : all));
}

const oneLine = (s) => s.replace(/[\r\n]+/g, ' ').replace(/"/g, "'");

/** タスクを実行（orchestrator/instance を使う） */
async function runTask(task, { main, orch, backupJob, vars }) {
  const lines = task.value.split('\n').map((l) => l.trim()).filter(Boolean);
  switch (task.kind) {
    case 'command':
      for (const l of lines) main.send(fill(l, vars).replace(/^\//, ''));
      break;
    case 'say':
      for (const l of lines) main.send(`tellraw @a {"rawtext":[{"text":${JSON.stringify(fill(l, vars))}}]}`);
      break;
    case 'title': {
      const [title, sub] = lines;
      if (title) main.send(`title @a title ${oneLine(fill(title, vars))}`);
      if (sub) main.send(`title @a subtitle ${oneLine(fill(sub, vars))}`);
      break;
    }
    case 'motd': {
      if (!lines.length) break;
      const i = task.rotateIndex % lines.length;
      task.rotateIndex = (i + 1) % lines.length;
      main.send(`levikit motd "${oneLine(fill(lines[i], vars))}"`);
      break;
    }
    case 'backup':
      backupJob(task.value || task.name);
      break;
    case 'restart':
      orch.restartMain({ standard: task.value === 'standard' });
      break;
    case 'resetWorld': {
      // 値: "levikit:resource" / "levikit:resource random" / 複数行で複数ワールド
      const names = [];
      let seed = 'keep';
      for (const l of lines) {
        const [name, opt] = l.split(/\s+/);
        if (name) names.push(name);
        if (opt === 'random') seed = 'random';
      }
      if (names.length) orch.resetWorlds(names, { seed });
      break;
    }
  }
}

module.exports = { KINDS, normalizeTask, isDue, runTask, fill };
