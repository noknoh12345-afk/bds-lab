# a .mcworld of the lab's flat world (the one every test runs on) with the addon's packs inside, ready to open in Minecraft
# usage: python3 mcworld.py <template world dir> <.mcaddon> <out.mcworld> "<level name>"
import sys, os, json, zipfile, shutil, tempfile, time, io
sys.path.insert(0, os.path.dirname(__file__))
import bnbt
tpl, addon, out, name = sys.argv[1:5]
work = tempfile.mkdtemp(prefix='mcworld-')
w = os.path.join(work, 'world'); shutil.copytree(tpl, w)
for f in ('level.dat_old',):
    p = os.path.join(w, f)
    if os.path.exists(p): os.remove(p)
ver, root = bnbt.load(os.path.join(w, 'level.dat'))
def setv(key, t, v):
    e = bnbt.get(root, key)
    if e: e[1], e[2] = t, v
    else: root.append([key, t, v])
setv('LevelName', bnbt.STR, name)
setv('keepinventory', bnbt.BYTE, 1)          # the wand and the tower slots stay after a fall
setv('commandsEnabled', bnbt.BYTE, 1)        # the owner is an operator (the admin and test commands work)
setv('cheatsEnabled', bnbt.BYTE, 1)
setv('LastPlayed', bnbt.LONG, int(time.time()))
setv('currentTick', bnbt.LONG, 0)
bnbt.save(os.path.join(w, 'level.dat'), ver, root)
open(os.path.join(w, 'levelname.txt'), 'w', encoding='utf-8').write(name)
# the packs, inside the world
packs = {'behavior': [], 'resource': []}
with zipfile.ZipFile(addon) as z:
    tops = sorted({n.split('/')[0] for n in z.namelist() if '/' in n})
    for top in tops:
        man = json.loads(z.read(f'{top}/manifest.json'))
        kind = 'resource' if any(m.get('type') == 'resources' for m in man.get('modules', [])) else 'behavior'
        dest = os.path.join(w, f'{kind}_packs', top)
        for n in z.namelist():
            if n.startswith(top + '/') and not n.endswith('/'):
                p = os.path.join(dest, n[len(top) + 1:]); os.makedirs(os.path.dirname(p), exist_ok=True)
                open(p, 'wb').write(z.read(n))
        packs[kind].append({'pack_id': man['header']['uuid'], 'version': man['header']['version']})
for kind in packs:
    json.dump(packs[kind], open(os.path.join(w, f'world_{kind}_packs.json'), 'w'), indent=2)
# a .mcworld is the world folder's contents at the zip's root
if os.path.exists(out): os.remove(out)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for dp, _, fs in os.walk(w):
        for f in fs:
            full = os.path.join(dp, f); z.write(full, os.path.relpath(full, w))
print(out, os.path.getsize(out), 'packs', {k: len(v) for k, v in packs.items()})
shutil.rmtree(work)
