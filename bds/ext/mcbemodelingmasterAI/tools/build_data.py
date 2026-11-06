"""Regenerates data/*.json from the docs, so the machine-readable lists never drift from the prose.

    python tools/build_data.py            write
    python tools/build_data.py --check    fail if the files on disk are stale (CI)
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def failure_modes():
    rows = []
    for line in (ROOT / "docs/14-failure-modes.md").read_text(encoding="utf-8").splitlines():
        if re.match(r"\|\s*F\d+", line):
            code, symptom, cause, cure = cells(line)
            rows.append({"id": code, "symptom": symptom, "cause": cause, "cure": cure})
    return {"source": "docs/14-failure-modes.md", "failure_modes": rows}


def review_checklist():
    sections, current = [], None
    for line in (ROOT / "docs/15-review-checklist.md").read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            current = {"section": line[3:].strip(), "items": []}
            sections.append(current)
        elif line.startswith("- [ ]") and current is not None:
            current["items"].append(line[5:].strip())
    return {"source": "docs/15-review-checklist.md",
            "instruction": "Answer every item with evidence: a command's output, a render, a diff.",
            "sections": sections}


def rules():
    text = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
    body = text.split("## 3. Hard rules", 1)[1].split("## 4.", 1)[0]
    out, group = [], None
    for line in body.splitlines():
        heading = re.match(r"\*\*(.+?)\*\*\s*$", line)
        item = re.match(r"(\d+b?)\.\s+(.*)", line)
        if heading:
            group = heading.group(1)
        elif item:
            out.append({"id": item.group(1), "group": group, "rule": item.group(2).strip()})
    return {"source": "AGENTS.md section 3", "rules": out}


def face_mapping():
    return {
        "source": "docs/02-x-mirror-and-face-uv.md",
        "summary": "Bedrock draws an entity model mirrored in x. A cube spans x0..x1, y0..y1, z0..z1 in the JSON "
                   "(sx, sy, sz are its sizes); u and v run 0..1 across the face's UV rectangle, left to right "
                   "and top to bottom of the texture. The table gives the point of the cube, in JSON coordinates, "
                   "that shows texel (u, v).",
        "rotation": "JSON [rx, ry, rz] is applied as right-handed (-rx, ry, -rz), X then Y then Z, about the pivot. "
                    "Animation rotations are added to the bind rotation.",
        "mirror_of_a_part": {"position": "[-x, y, z]", "rotation": "[rx, -ry, -rz]", "note": "never write -0.0"},
        "faces": {
            "east":  {"shown_on": "the LOW-x side",  "point": ["x0", "y1 - v*sy", "z1 - u*sz"]},
            "west":  {"shown_on": "the HIGH-x side", "point": ["x1", "y1 - v*sy", "z0 + u*sz"]},
            "north": {"shown_on": "the low-z side (front)",  "point": ["x0 + u*sx", "y1 - v*sy", "z0"]},
            "south": {"shown_on": "the high-z side (rear)",  "point": ["x1 - u*sx", "y1 - v*sy", "z1"]},
            "up":    {"shown_on": "the top",    "point": ["x0 + u*sx", "y1", "z1 - v*sz"]},
            "down":  {"shown_on": "the bottom", "point": ["x0 + u*sx", "y0", "z0 + v*sz"]},
        },
        "consequences": [
            "The outer face of a part on the +x side is `west`; on the -x side it is `east`.",
            "A renderer that draws the JSON as written shows every side picture on the wrong side and mirrored.",
            "Asymmetric art (text, numbers, a dial) must be verified in the game before it ships.",
        ],
        "evidence": "A wheel hub's outer face blanked by a tool that assumed east = high x showed as a grey square "
                    "in the game; emblem text placed with this table reads correctly in the game.",
    }


FILES = {"failure-modes.json": failure_modes, "review-checklist.json": review_checklist,
         "rules.json": rules, "face-mapping.json": face_mapping}


def main(argv):
    stale = []
    for name, make in FILES.items():
        text = json.dumps(make(), indent=2, ensure_ascii=False) + "\n"
        path = ROOT / "data" / name
        if "--check" in argv:
            if not path.exists() or path.read_text(encoding="utf-8") != text:
                stale.append(name)
        else:
            path.parent.mkdir(exist_ok=True)
            path.write_text(text, encoding="utf-8", newline="\n")
            print("wrote", path.relative_to(ROOT))
    if stale:
        print("stale:", ", ".join(stale), "- run python tools/build_data.py")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
