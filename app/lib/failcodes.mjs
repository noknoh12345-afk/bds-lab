// failcodes: why a step failed, as one word of a fixed list — what a public repository's summary may say about a failure
// (its message carries screen text, log lines, names: those stay sealed). A run read from a phone, an AI without the
// vault's key, or the panel then still knows where to look: "line 14 join-lan-missing" instead of "line 14".
// Pure: the step's own message in, a code out (never any part of the message).

/** a failed step's message → its code (the first rule that matches; 'other' for none) */
export const STEP_CODES = [
  [/LAN のワールドに焦点が移らない/, 'join-lan-focus'],
  [/LAN のワールドが出ない（PLAY を開き直した: (\d+) 回）/, 'join-lan-missing'],
  [/LAN のワールドが出ない/, 'join-lan-missing'],
  [/タイトルの Play が押せません/, 'join-title-play'],
  [/ゲームが参加をやめました/, 'join-refused'],
  [/参加用のリンク/, 'join-link'],
  [/サーバーはプレイヤーを出しました/, 'joined-app-loading'],
  [/サーバーには接続したが/, 'joined-not-in-world'],
  [/サーバーに接続が来ていません/, 'joined-no-connection'],
  [/タイトル画面になりません/, 'title-timeout'],
  [/真っ黒/, 'screen-black'],
  // (where it kept moving: its box in px, the share that changed and which of a 4 x 3 grid — scenario.mjs moveBox)
  [/画面が落ち着きません（動き続けた所: (\d+),(\d+)–(\d+),(\d+) px・([\d.]+)%・格子 ([01.]+)）/, 'stable-moving'],
  [/画面が落ち着きません/, 'stable-timeout'],
  [/測る画面がありません/, 'measure-no-shot'],
  [/基準の shot world を撮ったときと/, 'measure-size-mismatch'],
  [/^測れません/, 'measure-failed'],
  [/画面が開いていません/, 'changed-too-little'],
  [/画面に \/.*\/ の文字が(?:見つかりません|ありません|出ません)/, 'text-missing'],
  [/画面にあってはいけない文字があります/, 'text-present'],
  [/の行がありません|コンテンツログに .* があり/, 'log-missing'],
  [/あってはいけない行があります/, 'log-present'],
  [/サーバーがエラーを返しました/, 'server-error'],
  [/画面を変えられませんでした/, 'size-failed'],
  [/キーを押せませんでした/, 'key-failed'],
  [/アプリが動いていません|落ちた/, 'app-died'],
  [/時間切れ|ミリ秒待ちました/, 'timeout'],
];
export function stepCode(note) {
  const n = String(note ?? '');
  for (const [re, code] of STEP_CODES) { const m = re.exec(n); if (m) return m.length > 1 ? `${code} ${m.slice(1).join('/')}` : code; }
  return 'other';
}

/** a measure's why (bds/geoui/calib.mjs and lib/measure.mjs say it in fixed forms) → its code, with the counts it gives
 *  (numbers only): 'few-marks 4', 'no-grid', 'few-rows 7/2/3' … ('other' for none) */
export const MEASURE_CODES = [
  [/^only (\d+) square marks/, 'few-marks'],
  [/^no grid of equally spaced squares/, 'no-grid'],
  [/^none of the red, green or blue markers/, 'no-anchor'],
  [/^only (\d+) grid markers in their own colour/, 'few-colour'],
  [/^only (\d+) grid markers in (\d+) columns and (\d+) rows/, 'few-rows'],
  [/^the squares found are ([\d.]+) units wide/, 'wrong-size'],
  [/^比べる `shot world` がありません/, 'no-baseline'],
  [/^大きさが違います/, 'size-mismatch'],
  [/^測る途中で止まりました/, 'crashed'],
  [/^知らない測り方/, 'unknown-kind'],
];
export function measureCode(why) {
  const w = String(why ?? '');
  for (const [re, code] of MEASURE_CODES) { const m = re.exec(w); if (m) return m.length > 1 ? `${code} ${m.slice(1).join('/')}` : code; }
  return 'other';
}
/** a code as summary.json may hold it (a word of the lists above, and numbers): anything else is dropped (pure) */
export const cleanCode = (c) => (typeof c === 'string' && /^[a-z][a-z-]{1,30}( [\d./]{1,48})?$/.test(c) ? c : null);
