"""Retouches locales des pixels peints, avant normalisation des sprites."""
import re
import subprocess


def magick(*args):
    subprocess.run(["magick", *args], check=True)


def masque(image, dessin, sortie):
    magick(image, "-alpha", "off", "-colorspace", "gray", "-evaluate", "set", "0",
           "-fill", "white", "-draw", dessin, sortie)


def retoucher(planche, fiche, travail, cellules):
    identifiant = fiche["id"]
    reference = travail / f"reference-{identifiant}.png"
    resultat = travail / f"retouche-{identifiant}.png"
    couche = travail / f"masque-{identifiant}.png"
    magick(planche, "-crop", fiche["boite"], "+repage", f"PNG32:{reference}")
    magick(reference, f"PNG32:{resultat}")
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
               "-fill", "#202554", "-colorize", "74%", ")", couche,
               "-compose", "Src", "-composite", f"PNG32:{resultat}")
    if "peinture" in fiche:
        magick(resultat, "-draw", fiche["peinture"], f"PNG32:{resultat}")
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
    for couleur, region in fiche.get("recolorations", []):
        source = ["-crop", region, "+repage"] if region else []
        teinte = travail / f"teinte-{identifiant}.png"
        # Ancre les tons moyens sur le jeton tout en conservant ombres et reflets.
        original = travail / f"couleurs-{identifiant}.png"
        magick(resultat, *source, f"PNG32:{original}")
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
