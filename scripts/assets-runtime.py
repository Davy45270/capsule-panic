#!/usr/bin/env python3
"""Prépare les variantes légères chargées par le jeu et la planche miniature des crédits."""

import json
import re
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "packages/assets"
APP = ROOT / "apps/web/src"
RUNTIME = ASSETS / "runtime"
SIZE = 28
COLUMNS = 12


def run(*args):
    subprocess.run(args, check=True)


def main():
    RUNTIME.mkdir(exist_ok=True)
    sources = (APP / "artwork.ts", APP / "style.css", ROOT / "packages/renderer/src/pieces.ts")
    used = sorted(set().union(*(re.findall(r'assets/runtime/(sprite-[\w-]+)\.webp', path.read_text())
                               for path in sources)))
    licences = json.loads((ASSETS / "licences.json").read_text())["assets"]
    provenance = json.loads((ASSETS / "provenance.json").read_text())["assets"]
    captions = {item["id"]: [item["origine"], item["planche"]] for item in provenance}
    rows = ",\n".join("    " + json.dumps(captions[name], ensure_ascii=False) for name in licences)
    (RUNTIME / "credits.json").write_text(f"[\n{rows}\n]\n")

    with tempfile.TemporaryDirectory(prefix="capsule-runtime-") as work:
        work = Path(work)
        for name in used:
            trimmed = work / f"{name}.png"
            run("magick", ASSETS / "sprites" / f"{name}.png", "-trim", "+repage", trimmed)
            run("cwebp", "-quiet", "-q", "85", "-m", "6", trimmed, "-o", RUNTIME / f"{name}.webp")

        tiles = [ASSETS / "sprites" / f"{name}.png" for name in licences]
        sheet = work / "credits.png"
        run("magick", "montage", *tiles, "-background", "none", "-geometry", f"{SIZE}x{SIZE}+0+0",
            "-tile", f"{COLUMNS}x", sheet)
        run("cwebp", "-quiet", "-q", "70", "-m", "6", sheet, "-o", RUNTIME / "credits.webp")


if __name__ == "__main__":
    main()
