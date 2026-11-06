"""The forge, part 4: which faces can ever be seen.

Every face is drawn by id (in visibility.mjs, for speed) into a z-buffer from directions all round the kart
(orthographic, some 170 directions from straight above down to 15 degrees
below level, for a jump), at rest and in every animated pose, with no rider (a
kart also stands empty). A face that never wins a pixel is painted for
nobody: it gets one texel (the maintainer: "texture no one sees should go,
to save space"). The resolution is about 32 pixels to the unit, so
the thin steps between faces the forge set a hair apart (0.03 and up) still
count as seen and keep the colour that closes them.
"""
from __future__ import annotations

import json
import math
import subprocess
from pathlib import Path

from .checks import to_model


def _directions(count=256, from_below=False):
    """View directions all round the model. A vehicle on the ground is never
    seen from far below (down to 15 degrees under level covers a jump); a
    flying creature, a held item or a prop IS: pass from_below=True."""
    out = []
    golden = math.pi * (3 - math.sqrt(5))
    for i in range(count):
        y = 1 - (i / (count - 1)) * 2
        r = math.sqrt(max(0.0, 1 - y * y))
        d = (math.cos(golden * i) * r, y, math.sin(golden * i) * r)
        if from_below or y > -0.26:
            out.append(d)
    # the views that matter most: chasing, beside, ahead, above
    out += [(0, 0.45, 0.89), (1, 0.15, 0), (-1, 0.15, 0), (0, 0.2, -0.98), (0, 1, 0.001), (0.7, 0.35, -0.62), (-0.7, 0.35, 0.62)]
    return out


# the bones the physics animation spins: they turn under the fenders, so what
# hides their faces at rest does not hide them on the road - only their own
# cubes can (output.buried_faces)
SPINNING = frozenset({"A", "B", "C", "D", "steering_wheel"})


def unseen_faces(kart, poses, face_point, px_per_unit=32.0, spinning=SPINNING, from_below=False):
    """(cube name, face) of every textured face no view ever shows, spinning bones aside."""
    labels = ("north", "south", "east", "west", "up", "down")
    keys = []
    for c in kart.cubes:
        for face in labels:
            if c.get("only") and face not in c["only"]:
                continue
            keys.append((c, face))
    payload = {"pxPerUnit": px_per_unit, "directions": _directions(from_below=from_below), "poses": []}
    for pose in [{}] + list(poses.values()):
        payload["poses"].append({
            "quads": [[list(to_model(kart, c, face_point(c, face, u, v), pose)) for u, v in ((0, 0), (1, 0), (1, 1), (0, 1))] for c, face in keys],
            "centres": [list(to_model(kart, c, tuple(c["origin"][k] + c["size"][k] / 2 for k in range(3)), pose)) for c, _ in keys],
        })
    # the rasterising is JavaScript (visibility.mjs): a hundred times quicker than a Python loop
    done = subprocess.run(["node", str(Path(__file__).with_name("visibility.mjs"))], input=json.dumps(payload),
                          capture_output=True, text=True, check=True)
    seen = set(json.loads(done.stdout))
    return {(c["name"], face) for i, (c, face) in enumerate(keys) if i not in seen and c["bone"] not in spinning}
