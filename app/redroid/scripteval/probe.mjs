// scripteval の REPL(素のMinecraft APKに注入した libscripteval.so が開く TCP サーバ)に
// 正しいプロトコルで話しかけ、「JS ランタイムが APK 内で動いているか」を確かめる診断と、その REPL の客(Repl)。
//
// これは注入しない。注入(Frida Module.load → mod_init)が済んだ後に呼ばれる。
// scripteval のソースで確認した実仕様に厳密に合わせてある(0.3.0 / 0.3.1 共通):
//   - TCP。既定ポート 25599、bind 127.0.0.1(config.json の replPort/replBind)。
//   - 接続後まず認証: `#AUTH <token>\n`(token は <dataDir>/session.token、起動ごとに変わる)。
//     既定 dataDir(Android)= /data/data/com.mojang.minecraftpe/scripteval 。
//   - 認証が通るとバナー(`ScriptEval <ver> REPL - Minecraft <game>\n...\n> `)。`> ` で終わる。
//   - `.frame\n` を送るとフレーム応答に切替(以後の各応答は `\x04\n` 終端)。
//   - 評価は `#B64 <base64(js)>\n`。応答は `<出力><結果>\n\x04\n`。
//   - 0.3.0 は読み取り専用。0.3.1 で `ScriptEval.injectInput` / `agent` / `http` / `packs.installUrl` / `ScriptEval.update`
//     が足された(features.mjs が確かめる)。ここ(runProbe)は版によらない読み取りの確かめと、版の見分け。
//
//   node probe.mjs --selftest                        端末不要。偽REPLでプロトコル配線を実走検証
//   node probe.mjs --port 25599 --token <tok> [--out report.json]
import net from 'node:net';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const EOT = Buffer.from([0x04, 0x0a]); // framed 応答の終端

export class Repl {
  constructor(host = '127.0.0.1', port = 25599, timeoutMs = 10_000) {
    Object.assign(this, { host, port, timeoutMs });
    this.buf = Buffer.alloc(0);
    this.sock = null;
    this.closed = false;
    this._pending = null; // いま待っている読み({ fail })
  }
  connect() {
    return new Promise((resolve, reject) => {
      const s = net.createConnection({ host: this.host, port: this.port });
      const to = setTimeout(() => { s.destroy(); reject(new Error(`接続タイムアウト ${this.host}:${this.port}`)); }, this.timeoutMs);
      s.once('connect', () => {
        clearTimeout(to); this.sock = s;
        s.on('data', (d) => { this.buf = Buffer.concat([this.buf, d]); this._pump?.(); });
        // (閉じられたら待っている読みを 1 回だけ落とす。読みごとに 'close' を足すと聞き手が溜まる)
        s.on('close', () => { this.closed = true; const p = this._pending; this._pending = null; p?.fail(new Error('接続が閉じられました')); });
        s.on('error', () => { /* close が続く */ });
        resolve(this);
      });
      s.once('error', (e) => { clearTimeout(to); reject(e); });
    });
  }
  _readUntil(markers, timeoutMs = this.timeoutMs) { // markers: Buffer か [Buffer,..]。最初に現れたものまでを返す
    const ms = Array.isArray(markers) ? markers : [markers];
    return new Promise((resolve, reject) => {
      if (this.closed) { reject(new Error('接続が閉じられました')); return; }
      const done = () => { clearTimeout(to); this._pump = null; this._pending = null; };
      const to = setTimeout(() => { done(); reject(new Error('応答タイムアウト')); }, timeoutMs);
      const tryMatch = () => {
        for (const m of ms) {
          const i = this.buf.indexOf(m);
          if (i >= 0) { const out = this.buf.subarray(0, i).toString('utf8'); this.buf = this.buf.subarray(i + m.length); done(); resolve(out); return true; }
        }
        return false;
      };
      this._pump = tryMatch;
      this._pending = { fail: (e) => { done(); reject(e); } };
      tryMatch();
    });
  }
  send(line) { this.sock.write(line.endsWith('\n') ? line : line + '\n'); }

  async auth(token) {
    // 認証モード(既定)ではサーバは #AUTH を受けるまで無言。token を送ってバナー待ち。
    if (token) this.send('#AUTH ' + token);
    const PROMPT = Buffer.from('> ');
    const banner = await this._readUntil([PROMPT]);
    if (/authentication required/i.test(banner)) throw new Error('認証に失敗(token 不一致/未指定)');
    this.banner = banner.trim();
    return this.banner;
  }
  async frame() { this.send('.frame'); await this._readUntil(EOT); this.framed = true; }
  async evalJs(code, timeoutMs = this.timeoutMs) {
    if (!this.framed) throw new Error('frame() を先に呼ぶこと');
    this.send('#B64 ' + Buffer.from(code, 'utf8').toString('base64'));
    const out = await this._readUntil(EOT, timeoutMs);
    return out.replace(/\r/g, '');
  }
  /** 関数の本体(return で値を返す JS)を評価し、その値を JSON で受け取る → {ok, value, error, raw}。
   *  REPL は結果を inspect して返す(文字列は "…" で囲まれることがある)ので、タグ付きの 1 行を探して読む */
  async js(body, { timeoutMs = this.timeoutMs } = {}) {
    let raw = '';
    try { raw = await this.evalJs(wrapJs(body), timeoutMs); } catch (e) { return { ok: false, value: null, error: String(e.message || e), raw }; }
    return parseTagged(raw);
  }
  close() { try { this.sock?.end(); } catch { /* ignore */ } }
}

/** 本体を包む: 値は SE_OK <json>、例外は SE_ERR <stack> の 1 行(undefined は null に) */
export function wrapJs(body) {
  return `(()=>{try{const __v=(()=>{${body}\n})();return "SE_OK "+JSON.stringify(__v===undefined?null:__v,(k,v)=>typeof v==="bigint"?String(v):v);}catch(e){return "SE_ERR "+String(e&&e.stack||e).slice(0,2000);}})()`;
}

/** REPL の出力 → {ok, value, error, raw}。最後の SE_OK / SE_ERR の行(引用符つきでも)を読む */
export function parseTagged(raw) {
  const lines = String(raw ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    let l = lines[i];
    if (l.startsWith('"') && /^"SE_(OK|ERR) /.test(l)) { try { l = JSON.parse(l); } catch { /* そのまま */ } }
    if (l.startsWith('SE_OK ')) { try { return { ok: true, value: JSON.parse(l.slice(6)), error: null, raw }; } catch (e) { return { ok: false, value: null, error: 'JSON: ' + e.message, raw }; } }
    if (l.startsWith('SE_ERR ')) return { ok: false, value: null, error: l.slice(7), raw };
  }
  return { ok: false, value: null, error: '応答にタグがありません: ' + String(raw ?? '').slice(0, 300), raw };
}

/** 繋いで認証してフレームに。失敗は例外 */
export async function openRepl({ host = '127.0.0.1', port = 25599, token = null, timeoutMs = 15_000 } = {}) {
  const r = new Repl(host, port, timeoutMs);
  await r.connect();
  await r.auth(token);
  await r.frame();
  return r;
}

// 読み取りのチェック(タグ付き文字列で結果を確実に拾う。0.3.0 から同じ)
const CHECKS = [
  { name: 'js_runtime', crux: true, code: '"SE_PROBE " + (typeof world) + " " + (typeof system)' },
  { name: 'local_player', code: '"SE_LP " + (()=>{try{const p=world.getLocalPlayer();return p?(p.name+" @ "+JSON.stringify(p.location)):"none";}catch(e){return "ERR:"+(e&&e.message||e);}})()' },
  { name: 'all_players', code: '"SE_PLAYERS " + (()=>{try{return world.getAllPlayers().length;}catch(e){return "ERR:"+(e&&e.message||e);}})()' },
  { name: 'game_version', code: '"SE_GAME " + (()=>{try{return (client&&client.status&&JSON.stringify(client.status()))||"?";}catch(e){return "ERR:"+(e&&e.message||e);}})()' },
  // 0.3.1 から: 入力注入の口が生えているか(0.3.0 では undefined)
  { name: 'input_injection', code: '"SE_INPUT " + (typeof globalThis.ScriptEval==="object"&&typeof ScriptEval.injectInput==="function" ? "function" : "ERR:none")' },
];

export async function runProbe({ host = '127.0.0.1', port = 25599, token = null } = {}) {
  const r = new Repl(host, port);
  const report = { reachable: false, authed: false, banner: null, version: null, checks: [], conclusions: {} };
  try {
    await r.connect();
    report.reachable = true;
  } catch (e) {
    report.error = String(e.message || e);
    return report;
  }
  try {
    report.banner = await r.auth(token);
    report.authed = true;
    report.version = /ScriptEval (\d+\.\d+\.\d+)/.exec(report.banner)?.[1] ?? null;
    await r.frame();
    for (const c of CHECKS) {
      try {
        const out = (await r.evalJs(c.code)).trim();
        const ok = /^"?SE_/.test(out) && !/ERR:/.test(out) && !/Error/.test(out);
        report.checks.push({ name: c.name, ok, crux: !!c.crux, detail: out.slice(0, 300) });
      } catch (e) {
        report.checks.push({ name: c.name, ok: false, crux: !!c.crux, detail: 'EXC ' + String(e.message || e) });
      }
    }
  } catch (e) {
    report.error = String(e.message || e);
  } finally {
    r.close();
  }
  const named = (n) => report.checks.find((c) => c.name === n)?.ok || false;
  report.conclusions = {
    js_runtime_runs_in_apk: report.authed && named('js_runtime'),
    read_local_world: named('local_player') || named('all_players'),
    // 0.3.0 は読み取り専用(injectInput は構造上無い)。0.3.1 は生えているか(実際に効くかは offsets 次第: features / world)
    input_injection_available: named('input_injection'),
  };
  return report;
}

export function summarize(report) {
  const L = [];
  if (!report.reachable) {
    L.push('scripteval REPL に接続できません(= まだ検証不能)。');
    L.push('  理由: ' + (report.error || '(不明)'));
    L.push('  多くは: mod_init が走っていない / REPL が立っていない / port 違い / MC がまだワールド外。');
    return L.join('\n');
  }
  if (!report.authed) { L.push('接続はできたが認証に失敗: ' + (report.error || '')); return L.join('\n'); }
  L.push('scripteval REPL 応答あり'); L.push('  banner: ' + (report.banner || '').replace(/\n/g, ' / '));
  for (const c of report.checks) L.push(`  ${c.ok ? '✔' : '✘'} ${c.name}${c.crux ? ' ★' : ''}  ${c.detail}`);
  const cc = report.conclusions;
  L.push('');
  L.push('結論(§6):');
  L.push('  素のAPK内でJSランタイムが動く               : ' + (cc.js_runtime_runs_in_apk ? 'はい' : 'いいえ/未確認'));
  L.push('  クライアントのワールドを読める               : ' + (cc.read_local_world ? 'はい' : 'いいえ/未確認(タイトル画面ならワールド外で当然)'));
  L.push('  入力注入 API(ScriptEval.injectInput)       : ' + (cc.input_injection_available ? `あり(${report.version || '?'}。効くかは offsets 次第)` : 'なし(0.3.0 は読み取り専用)'));
  return L.join('\n');
}

// ---------------- selftest: 偽REPL(実仕様を最小再現)----------------
// handle(code) → 結果の文字列(既定は版 0.3.1 の答え)。features.mjs の selftest もこれを使う
export function fakeRepl({ version = '0.3.1', handle } = {}) {
  const TOKEN = 'testtoken';
  const srv = net.createServer((sock) => {
    let authed = false, framed = false, bufs = Buffer.alloc(0);
    const prompt = () => (framed ? '\x04\n' : '> ');
    const banner = () => `ScriptEval ${version} REPL - Minecraft 1.26.52\nType .help for help.\n`;
    sock.on('data', (d) => {
      bufs = Buffer.concat([bufs, d]); let nl;
      while ((nl = bufs.indexOf(0x0a)) >= 0) {
        const line = bufs.subarray(0, nl).toString('utf8').replace(/\r$/, ''); bufs = bufs.subarray(nl + 1);
        if (!authed) {
          if (line.startsWith('#AUTH ') && line.slice(6) === TOKEN) { authed = true; sock.write(banner() + prompt()); }
          else { sock.write('ScriptEval REPL: authentication required.\n'); sock.end(); }
          continue;
        }
        if (line === '.frame') { framed = true; sock.write('framed mode\n' + prompt()); continue; }
        const code = line.startsWith('#B64 ') ? Buffer.from(line.slice(5), 'base64').toString('utf8') : line;
        let result = handle?.(code);
        if (result === undefined) {
          if (/typeof world/.test(code)) result = 'SE_PROBE object object';
          else if (/getLocalPlayer/.test(code)) result = 'SE_LP Steve @ {"x":1,"y":-60,"z":2}';
          else if (/getAllPlayers/.test(code)) result = 'SE_PLAYERS 1';
          else if (/client\.status/.test(code)) result = 'SE_GAME {"world":"ok"}';
          else if (/SE_INPUT/.test(code)) result = version === '0.3.0' ? 'SE_INPUT ERR:none' : 'SE_INPUT function';
          else result = 'undefined';
        }
        // (本物と同じく、文字列の結果は引用符つきで返ることがある)
        sock.write(JSON.stringify(result) + '\n' + prompt());
      }
    });
  });
  return new Promise((res) => srv.listen(0, '127.0.0.1', () => res({ srv, port: srv.address().port, token: TOKEN })));
}

async function selftest() {
  let bad = 0;
  const t = (name, ok) => { console.log(`${ok ? '✔' : '✘'} ${name}`); if (!ok) bad++; };
  const { srv, port, token } = await fakeRepl();
  const report = await runProbe({ port, token });
  console.log(summarize(report));
  t('probe: 読み取り + 版 0.3.1 + injectInput あり', report.conclusions.js_runtime_runs_in_apk && report.conclusions.read_local_world && report.conclusions.input_injection_available && report.version === '0.3.1');
  srv.close();
  const old = await fakeRepl({ version: '0.3.0' });
  const r0 = await runProbe({ port: old.port, token: old.token });
  t('probe: 0.3.0 は injectInput なし', r0.authed && r0.conclusions.input_injection_available === false && r0.version === '0.3.0');
  old.srv.close();
  // js(): 本体 → 値(引用符つき応答・例外・タグなし)
  t('parseTagged: 引用符つき SE_OK', parseTagged('"SE_OK {\\"a\\":1}"').value?.a === 1);
  t('parseTagged: console の後の SE_OK', parseTagged('log line\nSE_OK [1,2]').value?.[1] === 2);
  t('parseTagged: SE_ERR', parseTagged('"SE_ERR TypeError: x"').ok === false && /TypeError/.test(parseTagged('"SE_ERR TypeError: x"').error));
  t('parseTagged: タグなし', parseTagged('undefined').ok === false);
  const f = await fakeRepl({ handle: (code) => (/__selftest_sum/.test(code) ? 'SE_OK ' + JSON.stringify({ sum: 3 }) : undefined) });
  const repl = await openRepl({ port: f.port, token: f.token });
  const v = await repl.js('const __selftest_sum = 1 + 2; return { sum: __selftest_sum };');
  t('Repl.js: 値が JSON で戻る', v.ok && v.value?.sum === 3);
  // 何回呼んでも close の聞き手が溜まらない
  for (let i = 0; i < 15; i++) await repl.js('return 1;');
  t('Repl.js: 聞き手が溜まらない', repl.sock.listenerCount('close') <= 2);
  repl.close(); f.srv.close();
  console.log(bad ? `\nSELFTEST FAIL (${bad})` : '\nSELFTEST OK');
  return bad ? 1 : 0;
}

function parseArgs(a) { const o = {}; for (let i = 0; i < a.length; i++) { const k = a[i]; if (k === '--selftest') o.selftest = true; else if (k.startsWith('--')) o[k.slice(2)] = a[++i]; } return o; }

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.selftest) return selftest();
  const report = await runProbe({ host: o.host || '127.0.0.1', port: Number(o.port) || 25599, token: o.token || process.env.SCRIPTEVAL_TOKEN || null });
  console.log(summarize(report));
  if (o.out) fs.writeFileSync(o.out, JSON.stringify(report, null, 2));
  return 0; // 「まだ繋がらない」は想定内。CI を赤くしない。
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().then((c) => process.exit(c || 0));
