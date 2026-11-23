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

const VL: Record<string, string> = { 'ア': 'a', 'イ': 'i', 'ウ': 'u', 'エ': 'e', 'オ': 'o' };
/** a mora's vowel as a VCV voice names it (a i u e o), '' for ン */
const vlOf = (kana: string) => VL[VOWEL_OF[kana[kana.length - 1]] ?? ''] ?? '';

/** VCV (tools/samples/voice.py --vcv): the voices made of voice v's units as they come after each vowel — '' (from silence: v
 *  itself), a i u e o, n (after ン) → index in VOICES */
function vcvSet(v: number): Map<string, number> | undefined {
  const base = VOICES[v]?.base; if (!base) return undefined;
  const m = new Map<string, number>();
  VOICES.forEach((x, i) => { if (x.base === base) m.set(x.after ?? '', i); });
  return m;
}

/** a speech song of the kana text for voice v (VOICES[v]); undefined when there is nothing to say. A VCV voice: each mora the unit
 *  made after the vowel before it, a vowel the same as the one before held on by the unit before (no new attack: サーバー was heard
 *  「さぁ、ワー」), the melody `range` 1 semitone (natural-pitch units: 2 made Whisper's reading worse), each unit stopped where the
 *  next starts (its 40 ms release the crossfade). Whisper on 20 sentences: 0.30-0.35 of the characters wrong, CV units 0.45-0.52 */
export function saySong(text: string, v = 0, moraMs = 180, range?: number): { song: NoteSong; skipped: number } | undefined {
  const voice = VOICES[v]; if (!voice) return undefined;
  const { morae, skipped, question } = kanaMorae(text);
  if (!morae.length) return undefined;
  const set = vcvSet(v);
  const rng = range ?? (set ? 1 : 4), k = rng / 4;
  const idxOf = new Map<number, Map<string, number>>();
  const unitIn = (vi: number, kana: string) => {
    let idx = idxOf.get(vi);
    if (!idx) { idx = new Map(VOICES[vi].units.map((u, i) => [u, i] as [string, number])); idxOf.set(vi, idx); }
    return idx.get(kana) ?? (kana.length > 1 ? idx.get(kana[0]) : undefined);
  };
  const unitOf = (vi: number, k: string) => unitIn(vi, k) ?? unitIn(vi, VOWEL_OF[k[k.length - 1]] ?? '');
  const programs: number[] = [], progOf = new Map<number, number>();
  const prog = (vi: number) => { let p = progOf.get(vi); if (p === undefined) { p = programs.length; programs.push(200 + vi); progOf.set(vi, p); } return p; };
  const on: number[] = [], dur: number[] = [], key: number[] = [], vel: number[] = [], cents: number[] = [], held: boolean[] = [], pg: number[] = [];
  let t = 300, reg = 0, pos = 0, pv = '';
  for (let i = 0; i < morae.length; i++) {
    const m = morae[i];
    if (m.phraseStart && i > 0) { reg = morae[i - 1].pause ? Math.max(-k, reg - 0.6 * k) : reg - 0.8 * k; pos = 0; }
    pos++;
    if (m.gem) { t += moraMs * 0.9; pv = ''; }
    const len = moraMs * (1 + m.long);
    const last = i === morae.length - 1 || morae[i].pause >= 420;
    let semis = reg + (pos > 1 ? rng / 2 : -rng / 2);
    if (last) semis = question ? reg + rng : reg - rng / 2 - 2 * k;
    if (set && pv && on.length && 'アイウエオ'.includes(m.kana) && vlOf(m.kana) === pv && !m.phraseStart) {
      t += len + m.pause;                                                  // (the same vowel again: held by the unit before)
      if (m.pause) pv = '';
      continue;
    }
    let vi = v, u: number | undefined;
    if (set) {
      for (const ctx of pv ? [pv, ''] : ['']) { const x = set.get(ctx); if (x === undefined) continue; u = unitOf(x, m.kana); if (u !== undefined) { vi = x; break; } }
    } else u = unitOf(v, m.kana);
    if (u !== undefined) {
      const pre = VOICES[vi].pre[u];
      on.push(t - pre); dur.push(len + pre + (m.pause ? 40 : 25)); key.push(u); vel.push(100); cents.push(Math.round(semis * 100));
      held.push(m.pause === 0); pg.push(prog(vi));
    }
    t += len + m.pause;
    pv = m.pause ? '' : m.kana === 'ン' ? 'n' : (vlOf(m.kana) || pv);
  }
  // (a mora's vowel stops as the next one's consonant starts, 10 ms of crossfade: left under the next /s/ /k/ /t/ it blurs it —
  //  Whisper read the units' speech 0.26 of the characters wrong so, about 0.7-1.2 without: tools/speech.py. VCV: it stops where
  //  the next unit starts, which already holds the end of its vowel)
  const cut = set ? 0 : 10;
  for (let i = 0; i + 1 < on.length; i++) if (held[i]) dur[i] = Math.max(40, on[i + 1] - on[i] + cut);
  if (!on.length) return undefined;
  const t0 = Math.min(...on);
  const dec: Notes = { n: on.length, on: Float64Array.from(on.map((x) => x - t0)), dur: Float32Array.from(dur), key: Uint8Array.from(key),
    vel: Uint8Array.from(vel), prog: Uint8Array.from(pg), cents: Int16Array.from(cents) };
  const seconds = (Math.max(...on.map((x, i) => x - t0 + dur[i]))) / 1000;
  return { song: { meta: { format: NOTES_FORMAT, id: 'say', title: text.slice(0, 40), seconds, notes: on.length, programs }, dec }, skipped };
}
