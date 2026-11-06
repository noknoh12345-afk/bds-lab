"""A small pixel-art helper (own code) that follows the habits of the pxl skill (bds/ext/claude-pxl):
one-character palette keys, grid strings, write the left half and mirror it, outlines drawn by the
tool (never by hand), a few tones per material, and an upscaled preview on a checkerboard to look at.

    c = Canvas(12, 12, PAL)
    c.grid('''
      ......
      .kkk..
      .yk...''', mirror=True)          # 6 columns written, 12 drawn
    c.outline('k'); c.save('face.png')
"""
from __future__ import annotations

from PIL import Image, ImageDraw


def rgba(v):
    if v is None:
        return None
    if isinstance(v, str):
        h = v.lstrip('#')
        if len(h) == 3:
            h = ''.join(ch * 2 for ch in h)
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        a = int(h[6:8], 16) if len(h) == 8 else 255
        return (r, g, b, a)
    return tuple(v) + ((255,) if len(v) == 3 else ())


class Canvas:
    def __init__(self, w, h, pal=None):
        self.w, self.h = w, h
        self.pal = {k: rgba(v) for k, v in (pal or {}).items()}
        self.px = [[None] * w for _ in range(h)]

    def col(self, c):
        if c is None or isinstance(c, tuple):
            return c
        if len(c) == 1:
            return self.pal[c]
        return rgba(c)

    def set(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = self.col(c)

    def get(self, x, y):
        return self.px[y][x] if 0 <= x < self.w and 0 <= y < self.h else None

    def grid(self, text, x=0, y=0, mirror=False, odd=False):
        """'.' leaves the pixel, '_' erases it, any other character is a palette key.
        mirror: each row is the left half; the right half is its mirror (odd: the last column is shared)."""
        rows = [r.strip() for r in text.strip('\n').split('\n')]
        rows = [r for r in rows if r]
        for j, row in enumerate(rows):
            if mirror:
                row = row + (row[:-1] if odd else row)[::-1]
            for i, ch in enumerate(row):
                if ch == '.':
                    continue
                self.set(x + i, y + j, None if ch == '_' else ch)
        return self

    def rect(self, x, y, w, h, c):
        for j in range(y, y + h):
            for i in range(x, x + w):
                self.set(i, j, c)
        return self

    def box(self, x, y, w, h, c):
        for i in range(x, x + w):
            self.set(i, y, c); self.set(i, y + h - 1, c)
        for j in range(y, y + h):
            self.set(x, j, c); self.set(x + w - 1, j, c)
        return self

    def line(self, x0, y0, x1, y1, c):
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            self.set(x0, y0, c)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy; x0 += sx
            if e2 <= dx:
                err += dx; y0 += sy
        return self

    def circ(self, cx, cy, r, c, ring=False):
        """pixel circle centred on a pixel corner when cx/cy end in .5"""
        for j in range(self.h):
            for i in range(self.w):
                d = ((i + 0.5 - cx) ** 2 + (j + 0.5 - cy) ** 2) ** 0.5
                if (r - 1 < d <= r) if ring else (d <= r):
                    self.set(i, j, c)
        return self

    def outline(self, c, diag=False):
        """1px outline on the transparent pixels next to opaque ones (inside the canvas)."""
        col = self.col(c)
        hits = []
        for j in range(self.h):
            for i in range(self.w):
                if self.px[j][i] is not None:
                    continue
                n = [(1, 0), (-1, 0), (0, 1), (0, -1)] + ([(1, 1), (-1, 1), (1, -1), (-1, -1)] if diag else [])
                if any(self.get(i + a, j + b) is not None and self.get(i + a, j + b) != col for a, b in n):
                    hits.append((i, j))
        for i, j in hits:
            self.px[j][i] = col
        return self

    def recolor(self, mapping, where=None):
        m = {self.col(a): self.col(b) for a, b in mapping.items()}
        for j in range(self.h):
            for i in range(self.w):
                if (where is None or where(i, j)) and self.px[j][i] in m:
                    self.px[j][i] = m[self.px[j][i]]
        return self

    def stamp(self, other, x, y):
        for j in range(other.h):
            for i in range(other.w):
                if other.px[j][i] is not None:
                    self.set(x + i, y + j, other.px[j][i])
        return self

    def image(self):
        im = Image.new('RGBA', (self.w, self.h), (0, 0, 0, 0))
        p = im.load()
        for j in range(self.h):
            for i in range(self.w):
                if self.px[j][i] is not None:
                    p[i, j] = self.px[j][i]
        return im

    def save(self, path):
        self.image().save(path, optimize=True)
        return self


def preview(items, path, size=168, cols=6, label=True):
    """items: [(name, PIL image)] -> one sheet; each image upscaled by a whole factor to about `size` px,
    on a checkerboard of its own pixels (transparent = checks)."""
    cell_w, cell_h = size + 16, size + (30 if label else 16)
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * cell_w, rows * cell_h), (24, 26, 30, 255))
    d = ImageDraw.Draw(sheet)
    for k, (name, im) in enumerate(items):
        scale = max(1, size // max(im.width, im.height))
        ox, oy = (k % cols) * cell_w + 8, (k // cols) * cell_h + 8
        w, h = im.width * scale, im.height * scale
        for j in range(0, h, scale):
            for i in range(0, w, scale):
                c = (70, 70, 78, 255) if ((i // scale) + (j // scale)) % 2 else (54, 54, 60, 255)
                d.rectangle([ox + i, oy + j, ox + i + scale - 1, oy + j + scale - 1], fill=c)
        up = im.resize((w, h), Image.NEAREST)
        sheet.alpha_composite(up, (ox, oy))
        if label:
            d.text((ox, oy + h + 3), name, fill=(220, 220, 220, 255))
    sheet.save(path)
