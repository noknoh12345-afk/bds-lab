// /spectral:say — kana read aloud in the game by the bank's voice, the way MIDI is played (src/notes.ts): a mora a note of its
// unit, placed by its vowel, its pitch by setPitch. The game has no dictionary, so only kana (and ー ッ ン, punctuation, spaces)
// are read; text with kanji is made into a speech song by tools/speech.py (Open JTalk's accents) or the converter page.
// The melody is Tokyo-like without a dictionary: each phrase (between spaces and punctuation) starts low and stays high, a
// little lower than the phrase before; a sentence's last mora falls, a question's rises.
import { VOICES } from './bank';
import { NoteSong, Notes, NOTES_FORMAT } from './notes';

const SMALL = 'ャュョァィゥェォ';
const FIX: Record<string, string> = { 'ヂ': 'ジ', 'ヅ': 'ズ', 'ヲ': 'オ', 'ヴ': 'ブ', 'ヴァ': 'バ', 'ヴィ': 'ビ', 'ヴェ': 'ベ', 'ヴォ': 'ボ', 'ヰ': 'イ', 'ヱ': 'エ',
  'シェ': 'セ', 'ジェ': 'ゼ', 'チェ': 'テ', 'イェ': 'エ', 'ツァ': 'チャ', 'ツィ': 'チ', 'ツェ': 'テ', 'ツォ': 'チョ' };
const VOWEL_OF: Record<string, string> = {};
for (const [v, row] of [['ア', 'アカガサザタダナハバパマヤラワャァ'], ['イ', 'イキギシジチヂニヒビピミリィ'], ['ウ', 'ウクグスズツヅヌフブプムユルュゥ'],
  ['エ', 'エケゲセゼテデネヘベペメレェ'], ['オ', 'オコゴソゾトドノホボポモヨロヲョォ']] as [string, string][]) for (const c of row) VOWEL_OF[c] = v;

export interface Mora { kana: string; long: number; pause: number; gem: boolean; phraseStart: boolean; }

/** the morae of a kana text; `skipped`: characters that are not kana (kanji, letters) */
export function kanaMorae(text: string): { morae: Mora[]; skipped: number; question: boolean } {
  const kata = [...text].map((c) => { const x = c.charCodeAt(0); return x >= 0x3041 && x <= 0x3096 ? String.fromCharCode(x + 0x60) : c; }).join('');
  const morae: Mora[] = []; let skipped = 0, start = true, gem = false;
  const chars = [...kata];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === 'ー' || c === '〜' || c === '~') { if (morae.length) morae[morae.length - 1].long++; continue; }
    if (c === 'ッ') { gem = true; continue; }
    if ('、，,'.includes(c)) { if (morae.length) morae[morae.length - 1].pause = Math.max(morae[morae.length - 1].pause, 220); start = true; continue; }
    if ('。．.！!？?'.includes(c)) { if (morae.length) morae[morae.length - 1].pause = Math.max(morae[morae.length - 1].pause, 420); start = true; continue; }
    if (c === ' ' || c === '　') { start = true; continue; }
    if (c >= 'ァ' && c <= 'ヺ') {
      let k = c;
      if (i + 1 < chars.length && SMALL.includes(chars[i + 1]) && !SMALL.includes(c)) { k = c + chars[i + 1]; i++; }
      if (SMALL.includes(k)) k = String.fromCharCode(k.charCodeAt(0) + 1);          // a lone small kana: its big one
      morae.push({ kana: FIX[k] ?? k, long: 0, pause: 0, gem, phraseStart: start });
      start = false; gem = false;
      continue;
    }
    skipped++;
  }
  return { morae, skipped, question: /[？?]\s*$/.test(text) };
}

/** a speech song of the kana text for voice v (VOICES[v]); undefined when there is nothing to say */
export function saySong(text: string, v = 0, moraMs = 180, range = 4): { song: NoteSong; skipped: number } | undefined {
  const voice = VOICES[v]; if (!voice) return undefined;
  const { morae, skipped, question } = kanaMorae(text);
  if (!morae.length) return undefined;
  const idx = new Map(voice.units.map((u, i) => [u, i] as [string, number]));
  const unitOf = (k: string) => idx.get(k) ?? idx.get(k[0]) ?? idx.get(VOWEL_OF[k[k.length - 1]] ?? '');
  const on: number[] = [], dur: number[] = [], key: number[] = [], vel: number[] = [], cents: number[] = [], held: boolean[] = [];
  let t = 300, reg = 0, pos = 0;
  for (let i = 0; i < morae.length; i++) {
    const m = morae[i];
    if (m.phraseStart && i > 0) { reg = morae[i - 1].pause ? Math.max(-1, reg - 0.6) : reg - 0.8; pos = 0; }
    pos++;
    if (m.gem) t += moraMs * 0.9;
    const u = unitOf(m.kana);
    const len = moraMs * (1 + m.long);
    const last = i === morae.length - 1 || morae[i].pause >= 420;
    let semis = reg + (pos > 1 ? range / 2 : -range / 2);
    if (last) semis = question ? reg + range : reg - range / 2 - 2;
    if (u !== undefined) {
      const pre = voice.pre[u];
      on.push(t - pre); dur.push(len + pre + (m.pause ? 40 : 25)); key.push(u); vel.push(100); cents.push(Math.round(semis * 100));
      held.push(m.pause === 0);
    }
    t += len + m.pause;
  }
  // (a mora's vowel stops as the next one's consonant starts, 10 ms of crossfade: left under the next /s/ /k/ /t/ it blurs it —
  //  Whisper read the units' speech 0.26 of the characters wrong so, about 0.7-1.2 without: tools/speech.py)
  for (let i = 0; i + 1 < on.length; i++) if (held[i]) dur[i] = Math.max(40, on[i + 1] - on[i] + 10);
  const t0 = Math.min(...on);
  const dec: Notes = { n: on.length, on: Float64Array.from(on.map((x) => x - t0)), dur: Float32Array.from(dur), key: Uint8Array.from(key),
    vel: Uint8Array.from(vel), prog: new Uint8Array(on.length), cents: Int16Array.from(cents) };
  const seconds = (Math.max(...on.map((x, i) => x - t0 + dur[i]))) / 1000;
  return { song: { meta: { format: NOTES_FORMAT, id: 'say', title: text.slice(0, 40), seconds, notes: on.length, programs: [200 + v] }, dec }, skipped };
}
