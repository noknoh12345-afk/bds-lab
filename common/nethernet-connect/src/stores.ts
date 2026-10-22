import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { bpRequire } from './bp.js';
import type { AccountInfo, SnapshotMeta } from './types.js';

/** サインインのコード（device code）。画面かコンソールに出す */
export interface DeviceCode {
  verification_uri: string;
  user_code: string;
  message?: string;
}

/** prismarine-auth's Authflow as AccountStore uses it (its constructor and getXboxToken), so a test can hand in its own */
export type AuthflowLike = new (username: string, cache: string, options: Record<string, unknown>, codeCallback: (c: any) => void) => { getXboxToken(): Promise<any> };

const NAME = /^[A-Za-z0-9_-]{1,32}$/;
/** prismarine-auth's Titles.MinecraftNintendoSwitch: bedrock-protocol signs in as this title by default */
const SWITCH_TITLE = '00000000441cc96b';
const checkName = (name: string) => { if (typeof name !== 'string' || !NAME.test(name)) throw new Error(`アカウント名は英数字・_・- の 1〜32 文字にしてください: ${JSON.stringify(name)}`); };
/** prismarine-auth's cache file prefix for a username (its Util createHash: sha1 of the name, hex, the first 6) */
export const cachePrefix = (name: string) => crypto.createHash('sha1').update(String(name), 'binary').digest('hex').slice(0, 6) + '_';

/**
 * ボットのアカウント（Microsoft のサインイン）を profilesFolder に。bedrock-protocol（prismarine-auth）のキャッシュと
 * 同じ置き方（`<sha1(name) の先頭 6 桁>_<live|xbl|bed>-cache.json`）で、名前の一覧は accounts.json。
 * connectToEndpoint は { username: name, profilesFolder, offline: false } でそのキャッシュを使う。
 */
export class AccountStore {
  private readonly Authflow: AuthflowLike | null;
  constructor(readonly folder: string, opts: { Authflow?: AuthflowLike } = {}) {
    this.Authflow = opts.Authflow ?? null;
  }

  private file(): string { return path.join(this.folder, 'accounts.json'); }
  private read(): AccountInfo[] {
    try {
      const j = JSON.parse(fs.readFileSync(this.file(), 'utf8'));
      return Array.isArray(j) ? j.filter((a) => a && typeof a.name === 'string' && NAME.test(a.name)) : [];
    } catch { return []; }
  }
  private write(list: AccountInfo[]): void {
    fs.mkdirSync(this.folder, { recursive: true });
    const tmp = `${this.file()}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2) + '\n');
    fs.renameSync(tmp, this.file());
  }
  /** the name's sign-in cache files in the folder */
  private caches(name: string): string[] {
    const p = cachePrefix(name);
    try { return fs.readdirSync(this.folder).filter((f) => f.startsWith(p) && f.endsWith('-cache.json')).map((f) => path.join(this.folder, f)); } catch { return []; }
  }

  /** 登録した名前（accounts.json の順）。キャッシュのファイルが消えたものは出さない */
  list(): AccountInfo[] {
    return this.read().filter((a) => fs.existsSync(path.join(this.folder, `${cachePrefix(a.name)}live-cache.json`)) || this.caches(a.name).length > 0);
  }

  /** 名前を一覧に足す（サインインのキャッシュを外から置いたとき: lab の `lan account import`） */
  register(name: string, info: Partial<AccountInfo> = {}): AccountInfo {
    checkName(name);
    const list = this.read();
    const prev = list.find((a) => a.name === name);
    const a: AccountInfo = { ...(prev ?? {}), ...info, name, addedAt: prev?.addedAt ?? info.addedAt ?? Date.now() };
    for (const k of ['gamertag', 'xuid'] as const) if (a[k] === undefined) a[k] = prev?.[k] ?? null;
    this.write(prev ? list.map((x) => (x.name === name ? a : x)) : [...list, a]);
    return a;
  }

  /** device code でサインインして登録する（onCode にコードを渡す）。gamertag・xuid が分かれば入れる */
  async add(name: string, onCode: (c: DeviceCode) => void): Promise<AccountInfo> {
    checkName(name);
    // (prismarine-auth from bedrock-protocol's own dependencies, read only now)
    const Flow: AuthflowLike = this.Authflow ?? createRequire(bpRequire().resolve('bedrock-protocol'))('prismarine-auth').Authflow;
    fs.mkdirSync(this.folder, { recursive: true });
    // (bedrock-protocol's own sign-in: the live flow as the Switch title — what connectToEndpoint's online join reads back)
    const flow = new Flow(name, this.folder, { flow: 'live', authTitle: SWITCH_TITLE, deviceType: 'Nintendo' }, (c: any) => {
      onCode({ verification_uri: String(c?.verification_uri ?? c?.verificationUri ?? ''), user_code: String(c?.user_code ?? c?.userCode ?? ''), ...(c?.message ? { message: String(c.message) } : {}) });
    });
    const x = await flow.getXboxToken();
    const claims = x?.displayClaims?.xui?.[0] ?? x?.DisplayClaims?.xui?.[0] ?? {};
    return this.register(name, {
      gamertag: (typeof x?.gamertag === 'string' && x.gamertag) || (typeof claims.gtg === 'string' && claims.gtg) || null,
      xuid: (typeof x?.userXUID === 'string' && x.userXUID) || (typeof claims.xid === 'string' && claims.xid) || null,
    });
  }

  /** 一覧とキャッシュのファイルを消す。無ければ false */
  remove(name: string): boolean {
    if (typeof name !== 'string' || !NAME.test(name)) return false;
    const list = this.read(), files = this.caches(name);
    const had = list.some((a) => a.name === name) || files.length > 0;
    if (!had) return false;
    for (const f of files) fs.rmSync(f, { force: true });
    this.write(list.filter((a) => a.name !== name));
    return true;
  }
}

// ---------------------------------------------------------------------------------------------------- snapshots

const ID = /^\d{8}-\d{6}-\d{3}-[0-9a-f]{6}$/;
const stamp = (t: number) => { const d = new Date(t), p = (n: number, w = 2) => String(n).padStart(w, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`; };

/** every file under dir (relative, / separators), folders followed, links left out */
function walk(dir: string, base = ''): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(dir, rel));
    else if (e.isFile()) out.push(rel);
  }
  return out.sort();
}

/** a running bedrock_server whose working folder is dir (Linux: /proc/<pid>/cwd). Elsewhere nothing is known: null */
function serverUsing(dir: string): number | null {
  if (process.platform !== 'linux') return null;
  const want = fs.realpathSync(dir);
  let pids: string[] = [];
  try { pids = fs.readdirSync('/proc').filter((p) => /^\d+$/.test(p)); } catch { return null; }
  for (const pid of pids) {
    try {
      const comm = fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim();
      if (!/^bedrock_server/.test(comm)) continue;
      if (fs.realpathSync(`/proc/${pid}/cwd`) === want) return Number(pid);
    } catch { /* gone, or not ours to read */ }
  }
  return null;
}

/**
 * BDS・ワールドのフォルダを取っておき、元に戻す（このマシンにある物だけ。動いている間は戻さない: 呼ぶ側が止めてから）。
 * dir/<id>/meta.json と dir/<id>/files/…。restore は今の状態を先に取っておく（backup）。
 */
export class SnapshotStore {
  constructor(readonly dir: string) {}

  private at(id: string): string {
    if (typeof id !== 'string' || !ID.test(id)) throw new Error(`スナップショットの id が不正です: ${JSON.stringify(id)}`);
    return path.join(this.dir, id);
  }
  private meta(id: string): SnapshotMeta {
    const f = path.join(this.at(id), 'meta.json');
    if (!fs.existsSync(f)) throw new Error(`スナップショット ${id} はありません（node lab.mjs lan snapshots で一覧）`);
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  }

  take(kind: 'bds' | 'world', source: string, label: string): SnapshotMeta {
    if (kind !== 'bds' && kind !== 'world') throw new Error(`kind は bds か world です: ${JSON.stringify(kind)}`);
    const src = path.resolve(source);
    if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) throw new Error(`取っておくフォルダがありません: ${src}`);
    const takenAt = Date.now();
    let id = '';
    for (let k = 0; k < 20; k++) { id = `${stamp(takenAt)}-${crypto.randomBytes(3).toString('hex')}`; if (!fs.existsSync(path.join(this.dir, id))) break; }
    const to = path.join(this.dir, id), files = walk(src);
    let bytes = 0;
    fs.mkdirSync(path.join(to, 'files'), { recursive: true });
    for (const rel of files) {
      const dst = path.join(to, 'files', ...rel.split('/'));
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(path.join(src, ...rel.split('/')), dst);
      bytes += fs.statSync(dst).size;
    }
    const m: SnapshotMeta = { id, kind, label: String(label ?? ''), source: src, files, takenAt, bytes };
    fs.writeFileSync(path.join(to, 'meta.json'), JSON.stringify(m, null, 2) + '\n');
    return m;
  }

  /** 新しい順 */
  list(): SnapshotMeta[] {
    let ids: string[] = [];
    try { ids = fs.readdirSync(this.dir).filter((x) => ID.test(x) && fs.existsSync(path.join(this.dir, x, 'meta.json'))); } catch { return []; }
    return ids.map((x) => { try { return this.meta(x); } catch { return null; } }).filter((m): m is SnapshotMeta => !!m).sort((a, b) => b.takenAt - a.takenAt || b.id.localeCompare(a.id));
  }

  /** id の状態に戻す（無かったファイルは消す）。戻す前の状態を backup として取っておく */
  async restore(id: string, opts: { force?: boolean } = {}): Promise<{ restored: number; backup: SnapshotMeta }> {
    const m = this.meta(id), src = m.source;
    fs.mkdirSync(src, { recursive: true });
    if (!opts.force && m.kind === 'bds') {
      const pid = serverUsing(src);
      if (pid) throw new Error(`この BDS（${src}）は動いています（pid ${pid}）: 止めてから戻してください（--force で止めずに）`);
    }
    const backup = this.take(m.kind, src, `${m.label} の戻す前`);
    const keep = new Set(m.files);
    // (what the snapshot does not have goes: files first, then the folders left empty)
    for (const rel of walk(src)) if (!keep.has(rel)) fs.rmSync(path.join(src, ...rel.split('/')), { force: true });
    const prune = (d: string): boolean => {
      let empty = true;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) { if (prune(path.join(d, e.name))) fs.rmdirSync(path.join(d, e.name)); else empty = false; } else empty = false;
      }
      return empty;
    };
    prune(src);
    let restored = 0;
    for (const rel of m.files) {
      const from = path.join(this.at(id), 'files', ...rel.split('/')), to = path.join(src, ...rel.split('/'));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
      restored++;
    }
    return { restored, backup };
  }

  remove(id: string): boolean {
    let d: string;
    try { d = this.at(id); } catch { return false; }
    if (!fs.existsSync(path.join(d, 'meta.json'))) return false;
    fs.rmSync(d, { recursive: true, force: true });
    return true;
  }
}
