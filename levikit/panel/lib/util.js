'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

function stripAnsi(s) {
  return s.replace(ANSI_RE, '');
}

// "12:00:00.123 INFO [Server] msg" / "[2026-01-01 12:00:00:123 INFO] msg" などの接頭辞を外す
function stripLogPrefix(s) {
  let t = s;
  t = t.replace(/^\s*\d{1,2}:\d{2}:\d{2}(?:[.:]\d+)?\s+[A-Z]+\s+(?:\[[^\]]*\]\s*)*/, '');
  t = t.replace(/^\s*\[\d{4}-\d{2}-\d{2}[^\]]*\]\s*/, '');
  // Endstone: "[02:10:06 INFO]: 本文" / "[02:10:06 INFO]: [プラグイン名] 本文"
  t = t.replace(/^\s*\[\d{1,2}:\d{2}:\d{2}(?:[.:]\d+)?\s+[A-Z]+\]:?\s*(?:\[[^\]]*\]\s*)?/, '');
  return t;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ts(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function exists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

async function dirSize(p) {
  let total = 0;
  let st;
  try {
    st = await fsp.lstat(p);
  } catch {
    return 0;
  }
  if (!st.isDirectory()) return st.size;
  for (const e of await fsp.readdir(p)) total += await dirSize(path.join(p, e));
  return total;
}

/** 子プロセスを実行して終了を待つ。onLine で行ごとに出力を受け取れる */
function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let buf = '';
    const onData = (d) => {
      const s = d.toString();
      out += s;
      if (out.length > 2_000_000) out = out.slice(-1_000_000);
      if (opts.onLine) {
        buf += s;
        let i;
        while ((i = buf.search(/\r?\n/)) >= 0) {
          const line = stripAnsi(buf.slice(0, i));
          buf = buf.slice(buf[i] === '\r' ? i + 2 : i + 1);
          if (line.trim()) opts.onLine(line);
        }
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', reject);
    child.on('close', (code) => {
      if (opts.onLine && buf.trim()) opts.onLine(stripAnsi(buf));
      if (code === 0 || opts.allowFail) resolve({ code, out });
      else reject(new Error(`${cmd} ${args.join(' ')} exited with ${code}\n${out.slice(-2000)}`));
    });
  });
}

async function which(bin) {
  try {
    const r = await run('sh', ['-c', `command -v ${bin}`]);
    return r.out.trim() || null;
  } catch {
    return null;
  }
}

async function readJson(p, fallback) {
  try {
    return JSON.parse(await fsp.readFile(p, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(p, data) {
  await fsp.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2));
  await fsp.rename(tmp, p);
}

/** ディレクトリを再帰コピー（シンボリックリンク等は無視） */
async function copyDir(src, dst, filter = () => true) {
  await fsp.mkdir(dst, { recursive: true });
  for (const e of await fsp.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (!filter(s, e)) continue;
    if (e.isDirectory()) await copyDir(s, d, filter);
    else if (e.isFile()) await fsp.copyFile(s, d);
  }
}

function safeName(s) {
  return /^[A-Za-z0-9._-]+$/.test(s) && !s.includes('..');
}

module.exports = {
  stripAnsi,
  stripLogPrefix,
  sleep,
  ts,
  exists,
  dirSize,
  run,
  which,
  readJson,
  writeJsonAtomic,
  copyDir,
  safeName,
  fs,
  fsp,
  path,
};
