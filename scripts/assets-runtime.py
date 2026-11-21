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

# Découpes dans les sprites détourés : seules les illustrations sont utilisées dans l'aide.
ILLUSTRATIONS = {
    "tutoriel-deplacer": "142x76+13+62",
    "tutoriel-pivoter": "96x88+36+55",
    "tutoriel-aligner": "154x44+8+63",
    "tutoriel-eliminer": "150x72+9+53",
    "gestes-gestes-jeu": "288x93+0+0",
}
PILULES = {
    "jouer-accueil", "options-accueil", "credits-accueil", "aide-accueil",
    "suivant-reussite", "rejouer-reussite", "menu-reussite",
}
# Bandes de matière sans lettrage, après normalisation en 126 × 28.
RACCORDS_PILULE = {
    "aide-accueil": ("3x20+57+4", "24x20+14+4"),
    "suivant-reussite": ("3x13+55+7", "29x13+9+7"),
}


def run(*args):
    subprocess.run(args, check=True)


def sprite_runtime(name, work):
    identifiant = name.removeprefix("sprite-")
    source = "sprite-options-accueil" if identifiant == "aide-accueil" else name
    trimmed = work / f"{name}.png"
    run("magick", ASSETS / "sprites" / f"{source}.png", "-trim", "+repage", trimmed)
    if identifiant in ILLUSTRATIONS:
        run("magick", trimmed, "-crop", ILLUSTRATIONS[identifiant], "+repage", trimmed)
    if identifiant in PILULES:
        run("magick", trimmed, "-resize", "126x28!", trimmed)
        if identifiant in RACCORDS_PILULE:
            sample, destination = RACCORDS_PILULE[identifiant]
            width, height, x, y = re.split("[x+]", destination)
            run("magick", trimmed, "(", "+clone", "-crop", sample, "+repage",
                "-resize", f"{width}x{height}!", ")", "-geometry", f"+{x}+{y}",
                "-compose", "Over", "-composite", trimmed)
        # Détourage de la pilule peinte, avec un bord anticrénelé.
        run("magick", trimmed, "(", "-size", "126x28", "xc:black", "-fill", "white",
            "-draw", "roundrectangle 1,1 124,26 12,12", "-alpha", "copy", ")",
            "-compose", "CopyAlpha", "-composite", trimmed)
    return trimmed


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
            trimmed = sprite_runtime(name, work)
            run("cwebp", "-quiet", "-q", "85", "-m", "6", trimmed, "-o", RUNTIME / f"{name}.webp")

        tiles = [ASSETS / "sprites" / f"{name}.png" for name in licences]
        sheet = work / "credits.png"
        run("magick", "montage", *tiles, "-background", "none", "-geometry", f"{SIZE}x{SIZE}+0+0",
            "-tile", f"{COLUMNS}x", sheet)
        run("cwebp", "-quiet", "-q", "70", "-m", "6", sheet, "-o", RUNTIME / "credits.webp")


if __name__ == "__main__":
    main()
