'use strict';
const crypto = require('node:crypto');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(pw, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const [algo, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const got = crypto.scryptSync(String(pw), Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, got);
}

class Sessions {
  constructor(ttlMs = 12 * 3600_000) {
    this.ttl = ttlMs;
    this.map = new Map();
    this.attempts = new Map(); // ip -> [timestamps]
  }
  create() {
    const id = crypto.randomBytes(32).toString('base64url');
    this.map.set(id, Date.now() + this.ttl);
    return id;
  }
  valid(id) {
    if (!id) return false;
    const exp = this.map.get(id);
    if (!exp) return false;
    if (exp < Date.now()) {
      this.map.delete(id);
      return false;
    }
    this.map.set(id, Date.now() + this.ttl);
    return true;
  }
  destroy(id) {
    this.map.delete(id);
  }
  destroyAll() {
    this.map.clear();
  }
  /** 1分間に5回まで */
  allowAttempt(ip) {
    const now = Date.now();
    // 古い記録を掃く（多数の送信元から叩かれても、覚えておく量が増え続けないように）
    if (this.attempts.size > 5000) for (const [k, v] of this.attempts) if (!v.some((t) => now - t < 60_000)) this.attempts.delete(k);
    const list = (this.attempts.get(ip) || []).filter((t) => now - t < 60_000);
    if (list.length >= 5) {
      this.attempts.set(ip, list);
      return false;
    }
    list.push(now);
    this.attempts.set(ip, list);
    return true;
  }
}

function parseCookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

module.exports = { hashPassword, verifyPassword, Sessions, parseCookies };
