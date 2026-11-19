"""Retouches locales des pixels peints, avant normalisation des sprites."""
import re
import subprocess

from assets_palette import RAYON, TOLERANCE, palette_reference, teinter


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
    for couleur, region, *_ in fiche.get("recolorations", []):
        source = ["-crop", region, "+repage"] if region else []
        teinte = travail / f"teinte-{identifiant}.png"
        # Ancre les tons moyens sur le jeton tout en conservant ombres et reflets.
        original = travail / f"couleurs-{identifiant}.png"
        magick(resultat, *source, f"PNG32:{original}")
        if fiche.get("rampe") == "luminance":
            teinter(original, couleur, teinte, palette_reference(planche, fiche["boite"]), rouge=bool(region))
        else:
            milieu = 188 if couleur == "#FBBF24" else 138
            magick(original, "-colorspace", "gray", "-colorspace", "sRGB",
                   "(", "-size", f"1x{milieu}", f"gradient:#080e22-{couleur}",
                   "-size", f"1x{256 - milieu}", f"gradient:{couleur}-#fff8ff",
                   "-append", "-rotate", "90", "-flop", ")",
                   "-channel", "RGB", "-clut", "+channel", f"PNG32:{teinte}")
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
RABATTEMENT_TEINTE = RABATTEMENT.replace("la couleur la plus proche", "la couleur neutre ou de même teinte la plus proche")

JETONS_A2 = {"#38BDF8": "cyan", "#F472B6": "magenta", "#FBBF24": "ambre"}


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
        etapes.append(f"recoloration blanc→{fiche.get('veste_teinte', '#202554')}")
        etapes.append(f"retouche blouse blanche recolorée ({fiche['veste'].count('polygon')} polygones) : niveaux de "
                      f"gris colorisés à {fiche.get('veste_force', 74)} %, plis et encrage conservés, alpha de la planche")
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
    for couleur, region, *origine in fiche.get("recolorations", []):
        de = origine[0] if origine else "teinte d'origine"
        zone = f"zone {region}, pixels R > B seulement" if region else "toute la découpe"
        etapes.append(f"recoloration {de}→{couleur}")
        if fiche.get("rampe") == "luminance":
            etapes.append(f"retouche jeton {JETONS_A2.get(couleur, couleur)} A2 ({zone}) : rampe par correspondance "
                          f"de luminance sur les couleurs de la planche (même teinte, encrage, reflets) et {couleur}, "
                          f"ton dominant de la planche → {couleur} ; sans ton intermédiaire de cette teinte dans la planche, "
                          "ombres bornées au voisinage du jeton et encrage vers le ton le plus sombre")
        else:
            etapes.append(f"retouche jeton {JETONS_A2.get(couleur, couleur)} A2 ({zone}) : luminance sur la rampe "
                          f"#080e22→{couleur}→#fff8ff, ombres et reflets conservés")
    if fiche.get("rabattement_palette"):
        etapes.append(RABATTEMENT_TEINTE if fiche.get("rampe") == "luminance" else RABATTEMENT)
    if not etapes:
        raise ValueError(f"dérivé sans transformation : {fiche['id']}")
    return etapes
