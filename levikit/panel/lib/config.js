'use strict';
const path = require('node:path');
const { readJson, writeJsonAtomic } = require('./util');

const CONFIG_PATH = process.env.LEVIKIT_CONFIG || '/opt/levikit/levikit.json';

function defaults(root) {
  return {
    root,
    publicHost: '',
    // 'levilamina'（Wine 上の LeviLamina + levikit-core）か 'endstone'（Endstone + endstone-levikit プラグイン）
    engine: 'levilamina',
    endstone: { bin: 'endstone' },
    panel: { host: '0.0.0.0', port: 8080, passwordHash: '', trustProxy: false },
    wine: { bin: 'wine', prefix: path.join(root, '.wine') },
    lipExe: path.join(root, 'lip', 'lip.exe'),
    instances: {
      main: { dir: path.join(root, 'instances', 'main'), autoStart: true, autoRestart: true },
      limbo: { dir: path.join(root, 'instances', 'limbo'), mode: 'ondemand', port: 19134, portv6: 19135, autoRestart: false },
    },
    backup: { dir: path.join(root, 'backups'), intervalMinutes: 60, keep: 48, keepDaily: 14, compression: 'zstd', onlyWhenPlayers: false },
    schedule: { dailyRestart: '', restartWarnSeconds: 30 },
  };
}

function merge(base, over) {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = base && typeof base[k] === 'object' && !Array.isArray(base[k]) ? merge(base[k], v) : v;
  }
  return out;
}

async function loadConfig() {
  const raw = await readJson(CONFIG_PATH, {});
  const root = raw.root || path.dirname(CONFIG_PATH);
  return merge(defaults(root), raw);
}

async function saveConfig(cfg) {
  await writeJsonAtomic(CONFIG_PATH, cfg);
}

module.exports = { loadConfig, saveConfig, CONFIG_PATH, merge };
