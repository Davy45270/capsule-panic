"""Rabattement d'un sprite sur la palette de sa planche, et rampe de teinte par luminance.

La palette de référence est celle du contrôle de chaîne : les 16 couleurs dominantes de l'élément
de planche que le sprite remplace (alpha seuillé à 95 %, fond blanc, sans tramage), plus les jetons
de la spec. Un pixel déjà à moins de TOLERANCE d'une couleur de la palette reste tel quel ; un pixel
plus loin est déplacé en ligne droite vers la couleur la plus proche, juste assez pour finir à RAYON
d'elle. Aucun tramage, aucun aplat : le modelé est gardé, l'alpha (anticrénelage) n'est jamais touché.
"""
import re
import subprocess

import numpy as np
from PIL import Image

from assets_spec import jetons

JETONS = jetons()
TOLERANCE = 48.0
RAYON = 44.0


SATURE = 0.25
ENCRE = 64.0
ECART_TEINTE = 15.0
# Le cyan de la spec et les bleus de la planche (196–223°) sont une même famille : la rampe du cyan garde les
# bleus et l'encrage marine de la planche. Le magenta (328°) n'a pas de famille dans la planche : ses rouges (355–5°)
# en restent exclus.
FAMILLE = {"#38BDF8": 30.0}
REFLET = 0.08  # un reflet est quasi blanc : un gris teinté (lavande du panneau) n'en est pas un
ENCRAGE = 0.35  # sous 35 % du ton dominant, un pixel de la planche est de l'encrage (contour)
SOMBRE = 60  # une couleur dont aucun canal ne dépasse 60 compte comme un encrage neutre (quasi noir)


def teinte_saturation(rgb):
    """Teinte (degrés) et saturation HSV de couleurs RVB 0–255."""
    maxi, mini = rgb.max(-1), rgb.min(-1)
    delta = maxi - mini
    saturation = np.where(maxi > 0, delta / np.maximum(maxi, 1e-9), 0)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    d = np.maximum(delta, 1e-9)
    teinte = np.select([maxi == r, maxi == g], [((g - b) / d) % 6, (b - r) / d + 2], (r - g) / d + 4) * 60
    return np.where(delta > 0, teinte, 0), saturation


def rvb(couleur):
    return tuple(int(couleur[k:k + 2], 16) for k in (1, 3, 5))


def palette_reference(planche, boite):
    """Palette de l'élément de planche (même commande que le contrôle de chaîne), jetons de la spec compris."""
    texte = subprocess.run(
        ["magick", str(planche), "-crop", boite, "+repage", "-channel", "A", "-fx", "u<0.95?0:1", "+channel",
         "-background", "white", "-alpha", "remove", "+dither", "-colors", "16", "-unique-colors",
         "-depth", "8", "txt:-"], capture_output=True, text=True, check=True).stdout
    couleurs = [tuple(float(v) for v in m.groups())
                for m in re.finditer(r": \(([\d.]+),([\d.]+),([\d.]+)", texte)]
    return np.array(couleurs + [rvb(c) for c in JETONS], float)


def rabattre(sprite, palette, meme_teinte=False, rayon=RAYON, tolerance=TOLERANCE):
    """Rabat en place les pixels hors tolérance vers la couleur la plus proche (déplacement minimal) ; avec
    meme_teinte (sprites recolorés sur une rampe), vers la plus proche de même teinte ou neutre. Rend (pixels
    déplacés, pixels visibles)."""
    image = np.asarray(Image.open(sprite).convert("RGBA")).astype(float)
    couleurs, alpha = image[..., :3].reshape(-1, 3), image[..., 3].reshape(-1)
    ecarts = couleurs[:, None, :] - palette[None, :, :]
    distances = np.sqrt((ecarts ** 2).sum(-1))
    # Rampe de teinte cohérente : un pixel coloré ne part que vers une couleur neutre (ou sombre) ou de même teinte
    # (± ECART_TEINTE), jamais vers une autre famille (un magenta ombré ne vire pas au rouge de la planche).
    t_pix, s_pix = teinte_saturation(couleurs)
    t_pal, s_pal = teinte_saturation(palette)
    ecart = np.abs(t_pix[:, None] - t_pal[None, :])
    ecart = np.minimum(ecart, 360 - ecart)
    neutre_pal = (s_pal < SATURE) | (palette.max(-1) < SOMBRE)
    # Deux tons d'encrage (luminance < ENCRE) se valent quelle que soit leur teinte : un trait sombre reste sombre.
    encre = (luminance(couleurs)[:, None] < ENCRE) & (luminance(palette)[None, :] < ENCRE)
    permis = (s_pix[:, None] < SATURE) | neutre_pal[None, :] | (ecart <= ECART_TEINTE) | encre
    permis[~permis.any(1) | (not meme_teinte)] = True
    distances_permises = np.where(permis, distances, np.inf)
    proche = np.where(distances.min(1) <= tolerance, distances.argmin(1), distances_permises.argmin(1))
    distance = distances[np.arange(len(couleurs)), proche]
    hors = (alpha > 0) & (distance > tolerance)
    cible = palette[proche[hors]]
    couleurs[hors] = cible + (couleurs[hors] - cible) * (rayon / distance[hors])[:, None]
    image[..., :3] = np.clip(np.rint(couleurs), 0, 255).reshape(image.shape[:2] + (3,))
    Image.fromarray(image.astype(np.uint8), "RGBA").save(sprite)
    return int(hors.sum()), int((alpha > 0).sum())


def luminance(rgb):
    return rgb @ np.array([0.2126, 0.7152, 0.0722])


def rampe(palette, couleur):
    """Arrêts de la rampe : le jeton, les couleurs de la planche de même teinte (± ECART_TEINTE), les neutres
    sombres (encrage) et clairs (reflets) ; triés par luminance. Les autres jetons de la spec en sont exclus."""
    jeton = np.array(rvb(couleur), float)
    autres = [np.array(rvb(c), float) for c in JETONS if c.upper() != couleur.upper()]
    l_jeton = luminance(jeton)
    teinte_j, _ = teinte_saturation(jeton)
    arrets = [jeton]
    for c in palette:
        if any(np.allclose(c, a) for a in autres) or np.allclose(c, jeton):
            continue
        t, s = teinte_saturation(c)
        ecart = min(abs(t - teinte_j), 360 - abs(t - teinte_j))
        encrage = (s < SATURE or c.max() < SOMBRE) and luminance(c) < 0.5 * l_jeton
        reflet = s < REFLET and luminance(c) > l_jeton
        neutre_utile = encrage or reflet
        if (s >= SATURE and ecart <= FAMILLE.get(couleur.upper(), ECART_TEINTE)) or neutre_utile:
            arrets.append(c)
    arrets = np.array(sorted(arrets, key=luminance))
    return arrets, luminance(arrets)


def teinter(source, couleur, sortie, palette, rouge=False):
    """Rampe de teinte par correspondance de luminance, construite sur les couleurs de la planche et de la spec :
    la luminance dominante des pixels colorés de la source (ton moyen de la planche) prend exactement le jeton ;
    plus sombre, la luminance descend linéairement jusqu'à l'arrêt le plus sombre ; plus clair, elle monte jusqu'au
    plus clair. La couleur est interpolée entre les deux arrêts qui encadrent cette luminance."""
    image = np.asarray(Image.open(source).convert("RGBA")).astype(float)
    rgb, alpha = image[..., :3], image[..., 3]
    lum = luminance(rgb)
    maxi, mini = rgb.max(-1), rgb.min(-1)
    sature = (alpha > 128) & (maxi - mini > 0.45 * np.maximum(maxi, 1))
    if rouge:
        sature &= rgb[..., 0] > rgb[..., 2]
    histo = np.histogram(lum[sature], bins=64, range=(0, 256))[0]
    milieu = (histo.argmax() + 0.5) * 4 if sature.any() else 128.0
    arrets, l_arrets = rampe(palette, couleur)
    l_jeton = luminance(np.array(rvb(couleur), float))
    cible = np.where(lum <= milieu,
                     l_arrets[0] + (l_jeton - l_arrets[0]) * lum / milieu,
                     l_jeton + (l_arrets[-1] - l_jeton) * (lum - milieu) / max(255 - milieu, 1))
    i = int(np.flatnonzero(np.isclose(l_arrets, l_jeton))[0])
    ecart = float(np.linalg.norm(arrets[i] - arrets[i - 1])) if i > 0 else 0.0
    if i == 1 and ecart > 2 * TOLERANCE:
        # Aucun ton intermédiaire de cette teinte dans la planche, seulement l'encrage : les ombres s'arrêtent
        # à RAYON du jeton (modelé atténué mais continu) ; seul l'encrage (luminance < ENCRAGE × ton dominant)
        # descend vers l'arrêt sombre. Sans cela, une ombre large de la planche bascule d'un bloc vers le noir.
        l_ombre = l_jeton - (l_jeton - l_arrets[0]) * RAYON / ecart
        cible = np.where((lum <= milieu) & (lum >= ENCRAGE * milieu), np.maximum(cible, l_ombre), cible)
    teinte = np.stack([np.interp(cible, l_arrets, arrets[:, k]) for k in range(3)], -1)
    resultat = image.copy()
    resultat[..., :3] = np.clip(np.rint(teinte), 0, 255)
    Image.fromarray(resultat.astype(np.uint8), "RGBA").save(sortie)
    return arrets


ENCRE_MARINE = "#080E22"   # encrage marine des blocs bleus : arrêt sombre des rampes projetées
GRIS = 0.08                # saturation HLS sous laquelle un pixel n'a pas de teinte (reflet blanc, gris) : jamais recoloré


def hexa(rgb):
    return "#" + "".join(f"{int(round(v)):02X}" for v in rgb)


def clarte_teinte_saturation(rgb):
    """Clarté HLS (0–1), teinte (degrés) et saturation HLS de couleurs RVB 0–255."""
    x = rgb / 255.0
    maxi, mini = x.max(-1), x.min(-1)
    clarte = (maxi + mini) / 2
    delta = maxi - mini
    saturation = np.where(delta == 0, 0, delta / np.maximum(np.where(clarte <= 0.5, maxi + mini, 2 - maxi - mini), 1e-9))
    teinte, _ = teinte_saturation(rgb)
    return clarte, teinte, saturation


def dans_plage(teinte, h1, h2):
    return (teinte >= h1) & (teinte <= h2) if h1 <= h2 else (teinte >= h1) | (teinte <= h2)


def ton_source(source, h1, h2):
    """Ton du corps de la zone de planche : couleur médiane (par canal) des pixels opaques de la plage de teintes, de
    clarté HLS comprise entre 0,4 et 0,6. C'est la couleur source déclarée de la recoloration."""
    image = np.asarray(Image.open(source).convert("RGBA")).astype(float)
    rgb = image[..., :3][image[..., 3] > 242]
    clarte, teinte, saturation = clarte_teinte_saturation(rgb)
    corps = dans_plage(teinte, h1, h2) & (saturation >= GRIS) & (clarte >= 0.4) & (clarte <= 0.6)
    return hexa(np.median(rgb[corps], 0))


def projeter_rampe(source, sortie, h1, h2, cible, sombre=ENCRE_MARINE, clair="#FFFFFF", pivot=0.5):
    """Rampe source projetée sur la teinte cible, par correspondance de clarté : chaque pixel dont la teinte est dans
    [h1, h2]° (h1 > h2 traverse 0°) et la saturation HLS d'au moins GRIS prend la couleur de la rampe sombre→cible→clair
    à sa clarté HLS (0 → sombre, pivot → cible, 1 → clair ; le pivot est la clarté du ton source, qui
    prend donc exactement la cible). Les autres pixels (reflets blancs, gris) restent ; l'alpha
    (anticrénelage) n'est jamais touché. Ni tramage, ni aplat : le modelé de la planche est celui de la clarté.
    C'est la projection que le contrôle de chaîne applique à la palette de la zone (style-palette.py --recoloration)."""
    image = np.asarray(Image.open(source).convert("RGBA")).astype(float)
    rgb = image[..., :3]
    clarte, teinte, saturation = clarte_teinte_saturation(rgb)
    choisi = dans_plage(teinte, h1, h2) & (saturation >= GRIS)
    s, c, l = (np.array(rvb(v), float) for v in (sombre, cible, clair))
    t = np.where(clarte < pivot, clarte / pivot, (clarte - pivot) / (1 - pivot))[..., None]
    rampe_px = np.where(clarte[..., None] < pivot, s + (c - s) * t, c + (l - c) * t)
    resultat = image.copy()
    resultat[..., :3] = np.where(choisi[..., None], np.clip(np.rint(rampe_px), 0, 255), rgb)
    Image.fromarray(resultat.astype(np.uint8), "RGBA").save(sortie)
