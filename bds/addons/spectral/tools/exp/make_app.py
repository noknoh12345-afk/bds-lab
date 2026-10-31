"""app.txt for a same-run A/B on the real client: arms = list of dicts
   {pre: recording prefix, suffix: song id suffix ('' = current converter), conv: converter options for that suffix,
    pack: a folder of songs converted beforehand with those options (make_packs.py; then nothing is converted in the run),
    cmds: commands before the arm (run as the player), songs: list (default all 13), export: kbps or 0,
    play: what starts a song ("spectral:play {song}" by default; e.g. "spectral:live_demo {song} phones")}
   interleave: prefixes of arms with the same commands, recorded song by song (a run cut short keeps whole pairs)
   calib: calibration programs recorded first (["loud"]); ceiling: {"arms": [{pre, args ("4" = playSound volume 4, "4 d4" = the
   event whose definition says volume 4), songs}]} — the originals as plain sounds (songpack.py --unit), last: the BDS restarts
   with that unit"""
import json, sys
SONGS=['piano_gymnopedie','piano_chopin_op66','vocal_stars','vocal_name_of_love','choir_how_long','drums_round','rock_big','edm_detection',
       'orchestra_five_armies','funk_funkorama','speech_ja_soseki','speech_en_wordsworth','demo_selfmade']
def make(arms, header, wait_ms=23000, calib=(), ceiling=None, interleave=None):
    L=[*header, '', 'section title', 'audio info', 'stop', 'audio volume 0', 'launch', 'until title 600000', 'audio info', 'shot title', '', 'section prep']
    sent={}                      # (suffix, converter options) -> every song an arm plays with them, in order
    for a in arms:
        key=(a.get('suffix',''), json.dumps(a.get('conv',{}),sort_keys=True))
        got=sent.setdefault(key, {'arm': a, 'songs': []})
        got['songs']+=[x for x in a.get('songs',SONGS) if x not in got['songs']]
    for (suffix, _), got in sent.items():
        a=got['arm']; songs=[x for x in SONGS if x in got['songs']]
        opts=' '.join(f'{k}={v}' for k,v in a.get('conv',{}).items())
        if a.get('pack'):           # converted beforehand (make_packs.py): sent as they are
            L.append(f"audio song {','.join(songs)}" + (f" suffix={suffix}" if suffix else '') + f" pack={a['pack']}")
        else:
            L.append(f"audio song {','.join(songs)}" + (f" suffix={suffix}" if suffix else '') + (f' {opts}' if opts else ''))
    if ceiling:
        cs=[]
        for c in ceiling['arms']:
            cs+=[x for x in c.get('songs',SONGS) if x not in cs]
        L.append(f"audio ceiling spectral_ceil {','.join(cs)}")
    L+=['', 'section join', 'join', 'until joined 300000', 'wait 5000', 'do time set noon', 'do gamerule dodaylightcycle false', 'do weather clear']
    for prog in calib:
        L+=['', f'section calib_{prog}', 'audio start calib', f'do spectral:calib {prog}', f'until server spectral calib\\] end {prog} 300000', 'wait 2000',
            'audio stop', f'audio analyze calib {prog}', 'audio export calib 192']
    def rec(a, s):
        name=f"{a['pre']}_{s}"
        play=a.get('play', 'spectral:play {song}').format(song=s + a.get('suffix',''))
        out=[f'audio start {name}', f"do execute as @a run {play}", f'wait {wait_ms}', 'audio stop', f'audio analyze {name} song:{s}']
        if a.get('export',160): out.append(f"audio export {name} {a.get('export',160)}")
        return out
    # arms with the same commands may go song by song (interleave: their prefixes): a run cut at its 40 minutes keeps its pairs
    inter=[a for a in arms if a['pre'] in (interleave or [])]
    done=set()
    for a in arms:
        if a['pre'] in done: continue
        if a in inter:
            L+=['', 'section ' + '_'.join(x['pre'] for x in inter)]
            for c in a.get('cmds',[]): L.append(f'do execute as @a run {c}')
            songs=[x for x in SONGS if any(x in b.get('songs',SONGS) for b in inter)]
            for s in songs:
                for b in inter:
                    if s in b.get('songs',SONGS): L+=rec(b, s)
            done.update(x['pre'] for x in inter); continue
        L+=['', f"section {a['pre']}"]
        for c in a.get('cmds',[]): L.append(f'do execute as @a run {c}')
        for s in a.get('songs',SONGS): L+=rec(a, s)
        done.add(a['pre'])
    if ceiling:
        L+=['', 'section ceiling', 'addon spectral_ceil', 'join', 'until joined 300000', 'wait 5000']
        for c in ceiling['arms']:
            for s in c.get('songs',SONGS):
                name=f"{c['pre']}_{s}"
                L+=[f'audio start {name}', f"do scriptevent spectral:ceiling {s}" + (f" {c['args']}" if c.get('args') else ''), f'wait {wait_ms - 1000}', 'audio stop',
                    f'audio analyze {name} song:{s}']
                if c.get('export',160): L.append(f"audio export {name} {c.get('export',160)}")
    return '\n'.join(L)+'\n'
if __name__=='__main__':
    spec=json.load(open(sys.argv[1]))
    open(sys.argv[2],'w').write(make(spec['arms'], spec['header'], spec.get('wait_ms',23000), spec.get('calib',()), spec.get('ceiling'), spec.get('interleave')))
