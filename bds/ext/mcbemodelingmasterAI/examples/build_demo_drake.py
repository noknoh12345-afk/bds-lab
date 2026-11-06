"""A small original creature, built with the same forge as the kart - to show
that none of the rules are about karts.

    python examples/build_demo_drake.py            # write examples/out/...
    python examples/build_demo_drake.py --check    # exit 1 when any output is stale

"Drake": a whelp with folding wings. Look for, in this file:
 - a spine that CURVES: torso, neck and tail are chains of tilted links joined
   corner to corner in the side profile - never stair steps; each chain's end
   runs INTO what it meets (neck into chest, tail into hips);
 - wings built the way the vanilla Ender Dragon's are: two jointed segments
   (an ARM from the shoulder to a wrist, a HAND on its own bone), each one a
   leading-edge bone plus ONE ZERO-THICKNESS MEMBRANE PLATE. The membrane's
   deep curved trailing edge and its finger bones are PAINTED; everything
   ahead of the bone and outside the outline is left TRANSPARENT (the client
   entity's material must be `entity_alphatest`). Both plates lie in ONE wing
   plane, each with its inner edge exactly on its hinge line (the flank, the
   wrist line), so no pose can swing a membrane into the body. Both faces of
   a plate are drawn over each other, so they must show the same colour at
   the same point: the membrane is painted BY POSITION (p.local()).
   Three drafts were rejected before this one - a flat board per wing; a fan
   of box panels; plates turned with the swept arm bone, which cut into the
   back, stood up as square boards when folded and showed the hand edge-on
   as spikes. The maintainer: "look closely - at how the Ender Dragon's wing
   is built and painted".
 - the wings are modelled SPREAD; at rest the bind pose holds them half
   raised and bent at the wrist, as the vanilla dragon carries them; clips
   and the looping flap ADD to the bind, and the hand lags the arm;
 - every animated pose checked: the wings may not cross the centre line or
   sink into the body, folded, spread or at the bottom of a stroke;
 - parts a hair apart instead of sharing a plane (forearm inside the arm's
   planes, ribs proud of the membrane), and step faces that continue their
   neighbour (the scales run by position, not per cube);
 - no ground clearance rule (its feet stand on the ground), no rider, no
   wheels: `spec` simply leaves those keys out;
 - bones an animation moves but whose poses are not listed go in `spinning`,
   so the visibility pass never blanks a face a moving joint can reveal.
Everything here is original work released with this repository (MIT).
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from forge.output import DYES, FACE_LIGHT, mix, mul, run  # noqa: E402
from forge.shapes import Model  # noqa: E402

OUT = Path(__file__).resolve().parent / "out"
SHOULDER = (3.5, 13.7, -1.0)               # on the shoulder: folded up, the arm stands clear of the back
WRIST = (13.6, 15.6, -3.2)                  # the arm rises a little and sweeps forward
TIP = (24.6, 17.0, -1.8)                    # the leading finger's tip: a span of three body widths
WEB_REAR = 10.6                             # the membranes reach back to this z, along the flank
# the hand's painted fingers, from the wrist: (along the leading bone, behind it), as fractions
HAND_FINGERS = ((1.0, 0.0), (0.92, 0.55), (0.55, 0.92), (0.0, 1.0))
ARM_REST, HAND_REST = (0.0, 0.0, -35.0), (0.0, 0.0, 50.0)              # bind: half raised, bent down at the wrist
ARM_SPREAD, HAND_SPREAD = (0.0, 0.0, 35.0), (0.0, 0.0, -50.0)          # added: as modelled
ARM_UP, HAND_UP = (0.0, 0.0, 13.0), (0.0, 0.0, -22.0)                  # added: the top of a stroke, the hand trailing
ARM_DOWN, HAND_DOWN = (0.0, 0.0, 53.0), (0.0, 0.0, -72.0)              # added: the bottom of a stroke, the hand still catching up

m = Model("drake")


def build():
    B = "body"
    m.bone("root", None, (0, 0, 0))
    m.bone(B, "root", (0, 10, 0))
    m.bone("neck", B, (0, 12.0, -6.5))
    m.bone("head", "neck", (0, 16.6, -11.0))
    m.bone("jaw", "head", (0, 15.6, -11.4))
    m.bone("tail", B, (0, 10.6, 7.5))
    m.bone("tail_tip", "tail", (0, 7.6, 15.0))
    flip = lambda v: [v[0], -v[1], -v[2]]  # noqa: E731
    m.bone("wing_left", B, SHOULDER, rotation=list(ARM_REST))
    m.bone("wingtip_left", "wing_left", WRIST, rotation=list(HAND_REST))
    m.bone("wing_right", B, (-SHOULDER[0], SHOULDER[1], SHOULDER[2]), rotation=flip(ARM_REST))
    m.bone("wingtip_right", "wing_right", (-WRIST[0], WRIST[1], WRIST[2]), rotation=flip(HAND_REST))
    for name, x, z in (("leg_fl", 3.4, -4.0), ("leg_fr", -3.4, -4.0), ("leg_bl", 3.5, 5.4), ("leg_br", -3.5, 5.4)):
        m.bone(name, B, (x, 9.0, z))

    # --- the torso: one curved back, a paler belly a hair lower (its top is buried)
    back = [(-7.0, 12.6), (-2.5, 13.6), (3.0, 13.0), (8.0, 11.0)]
    m.chain(B, "torso", -3.2, 3.2, back, 5.4, "paint", decal="scales")
    m.chain(B, "belly", -2.4, 2.4, [(z, y - 0.35) for z, y in back], 5.35, "trim", decal="plates")
    for i, (z, y) in enumerate(((-4.6, 13.2), (-0.8, 13.45), (3.0, 13.1), (6.2, 11.9))):   # dorsal spines, raked back
        m.box(B, f"spine{i}", -0.35, 0.35, y - 0.6, y + 1.5, z - 0.7, z + 0.7, "trim", rot=(-32, 0, 0), pivot=(0, y, z))

    # --- the neck runs INTO the chest; the head sits on its top end
    m.chain("neck", "neck", -1.9, 1.9, [(-11.2, 17.4), (-9.0, 15.4), (-6.0, 12.9)], 3.4, "paint", decal="scales")
    m.box("head", "skull", -2.3, 2.3, 15.4, 18.8, -15.2, -10.6, "paint", decal="scales")
    m.slope("head", "snout", -1.7, 1.7, (-18.6, 16.5), (-15.0, 17.9), 2.0, "paint", decal="scales", extend=(0.0, 0.3))
    m.pair("head", "head", "eye", 2.3, 2.45, 17.1, 17.95, -14.3, -13.1, "glow")
    m.pair("head", "head", "nostril", 0.7, 1.25, 16.62, 16.82, -18.2, -17.7, "dark")
    for tag, sx in (("l", 1), ("r", -1)):
        x0, x1 = sorted((sx * 1.15, sx * 1.95))
        m.slope("head", f"horn_{tag}", x0, x1, (-11.8, 18.5), (-7.8, 20.8), 0.9, "trim")
    m.box("jaw", "jaw", -1.6, 1.6, 14.6, 15.45, -18.2, -11.0, "paint2", decal="teeth")

    # --- the tail: two chains (the tip sways on its own bone), a spade at the end
    m.chain("tail", "tail", -2.2, 2.2, [(7.0, 11.5), (11.0, 9.9), (15.0, 8.1)], 3.2, "paint", decal="scales")
    m.chain("tail_tip", "tail_tip", -1.4, 1.4, [(14.6, 8.2), (18.5, 6.7), (22.0, 5.9)], 2.0, "paint", decal="scales")
    m.box("tail_tip", "spade", -1.5, 1.5, 4.95, 5.55, 21.2, 24.2, "trim", rot=(0, 45, 0), pivot=(0, 5.25, 22.7))

    # --- legs: thigh and shin tilted opposite ways, joined at the knee; feet ON the ground
    for bone, sx, z, lift in (("leg_fl", 1, -4.0, 0.0), ("leg_fr", -1, -4.0, 0.0), ("leg_bl", 1, 5.4, 0.4), ("leg_br", -1, 5.4, 0.4)):
        def xr(a, b, sx=sx):
            return tuple(sorted((sx * a, sx * b)))
        x0, x1 = xr(2.5, 4.7)
        m.box(bone, f"thigh_{bone}", x0, x1, 4.4, 9.8 + lift, z - 1.4, z + 1.4, "paint", rot=(-16, 0, 0), pivot=(sx * 3.6, 9.0, z), decal="scales")
        x0, x1 = xr(2.75, 4.45)
        m.box(bone, f"shin_{bone}", x0, x1, 0.9, 5.4, z - 1.9, z + 0.3, "paint", rot=(15, 0, 0), pivot=(sx * 3.6, 5.0, z - 0.8), decal="scales")
        x0, x1 = xr(2.3, 4.9)
        m.box(bone, f"foot_{bone}", x0, x1, 0.0, 1.2, z - 3.6, z + 0.2, "paint2")
        for i, off in enumerate((2.55, 3.35, 4.15)):
            x0, x1 = xr(off, off + 0.5)
            m.box(bone, f"claw{i}_{bone}", x0, x1, 0.0, 0.7, z - 4.3, z - 3.55, "trim")

    # --- the left wing, modelled SPREAD; the right is its mirror.
    # Each segment: a leading-edge bone, and ONE membrane plate (zero thickness, both faces) in the wing's
    # plane. A plate's inner edge lies exactly on its hinge line (x = the joint), and it turns about z only,
    # so raising or folding the wing can never swing it into the body. It reaches forward past the swept
    # bone; the decal cuts away what lies ahead of the bone.
    up = (0.0, 1.0, 0.0)
    m.plank("wing_left", "wing_arm_l", SHOULDER, WRIST, up, -0.7, 1.4, 1.15, "paint", decal="scales")
    m.plank("wingtip_left", "wing_finger_l", WRIST, TIP, up, -0.4, 0.8, 0.8, "paint2")
    m.plank("wingtip_left", "thumb_l", WRIST, (14.6, 16.9, -6.4), up, -0.3, 0.6, 0.6, "trim")
    for bone, name, joint, end, drop in (("wing_left", "arm_web_l", SHOULDER, WRIST, 0.5), ("wingtip_left", "hand_web_l", WRIST, TIP, 0.42)):
        run_x, rise = end[0] - joint[0], end[1] - joint[1]
        m.box(bone, name, joint[0], joint[0] + math.hypot(run_x, rise), joint[1] - drop, joint[1] - drop,
              min(joint[2], end[2]) - 0.4, WEB_REAR, "membrane", rot=(0, 0, -math.degrees(math.atan2(rise, run_x))), pivot=joint,
              decal=name[:-2], only=("up", "down"), dens=5)
    for c in [c for c in m.cubes if c["bone"] in ("wing_left", "wingtip_left")]:
        m.mirror(c["name"], c["name"][:-2] + "_r", bone=c["bone"].replace("left", "right"))
    return m


# --- paint ------------------------------------------------------------------

FIXED = {
    "paint": (46, 140, 96), "paint2": (30, 84, 66), "trim": (232, 214, 170), "membrane": (196, 92, 70), "glow": (255, 214, 90),
    "dark": (20, 22, 24),
}


def palette(variant):
    if variant == "undyed":
        return {"paint": FIXED["paint"], "paint2": FIXED["paint2"]}
    base = DYES[variant]
    if sum(base) / 3 < 50:
        base = mix(base, (70, 72, 80), 0.3)
    return {"paint": base, "paint2": mix(base, (10, 14, 16), 0.45)}


def membrane(p, hand):
    """A wing membrane plate, painted BY POSITION on the plate so that its two
    faces agree point for point. `along` runs 0..1 from the joint to the end
    of the leading bone; `behind` 0..1 from the bone back to the plate's rear
    edge. Ahead of the bone and outside the outline: None (transparent)."""
    q, o, size = p.local(), p.cube["origin"], p.cube["size"]
    left = p.cube["pivot"][0] > 0                         # the mirrored plate runs the other way in x
    along = ((q[0] - o[0]) if left else (o[0] + size[0] - q[0])) / size[0]
    joint, end = (WRIST, TIP) if hand else (SHOULDER, WRIST)
    bone_z = joint[2] + (end[2] - joint[2]) * along       # the swept leading bone, in the plate's frame
    behind = (q[2] - bone_z) / (WEB_REAR - bone_z)
    if behind < 0.0:
        return None
    skin, bone = p.col, p.palette["paint2"]
    depth = WEB_REAR - joint[2]
    if hand:
        # fingers fan from the wrist; between their tips the edge sags in a deep scallop
        radius, angle = math.hypot(along, behind), math.atan2(behind, along)
        tips = [(math.atan2(b, a), math.hypot(a, b)) for a, b in HAND_FINGERS]
        for (a0, r0), (a1, r1) in zip(tips, tips[1:]):
            if a0 <= angle <= a1 + 1e-9:
                f = (angle - a0) / (a1 - a0)
                edge = r0 + (r1 - r0) * f - 0.3 * math.sin(math.pi * f)
                break
        else:
            return None
        if radius > edge:
            return None
        if any(abs(angle - a) * radius * depth < 0.42 and radius <= r for a, r in tips[1:]):
            return bone                                   # a painted finger bone
        shade = 1.0 - 0.22 * radius
    else:
        # attached along the flank and along the arm; the free edge sags deep between the flank's rear and the wrist line
        if behind > 1.0 - 0.42 * math.sin(math.pi * min(1.0, max(0.0, along))) ** 0.8:
            return None
        if abs(along - 0.975) * size[0] < 0.4:
            return bone                                   # the strut at the wrist line: the hand's last finger continues it
        if abs(behind - (0.1 + 0.62 * along)) * depth < 0.3 and along > 0.06:
            return bone                                   # a batten from the shoulder across the sail
        shade = 1.0 - 0.2 * behind
    veins = int(behind * depth * 1.5) % 3 == 0 and int(along * size[0] * 2) % 2 == 0
    return mul(skin, shade * (0.93 if veins else 1.0))


def decal(p):
    d, f, col = p.cube["decal"], p.face, p.col
    if d == "scales":
        # by position in the cube's frame, not by texel index: the lattice keeps its pitch on every link
        q = p.local()
        a = (q[2] * 2 + (q[0] if f in ("up", "down", "north", "south") else q[1]) * 2)
        b = (q[2] * 2 - (q[0] if f in ("up", "down", "north", "south") else q[1]) * 2)
        return mul(col, 0.86) if abs(a % 3.0) < 0.5 or abs(b % 3.0) < 0.5 else col
    if d == "plates":
        return mul(col, 0.82) if int(p.local()[2] * 1.2) % 2 == 0 else col
    if d == "teeth":
        if f in ("east", "west", "north") and p.j == 0 and p.i % 2 == 0:
            return FIXED["trim"]
        return col
    if d in ("arm_web", "hand_web"):
        return membrane(p, d == "hand_web")
    return col


SPEC = dict(
    rp=OUT, cap=250, density=3.0, atlas=(512, 256), grain=0.0,
    variants=("undyed", "red", "black"),
    groups={"body": {"body", "neck", "head", "jaw", "tail", "tail_tip", "leg_fl", "leg_fr", "leg_bl", "leg_br"},
            "wing_left": {"wing_left", "wingtip_left"}, "wing_right": {"wing_right", "wingtip_right"}},
    poses={name: {"wing_left": arm, "wingtip_left": hand, "wing_right": (arm[0], -arm[1], -arm[2]), "wingtip_right": (hand[0], -hand[1], -hand[2])}
           for name, arm, hand in (("rest", (0, 0, 0), (0, 0, 0)), ("spread", ARM_SPREAD, HAND_SPREAD),
                                   ("up", ARM_UP, HAND_UP), ("down", ARM_DOWN, HAND_DOWN))},
    visibility=("spread", "up", "down"), seen_from_below=True,     # it flies: players look up at it
    # animated, but their poses are not listed above: only burial inside their OWN bone may blank their faces
    spinning=("neck", "head", "jaw", "tail", "tail_tip", "leg_fl", "leg_fr", "leg_bl", "leg_br"),
    clips={
        "spread": (0.4, {"wing_left": "wing_right", "wingtip_left": "wingtip_right"}, {
            "0.0": {"wing_left": {"rotation": (0, 0, 0)}, "wingtip_left": {"rotation": (0, 0, 0)}},
            "0.2": {"wing_left": {"rotation": (0, 0, 40)}, "wingtip_left": {"rotation": (0, 0, -24)}},      # the arm leads, the hand opens late
            "0.4": {"wing_left": {"rotation": ARM_SPREAD}, "wingtip_left": {"rotation": HAND_SPREAD}}}),
        "roar": (0.6, None, {
            "head": {"rotation": {"0.0": (0, 0, 0), "0.2": (-18, 0, 0), "0.6": (0, 0, 0)}},
            "jaw": {"rotation": {"0.0": (0, 0, 0), "0.2": (26, 0, 0), "0.6": (0, 0, 0)}}}),
    },
    base_animations={
        "fly": {"loop": True, "bones": {
            # between ARM_UP and ARM_DOWN about the spread pose; the hand lags the arm by 70 degrees of phase
            "wing_left": {"rotation": [0, 0, "33.0 + math.sin(q.life_time * 540.0) * 20.0"]},
            "wing_right": {"rotation": [0, 0, "-33.0 - math.sin(q.life_time * 540.0) * 20.0"]},
            "wingtip_left": {"rotation": [0, 0, "-47.0 + math.sin(q.life_time * 540.0 - 70.0) * 25.0"]},
            "wingtip_right": {"rotation": [0, 0, "47.0 - math.sin(q.life_time * 540.0 - 70.0) * 25.0"]}}},
        "idle": {"loop": True, "bones": {
            "tail": {"rotation": [0, "math.sin(q.life_time * 90.0) * 8.0", 0]},
            "tail_tip": {"rotation": [0, "math.sin(q.life_time * 90.0 - 40.0) * 12.0", 0]},
            "neck": {"rotation": ["math.sin(q.life_time * 60.0) * 2.0", 0, 0]}}},
    },
    fixed=FIXED, palette=palette, decal=decal,
)

if __name__ == "__main__":
    build()
    sys.exit(run(sys.argv[1:], m, SPEC))
