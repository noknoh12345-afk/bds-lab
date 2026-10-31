#!/usr/bin/env python3
"""A redroid run's published recordings into corpus/renders/rec/ (for tools/exp, tools/abx and the tables): app.txt's
`audio export <name>` puts each recording as Opus in the job's results folder under public/spectral/rec/ (app/lib/audiorec.mjs
publish), which `app checks --seal` keeps in the clear beside the sealed results (app/lib/publicout.mjs) — no key anywhere.
The same files are what the management panel plays to whoever signs in, and what notify.yml sends to Discord.

  python3 tools/rig/fetch_rec.py <run id> [--repo owner/name] [--out corpus/renders/rec] [--index out.json]

Uses the GitHub CLI's login (gh api): the artifact list, then each artifact's zip (gh follows GitHub's storage address)."""
import argparse, io, json, os, subprocess, sys, zipfile

UNIT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def gh(*args, binary=False):
    r = subprocess.run(['gh', 'api', *args], capture_output=True)
    if r.returncode:
        raise SystemExit(f'gh api {" ".join(args)}: {r.stderr.decode(errors="replace").strip()[:300]}')
    return r.stdout if binary else json.loads(r.stdout)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('run')
    ap.add_argument('--repo', default=os.environ.get('GITHUB_REPOSITORY', 'noknoh12345-afk/bds-lab'))
    ap.add_argument('--out', default=os.path.join(UNIT, 'corpus', 'renders', 'rec'))
    ap.add_argument('--index', help='also write the recordings\' index (their numbers) to this file')
    ap.add_argument('--addon', default='spectral')
    a = ap.parse_args()
    arts = [x for x in gh(f'repos/{a.repo}/actions/runs/{a.run}/artifacts?per_page=100').get('artifacts', []) if not x.get('expired')]
    if not arts:
        raise SystemExit(f'run {a.run}: no artifact (expired after 3 days, or the run uploaded none)')
    os.makedirs(a.out, exist_ok=True)
    got, index = [], {'run': a.run, 'recordings': []}
    want = f'public/{a.addon}/rec/'
    for art in arts:
        z = zipfile.ZipFile(io.BytesIO(gh(art['archive_download_url'].split('api.github.com/', 1)[-1], binary=True)))
        for n in z.namelist():
            if want not in n:
                continue
            base = n.rsplit('/', 1)[-1]
            if base == 'index.json':
                index['recordings'] += json.loads(z.read(n)).get('recordings', [])
            elif base.endswith('.opus'):
                with open(os.path.join(a.out, base), 'wb') as fh:
                    fh.write(z.read(n))
                got.append(base)
    if a.index:
        with open(a.index, 'w') as fh:
            json.dump(index, fh, indent=1)
    print(json.dumps({'run': a.run, 'recordings': len(got), 'out': os.path.relpath(a.out, UNIT), 'names': sorted(got)}))
    if not got:
        sys.exit(1)


if __name__ == '__main__':
    main()
