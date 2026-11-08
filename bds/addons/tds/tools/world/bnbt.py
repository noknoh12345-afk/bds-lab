# Bedrock level.dat: an 8-byte header (storage version, length; little-endian) and a little-endian NBT compound
import struct
END, BYTE, SHORT, INT, LONG, FLOAT, DOUBLE, BARR, STR, LIST, COMP, IARR, LARR = range(13)
class R:
    def __init__(s, b): s.b, s.i = b, 0
    def take(s, n): v = s.b[s.i:s.i + n]; s.i += n; return v
    def u(s, f): n = struct.calcsize(f); return struct.unpack('<' + f, s.take(n))[0]
    def str(s): n = s.u('H'); return s.take(n).decode('utf-8', 'surrogatepass')
def rpay(r, t):
    if t == BYTE: return r.u('b')
    if t == SHORT: return r.u('h')
    if t == INT: return r.u('i')
    if t == LONG: return r.u('q')
    if t == FLOAT: return r.u('f')
    if t == DOUBLE: return r.u('d')
    if t == BARR: n = r.u('i'); return bytes(r.take(n))
    if t == STR: return r.str()
    if t == LIST: et = r.u('B'); n = r.u('i'); return (et, [rpay(r, et) for _ in range(n)])
    if t == COMP:
        out = []
        while True:
            tt = r.u('B')
            if tt == END: return out
            name = r.str(); out.append([name, tt, rpay(r, tt)])
    if t == IARR: n = r.u('i'); return [r.u('i') for _ in range(n)]
    if t == LARR: n = r.u('i'); return [r.u('q') for _ in range(n)]
    raise ValueError(t)
def wpay(t, v):
    if t == BYTE: return struct.pack('<b', v)
    if t == SHORT: return struct.pack('<h', v)
    if t == INT: return struct.pack('<i', v)
    if t == LONG: return struct.pack('<q', v)
    if t == FLOAT: return struct.pack('<f', v)
    if t == DOUBLE: return struct.pack('<d', v)
    if t == BARR: return struct.pack('<i', len(v)) + v
    if t == STR: b = v.encode('utf-8', 'surrogatepass'); return struct.pack('<H', len(b)) + b
    if t == LIST: et, items = v; return struct.pack('<Bi', et, len(items)) + b''.join(wpay(et, x) for x in items)
    if t == COMP: return b''.join(struct.pack('<B', tt) + wpay(STR, n) + wpay(tt, x) for n, tt, x in v) + b'\x00'
    if t == IARR: return struct.pack('<i', len(v)) + b''.join(struct.pack('<i', x) for x in v)
    if t == LARR: return struct.pack('<i', len(v)) + b''.join(struct.pack('<q', x) for x in v)
    raise ValueError(t)
def load(path):
    b = open(path, 'rb').read(); ver, ln = struct.unpack('<ii', b[:8]); r = R(b[8:8 + ln])
    assert r.u('B') == COMP; r.str(); return ver, rpay(r, COMP)
def save(path, ver, root):
    body = struct.pack('<B', COMP) + wpay(STR, '') + wpay(COMP, root)
    open(path, 'wb').write(struct.pack('<ii', ver, len(body)) + body)
def get(root, name):
    for e in root:
        if e[0] == name: return e
    return None
