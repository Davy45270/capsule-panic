"""Palette de référence d'une zone de planche, calculée exactement comme le contrôle de chaîne (style-palette.py).

Les 16 couleurs dominantes des SEULS pixels opaques de la zone (alpha seuillé à 95 %), par coupe médiane : aucun
aplatissement sur fond blanc, qui faisait presque toujours entrer le blanc dans la palette et en chasser une couleur
réelle de la planche. Sans dépendance (ni numpy ni Pillow) : testé en CI sur des pixels fabriqués.
"""
import re

OPAQUE = 242   # alpha 8 bits à partir duquel un pixel compte (95 %)
COMMANDE = ("-channel", "A", "-fx", "u<0.95?0:1", "+channel", "-depth", "8", "txt:-")


def pixels_opaques(texte):
    """Pixels RVB (flottants) des lignes `txt:` d'ImageMagick dont l'alpha atteint OPAQUE ; sans alpha, opaques."""
    pixels = []
    for m in re.finditer(r": \(([\d.]+),([\d.]+),([\d.]+)(?:,([\d.]+))?\)", texte):
        r, g, b, a = (float(x) if x else 255.0 for x in m.groups())
        if a >= OPAQUE:
            pixels.append((r, g, b))
    return pixels


def coupe_mediane(pixels, n=16):
    """Palette de n couleurs par coupe médiane : on coupe en deux, à la médiane de son canal le plus étendu, la boîte la
    plus étendue (la première en cas d'égalité), jusqu'à n boîtes ; chaque couleur est la moyenne de sa boîte."""
    boites = [list(pixels)] if pixels else []
    while len(boites) < n:
        i, k, etendue = max(((i, k, max(p[k] for p in b) - min(p[k] for p in b)) for i, b in enumerate(boites) if len(b) > 1
                             for k in range(3)), key=lambda x: x[2], default=(None, None, 0))
        if i is None or etendue == 0:
            break
        b = sorted(boites.pop(i), key=lambda p: p[k])
        m = len(b) // 2
        boites += [b[:m], b[m:]]
    return [tuple(sum(p[k] for p in b) / len(b) for k in range(3)) for b in boites]
