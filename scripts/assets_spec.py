"""Jetons de couleur de la spec, lus à leur source unique (packages/renderer/src/art.ts, `TOKENS`).

Sans dépendance (ni numpy ni Pillow) : la commande du contrôle de palette est testée en CI.
"""
import re
import subprocess
from pathlib import Path

ART = Path(__file__).resolve().parents[1] / "packages/renderer/src/art.ts"
ORDRE = ("cyan", "amber", "magenta")   # ordre du contrôle de chaîne : #38BDF8,#FBBF24,#F472B6


def jetons():
    """(cyan, ambre, magenta) en #RRGGBB, lus dans `TOKENS` d'art.ts."""
    ligne = next(l for l in ART.read_text().splitlines() if l.startswith("export const TOKENS"))
    valeurs = dict(re.findall(r"(\w+): '(#[0-9A-Fa-f]{6})'", ligne))
    return tuple(valeurs[nom].upper() for nom in ORDRE)


def commande_palette(outils, reference, sprite):
    """Contrôle de palette d'un sprite, avec les jetons de la spec comme le contrôle P4 de la chaîne."""
    return ["python3", str(Path(outils) / "style-palette.py"), str(reference), str(sprite),
            "--couleurs", ",".join(jetons())]


def mesure_palette(reference, sprite, outils, journal):
    """Journal de construction : le contrôle de palette du sprite (code 1 = sous le seuil, consigné sans arrêter)."""
    resultat = subprocess.run(commande_palette(outils, reference, sprite), stdout=subprocess.PIPE, text=True)
    journal.write(resultat.stdout)
    print(f"Code palette : {resultat.returncode}", file=journal)
    if resultat.returncode not in (0, 1):
        resultat.check_returncode()
