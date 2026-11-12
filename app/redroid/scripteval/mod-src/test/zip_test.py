#!/usr/bin/env python3
"""Checks Studio's in-browser ZIP reader / pack finder (studio/src/zip.js) under Node
against archives written by Python's zipfile (an independent implementation):
deflate + stored entries, a folder-wrapped pack, an .mcaddon with nested .mcpack
files (resource + behavior), ZIP64 (more than 65535 entries), junk files, a zip
without a manifest, and lenient manifests (comments, trailing commas, lang keys).

    python3 test/zip_test.py
"""
import io, json, os, subprocess, sys, tempfile, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
STUDIO = os.path.join(HERE, "..", "studio", "src", "zip.js")

MANIFEST = """{
  // comments and trailing commas are fine for Bedrock
  "format_version": 2,
  "header": { "name": "pack.name", "description": "pack.description", "uuid": "%s", "version": [1, 2, 3], "min_engine_version": [1, 20, 0], },
  /* block comment */
  "modules": [ { "type": "%s", "uuid": "00000000-0000-4000-8000-000000000001", "version": [1, 0, 0] } ],
  "subpacks": [ { "folder_name": "low", "name": "Low res", "memory_tier": 1 } ],
}
"""
PNG = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) + os.urandom(300)
BIG = os.urandom(70000) + b"A" * 300000  # mixed: incompressible + compressible


def pack_zip(prefix="", uuid="11111111-2222-4333-8444-555555555555", kind="resources", name_lang="Fancy §6Pack"):
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        z.writestr(prefix + "manifest.json", MANIFEST % (uuid, kind), compress_type=zipfile.ZIP_DEFLATED)
        z.writestr(prefix + "pack_icon.png", PNG, compress_type=zipfile.ZIP_STORED)
        z.writestr(prefix + "texts/en_US.lang", f"pack.name={name_lang}\t#comment\npack.description=Nice\n", compress_type=zipfile.ZIP_DEFLATED)
        z.writestr(prefix + "textures/blocks/stone.png", BIG, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr(prefix + "subpacks/low/textures/blocks/stone.png", b"low", compress_type=zipfile.ZIP_DEFLATED)
        z.writestr(prefix + "empty.txt", b"", compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("__MACOSX/._junk", b"junk")
        z.writestr(prefix + ".DS_Store", b"junk")
    return b.getvalue()


def main():
    d = tempfile.mkdtemp(prefix="se-zip-")
    open(f"{d}/plain.mcpack", "wb").write(pack_zip())
    open(f"{d}/wrapped.zip", "wb").write(pack_zip("Wrapped Pack/", uuid="aaaaaaaa-2222-4333-8444-555555555555"))
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        z.writestr("Addon_RP.mcpack", pack_zip(uuid="bbbbbbbb-2222-4333-8444-555555555555"), compress_type=zipfile.ZIP_STORED)
        z.writestr("Addon_BP.mcpack", pack_zip(uuid="cccccccc-2222-4333-8444-555555555555", kind="data"), compress_type=zipfile.ZIP_DEFLATED)
    open(f"{d}/both.mcaddon", "wb").write(b.getvalue())
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w", allowZip64=True) as z:
        z.writestr("manifest.json", MANIFEST % ("dddddddd-2222-4333-8444-555555555555", "resources"))
        for i in range(66000):
            z.writestr(f"t/{i}.txt", str(i), compress_type=zipfile.ZIP_STORED)
    open(f"{d}/many.zip", "wb").write(b.getvalue())
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        z.writestr("readme.txt", "not a pack")
    open(f"{d}/nopack.zip", "wb").write(b.getvalue())
    open(f"{d}/expect.json", "w").write(json.dumps({"bigLen": len(BIG), "bigHead": list(BIG[:16]), "bigTail": list(BIG[-16:]), "png": len(PNG)}))
    r = subprocess.run(["node", os.path.join(HERE, "zip_test.mjs"), d, STUDIO], capture_output=True, text=True, timeout=300)
    sys.stdout.write(r.stdout)
    sys.stderr.write(r.stderr)
    return r.returncode


if __name__ == "__main__":
    sys.exit(main())
