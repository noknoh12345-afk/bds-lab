// studio.mjs — scripteval の Studio(ブラウザ IDE、:25600)をこのホストの Chrome で開き、0.3.1 で足された「操作」タブを撮る。
// 見た目の最終確認(COMPLETE.md の残り③)。ベストエフォート: Chrome が無い・開けない時は理由を記録して先へ(run は赤くしない)。
//
//   - Studio の URL は token を含む(session ごと)。REPL で client.studio(false) が返す。token はログに出さない(伏せる)。
//   - 端末の :25600 は adb forward で host の 127.0.0.1:25600 から届く(scripteval.mjs が張る)。
//   - playwright-core はラボの app/.lab/browser/pw に一度だけ入る(lib/playwright-login.mjs の loadPlaywright)。GitHub の
//     ubuntu-latest には Chrome があり、無ければ Chromium を取る。ヘッドレスで開き、「操作」タブを押して撮る。
//
//   node studio.mjs --selftest     端末不要: URL から token を伏せる・host 向けに直す純粋関数だけ
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Studio の URL(token つき)→ host から届く URL に。studioBind が 0.0.0.0 等でも 127.0.0.1 にする(forward 先) */
export function hostStudioUrl(url, localPort = 25600) {
  try {
    const u = new URL(String(url).trim());
    u.hostname = '127.0.0.1';
    u.port = String(localPort);
    return u.toString();
  } catch { return null; }
}

/** ログ用: URL の token(query や #)を伏せる */
export function scrubUrl(url) {
  return String(url ?? '').replace(/([?&#](?:token|t|key|auth)=)[^&#\s]+/gi, '$1***').replace(/\b[0-9a-fA-F]{24,}\b/g, '<tok>');
}

/** 実機: REPL から Studio URL を取り、host の Chrome で開いて「操作」タブを撮る → {ok, shots:[...], url, error} */
export async function captureStudio({ repl, outDir, localPort = 25600, labDir, log = () => {} }) {
  const out = { ok: false, shots: [] };
  const got = await repl.js('try { return client.studio(false); } catch (e) { return "ERR:" + (e && e.message || e); }');
  const raw = typeof got.value === 'string' ? got.value : '';
  const m = /(https?:\/\/\S+)/.exec(raw);
  if (!m) { out.error = 'Studio の URL を取れません: ' + (got.error || raw).slice(0, 120); return out; }
  const url = hostStudioUrl(m[1], localPort);
  if (!url) { out.error = 'Studio の URL を解せません'; return out; }
  out.url = scrubUrl(url);
  log('Studio を開きます: ' + out.url);
  let pw, dir, browser;
  try { ({ pw, dir } = (await import('../../lib/playwright-login.mjs')).loadPlaywright(labDir, { log })); }
  catch (e) { out.error = 'playwright を用意できません: ' + String(e.message || e).slice(0, 160); return out; }
  try {
    const tries = [{ channel: 'chrome' }, { channel: 'msedge' }, {}];
    for (const t of tries) {
      try { browser = await pw.chromium.launch({ headless: true, args: ['--no-sandbox'], ...t }); break; } catch { /* 次 */ }
    }
    if (!browser) {
      const { spawnSync } = await import('node:child_process');
      spawnSync(process.execPath, [path.join(dir, 'node_modules', 'playwright-core', 'cli.js'), 'install', 'chromium'], { encoding: 'utf8' });
      browser = await pw.chromium.launch({ headless: true, args: ['--no-sandbox'] });
    }
    const page = await browser.newPage({ viewport: { width: 1200, height: 860 } });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await sleep(1500);
    const s1 = path.join(outDir, 'studio-open.png');
    await page.screenshot({ path: s1 }); out.shots.push(path.basename(s1));
    // 「操作」タブを押す(無ければ撮るだけで ok)
    const tab = page.getByRole('tab', { name: '操作' });
    if (await tab.count().catch(() => 0)) {
      await tab.first().click({ timeout: 5000 }).catch(() => {});
      await sleep(1200);
      const s2 = path.join(outDir, 'studio-agent-tab.png');
      await page.screenshot({ path: s2 }); out.shots.push(path.basename(s2));
      out.agentTab = true;
    } else {
      out.agentTab = false;
      out.error = '「操作」タブが見当たりません(撮影は open のみ)';
    }
    out.ok = out.shots.length > 0;
  } catch (e) {
    out.error = (out.error ? out.error + ' / ' : '') + String(e.message || e).slice(0, 200);
  } finally {
    try { await browser?.close(); } catch { /* ignore */ }
  }
  return out;
}

// ---------------- selftest(端末不要: 純粋関数のみ。実ブラウザは本番で)----------------
function selftest() {
  let bad = 0;
  const t = (name, ok) => { console.log(`${ok ? '✔' : '✘'} ${name}`); if (!ok) bad++; };
  t('hostStudioUrl: host:port を 127.0.0.1:25600 に', hostStudioUrl('http://0.0.0.0:25600/?token=abc123', 25600) === 'http://127.0.0.1:25600/?token=abc123');
  t('hostStudioUrl: 別ポートも', /:25611\//.test(hostStudioUrl('http://127.0.0.1:25600/#t=x', 25611) || ''));
  t('hostStudioUrl: 壊れた URL は null', hostStudioUrl('not a url') === null);
  t('scrubUrl: token= を伏せる', !scrubUrl('http://h/?token=deadbeefdeadbeef').includes('deadbeef'));
  t('scrubUrl: 長い16進を伏せる', scrubUrl('http://h/#0123456789abcdef0123456789').includes('<tok>'));
  console.log(bad ? `\nSELFTEST FAIL (${bad})` : '\nSELFTEST OK');
  return bad ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--selftest')) process.exit(selftest());
  else { console.log('使い方: node studio.mjs --selftest(実機は scripteval.mjs から)'); process.exit(0); }
}
