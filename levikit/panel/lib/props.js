'use strict';
// server.properties をコメントと順序を保ったまま読み書きする
const fsp = require('node:fs/promises');

async function readProps(file) {
  let text = '';
  try {
    text = await fsp.readFile(file, 'utf8');
  } catch {
    return { lines: [], map: {} };
  }
  const lines = text.split(/\r?\n/);
  const map = {};
  for (const l of lines) {
    const m = /^\s*([^#=\s][^=]*?)\s*=(.*)$/.exec(l);
    if (m) map[m[1]] = m[2];
  }
  return { lines, map };
}

/** 項目ごとに直前のコメント行を説明として返す（UI 用） */
async function describeProps(file) {
  const { lines } = await readProps(file);
  const out = [];
  let comment = [];
  for (const l of lines) {
    if (/^\s*#/.test(l)) {
      comment.push(l.replace(/^\s*#\s?/, ''));
      continue;
    }
    const m = /^\s*([^#=\s][^=]*?)\s*=(.*)$/.exec(l);
    if (m) {
      out.push({ key: m[1], value: m[2], comment: comment.join(' ') });
    }
    comment = [];
  }
  return out;
}

async function writeProps(file, updates) {
  const { lines } = await readProps(file);
  const done = new Set();
  const outLines = lines.map((l) => {
    const m = /^(\s*)([^#=\s][^=]*?)(\s*)=(.*)$/.exec(l);
    if (m && Object.prototype.hasOwnProperty.call(updates, m[2])) {
      done.add(m[2]);
      return `${m[1]}${m[2]}${m[3]}=${sanitize(updates[m[2]])}`;
    }
    return l;
  });
  for (const [k, v] of Object.entries(updates)) {
    if (!done.has(k)) outLines.push(`${k}=${sanitize(v)}`);
  }
  while (outLines.length && outLines[outLines.length - 1] === '') outLines.pop();
  await fsp.writeFile(file, outLines.join('\n') + '\n');
}

function sanitize(v) {
  return String(v).replace(/[\r\n]/g, ' ');
}

module.exports = { readProps, describeProps, writeProps };
