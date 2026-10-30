// What the game on the device plays, recorded on this machine: scrcpy captures the device's audio output (Android 11+,
// AudioPlaybackCapture — no root, nothing changed in the game) into a WAV file. app.txt: `audio start [name]` … `audio stop`
// → audio/<name>.wav in the run folder. Written for bds/addons/spectral's measurement rig (tools/rig); UNTESTED on a real
// device when it was written (the session that wrote it had no game): the first run tells whether redroid's audio path lets
// AudioPlaybackCapture hear the game.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const VERSION = process.env.SCRCPY_VERSION || '3.1';

/** scrcpy to use: $SCRCPY, one on PATH, or a release downloaded once into <lab>/.lab-tools/scrcpy-<version>/ */
export function scrcpyBin(labDir) {
  if (process.env.SCRCPY) return process.env.SCRCPY;
  const onPath = spawnSync('sh', ['-c', 'command -v scrcpy'], { encoding: 'utf8' }).stdout.trim();
  if (onPath) {
    // (Ubuntu's scrcpy 1.x has no audio: needs 2.1 or later)
    const v = spawnSync(onPath, ['--version'], { encoding: 'utf8' }).stdout;
    const m = /scrcpy (\d+)\.(\d+)/.exec(v);
    if (m && (Number(m[1]) > 2 || (Number(m[1]) === 2 && Number(m[2]) >= 1))) return onPath;
  }
  const dir = path.join(labDir, '.lab-tools', `scrcpy-${VERSION}`);
  const bin = path.join(dir, 'scrcpy');
  if (fs.existsSync(bin)) return bin;
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('scrcpy 2.1 以上を入れてください（SCRCPY=<パス> でも指定できます）');
  fs.mkdirSync(dir, { recursive: true });
  const url = `https://github.com/Genymobile/scrcpy/releases/download/v${VERSION}/scrcpy-linux-x86_64-v${VERSION}.tar.gz`;
  const tgz = path.join(dir, 'scrcpy.tgz');
  const r = spawnSync('curl', ['-sSfL', '-m', '300', '-o', tgz, url], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`scrcpy を取れません: ${url}`);
  spawnSync('tar', ['-xzf', tgz, '-C', dir, '--strip-components=1'], { stdio: 'inherit' });
  if (!fs.existsSync(bin)) throw new Error(`scrcpy の展開に失敗しました（${dir}）`);
  return bin;
}

/** starts recording; → a handle for stop(). out: a .wav path. */
export function start({ adb, out, labDir }) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const bin = scrcpyBin(labDir);
  const args = ['--serial', adb.serial, '--no-video', '--no-control', '--no-playback', '--no-window',
    '--audio-source=output', '--audio-codec=raw', `--record=${out}`];
  const env = { ...process.env, ADB: adb.bin };
  const child = spawn(bin, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  return { child, out, began: Date.now(), log: () => log };
}

/** stops it (SIGINT: scrcpy closes the file properly) and checks the file; → { file, seconds } */
export async function stop(h) {
  if (h.child.exitCode === null) {
    h.child.kill('SIGINT');
    await new Promise((res) => { const t = setTimeout(() => { h.child.kill('SIGKILL'); res(); }, 10_000); h.child.on('exit', () => { clearTimeout(t); res(); }); });
  }
  const size = fs.existsSync(h.out) ? fs.statSync(h.out).size : 0;
  if (size < 1000) throw new Error(`録音がありません（${size} バイト）。scrcpy の出力: ${h.log().trim().split('\n').slice(-4).join(' | ').slice(0, 400)}`);
  // 48 kHz stereo 16-bit from scrcpy's raw codec: bytes / 192000 = seconds
  return { file: h.out, seconds: Math.round((size - 44) / 192000 * 10) / 10 };
}

// ---- analysis on this machine (the run's report and log carry the numbers; the recordings stay in the run folder)
/** python3 with numpy + scipy, and ffmpeg: a venv in <lab>/.lab-tools/rigpy and apt's ffmpeg, made once when missing */
export function pythonFor(labDir) {
  const has = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' }).status === 0;
  if (!has('ffmpeg', ['-version']) && has('sudo', ['-n', 'true'])) {
    spawnSync('sudo', ['-n', 'sh', '-c', 'apt-get install -y -qq ffmpeg >/dev/null 2>&1 || (apt-get update -qq >/dev/null 2>&1 && apt-get install -y -qq ffmpeg >/dev/null 2>&1)'], { stdio: 'ignore', timeout: 600_000 });
  }
  if (has('python3', ['-c', 'import numpy, scipy'])) return 'python3';
  const venv = path.join(labDir, '.lab-tools', 'rigpy'), py = path.join(venv, 'bin', 'python3');
  if (!fs.existsSync(py)) spawnSync('python3', ['-m', 'venv', venv], { stdio: 'ignore', timeout: 120_000 });
  if (!has(py, ['-c', 'import numpy, scipy'])) spawnSync(py, ['-m', 'pip', 'install', '-q', 'numpy', 'scipy'], { stdio: 'ignore', timeout: 600_000 });
  if (!has(py, ['-c', 'import numpy, scipy'])) throw new Error('numpy / scipy を用意できません（python3 -m pip install numpy scipy）');
  return py;
}

/** what a recording says, measured by bds/addons/<addon>/tools/rig (analyze.py for calibration programs, score_song.py for a
 *  song against its original). → { json, line }: line is one short summary; json is also written beside the recording */
export function analyze({ labDir, addon = 'spectral', wav, what, refs = [] }) {
  const unit = path.join(labDir, 'bds', 'addons', addon);
  const py = pythonFor(labDir);
  const out = wav.replace(/\.wav$/, '') + `.${what.replace(/[^\w.-]/g, '_')}.json`;
  let args;
  if (what.startsWith('song:')) {
    const ref = refFile(unit, what.slice(5), py);
    args = [path.join(unit, 'tools', 'rig', 'score_song.py'), ref, wav, ...refs, '--json', out];
  } else args = [path.join(unit, 'tools', 'rig', 'analyze.py'), wav, what, '--json', out];
  const r = spawnSync(py, args, { encoding: 'utf8', timeout: 1_800_000, maxBuffer: 64e6, cwd: unit });
  if (r.status !== 0) throw new Error(`解析に失敗しました: ${(r.stderr || r.stdout).trim().split('\n').slice(-3).join(' | ').slice(0, 400)}`);
  const json = JSON.parse(fs.readFileSync(out, 'utf8'));
  return { json, out, line: summarize(json) };
}

/** the original of a song the rig knows: demo = tools/make_demo_song.py (deterministic), else corpus/audio/<id>.mp3 */
function refFile(unit, id, py) {
  if (id === 'demo') {
    const base = path.join(unit, 'corpus', 'cache', 'demo_ref');
    if (!fs.existsSync(base + '.mp3')) {
      fs.mkdirSync(path.dirname(base), { recursive: true });
      const r = spawnSync(py, [path.join(unit, 'tools', 'make_demo_song.py'), base], { encoding: 'utf8', timeout: 300_000, cwd: unit });
      if (r.status !== 0) throw new Error(`デモ曲を作れません: ${(r.stderr || '').slice(-300)}`);
    }
    return base + '.mp3';
  }
  const f = path.join(unit, 'corpus', 'audio', id + '.mp3');
  if (!fs.existsSync(f)) {
    const r = spawnSync(py, [path.join(unit, 'tools', 'corpus.py'), 'fetch', id], { encoding: 'utf8', timeout: 600_000, cwd: unit });
    if (r.status !== 0) throw new Error(`試験曲 ${id} を取れません: ${(r.stderr || '').slice(-300)}`);
  }
  return f;
}

function summarize(j) {
  const n = (v, d = 1) => (typeof v === 'number' ? v.toFixed(d) : '-');
  const parts = [];
  if (j.voices) parts.push(`voices ${j.voices.limit}${j.voices.policy ? ` (${j.voices.policy})` : ''}`);
  if (j.fade) parts.push(`fade ${j.fade.shape ?? '?'} min ${n(j.fade.fade_min_ms)}ms ratio ${n(j.fade.duration_ratio, 2)}`);
  if (j.timing) parts.push(`lands vol ${n(j.timing.volume_lands_ms?.mean)}±${n(j.timing.volume_lands_ms?.std)}ms pitch-vol ${n(j.timing.pitch_minus_volume_ms?.mean)}ms`);
  if (j.seek) parts.push(`seek loop late ${n(j.seek.loop_summary?.late_ms_mean)}ms one-shot ${n(j.seek.oneshot_summary?.late_ms_mean)}ms`);
  if (j.pitch) { const ps = j.pitch.points.filter((p) => typeof p.spur_db === 'number'); parts.push(`pitch worst spur ${n(Math.max(...ps.map((p) => p.spur_db)))}dB`); }
  if (j.stereo) parts.push(`stereo ${n(j.stereo.separation_dB)}dB`);
  if (j.mixer) parts.push(`mixer ${j.mixer.behaviour} music ${n(j.mixer.category_db?.music)} record ${n(j.mixer.category_db?.record)}dB`);
  if (j.throughput) parts.push(`128 cmds spread ${n(j.throughput.counts?.at(-1)?.spread_ms)}ms`);
  for (const [k, v] of Object.entries(j)) if (v && typeof v === 'object' && 'visqol' in v) parts.push(`${k} ViSQOL ${n(v.visqol, 3)}`);
  return parts.join(' · ');
}
