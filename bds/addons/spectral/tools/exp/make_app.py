"""app.txt for a same-run A/B on the real client: arms = list of dicts
   {pre: recording prefix, suffix: song id suffix ('' = current converter), conv: converter options for that suffix,
    cmds: commands before the arm (run as the player), songs: list (default all 13), export: kbps or 0}"""
import json, sys
SONGS=['piano_gymnopedie','piano_chopin_op66','vocal_stars','vocal_name_of_love','choir_how_long','drums_round','rock_big','edm_detection',
       'orchestra_five_armies','funk_funkorama','speech_ja_soseki','speech_en_wordsworth','demo_selfmade']
def make(arms, header, wait_ms=23000):
    L=[*header, '', 'section title', 'audio info', 'stop', 'audio volume 0', 'launch', 'until title 600000', 'audio info', 'shot title', '', 'section prep']
    sent=set()
    for a in arms:
        key=(a.get('suffix',''), json.dumps(a.get('conv',{}),sort_keys=True))
        if key in sent: continue
        sent.add(key)
        songs=a.get('songs',SONGS)
        opts=' '.join(f'{k}={v}' for k,v in a.get('conv',{}).items())
        L.append(f"audio song {','.join(songs)}" + (f" suffix={a['suffix']}" if a.get('suffix') else '') + (f' {opts}' if opts else ''))
    L+=['', 'section join', 'join', 'until joined 300000', 'wait 5000', 'do time set noon', 'do gamerule dodaylightcycle false', 'do weather clear']
    for a in arms:
        L+=['', f"section {a['pre']}"]
        for c in a.get('cmds',[]): L.append(f'do execute as @a run {c}')
        for s in a.get('songs',SONGS):
            name=f"{a['pre']}_{s}"
            L+=[f'audio start {name}', f"do execute as @a run spectral:play {s}{a.get('suffix','')}", f'wait {wait_ms}', 'audio stop', f'audio analyze {name} song:{s}']
            if a.get('export',160): L.append(f"audio export {name} {a.get('export',160)}")
    return '\n'.join(L)+'\n'
if __name__=='__main__':
    spec=json.load(open(sys.argv[1]))
    open(sys.argv[2],'w').write(make(spec['arms'], spec['header'], spec.get('wait_ms',23000)))
