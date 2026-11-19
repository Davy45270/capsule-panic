"""Retouches locales des pixels peints, avant normalisation des sprites."""
import re
import subprocess

import numpy as np

from assets_palette import (ENCRE_MARINE, RAYON, TOLERANCE, clarte_teinte_saturation, palette_aplatie,
                            projeter_rampe, rvb, teinter, ton_source)
from assets_spec import jetons


def magick(*args):
    subprocess.run(["magick", *args], check=True)


def masque(image, dessin, sortie):
    magick(image, "-alpha", "off", "-colorspace", "gray", "-evaluate", "set", "0",
           "-fill", "white", "-draw", dessin, sortie)


def cadre(fiche):
    """Boîte d'inventaire élargie de la marge, bornée au coin de la planche."""
    largeur, hauteur, x, y = map(int, re.split("[x+]", fiche["boite"]))
    marge = fiche.get("marge", 0)
    gauche, haut = max(0, x - marge), max(0, y - marge)
    return f"{x + largeur + marge - gauche}x{y + hauteur + marge - haut}+{gauche}+{haut}"


def remplissage(image, condition, graines, sortie, rayon):
    """Zones connexes qui vérifient la condition et contiennent une graine, dilatées."""
    dessin = [argument for x, y in graines for argument in ("-draw", f"color {x},{y} floodfill")]
    magick(image, "-channel", "RGB", "-fx", f"{condition}?1:0", "+channel", "-alpha", "off", "-colorspace", "sRGB",
           "-type", "TrueColor", "-fill", "red", *dessin, "-fill", "black", "+opaque", "red",
           "-fill", "white", "-opaque", "red", "-colorspace", "gray",
           "-morphology", "Dilate", f"Disk:{rayon}", sortie)


def retoucher(planche, fiche, travail, cellules):
    identifiant = fiche["id"]
    reference = travail / f"reference-{identifiant}.png"
    resultat = travail / f"retouche-{identifiant}.png"
    couche = travail / f"masque-{identifiant}.png"
    magick(planche, "-crop", cadre(fiche), "+repage", f"PNG32:{reference}")
    magick(reference, f"PNG32:{resultat}")
    if "composante" in fiche:
        # Seule la composante connexe du personnage garde son alpha réel : aucun voisin de la planche.
        remplissage(reference, "a>0.5", [fiche["composante"]], couche, 3)
        magick(resultat, "(", couche, "-alpha", "copy", ")", "-compose", "DstIn",
               "-composite", f"PNG32:{resultat}")
    if "silhouette" in fiche:
        dessin = fiche["silhouette"]
        if "effacer" in fiche:
            dessin += " fill black " + fiche["effacer"]
        masque(reference, dessin, couche)
        magick(resultat, "(", couche, "-alpha", "copy", ")", "-compose", "DstIn",
               "-composite", f"PNG32:{resultat}")
    if "veste" in fiche:
        masque(reference, fiche["veste"], couche)
        # Les plis et l'encrage restent inscrits dans la luminance de la planche.
        magick(resultat, "(", "+clone", "-colorspace", "gray", "-colorspace", "sRGB",
               "-fill", fiche.get("veste_teinte", "#202554"), "-colorize", f"{fiche.get('veste_force', 74)}%", ")", couche,
               "-compose", "Src", "-composite", f"PNG32:{resultat}")
        # La recoloration ne rend jamais opaque un pixel transparent de la planche.
        magick(resultat, reference, "-compose", "DstIn", "-composite", f"PNG32:{resultat}")
    if "peinture" in fiche:
        magick(resultat, "-draw", fiche["peinture"], f"PNG32:{resultat}")
    if "gant" in fiche:
        # Le gant garde les pixels de la planche : seule la veste change de couleur.
        gant = fiche["gant"]
        remplissage(reference, f"a>0.5 && lightness>{gant['seuil']}", gant["graines"], couche, 2)
        magick(resultat, "(", reference, "(", couche, "-alpha", "copy", ")",
               "-compose", "DstIn", "-composite", ")", "-compose", "Over", "-composite",
               f"PNG32:{resultat}")
    for source, destination in fiche.get("raccords", []):
        largeur, hauteur, x, y = re.split("[x+]", destination)
        magick(resultat, "(", reference, "-crop", source, "+repage",
               "-resize", f"{largeur}x{hauteur}!", "-alpha", "off", ")", "-geometry", f"+{x}+{y}",
               "-compose", "Over", "-composite", f"PNG32:{resultat}")
    if "cellule" in fiche:
        cote, x, y = fiche["cellule"]
        magick(resultat, "(", cellules / "sprite-cellule-cyan.png", "-trim", "+repage",
               "-resize", f"{cote}x{cote}", ")", "-geometry", f"+{x}+{y}",
               "-compose", "Over", "-composite", f"PNG32:{resultat}")
        if "premier_plan" in fiche:
            masque(reference, fiche["premier_plan"], couche)
            magick(resultat, "(", reference, "(", couche, "-alpha", "copy", ")",
                   "-compose", "DstIn", "-composite", ")", "-gravity", "northwest",
                   "-geometry", "+0+0", "-compose", "Over", "-composite", f"PNG32:{resultat}")
    for couleur, region, declare, teintes in fiche.get("recolorations", []):
        source = ["-crop", region, "+repage"] if region else []
        teinte = travail / f"teinte-{identifiant}.png"
        # Ancre les tons moyens sur le jeton tout en conservant ombres et reflets.
        original = travail / f"couleurs-{identifiant}.png"
        magick(resultat, *source, f"PNG32:{original}")
        h1, h2 = plage(teintes)
        mesure = ton_source(original, h1, h2)
        if mesure != declare:
            # La chaîne déclarée doit rester vraie : le ton source se mesure, il ne se suppose pas.
            raise ValueError(f"{identifiant} : ton source mesuré {mesure}, déclaré {declare}")
        if fiche.get("rampe") == "projection":
            projeter_rampe(original, teinte, h1, h2, couleur, ENCRE_MARINE, CLAIR, pivot(declare))
        elif fiche.get("rampe") == "luminance":
            teinter(original, couleur, teinte, palette_aplatie(planche, fiche["boite"]), rouge=bool(region))
        else:
            # Plus de rampe implicite : la rampe linéaire sur le gris (pivot 188 ou 138) n'était pas celle déclarée.
            raise ValueError(f"{identifiant} : rampe à déclarer (projection ou luminance)")
        if region:
            _, x, y = region.split("+")
            # Les pixels bleus du panneau autour des blocs restent intacts.
            magick(original, "-alpha", "off", "-fx", "min(1,max(0,(r-b)*12))", couche)
            magick(resultat, "(", teinte, "(", couche, "-alpha", "copy", ")",
                   "-compose", "DstIn", "-composite", ")", "-geometry", f"+{x}+{y}",
                   "-compose", "Over", "-composite", f"PNG32:{resultat}")
        else:
            teinte.replace(resultat)
    return reference, resultat


RABATTEMENT = (f"retouche rabattement sur la palette de la planche et de la spec, sans tramage : pixels à plus de "
               f"{TOLERANCE:g} de la palette ramenés vers la couleur la plus proche jusqu'à {RAYON:g}, alpha inchangé")
RABATTEMENT_FAMILLE = (RABATTEMENT.replace("sur la palette de la planche", "sur la palette sans biais de la planche (coupe "
                                           "médiane des seuls pixels opaques, comme le contrôle de chaîne)")
                       + " ; un pixel neutre dont la couleur la plus proche est colorée, ou l'inverse, reste tel quel "
                       "(encrage excepté)")
RABATTEMENT_TEINTE = RABATTEMENT.replace("la couleur la plus proche", "la couleur neutre ou de même teinte la plus proche")

JETONS_A2 = dict(zip(jetons(), ("cyan", "ambre", "magenta")))
MODES = {"projection": "rampe projetée", "luminance": "rampe luminance"}
CLAIR = "#FFFFFF"


def plage(teintes):
    """« rouge 340–20° » → (340.0, 20.0)."""
    h1, h2 = re.search(r"(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*°", teintes).groups()
    return float(h1), float(h2)


def pivot(source):
    """Clarté HLS du ton source : c'est elle qui prend exactement la couleur cible sur la rampe projetée."""
    return float(clarte_teinte_saturation(np.array(rvb(source), float))[0])


def _sommets(dessin):
    return sum(len(polygone.split()) for polygone in dessin.split("polygon")[1:])


def transformations_derive(fiche):
    """Ce que retoucher() fait vraiment à la fiche, dans l'ordre, en chaînes « recoloration <de>→<vers> »
    ou « retouche <quoi> ». Un dérivé sans transformation n'existe pas : la liste est toujours non vide."""
    etapes = []
    if "composante" in fiche:
        x, y = fiche["composante"]
        etapes.append(f"retouche composante connexe seule (alpha > 50 % contenant {x},{y}, dilatée Disk:3) : "
                      "voisins de la planche retirés")
    if "silhouette" in fiche:
        etapes.append(f"retouche masque de silhouette ({_sommets(fiche['silhouette'])} sommets) : "
                      "hors silhouette rendu transparent")
        if "effacer" in fiche:
            etapes.append(f"retouche gélule bicolore effacée ({_sommets(fiche['effacer'])} sommets)")
    if "veste" in fiche:
        teinte, force = fiche.get("veste_teinte", "#202554"), fiche.get("veste_force", 74)
        cible = [int(teinte[k:k + 2], 16) for k in (1, 3, 5)]
        sombre, clair = ("#" + "".join(f"{round(force / 100 * c + (1 - force / 100) * g):02X}" for c in cible)
                         for g in (0, 255))
        etapes.append(f"recoloration {fiche['veste_teintes']}→{teinte} (source {fiche['veste_source']}, "
                      f"colorisation {force} % de toute la blouse, 95 % de ses pixels colorés dans cette plage)")
        etapes.append(f"retouche blouse blanche recolorée ({fiche['veste'].count('polygon')} polygones) : niveaux de "
                      f"gris g colorisés à {force} % ({force} % de {teinte} + {100 - force} % de g, linéaire de {sombre} "
                      f"pour g = 0 à {clair} pour g = 255) ; plis et encrage conservés, "
                      "alpha de la planche")
    if "peinture" in fiche:
        etapes.append("retouche badge à fiole masqué (rectangle arrondi #3f4864 cerné #252d45, rabat #49536d)")
    if "gant" in fiche:
        gant = fiche["gant"]
        etapes.append(f"retouche masque du gant rétabli (clarté > {gant['seuil']}, {len(gant['graines'])} graines, "
                      "dilaté Disk:2) : pixels de la planche recomposés sur la veste")
    for source, destination in fiche.get("raccords", []):
        etapes.append(f"retouche libellé peint effacé : bande {source} étirée sur {destination}")
    if "cellule" in fiche:
        cote, x, y = fiche["cellule"]
        etapes.append(f"retouche gélule remplacée par cellule (cellule-cyan.svg, {cote} px en +{x}+{y})")
        if "premier_plan" in fiche:
            etapes.append(f"retouche main recomposée au premier plan depuis la planche "
                          f"({_sommets(fiche['premier_plan'])} sommets)")
    for couleur, region, source, teintes in fiche.get("recolorations", []):
        zone = f"zone {region}, pixels R > B seulement" if region else "toute la découpe"
        jeton = JETONS_A2.get(couleur, couleur)
        rampe = fiche.get("rampe")
        # Forme lue par le contrôle de chaîne : « recoloration <nom> H1–H2°→#CIBLE », puis entre parenthèses le ton
        # source (corps de la zone de planche) et le mode. Une rampe « rampe #SOMBRE→#CIBLE→#CLAIR » n'est déclarée que
        # si la retouche suit vraiment ces trois arrêts (projection par clarté).
        etapes.append(f"recoloration {teintes}→{couleur} (source {source}, {MODES[rampe]})")
        if rampe == "projection":
            etapes.append(f"retouche jeton {jeton} A2 ({zone}) : pixels de teinte {plage(teintes)[0]:g}–{plage(teintes)[1]:g}° "
                          f"et de saturation HLS ≥ 0,08 projetés par clarté HLS sur la rampe {ENCRE_MARINE}→{couleur}→{CLAIR}, "
                          f"pivot à la clarté du ton source {source} ({pivot(source):.3f}) : corps = {couleur}, encrage sombre "
                          f"de la planche vers {ENCRE_MARINE} (encrage marine des blocs bleus) ; reflets blancs (saturation "
                          "< 0,08) et alpha de la planche inchangés, sans tramage")
        elif rampe == "luminance":
            etapes.append(f"retouche jeton {jeton} A2 ({zone}) : rampe par correspondance de luminance sur les couleurs "
                          f"de la planche (même teinte, encrage, reflets) et {couleur}, ton dominant de la planche égal "
                          f"à {couleur} ; sans ton intermédiaire de cette teinte dans la planche, ombres bornées au "
                          "voisinage du jeton et encrage vers le ton le plus sombre")
    if fiche.get("rabattement_palette"):
        etapes.append(RABATTEMENT_TEINTE if fiche.get("rampe") == "luminance" else RABATTEMENT)
    if not etapes:
        raise ValueError(f"dérivé sans transformation : {fiche['id']}")
    return etapes
