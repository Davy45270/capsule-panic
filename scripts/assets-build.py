"""Construit les visuels livrés depuis les tables du dépôt."""
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ASSETS = Path("packages/assets")


def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def lire(path):
    return json.loads(path.read_text())


def ecrire(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def decouper(planche, info, marge, taille, sortie):
    largeur, hauteur, x, y = info["boite"]
    boite = f"{largeur + 2*marge}x{hauteur + 2*marge}+{x-marge}+{y-marge}"
    ancre = {"bas": "south", "centre": "center"}[info["ancre"]]
    run("magick", planche, "-crop", boite, "+repage",
        "-channel", "A", "-fx", "u<0.04?0:u", "+channel", "-trim", "+repage",
        "-resize", taille, "-background", "none", "-gravity", ancre,
        "-extent", taille, f"PNG32:{sortie}")


def atlas(aseprite, sprites, image, mapping=None):
    args = ["--data", mapping, "--format", "json-hash",
            "--filename-format", "{title}"] if mapping else []
    run(aseprite, "-b", *sprites, "--sheet-pack", "--sheet-width", "1024",
        "--shape-padding", "2", "--border-padding", "2", "--sheet", image, *args, stdout=subprocess.DEVNULL)
    run("oxipng", "-q", "-o", "4", "--strip", "safe", image)


def construire_groupe(table, planches, outils, aseprite, travail):
    journal = io.StringIO()
    chaine, sprites_planche = [], []
    controles = os.environ.get("ASSETS_CONTROLES_DIR")
    data = lire(table)
    groupe = table.name.split(".")[1]
    planche = planches / data["planche"]
    fiches = []
    liste = ASSETS / "source" / f"{groupe}.redessines.json"
    redessines = lire(liste) if liste.exists() else []
    for echelle in (2, 3):
        dimension = data["taille"] * echelle // 2
        taille = f"{dimension}x{dimension}"
        nom = f"{groupe}@{echelle}x"
        dossier = travail / nom
        dossier.mkdir()
        sprites = []
        for element in data["elements"]:
            sprite = dossier / f"sprite-{element['id']}.png"
            decouper(planche, element, data["marge"], taille, sprite)
            sprites.append(sprite)
            if echelle == 3:
                shutil.copyfile(sprite, travail / "sprites" / sprite.name)
        references = []
        provenance_redessins = []
        for redessin in redessines:
            identifiant = redessin["id"]
            svg = ASSETS / "source" / "svg" / f"{identifiant}.svg"
            sprite = dossier / f"sprite-{identifiant}.png"
            if redessin.get("superposition"):
                geometrie = redessin["boite"]
                largeur, hauteur = geometrie.split("+", 1)[0].split("x")
                motif = dossier / f"motif-{identifiant}.png"
                run("rsvg-convert", "-w", largeur, "-h", hauteur, svg, "-o", motif)
                base = ["magick", planche, "-crop", geometrie, "+repage"]
                composition = "Over"
                if redessin.get("masque"):
                    masque = dossier / f"masque-{identifiant}.png"
                    source_masque = ASSETS / "source" / "svg" / f"{redessin['masque']}.svg"
                    run("rsvg-convert", "-w", largeur, "-h", hauteur, source_masque, "-o", masque)
                    base.extend([masque, "-compose", "DstIn", "-composite"])
                    composition = "DstOver"
                run(*base, motif, "-compose", composition, "-composite", "-resize", taille,
                    "-background", "none", "-gravity", "center", "-extent", taille, f"PNG32:{sprite}")
            else:
                run("rsvg-convert", "-w", str(dimension), "-h", str(dimension), svg, "-o", sprite)
            sprites.append(sprite)
            provenance_redessins.append({
                "id": f"sprite-{identifiant}", "origine": "redessiné (marque)",
                "raison": redessin["raison"], "svg": str(svg),
                "planche": data["planche"], "element_remplace": redessin["boite"],
                "transformations": ["crop", "superposition SVG", "resize", "atlas json-hash"]
                if redessin.get("superposition") else ["rendu SVG", "atlas json-hash"],
            })
            if redessin.get("masque"):
                provenance_redessins[-1]["masque"] = str(source_masque)
            if echelle == 3:
                shutil.copyfile(sprite, travail / "sprites" / sprite.name)
                reference = dossier / f"reference-{identifiant}.png"
                run("magick", planche, "-crop", redessin["boite"], "+repage", reference)
                print(f"Palette {identifiant}", file=journal)
                resultat = subprocess.run(["python3", outils / "style-palette.py", reference, sprite],
                                          stdout=subprocess.PIPE, text=True)
                journal.write(resultat.stdout)
                print(f"Code palette : {resultat.returncode}", file=journal)
                if resultat.returncode not in (0, 1):
                    resultat.check_returncode()
            else:
                references.append({"id": f"sprite-{identifiant}", "boite": redessin["boite"],
                                   "element": str(ASSETS / "sprites" / sprite.name)})
        image = travail / "atlas" / f"{nom}.png"
        mapping = image.with_suffix(".json")
        atlas(aseprite, sprites, image, mapping)
        donnees_atlas = lire(mapping)
        donnees_atlas["meta"]["scale"] = str(echelle)
        ecrire(mapping, donnees_atlas)
        webp = image.with_suffix(".webp")
        run("cwebp", "-quiet", "-lossless", image, "-o", webp)
        poids_webp = webp.stat().st_size
        if poids_webp >= image.stat().st_size:
            webp.unlink()
        taille_image = donnees_atlas["meta"]["size"]
        largeur, hauteur = taille_image["w"], taille_image["h"]
        if max(largeur, hauteur) > 2048:
            raise ValueError(f"Atlas hors dimensions : {nom}")
        print(f"{nom} {largeur}×{hauteur} PNG {image.stat().st_size} o"
              f" WebP {poids_webp} o{' (écarté)' if not webp.exists() else ''}", file=journal)
        mesure = dossier / table.name
        ecrire(mesure, dict(data, taille=dimension))
        journal.write(run("python3", outils / "verifier-decoupe.py", planche, mesure, image, mapping,
                          stdout=subprocess.PIPE, text=True).stdout)
        preuve = dossier / "provenance-groupe.json"
        redessins = dossier / "provenance-redessins.json"
        ecrire(redessins, provenance_redessins)
        journal.write(run("python3", outils / "ecrire-provenance.py", planche, mesure, mapping, preuve, redessins,
                          stdout=subprocess.PIPE, text=True).stdout)
        fiches.append(lire(preuve))
        if echelle == 2:
            sprites_planche.extend(sprites)
            chaine.append({"planche": str(planche), "decoupe": str(table),
                           "atlas": str(ASSETS / "atlas" / image.name),
                           "atlas_json": str(ASSETS / "atlas" / mapping.name),
                           "redessines": references})
            if controles:
                miniatures = travail / f"controle-{groupe}"
                miniatures.mkdir()
                for sprite in sprites:
                    run("magick", sprite, "-resize", "96x96", miniatures / sprite.name)
                extras = []
                for redessin in redessines:
                    identifiant = redessin["id"]
                    reference = dossier / f"reference-{identifiant}.png"
                    run("magick", planche, "-crop", redessin["boite"], "+repage", reference)
                    extras.extend([reference, miniatures / f"sprite-{identifiant}.png", identifiant])
                run("bash", outils / "planche-controle.sh", planche, table, miniatures,
                    Path(controles) / f"controle-{table.name.removesuffix('.decoupe.json')}.png", *extras)
    print(journal.getvalue(), end="", flush=True)
    return fiches[0], chaine[0], sprites_planche


def construire(planches, outils, aseprite, travail):
    tables = sorted((ASSETS / "source").glob("*.decoupe.json"))
    def construire_table(table):
        return construire_groupe(table, planches, outils, aseprite, travail)

    with ThreadPoolExecutor(max_workers=4) as execution:
        resultats = list(execution.map(construire_table, tables))
    assembler(aseprite, travail, resultats)


def assembler(aseprite, travail, resultats):
    provenances, chaine, planches_groupes = zip(*resultats)
    sprites_planche = [sprite for groupe in planches_groupes for sprite in groupe]
    entrees = [item for fiche in provenances for item in fiche["assets"]]
    ecrire(travail / "provenance.json", dict(provenances[0], assets=entrees))
    ecrire(travail / "licences.json", {
        "titulaire": "David Sevin", "licence": "CC BY 4.0",
        "assets": sorted(item["id"] for item in entrees),
    })
    ecrire(travail / "chaine.json", chaine)
    atlas(aseprite, sprites_planche,
          travail / "planche-transparente.png")


def main():
    planches, outils, aseprite = map(Path, sys.argv[1:])
    with tempfile.TemporaryDirectory(prefix="capsule-assets-") as temporaire:
        travail = Path(temporaire)
        for dossier in ("sprites", "atlas"):
            (travail / dossier).mkdir()
        construire(planches, outils, aseprite, travail)
        installer(travail)


def installer(travail):
    for fichier in ("chaine.json", "provenance.json", "licences.json", "planche-transparente.png"):
        shutil.copyfile(travail / fichier, ASSETS / fichier)
    for dossier in ("sprites", "atlas"):
        destination = ASSETS / dossier
        if destination.exists():
            shutil.rmtree(destination)
        shutil.copytree(travail / dossier, destination)


if __name__ == "__main__":
    main()
