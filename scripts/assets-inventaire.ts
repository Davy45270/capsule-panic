// Inventaire des fichiers d'assets livrés (sprites et atlas), avec leur provenance.
// Sources : packages/assets/provenance.json (origine, planche, boîte de chaque sprite), licences.json
// (licence et titulaire) et chaine.json (planche et découpe de chaque atlas). Le résultat,
// packages/assets/assets.inventaire.json, prépare un futur assets.lock.json dont le format n'est pas encore fixé.
// Une planche n'est désignée que par son nom de fichier et son sha256 : jamais par un chemin absolu.
// Usage : node scripts/assets-inventaire.ts           écrit l'inventaire
//         node scripts/assets-inventaire.ts --check   rend 1 si l'inventaire écrit diffère des fichiers
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DOSSIER = 'packages/assets';
export const FICHIER_INVENTAIRE = `${DOSSIER}/assets.inventaire.json`;

type Origine = 'découpe' | 'redessin' | 'retouche';

interface Fiche {
    id: string;
    origine: string;
    planche: string;
    planche_sha256: string;
    boite?: number[];
    element_remplace?: string;
    source_retouche?: string;
    svg?: string;
}
interface Table {
    planche: string;
    decoupe: string;
    atlas: string;
}
export interface Entree {
    chemin: string;
    sha256: string;
    taille: number;
    type: 'sprite' | 'atlas';
    id?: string;
    origine?: Origine | null;
    origines?: Origine[];
    cadres?: string[];
    planche: { fichier: string; sha256: string } | null;
    boite?: string | null;
    source?: string;
    decoupe?: string;
    licence: string | null;
    titulaire: string | null;
    anomalie?: string;
}
export interface Inventaire {
    schemaVersion: 1;
    note: string;
    fichiers: Entree[];
}

const lireJson = (racine: string, fichier: string): unknown =>
    JSON.parse(readFileSync(join(racine, DOSSIER, fichier), 'utf8'));

/** Origine normalisée : découpe brute, découpe retouchée, ou élément redessiné. */
function origine(fiche: Fiche): Origine {
    if (fiche.origine.startsWith('redessiné')) return 'redessin';
    if (fiche.origine !== 'planche') throw new Error(`origine inconnue pour ${fiche.id} : ${fiche.origine}`);
    return fiche.source_retouche ? 'retouche' : 'découpe';
}

/** Boîte au format largeurxhauteur+x+y ; provenance.json la donne en [largeur, hauteur, x, y]. */
function boite(fiche: Fiche): string | null {
    if (fiche.boite) {
        const [l, h, x, y] = fiche.boite;
        return `${l}x${h}+${x}+${y}`;
    }
    return fiche.element_remplace ?? null;
}

const empreinte = (contenu: Buffer): string => createHash('sha256').update(contenu).digest('hex');

/** Fichiers livrés : tout ce que contiennent packages/assets/sprites et packages/assets/atlas. */
export function fichiersLivres(racine: string): { chemin: string; sha256: string; taille: number }[] {
    return ['sprites', 'atlas']
        .flatMap((dossier) =>
            readdirSync(join(racine, DOSSIER, dossier), { withFileTypes: true })
                .filter((entree) => entree.isFile())
                .map((entree) => `${DOSSIER}/${dossier}/${entree.name}`),
        )
        .sort()
        .map((chemin) => {
            const contenu = readFileSync(join(racine, chemin));
            return { chemin, sha256: empreinte(contenu), taille: contenu.length };
        });
}

export function genererInventaire(racine: string): Inventaire {
    const { assets } = lireJson(racine, 'provenance.json') as { assets: Fiche[] };
    const licences = lireJson(racine, 'licences.json') as {
        titulaire: string;
        licence: string;
        assets: string[];
    };
    const { tables } = lireJson(racine, 'chaine.json') as { tables: Table[] };
    const fiches = new Map(assets.map((fiche) => [fiche.id, fiche]));
    const sousLicence = new Set(licences.assets);
    const shaPlanche = new Map(assets.map((fiche) => [fiche.planche, fiche.planche_sha256]));
    const licence = (ids: string[]) =>
        ids.length > 0 && ids.every((id) => sousLicence.has(id))
            ? { licence: licences.licence, titulaire: licences.titulaire }
            : { licence: null, titulaire: null };

    const fichiers = fichiersLivres(racine).map((fichier): Entree => {
        const nom = basename(fichier.chemin);
        if (fichier.chemin.startsWith(`${DOSSIER}/sprites/`)) {
            const id = nom.replace(/\.png$/u, '');
            const fiche = fiches.get(id);
            if (!fiche) {
                return {
                    ...fichier,
                    type: 'sprite',
                    id,
                    origine: null,
                    planche: null,
                    boite: null,
                    ...licence([id]),
                    anomalie: 'absent de provenance.json',
                };
            }
            const source = fiche.svg ?? fiche.source_retouche;
            return {
                ...fichier,
                type: 'sprite',
                id,
                origine: origine(fiche),
                planche: { fichier: fiche.planche, sha256: fiche.planche_sha256 },
                boite: boite(fiche),
                ...(source ? { source } : {}),
                ...licence([id]),
            };
        }
        // Atlas : <nom>@<échelle>.<json|png|webp> ; chaine.json rattache chaque nom à une planche et une découpe.
        const base = nom.replace(/@\d+x\.\w+$/u, '');
        const table = tables.find((t) => basename(t.atlas).replace(/@\d+x\.\w+$/u, '') === base);
        const cadresJson = join(racine, fichier.chemin.replace(/\.\w+$/u, '.json'));
        const cadres = Object.keys(
            (JSON.parse(readFileSync(cadresJson, 'utf8')) as { frames: Record<string, unknown> }).frames,
        ).sort();
        const origines = [
            ...new Set(cadres.flatMap((id) => (fiches.has(id) ? [origine(fiches.get(id) as Fiche)] : []))),
        ].sort();
        const planche = table ? basename(table.planche) : null;
        return {
            ...fichier,
            type: 'atlas',
            origines,
            cadres,
            planche: planche ? { fichier: planche, sha256: shaPlanche.get(planche) ?? '' } : null,
            ...(table ? { decoupe: table.decoupe } : {}),
            ...licence(cadres),
            ...(table && cadres.every((id) => fiches.has(id))
                ? {}
                : { anomalie: 'atlas sans table ou cadre sans provenance' }),
        };
    });
    return {
        schemaVersion: 1,
        note: 'Généré par scripts/assets-inventaire.ts depuis provenance.json, licences.json et chaine.json ; ne pas éditer.',
        fichiers,
    };
}

/** Écarts entre un inventaire et les fichiers livrés : fichier absent, en trop, ou empreinte différente. */
export function ecarts(
    inventaire: Inventaire,
    livres: { chemin: string; sha256: string; taille: number }[],
): string[] {
    const declares = new Map(inventaire.fichiers.map((entree) => [entree.chemin, entree]));
    const presents = new Set(livres.map((fichier) => fichier.chemin));
    return [
        ...livres.flatMap(({ chemin, sha256, taille }) => {
            const entree = declares.get(chemin);
            if (!entree) return [`absent de l'inventaire : ${chemin}`];
            if (entree.sha256 !== sha256) return [`sha256 différent : ${chemin}`];
            return entree.taille === taille ? [] : [`taille différente : ${chemin}`];
        }),
        ...[...declares.keys()]
            .filter((chemin) => !presents.has(chemin))
            .map((c) => `fichier disparu : ${c}`),
    ];
}

export const serialiser = (inventaire: Inventaire): string => `${JSON.stringify(inventaire, null, 2)}\n`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const racine = process.cwd();
    const attendu = serialiser(genererInventaire(racine));
    if (process.argv.includes('--check')) {
        const ecrit = existsSync(join(racine, FICHIER_INVENTAIRE))
            ? readFileSync(join(racine, FICHIER_INVENTAIRE), 'utf8')
            : '';
        if (ecrit !== attendu) {
            console.error(`${FICHIER_INVENTAIRE} n'est pas à jour : node scripts/assets-inventaire.ts`);
            process.exit(1);
        }
        console.log(`${FICHIER_INVENTAIRE} à jour`);
    } else {
        writeFileSync(join(racine, FICHIER_INVENTAIRE), attendu);
        const { fichiers } = JSON.parse(attendu) as Inventaire;
        console.log(
            `${fichiers.length} fichiers inventoriés, ${fichiers.filter((f) => f.anomalie).length} anomalie(s)`,
        );
    }
}
