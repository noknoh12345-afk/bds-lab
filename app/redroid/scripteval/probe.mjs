// scripteval の REPL(素のMinecraft APKに注入した libscripteval.so が開く TCP サーバ)に
// 正しいプロトコルで話しかけ、「読み取り専用の JS ランタイムが APK 内で動いているか」を確かめる診断。
//
// これは注入しない。注入(Frida Module.load → mod_init)が済んだ後に呼ばれる。
// scripteval 0.3.0 のソースで確認した実仕様に厳密に合わせてある:
//   - TCP。既定ポート 25599、bind 127.0.0.1(config.json の replPort/replBind)。
//   - 接続後まず認証: `#AUTH <token>\n`(token は <dataDir>/session.token、起動ごとに変わる)。
//     既定 dataDir(Android)= /data/data/com.mojang.minecraftpe/scripteval 。
//   - 認証が通るとバナー(`ScriptEval <ver> REPL - Minecraft <game>\n...\n> `)。`> ` で終わる。
//   - `.frame\n` を送るとフレーム応答に切替(以後の各応答は `\x04\n` 終端)。
//   - 評価は `#B64 <base64(js)>\n`。応答は `<出力><結果>\n\x04\n`。
//   - scripteval は読み取り専用(prelude は "read-only"、teleport は NotSupportedOnClientError を投げる)。
//     操作系 API(injectInput 等)は 0.3.0 には無い。ここでは読み取りだけを確かめる。
//
//   node probe.mjs --selftest                        端末不要。偽REPLでプロトコル配線を実走検証
//   node probe.mjs --port 25599 --token <tok> [--out report.json]
import net from 'node:net';
import fs from 'node:fs';

const EOT = Buffer.from([0x04, 0x0a]); // framed 応答の終端

class Repl {
  constructor(host = '127.0.0.1', port = 25599, timeoutMs = 10_000) {
    Object.assign(this, { host, port, timeoutMs });
    this.buf = Buffer.alloc(0);
    this.sock = null;
  }
  connect() {
    return new Promise((resolve, reject) => {
      const s = net.createConnection({ host: this.host, port: this.port });
      const to = setTimeout(() => { s.destroy(); reject(new Error(`接続タイムアウト ${this.host}:${this.port}`)); }, this.timeoutMs);
      s.once('connect', () => { clearTimeout(to); this.sock = s; s.on('data', (d) => { this.buf = Buffer.concat([this.buf, d]); this._pump?.(); }); resolve(this); });
      s.once('error', (e) => { clearTimeout(to); reject(e); });
    });
  }
  _readUntil(markers) { // markers: Buffer か [Buffer,..]。最初に現れたものまでを返す
    const ms = Array.isArray(markers) ? markers : [markers];
    return new Promise((resolve, reject) => {
      const to = setTimeout(() => { this._pump = null; reject(new Error('応答タイムアウト')); }, this.timeoutMs);
      const tryMatch = () => {
        for (const m of ms) {
          const i = this.buf.indexOf(m);
          if (i >= 0) { const out = this.buf.subarray(0, i).toString('utf8'); this.buf = this.buf.subarray(i + m.length); clearTimeout(to); this._pump = null; resolve(out); return true; }
        }
        return false;
      };
      this._pump = tryMatch;
      if (!tryMatch()) { this.sock.once('close', () => { clearTimeout(to); this._pump = null; reject(new Error('接続が閉じられました')); }); }
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
  async evalJs(code) {
    if (!this.framed) throw new Error('frame() を先に呼ぶこと');
    this.send('#B64 ' + Buffer.from(code, 'utf8').toString('base64'));
    const out = await this._readUntil(EOT);
    return out.replace(/\r/g, '');
  }
  close() { try { this.sock?.end(); } catch { /* ignore */ } }
}

// 読み取り専用チェック(タグ付き文字列で結果を確実に拾う)
const CHECKS = [
  { name: 'js_runtime', crux: true, code: '"SE_PROBE " + (typeof world) + " " + (typeof system)' },
  { name: 'local_player', code: '"SE_LP " + (()=>{try{const p=world.getLocalPlayer();return p?(p.name+" @ "+JSON.stringify(p.location)):"none";}catch(e){return "ERR:"+(e&&e.message||e);}})()' },
  { name: 'all_players', code: '"SE_PLAYERS " + (()=>{try{return world.getAllPlayers().length;}catch(e){return "ERR:"+(e&&e.message||e);}})()' },
  { name: 'game_version', code: '"SE_GAME " + (()=>{try{return (client&&client.status&&JSON.stringify(client.status()))||"?";}catch(e){return "ERR:"+(e&&e.message||e);}})()' },
];

export async function runProbe({ host = '127.0.0.1', port = 25599, token = null } = {}) {
  const r = new Repl(host, port);
  const report = { reachable: false, authed: false, banner: null, checks: [], conclusions: {} };
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
    // 0.3.0 は読み取り専用 ⇒ 入力注入は構造上存在しない(事実として明記)
    input_injection_available: false,
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
  L.push('  素のAPK内で(読み取り専用)JSランタイムが動く : ' + (cc.js_runtime_runs_in_apk ? 'はい' : 'いいえ/未確認'));
  L.push('  クライアントのワールドを読める               : ' + (cc.read_local_world ? 'はい' : 'いいえ/未確認'));
  L.push('  入力注入(操作)API                           : なし(0.3.0 は読み取り専用。操作には injectInput 追加が必要)');
  return L.join('\n');
}

// ---------------- selftest: 偽REPL(実仕様を最小再現)----------------
function fakeRepl() {
  const TOKEN = 'testtoken';
  const srv = net.createServer((sock) => {
    let authed = false, framed = false, bufs = Buffer.alloc(0);
    const prompt = () => (framed ? '\x04\n' : '> ');
    const banner = () => `ScriptEval 0.3.0 REPL - Minecraft 1.21.0.0\nType .help for help.\n`;
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
        let code = line.startsWith('#B64 ') ? Buffer.from(line.slice(5), 'base64').toString('utf8') : line;
        let result = '';
        if (/typeof world/.test(code)) result = 'SE_PROBE object object';
        else if (/getLocalPlayer/.test(code)) result = 'SE_LP Steve @ {"x":1,"y":-60,"z":2}';
        else if (/getAllPlayers/.test(code)) result = 'SE_PLAYERS 1';
        else if (/client\.status/.test(code)) result = 'SE_GAME {"world":"ok"}';
        else result = 'undefined';
        sock.write(result + '\n' + prompt());
      }
    });
  });
  return new Promise((res) => srv.listen(0, '127.0.0.1', () => res({ srv, port: srv.address().port, token: TOKEN })));
}

async function selftest() {
  const { srv, port, token } = await fakeRepl();
  const report = await runProbe({ port, token });
  srv.close();
  console.log(summarize(report));
  const ok = report.conclusions.js_runtime_runs_in_apk && report.conclusions.read_local_world;
  console.log(ok ? '\nSELFTEST OK' : '\nSELFTEST FAIL');
  return ok ? 0 : 1;
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

if (import.meta.url === `file://${process.argv[1]}`) main().then((c) => process.exit(c || 0));
