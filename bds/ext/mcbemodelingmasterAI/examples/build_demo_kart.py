"""A small original kart, built to show every rule in this repository at work.

    python examples/build_demo_kart.py            # write examples/out/...
    python examples/build_demo_kart.py --check    # exit 1 when any output is stale

"Comet": an open roadster. Look for, in this file:
 - slopes and curves made of TILTED boxes joined corner to corner (nose chain,
   wheel arches) - never stair steps;
 - a width step bridged by yawed TAPER walls (the chamfered nose corners);
 - valley joints closed by running both links past the corner (chain_pair does it);
 - a rolled crease along a fender's outer edge (roll_chain_pair);
 - parts set a hair apart instead of sharing a plane (tyre slab widths, the
   deck rail 0.04 above the lids) and the step faces painted to continue
   their neighbour (the `tyre` decal is radial);
 - a transforming booster modelled OPEN and folded by its bone's bind pose;
   the clip's rotation is ADDED to the bind;
 - a seated-rider check, a steering shaft that must stay buried, and the
   visibility pass that cuts texture nobody can see.
Everything here is original work released with this repository (MIT).
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from forge.output import DYES, FACE_LIGHT, mix, mul, run  # noqa: E402
from forge.shapes import Kart  # noqa: E402

OUT = Path(__file__).resolve().parent / "out"
HIP = (0.0, 5.12, 5.6)                      # the seated rider's hip, model units (16 = one block)
FRONT_WHEEL = dict(x=8.4, y=3.5, z=-12.5, r=3.5, w=2.4)
REAR_WHEEL = dict(x=8.5, y=3.9, z=12.0, r=3.9, w=2.8)
SIDE = 9.7
# The booster: two halves of a rear wing, modelled STANDING (their picture on
# the south face, toward a chasing camera), folded flat onto the deck by the
# bind pose, raised by the clip. The hinge is the folded panel's top front edge.
HINGE = (5.0, 9.0, 14.0)
PITCH = 6.0
FOLD = (-(90.0 + PITCH), 0.0, 0.0)
OPEN = (90.0 + PITCH + 8.0, 0.0, 14.0)      # added to the fold: leaning 8 forward, spread 14 out
PEAK = (90.0 + PITCH + 13.0, 0.0, 18.0)

k = Kart("comet")


def lid_top(z):
    return HINGE[1] - (z - HINGE[2]) * math.tan(math.radians(PITCH))


def arch(wheel, radius, angles=(-50, -25, 0, 25, 50)):
    return [(round(wheel["z"] + radius * math.sin(math.radians(a)), 3), round(wheel["y"] + radius * math.cos(math.radians(a)), 3))
            for a in angles]


def build():
    B = "body"
    k.bone("root", None, (0, 0, 0))
    k.bone(B, "root", (0, 4, 0))
    k.bone("steering_column", B, (0, 11.6, -6.6), rotation=[24, 0, 0])
    k.bone("steering_wheel", "steering_column", (0, 11.6, -6.6))
    k.bone("boost_left", B, HINGE, rotation=list(FOLD))
    k.bone("boost_right", B, (-HINGE[0], HINGE[1], HINGE[2]), rotation=list(FOLD))
    for name, wheel, side in (("A", FRONT_WHEEL, 1), ("B", REAR_WHEEL, 1), ("C", FRONT_WHEEL, -1), ("D", REAR_WHEEL, -1)):
        k.bone(name, "root", (side * wheel["x"], wheel["y"], wheel["z"]))

    # --- the nose: a chain of tilted links (no stairs), chamfered corners in plan
    k.box(B, "floor", -6.0, 6.0, 1.5, 2.4, -17.5, 18.5, "carbon")
    k.box(B, "engine_bay", -5.4, 5.4, 2.5, 7.4, -18.0, -8.0, "dark", dens=2)
    k.chain(B, "bonnet", -6.2, 6.2, [(-19.2, 6.4), (-16.0, 7.6), (-12.0, 8.2), (-8.2, 8.5)], 1.6, "paint", decal="stripe")
    k.box(B, "nose_face", -7.6, 7.6, 2.4, 6.6, -19.6, -18.2, "paint", decal="face", seamless=True)
    k.box(B, "grille", -3.6, 3.6, 3.0, 5.6, -19.8, -18.9, "dark", decal="grille")
    k.pair(B, B, "headlamp", 4.4, 7.2, 5.0, 6.1, -19.75, -18.9, "glow", decal="lamp")
    k.box(B, "splitter", -7.8, 7.8, 1.9, 2.4, -19.9, -17.6, "metal")
    # (the corners run back from the face's ends to the wheel arches: no side of the face shows;
    #  -16.4: a front tyre turned 30 degrees reaches forward to about -16.1)
    k.taper_walls(B, "corner_front", (SIDE - 0.05, -16.4), (7.55, -19.6), 6.55, 6.55, 1.2, [(0.0, 1.0, 4.05, "paint", "side")], seamless=True)

    # --- the sides: an arch over each wheel, a shoulder with a rolled crease, doors between
    front, rear = arch(FRONT_WHEEL, 5.2), arch(REAR_WHEEL, 5.6)
    k.chain_pair(B, "arch_front", 6.2, SIDE, front, 1.3, "paint", decal="side")
    k.chain_pair(B, "arch_rear", 6.2, SIDE, rear, 1.3, "paint", decal="side")
    k.roll_chain_pair(B, "crease_rear", SIDE, rear, 45, 0.6, 0.4, "paint", decal="crease")
    k.pair(B, B, "door", 5.9, SIDE - 0.06, 2.5, 7.3, -8.5, 7.7, "paint", decal="door", seamless=True)
    k.pair(B, B, "sill", 6.1, SIDE + 0.02, 2.0, 2.55, -8.4, 7.6, "metal")
    k.pair(B, B, "tub", 4.8, 5.95, 2.4, 7.9, -7.0, 9.4, "seat", decal="leather", dens=2.5)
    k.box(B, "scuttle", -5.95, 5.95, 2.45, 7.9, -8.6, -7.0, "paint", dens=2)

    # --- the cockpit, fitted to the seated rider (the check below proves it)
    k.box(B, "seat_cushion", -3.8, 3.8, 2.4, HIP[1] - 2.1, -3.6, 8.0, "seat", decal="leather")
    k.box(B, "seat_back", -3.7, 3.7, 3.0, 15.0, 7.9, 9.2, "seat", rot=(-6, 0, 0), pivot=(0, 3.0, 7.9), decal="leather")
    k.box(B, "headrest", -2.2, 2.2, 14.6, 17.6, 9.2, 10.5, "seat", decal="leather")
    k.box(B, "cowl", -3.4, 3.4, 6.2, 9.6, -10.6, -7.6, "paint", rot=(40, 0, 0), pivot=(0, 8.6, -8.8), seamless=True)
    # (the dash is deep enough to hold the steering shaft's front quarter: see "shaft" below)
    k.box(B, "dash", -3.2, 3.2, 7.4, 9.9, -8.7, -6.9, "dark")
    k.box(B, "screen", -3.3, 3.3, 9.6, 11.6, -9.3, -9.1, "glass", rot=(-28, 0, 0), pivot=(0, 9.6, -9.2))
    # (named "shaft": spec["shaft_buried"] keeps its first quarter inside the cowl)
    k.box("steering_column", "shaft", -0.45, 0.45, 10.7, 11.6, -9.6, -6.4, "dark", rot=(40, 0, 0), pivot=(0, 11.15, -7.2))
    cy, cz = 11.6, -6.6
    k.box("steering_wheel", "hub", -0.9, 0.9, cy - 0.9, cy + 0.9, cz - 0.45, cz + 0.35, "dark")
    ring = 2 * 3.0 * math.tan(math.radians(22.5)) + 0.04
    for i in range(8):                       # a round rim: eight links; alternate depths keep their fronts off one plane
        d = 0.3 if i % 2 == 0 else 0.26
        k.box("steering_wheel", f"rim{i}", -ring / 2, ring / 2, cy + 2.7, cy + 3.3, cz - d, cz + d, "grip",
              rot=(0, 0, 45.0 * i) if i else None, pivot=(0, cy, cz) if i else None)
    k.box("steering_wheel", "spoke", -2.8, 2.8, cy - 0.2, cy + 0.2, cz - 0.15, cz + 0.15, "metal")

    # --- the tail: a bulkhead, the deck the wing halves fold onto, lights, exhausts
    k.box(B, "bulkhead", -5.9, 5.9, 2.5, HINGE[1], 9.4, HINGE[2], "paint", dens=2)
    deck = lambda z: lid_top(z) - 0.4 / math.cos(math.radians(PITCH))  # noqa: E731
    k.slope(B, "deck", -4.95, 4.95, (13.9, deck(13.9)), (19.0, deck(19.0)), 5.0, "dark", decal="vent")
    for tag, sx in (("l", 1), ("r", -1)):    # rails beside the wing halves, a hair ABOVE them (no shared plane)
        x0, x1 = sorted((sx * 5.0, sx * 6.3))
        k.slope(B, f"deck_rail_{tag}", x0, x1, (14.0, lid_top(14.0) + 0.04), (19.0, lid_top(19.0) + 0.04), 4.6, "paint", decal="side")
    k.box(B, "tail_panel", -7.6, 7.6, 2.6, 8.2, 18.6, 19.6, "paint", decal="face", seamless=True)
    k.taper_walls(B, "corner_rear", (7.55, 19.6), (SIDE - 0.05, 16.4), 8.0, 8.0, 1.2, [(0.0, 1.0, 5.3, "paint", "side")], seamless=True)
    k.pair(B, B, "tail_light", 4.6, 7.2, 6.4, 7.2, 19.6, 19.8, "light_red")
    for tag, sx in (("l", 1), ("r", -1)):
        k.octagon(B, f"exhaust_{tag}", sx * 3.0, 3.6, 18.0, 20.2, 0.9, "metal")
    k.pair(B, B, "axle_front", 5.4, 7.2, 3.2, 3.8, -12.8, -12.2, "dark")
    k.pair(B, B, "axle_rear", 5.9, 7.1, 3.6, 4.2, 11.7, 12.3, "dark")

    # --- the booster's wing halves, modelled standing
    x1, y0, z0 = HINGE
    k.box("boost_left", "wing_l", 0.35, x1 - 0.05, y0, y0 + 4.8, z0, z0 + 0.4, "paint", decal="wing", dens={"south": 6})
    k.mirror("wing_l", "wing_r", bone="boost_right")

    for name, wheel, side in (("A", FRONT_WHEEL, 1), ("B", REAR_WHEEL, 1), ("C", FRONT_WHEEL, -1), ("D", REAR_WHEEL, -1)):
        k.wheel(name, side, wheel, cap_mat="accent", brake_mat="dark")
    return k


# --- paint ------------------------------------------------------------------

FIXED = {
    "paint": (196, 40, 44), "paint2": (40, 42, 50), "trim": (240, 232, 214), "accent": (250, 200, 60), "carbon": (38, 40, 46),
    "dark": (22, 23, 27), "metal": (168, 176, 188), "rubber": (28, 28, 32), "rim": (128, 134, 146), "seat": (52, 46, 44),
    "grip": (30, 30, 34), "glass": (20, 32, 48), "glow": (255, 244, 214), "light_red": (240, 48, 48),
}
WAIST = 5.2


def palette(variant):
    return {"paint": FIXED["paint"] if variant == "undyed" else DYES[variant]}


def side_matched(p, col):
    """As bright on this face as `col` is on a side face: for the thin step faces
    that appear where two parts are set a hair apart - they must continue their
    neighbour, or they read as cracks."""
    return mul(col, FACE_LIGHT["east"] / FACE_LIGHT[p.face])


def decal(p):
    d, f, col = p.cube["decal"], p.face, p.col
    if d == "stripe":                                   # twin racing stripes along the bonnet
        off = abs(p.u - 0.5) * p.cube["size"][0]
        return FIXED["trim"] if f == "up" and 0.5 < off < 1.3 else col
    if d in ("side", "door", "face"):
        y = p.local()[1]                                # exact height in the cube's frame: lines run on from cube to cube
        if f != "up" and not p.cube["rot"] and abs(y - WAIST) < 0.13:
            return side_matched(p, FIXED["trim"])       # a pinstripe at one height on every straight panel
        if d == "door" and f in ("east", "west") and abs(p.u - 0.5) < 0.1 and abs(p.v - 0.42) < 0.2:
            return FIXED["trim"]                        # a number roundel's bar
        return col
    if d == "crease":
        return FIXED["trim"] if f == "up" else col
    if d == "grille":
        return mul(FIXED["metal"], 0.8) if f == "north" and p.i % 3 == 0 else col
    if d == "lamp":
        return mix(col, (255, 255, 255), 0.5) if f == "north" and 0 < p.i < p.w - 1 else mul(FIXED["metal"], 0.9)
    if d == "leather":
        return mul(col, 1.25) if p.j == 1 and p.i % 2 == 0 else col
    if d == "vent":
        return FIXED["accent"] if f == "up" and p.j % 4 == 1 and 0.15 < p.u < 0.85 else col
    if d == "wing":
        if f == "south":                                # what the chaser sees once the wing stands
            edge = min(p.i, p.w - 1 - p.i, p.j, p.h - 1 - p.j)
            if edge < 2:
                return FIXED["trim"]
            return FIXED["accent"] if (p.i + p.j) % 8 < 4 else FIXED["dark"]
        return col
    return col


SPEC = dict(
    rp=OUT, cap=250, hip=HIP, ground_clearance=0.55, density=3.0, atlas=(512, 256), grain=0.0, shaft_buried=True, visibility=("open",),
    variants=("undyed", "blue", "white"),
    groups={"body": {"body", "steering_column", "steering_wheel"}, "boost_left": {"boost_left"}, "boost_right": {"boost_right"},
            "A": {"A"}, "B": {"B"}, "C": {"C"}, "D": {"D"}},
    wheels={"A": dict(FRONT_WHEEL, side=1), "B": dict(REAR_WHEEL, side=1), "C": dict(FRONT_WHEEL, side=-1), "D": dict(REAR_WHEEL, side=-1)},
    poses={"folded": {"boost_left": (0, 0, 0), "boost_right": (0, 0, 0)},
           "open": {"boost_left": OPEN, "boost_right": (OPEN[0], -OPEN[1], -OPEN[2])},
           "peak": {"boost_left": PEAK, "boost_right": (PEAK[0], -PEAK[1], -PEAK[2])}},
    clips={
        "boost_start": (0.3, {"boost_left": "boost_right"}, {
            "0.0": {"boost_left": {"rotation": (0, 0, 0)}},
            "0.14": {"boost_left": {"rotation": PEAK}},
            "0.3": {"boost_left": {"rotation": OPEN}}}),
        "boost_end": (0.26, {"boost_left": "boost_right"}, {
            "0.0": {"boost_left": {"rotation": OPEN}},
            "0.26": {"boost_left": {"rotation": (0, 0, 0)}}}),
    },
    base_animations={"drive": {"loop": True, "bones": {
        name: {"rotation": ["q.modified_distance_moved * -16.0", 0, 0]} for name in "ABCD"}}},
    fixed=FIXED, palette=palette, decal=decal,
)

if __name__ == "__main__":
    build()
    sys.exit(run(sys.argv[1:], k, SPEC))
