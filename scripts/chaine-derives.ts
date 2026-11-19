// Contrôle des sprites DÉRIVÉS : un sprite retouché ou recoloré vient de sa planche (planche, zone,
// transformations appliquées) ; ce n'est ni une découpe brute, ni un redessin.
// chaine.json les déclare dans `derives` (par table), provenance.json leur donne `origine: "dérivé"` et les
// MÊMES transformations. Chaque transformation est de la forme « recoloration <de>→<vers> » ou « retouche <quoi> ».
// Usage : node scripts/chaine-derives.ts    rend 1 et liste les écarts du dépôt, 0 sinon.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export interface EntreeChaine {
    id: string;
    boite?: string;
    element?: string;
    transformations?: unknown;
}
export interface TableChaine {
    decoupe: string;
    redessines?: EntreeChaine[];
    derives?: EntreeChaine[];
    retouches?: unknown;
}
export interface FicheProvenance {
    id: string;
    origine: string;
    transformations?: unknown;
}

export const FORME_TRANSFORMATION = /^(?:recoloration \S[^→]*→\S.*|retouche \S.*)$/u;
const BOITE = /^\d+x\d+\+\d+\+\d+$/u;

const origineDeclaree = (origine: string): string =>
    origine === 'dérivé' ? 'dérivé' : origine.startsWith('redessiné') ? 'redessin' : origine;

/** Écarts entre les dérivés de chaine.json et provenance.json ; vide si tout concorde. */
export function controlerDerives(tables: TableChaine[], assets: FicheProvenance[]): string[] {
    const erreurs: string[] = [];
    const attendu = new Map<string, string>();
    const derives = new Map<string, EntreeChaine>();
    for (const table of tables) {
        if (table.retouches !== undefined) erreurs.push(`${table.decoupe} : \`retouches\` est remplacé par \`derives\``);
        for (const redessin of table.redessines ?? []) attendu.set(redessin.id, 'redessin');
    }
    for (const table of tables) {
        for (const derive of table.derives ?? []) {
            const { id, boite, element, transformations } = derive;
            if (attendu.get(id) === 'redessin') erreurs.push(`déclaré à la fois dérivé et redessin : ${id}`);
            attendu.set(id, 'dérivé');
            derives.set(id, derive);
            if (!Array.isArray(transformations) || transformations.length === 0) {
                erreurs.push(`dérivé sans transformation : ${id}`);
            } else {
                for (const t of transformations as unknown[]) {
                    if (typeof t !== 'string' || !FORME_TRANSFORMATION.test(t))
                        erreurs.push(`transformation hors forme pour ${id} : ${JSON.stringify(t)}`);
                }
            }
            if (typeof boite !== 'string' || !BOITE.test(boite)) erreurs.push(`boîte invalide pour ${id} : ${boite}`);
            if (element !== `packages/assets/sprites/${id}.png`) erreurs.push(`élément invalide pour ${id} : ${element}`);
        }
    }
    const fiches = new Map(assets.map((fiche) => [fiche.id, fiche]));
    for (const [id, origine] of attendu) {
        const fiche = fiches.get(id);
        if (!fiche) {
            erreurs.push(`absent de provenance.json : ${id}`);
            continue;
        }
        const lue = origineDeclaree(fiche.origine);
        if (lue !== origine)
            erreurs.push(`origine différente entre chaine.json (${origine}) et provenance.json (${fiche.origine}) : ${id}`);
        const derive = derives.get(id);
        if (derive && lue === 'dérivé' && JSON.stringify(fiche.transformations) !== JSON.stringify(derive.transformations))
            erreurs.push(`transformations différentes entre chaine.json et provenance.json : ${id}`);
    }
    for (const fiche of assets) {
        if (fiche.origine === 'dérivé' && attendu.get(fiche.id) !== 'dérivé')
            erreurs.push(`dérivé de provenance.json absent des \`derives\` de chaine.json : ${fiche.id}`);
    }
    return erreurs;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const lire = (nom: string): unknown => JSON.parse(readFileSync(`packages/assets/${nom}`, 'utf8'));
    const { tables } = lire('chaine.json') as { tables: TableChaine[] };
    const { assets } = lire('provenance.json') as { assets: FicheProvenance[] };
    const erreurs = controlerDerives(tables, assets);
    for (const erreur of erreurs) console.error(erreur);
    console.log(`${tables.reduce((n, t) => n + (t.derives?.length ?? 0), 0)} dérivés, ${erreurs.length} écart(s)`);
    process.exit(erreurs.length ? 1 : 0);
}
