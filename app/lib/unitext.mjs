// Text that `adb shell input text` cannot type: anything outside printable ASCII (a song text in CJK characters, a chat line
// in Japanese). `input text` turns each character into key presses of the virtual keyboard's map, which has none for them.
// Instead an input method that takes its text from a broadcast — ADBKeyBoard (GPL-2.0, github.com/senzhk/ADBKeyBoard) — is
// switched in for the typing and the device's own keyboard back after it: its commitText reaches the field the way a paste from
// a keyboard's clipboard does. The APK is fetched at a pinned commit and checked by its hash; it is never kept in this repository.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export const ADB_IME = {
  id: 'com.android.adbkeyboard/.AdbIME',
  url: 'https://raw.githubusercontent.com/senzhk/ADBKeyBoard/d7b27288bc8c1c8348a79ea6896bd7352c30a9fc/ADBKeyboard.apk',
  sha256: 'e698adea5633135a067b038f9a0cf41baa4de09888713a81593fb2b9682cdc59',
};
/** true when `input text` cannot type it (outside printable ASCII) */
export const needsIme = (t) => /[^\x20-\x7e]/.test(String(t));
/** the text in pieces of at most `max` characters (whole code points), each as the broadcast's base64 of its UTF-8 */
export function b64Chunks(text, max = 1500) {
  const cps = Array.from(String(text)), out = [];
  for (let i = 0; i < cps.length; i += max) out.push(Buffer.from(cps.slice(i, i + max).join(''), 'utf8').toString('base64'));
  return out;
}
/** the APK on disk (APP_ADB_IME_APK, else fetched once into the temp folder), its hash checked */
export async function imeApk({ file = process.env.APP_ADB_IME_APK, dir = path.join(os.tmpdir(), 'lab-adb-ime'), fetchImpl = globalThis.fetch } = {}) {
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
  if (file) {
    if (sha(fs.readFileSync(file)) !== ADB_IME.sha256) throw new Error(`${file} は ADBKeyBoard の決まった版ではありません（sha256 が違う）`);
    return file;
  }
  const f = path.join(dir, `ADBKeyboard-${ADB_IME.sha256.slice(0, 12)}.apk`);
  if (fs.existsSync(f) && sha(fs.readFileSync(f)) === ADB_IME.sha256) return f;
  const r = await fetchImpl(ADB_IME.url);
  if (!r.ok) throw new Error(`ADBKeyBoard を取れませんでした（HTTP ${r.status}）: ${ADB_IME.url}`);
  const b = Buffer.from(await r.arrayBuffer());
  if (sha(b) !== ADB_IME.sha256) throw new Error(`取った ADBKeyBoard の sha256 が違います（${sha(b).slice(0, 16)}…）: 使いません`);
  fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(f, b);
  return f;
}
const ready = new WeakMap();   // adb → { prev: the device's own input method }
/** types `text` into the focused field through the broadcast input method; returns how it went (for the step's line) */
export async function typeWithIme(adb, text, { sleep = (ms) => new Promise((r) => setTimeout(r, ms)), apk = imeApk } = {}) {
  let st = ready.get(adb);
  if (!st) {
    const listed = adb.shell(['pm', 'list', 'packages', 'com.android.adbkeyboard']);
    if (!/package:com\.android\.adbkeyboard\b/.test(listed.stdout)) {
      const r = adb.run(['install', '-r', '-g', await apk()], { timeout: 180_000 });
      if (r.status !== 0 || !/Success/.test(r.stdout + r.stderr)) throw new Error(`ADBKeyBoard を入れられませんでした: ${(r.stderr || r.stdout).trim().slice(0, 160)}`);
    }
    adb.shell(['ime', 'enable', ADB_IME.id]);
    const prev = adb.shell(['settings', 'get', 'secure', 'default_input_method']).stdout.trim();
    st = { prev: prev && prev !== 'null' && prev !== ADB_IME.id ? prev : '' };
    ready.set(adb, st);
  }
  // (switched in while the field has the focus: the field binds to it — then each piece is committed as it comes)
  const set = adb.shell(['ime', 'set', ADB_IME.id]);
  if (set.status !== 0) throw new Error(`ADBKeyBoard に切り替えられませんでした: ${(set.stderr || set.stdout).trim().slice(0, 160)}`);
  await sleep(1200);
  const pieces = b64Chunks(text);
  try {
    for (const b of pieces) {
      const r = adb.shell(['am', 'broadcast', '-a', 'ADB_INPUT_B64', '--es', 'msg', b], { timeout: 60_000 });
      if (r.status !== 0 || !/Broadcast completed/.test(r.stdout)) throw new Error(`文字を送れませんでした: ${(r.stderr || r.stdout).trim().slice(0, 160)}`);
      await sleep(200);
    }
    await sleep(500);
  } finally {
    // (the device's own keyboard back: the rest of the run sees the screens it was written for)
    if (st.prev) adb.shell(['ime', 'set', st.prev]); else adb.shell(['ime', 'reset']);
    await sleep(800);
  }
  return `入力メソッド経由で ${pieces.length} 回`;
}
