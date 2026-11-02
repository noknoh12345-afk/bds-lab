#!/usr/bin/env python3
"""Runs tools/exp/queue/q*.json on the real device one after another and records what each measured, without judging it
(ユーザーの依頼 11-02 18:55「それぞれ考えずに記録して」). For each plan in order: its app.txt written (tools/exp/make_app.py), committed and
pushed to addon/spectral with the song packs it sends; redroid.yml dispatched (addon spectral, mode run) only when no redroid or app.yml
run is queued or going (one at a time: redroid cancels a run in progress, and both use the same Google account); waited for; the job
log's `[spectral rig]` / `[spectral rec]` / failed-step lines kept in tools/exp/queue/logs/; measured/redroid-<run>.json written
(tools/rig/collect.py); a line added to tools/exp/queue/RESULTS.md; the recordings and that line sent to Discord (notify.yml); the
state kept in tools/exp/queue/state.json and pushed. A run that ends with no recording at all (the device never came up) is tried once
more. Packs made elsewhere (a folder with <name>.done beside it in --staging) are moved into tools/exp/packs/ and pushed on the way.
  python3 tools/exp/queue_run.py loop [--budget <seconds>] [--staging <dir>]   (stops between waits when the budget is spent: run it
                                                                                again and it picks up where it was)
  python3 tools/exp/queue_run.py status"""
import json, os, re, subprocess, sys, time, statistics, glob, shutil
from datetime import datetime, timezone, timedelta
HERE = os.path.dirname(os.path.abspath(__file__))
UNIT = os.path.dirname(os.path.dirname(HERE))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(UNIT)))
Q = os.path.join(HERE, 'queue')
STATE = os.path.join(Q, 'state.json')
SLUG = 'noknoh12345-afk/bds-lab'
BRANCH = 'addon/spectral'
TRAILER = '\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_0178eNzJYZskGgfdT3YHCF8G'
SONGS13 = ['piano_gymnopedie', 'piano_chopin_op66', 'vocal_stars', 'vocal_name_of_love', 'choir_how_long', 'drums_round', 'rock_big',
           'edm_detection', 'orchestra_five_armies', 'funk_funkorama', 'speech_ja_soseki', 'speech_en_wordsworth', 'demo_selfmade']
sys.path.insert(0, os.path.join(UNIT, 'tools', 'rig'))
import collect  # noqa: E402  (the rig's own reading of `[spectral rig]` lines)

DEADLINE = [1e18]
STAGING = [None]
WORK = os.environ.get('QUEUE_WORK', '/tmp')


class OutOfTime(Exception):
    pass


def log(m):
    print(time.strftime('%m-%d %H:%M:%S'), m, flush=True)


def sh(*cmd, check=True, timeout=600, cwd=REPO):
    for k in range(5):
        r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
        if r.returncode == 0 or not check:
            return r.stdout
        err = (r.stderr or r.stdout).strip()
        if cmd[0] == 'git' and 'index.lock' in err:          # (another git at the same moment: the session's own)
            time.sleep(5); continue
        if cmd[0] == 'gh' and re.search(r'HTTP 5\d\d|timeout|connection|EOF|rate limit', err, re.I):
            time.sleep(30 * (k + 1)); continue
        raise RuntimeError(f"{' '.join(cmd[:5])}: {err[-500:]}")
    raise RuntimeError(f"{' '.join(cmd[:5])}: gave up")


def nap(seconds):
    if time.time() + seconds > DEADLINE[0]:
        raise OutOfTime()
    time.sleep(seconds)


def load_state():
    st = json.load(open(STATE)) if os.path.exists(STATE) else {}
    # (p<NN>_*.json: plans added later for something being built — they sort, and run, before the twenty q<NN>)
    for f in sorted(glob.glob(os.path.join(Q, 'p[0-9][0-9]_*.json')) + glob.glob(os.path.join(Q, 'q[0-9][0-9]_*.json'))):
        st.setdefault(os.path.basename(f)[:-5], {'status': 'pending'})
    return st


def save_state(st):
    with open(STATE, 'w') as fh:
        json.dump(st, fh, ensure_ascii=False, indent=1, sort_keys=True)
        fh.write('\n')


def commit(paths, msg):
    """add, commit (if anything changed) and push to addon/spectral (the lab's go run leaves bds/vendor/bds-version.txt changed:
    never committed)"""
    sh('git', 'checkout', '--', 'bds/vendor/bds-version.txt', check=False)
    paths = [p for p in paths if os.path.exists(os.path.join(REPO, p))]
    if paths:
        sh('git', 'add', '--', *paths)
    if sh('git', 'diff', '--cached', '--name-only').strip():
        sh('git', 'commit', '-q', '-m', msg + TRAILER)
    for k in range(4):
        r = subprocess.run(['git', 'push', '-q', 'origin', BRANCH], cwd=REPO, capture_output=True, text=True)
        if r.returncode == 0:
            return
        subprocess.run(['git', 'pull', '-q', '--rebase', 'origin', BRANCH], cwd=REPO, capture_output=True, text=True)
        time.sleep(5)
    raise RuntimeError('push failed: ' + r.stderr[-300:])


def rel(p):
    return os.path.relpath(p, REPO)


def song_files(spec):
    need = []
    for a in spec.get('arms', []):
        if a.get('pack'):
            need += [os.path.join(UNIT, a['pack'], f"{s}{a.get('suffix', '')}.song.json") for s in a.get('songs', SONGS13)]
    for line in spec.get('prep', []):
        m = re.match(r'audio song (\S+)(?: suffix=(\S+))? pack=(\S+)', line)
        if m:
            need += [os.path.join(UNIT, m.group(3), f"{s}{m.group(2) or ''}.song.json") for s in m.group(1).split(',')]
    return need


def settled(p):
    try:
        if time.time() - os.path.getmtime(p) < 30:
            return False
        json.load(open(p))
        return True
    except Exception:
        return False


def sync_packs():
    """packs finished in the staging folder moved in, and pushed; a plan's own song files that appeared (made in place) too"""
    moved = []
    if STAGING[0] and os.path.isdir(STAGING[0]):
        for done in sorted(glob.glob(os.path.join(STAGING[0], '*.done'))):
            name = os.path.basename(done)[:-5]
            src, dst = os.path.join(STAGING[0], name), os.path.join(HERE, 'packs', name)
            if not os.path.isdir(src) or os.path.exists(done + '.moved'):
                continue
            os.makedirs(dst, exist_ok=True)
            for f in sorted(glob.glob(os.path.join(src, '*.song.json'))):
                shutil.copyfile(f, os.path.join(dst, os.path.basename(f)))
            open(done + '.moved', 'w').write(time.strftime('%F %T\n'))
            moved.append(name)
    untracked = sh('git', 'ls-files', '--others', '--exclude-standard', '--', rel(os.path.join(HERE, 'packs'))).split()
    ready = [p for p in untracked if p.endswith('.song.json') and settled(os.path.join(REPO, p))]
    if ready:
        dirs = sorted({os.path.basename(os.path.dirname(p)) for p in ready})
        commit(ready, f"spectral queue: song packs for the device runs ({', '.join(dirs)}) — made here, sent by the rig as they are")
        log(f'packs pushed: {", ".join(dirs)} ({len(ready)} files)')
    return moved


def busy():
    """a redroid or app.yml run queued or going"""
    for wf in ('redroid.yml', 'app.yml'):
        out = sh('gh', 'run', 'list', '--repo', SLUG, '--workflow', wf, '--limit', '6', '--json', 'status', check=False)
        try:
            if any(r['status'] != 'completed' for r in json.loads(out or '[]')):
                return True
        except json.JSONDecodeError:
            return True
    return False


def start(name, st):
    spec_path = os.path.join(Q, name + '.json')
    spec = json.load(open(spec_path))
    need = song_files(spec)
    missing = [p for p in need if not os.path.exists(p)]
    if missing:
        return False, f'waiting for {len(missing)} song files ({rel(missing[0])} …)'
    untracked = set(sh('git', 'ls-files', '--others', '--exclude-standard', '--', *sorted({rel(os.path.dirname(p)) for p in need})).split()) if need else set()
    if untracked:
        return False, f'{len(untracked)} song files not pushed yet'
    while busy():
        log('a redroid / app run is queued or going: waiting')
        nap(90)
    app = os.path.join(UNIT, 'app.txt')
    sh('python3', os.path.join(HERE, 'make_app.py'), spec_path, app)
    title = spec['header'][-1].split('）: ', 1)[-1].split('。')[0][:120]
    commit([rel(app), rel(Q)], f'spectral queue {name}: on the real device next — {title}')
    head = sh('git', 'rev-parse', 'HEAD').strip()
    t0 = datetime.now(timezone.utc).replace(microsecond=0)
    sh('gh', 'workflow', 'run', 'redroid.yml', '--repo', SLUG, '--ref', BRANCH, '-f', 'addon=spectral', '-f', 'mode=run')
    rid = None
    for _ in range(60):
        time.sleep(5)
        out = json.loads(sh('gh', 'run', 'list', '--repo', SLUG, '--workflow', 'redroid.yml', '--event', 'workflow_dispatch', '--limit', '5',
                            '--json', 'databaseId,headSha,createdAt'))
        cand = [r for r in out if datetime.fromisoformat(r['createdAt'].replace('Z', '+00:00')) >= t0 - timedelta(seconds=10)]
        if cand:
            rid = str(cand[0]['databaseId'])
            break
    if not rid:
        raise RuntimeError(f'{name}: dispatched, but no redroid run showed up')
    st[name] = {**st.get(name, {}), 'status': 'running', 'run': rid, 'started': time.strftime('%Y-%m-%d %H:%M'), 'commit': head[:7]}
    save_state(st)
    commit([rel(STATE)], f'spectral queue {name}: run {rid} started')
    log(f'{name}: run {rid} started (commit {head[:7]})')
    return True, rid


def measured(lines):
    """per arm (the recording's prefix): how many songs scored and the median of each score; the recordings exported"""
    tmp = os.path.join(WORK, 'queue_rig_lines.txt')
    open(tmp, 'w').write('\n'.join(lines) + '\n')
    rows = collect.read(tmp)
    by = {}
    for recname, whats in rows.items():
        for what, j in whats.items():
            if not what.startswith('song:') or not isinstance(j, dict):
                continue
            v = next(iter(j.values())) if j and isinstance(next(iter(j.values())), dict) else j
            if isinstance(v, dict) and isinstance(v.get('visqol'), (int, float)):
                pre = recname.split('_', 1)[0]
                for k in ('visqol', 'mrstft', 'third_oct_db', 'rms_db'):
                    if isinstance(v.get(k), (int, float)):
                        by.setdefault(pre, {}).setdefault(k, []).append(v[k])
    arms = {pre: {'n': len(d['visqol']), **{k: round(statistics.median(x), 3) for k, x in d.items()}} for pre, d in by.items()}
    recs = []
    for l in lines:
        m = re.search(r'\[spectral rec\] (\S+) (\S+) (\d+ [KM]?B)', l)
        if m and not m.group(1).startswith('ck_'):
            recs.append(f'{m.group(1)} {m.group(3)}')
    cks = sum(1 for l in lines if re.search(r'\[spectral rec\] ck_', l))
    return arms, recs, cks


def finish(name, st):
    rid = st[name]['run']
    while True:
        v = json.loads(sh('gh', 'run', 'view', rid, '--repo', SLUG, '--json', 'status,conclusion,jobs'))
        if v['status'] == 'completed':
            break
        sync_packs()
        nap(60)
    lines, job = [], (v.get('jobs') or [{}])[0].get('databaseId')
    if job:
        txt = subprocess.run(['gh', 'api', f'repos/{SLUG}/actions/jobs/{job}/logs'], capture_output=True, text=True, timeout=600).stdout
        joblog = os.path.join(WORK, f'queue_{rid}.log')
        open(joblog, 'w').write(txt)
        lines = [l for l in txt.split('\n') if '[spectral rig]' in l or '[spectral rec]' in l or re.search(r'✘ \d+ ', l)]
        os.makedirs(os.path.join(Q, 'logs'), exist_ok=True)
        open(os.path.join(Q, 'logs', f'{name}_{rid}.txt'), 'w').write('\n'.join(lines) + '\n')
        subprocess.run(['python3', os.path.join(UNIT, 'tools', 'rig', 'collect.py'), joblog, '--run', rid], cwd=UNIT, capture_output=True, text=True, timeout=600)
    arms, recs, cks = measured(lines)
    fails = [re.sub(r'^\S+Z\s+', '', l).strip() for l in lines if re.search(r'✘ \d+ ', l)]
    tries = st[name].get('tries', 0) + 1
    again = not recs and tries < 2
    st[name].update({'status': 'pending' if again else 'done', 'conclusion': v.get('conclusion'), 'ended': time.strftime('%Y-%m-%d %H:%M'),
                     'arms': arms, 'recordings': len(recs), 'checkpoints': cks, 'failed_steps': len(fails), 'tries': tries})
    if again:
        st[name].setdefault('earlier_runs', []).append(rid)
    save_state(st)
    res = os.path.join(Q, 'RESULTS.md')
    if not os.path.exists(res):
        open(res, 'w').write('# キューの結果（実測、1 本ずつそのまま記録。判断は後で）\n\n'
                             'tools/exp/queue_run.py が書く。ViSQOL・mrstft・1/3 oct（dB）は腕（録音の頭の文字）ごとの中央値、n はその本数。録音そのものは'
                             ' run の成果物 public/spectral/rec/ と Discord、ジョブのログの行は logs/、全部の値は measured/redroid-<run>.json。\n\n'
                             '| キュー | run | 結果 | 録音 | 腕ごと: ViSQOL / mrstft / 1/3 oct (n) | 失敗した手順 | 時刻 |\n|---|---|---|---|---|---|---|\n')
    arm_txt = ' · '.join(f"{k} {a['visqol']:.3f} / {a.get('mrstft', float('nan')):.3f} / {a.get('third_oct_db', float('nan')):.2f} ({a['n']})"
                         for k, a in sorted(arms.items())) or '—'
    rec_txt = f'{len(recs)}' + (f"（{', '.join(recs[:2])}）" if 0 < len(recs) <= 2 else '')
    fail_txt = f'{len(fails)}' + (f"（{fails[0][:80]}）" if fails else '')
    with open(res, 'a') as fh:
        fh.write(f"| {name} | {rid} | {v.get('conclusion')}{'（もう一度）' if again else ''} | {rec_txt} | {arm_txt} | {fail_txt} | "
                 f"{st[name]['started']} → {st[name]['ended']} |\n")
    commit([rel(Q), rel(os.path.join(UNIT, 'measured'))], f"spectral queue {name}: run {rid} recorded ({len(recs)} recordings, {v.get('conclusion')})")
    subprocess.run(['gh', 'workflow', 'run', 'notify.yml', '--repo', SLUG, '--ref', BRANCH, '-f', f'run={rid}'], capture_output=True)
    spec = json.load(open(os.path.join(Q, name + '.json')))
    label = f'キュー {int(name[1:3])}/20 {name}' if name.startswith('q') else f'追加の実機 {name}'
    msg = (f"🧾 {label}（run {rid}・実測・記録のみ）: {spec['header'][-1].split('）: ', 1)[-1].split('。')[0][:150]}\n"
           f"結果 {v.get('conclusion')}・録音 {rec_txt}・失敗した手順 {fail_txt}"
           + ('・録音が無いのでもう一度走らせる' if again else '') + f"\n腕ごとの中央値 ViSQOL / mrstft / 1/3 oct (n): {arm_txt}")
    subprocess.run(['gh', 'workflow', 'run', 'notify.yml', '--repo', SLUG, '--ref', BRANCH, '-f', f'message={msg[:1900]}'], capture_output=True)
    log(f'{name}: run {rid} {v.get("conclusion")} — {len(recs)} recordings — {arm_txt}')


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'status'
    if '--budget' in sys.argv:
        DEADLINE[0] = time.time() + float(sys.argv[sys.argv.index('--budget') + 1])
    if '--staging' in sys.argv:
        STAGING[0] = sys.argv[sys.argv.index('--staging') + 1]
    if cmd == 'status':
        for k, v in sorted(load_state().items()):
            print(k, v.get('status'), v.get('run', ''), v.get('conclusion', ''), v.get('recordings', ''),
                  ' '.join(f"{a}:{d['visqol']}" for a, d in sorted((v.get('arms') or {}).items())))
        return
    try:
        while True:
            sync_packs()
            st = load_state()
            going = [k for k, v in sorted(st.items()) if v.get('status') == 'running']
            if going:
                finish(going[0], st)
                continue
            pend = [k for k, v in sorted(st.items()) if v.get('status') == 'pending']
            if not pend:
                log('every plan has run')
                return
            if time.time() + 20 * 60 > DEADLINE[0]:
                raise OutOfTime()
            started = False
            for name in pend:
                ok, info = start(name, st)
                if ok:
                    started = True
                    break
                log(f'{name}: not yet — {info}')
            if not started:
                nap(120)
    except OutOfTime:
        log('budget spent: run me again (state.json says where it was)')


if __name__ == '__main__':
    main()
