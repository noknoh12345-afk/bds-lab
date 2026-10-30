"""app.txt for a same-run A/B on the real client: arms = list of dicts
   {pre: recording prefix, suffix: song id suffix ('' = current converter), conv: converter options for that suffix,
    cmds: commands before the arm (run as the player), songs: list (default all 13), export: kbps or 0}
   calib: calibration programs recorded first (["loud"]); ceiling: {"arms": [{pre, args ("4" = playSound volume 4, "4 d4" = the
   event whose definition says volume 4), songs}]} — the originals as plain sounds (songpack.py --unit), last: the BDS restarts
   with that unit"""
import json, sys
SONGS=['piano_gymnopedie','piano_chopin_op66','vocal_stars','vocal_name_of_love','choir_how_long','drums_round','rock_big','edm_detection',
       'orchestra_five_armies','funk_funkorama','speech_ja_soseki','speech_en_wordsworth','demo_selfmade']
def make(arms, header, wait_ms=23000, calib=(), ceiling=None):
    L=[*header, '', 'section title', 'audio info', 'stop', 'audio volume 0', 'launch', 'until title 600000', 'audio info', 'shot title', '', 'section prep']
    sent=set()
    for a in arms:
        key=(a.get('suffix',''), json.dumps(a.get('conv',{}),sort_keys=True))
        if key in sent: continue
        sent.add(key)
        songs=a.get('songs',SONGS)
        opts=' '.join(f'{k}={v}' for k,v in a.get('conv',{}).items())
        L.append(f"audio song {','.join(songs)}" + (f" suffix={a['suffix']}" if a.get('suffix') else '') + (f' {opts}' if opts else ''))
    if ceiling:
        cs=[]
        for c in ceiling['arms']:
            cs+=[x for x in c.get('songs',SONGS) if x not in cs]
        L.append(f"audio ceiling spectral_ceil {','.join(cs)}")
    L+=['', 'section join', 'join', 'until joined 300000', 'wait 5000', 'do time set noon', 'do gamerule dodaylightcycle false', 'do weather clear']
    for prog in calib:
        L+=['', f'section calib_{prog}', 'audio start calib', f'do spectral:calib {prog}', f'until server spectral calib\\] end {prog} 300000', 'wait 2000',
            'audio stop', f'audio analyze calib {prog}', 'audio export calib 192']
    for a in arms:
        L+=['', f"section {a['pre']}"]
        for c in a.get('cmds',[]): L.append(f'do execute as @a run {c}')
        for s in a.get('songs',SONGS):
            name=f"{a['pre']}_{s}"
            L+=[f'audio start {name}', f"do execute as @a run spectral:play {s}{a.get('suffix','')}", f'wait {wait_ms}', 'audio stop', f'audio analyze {name} song:{s}']
            if a.get('export',160): L.append(f"audio export {name} {a.get('export',160)}")
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
    open(sys.argv[2],'w').write(make(spec['arms'], spec['header'], spec.get('wait_ms',23000), spec.get('calib',()), spec.get('ceiling')))
