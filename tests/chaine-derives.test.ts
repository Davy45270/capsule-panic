// Sprites dérivés (retouchés ou recolorés) : chaine.json (`derives`) et provenance.json concordent.
// Chaque cas fautif est fabriqué à partir des données réelles du dépôt, pour que le contrôle soit prouvé
// sur la forme exacte des fichiers livrés.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { controlerDerives, type FicheProvenance, type TableChaine } from '../scripts/chaine-derives.ts';

const lire = (nom: string): unknown => JSON.parse(readFileSync(`packages/assets/${nom}`, 'utf8'));
const charger = () => ({
    tables: (lire('chaine.json') as { tables: TableChaine[] }).tables,
    assets: (lire('provenance.json') as { assets: FicheProvenance[] }).assets,
});
const premierDerive = (tables: TableChaine[]) => {
    const table = tables.find((t) => (t.derives?.length ?? 0) > 0);
    const derive = table?.derives?.[0];
    if (!table || !derive) throw new Error('aucun dérivé dans chaine.json');
    return { table, derive };
};

it('les dérivés du dépôt sont déclarés, transformés et concordent avec la provenance', () => {
    const { tables, assets } = charger();
    const ids = tables.flatMap((t) => (t.derives ?? []).map((d) => d.id));
    expect(ids).toEqual(expect.arrayContaining(['sprite-chercheuse-origine', 'sprite-responsable-origine']));
    expect(ids.length).toBeGreaterThanOrEqual(29);
    expect(controlerDerives(tables, assets)).toEqual([]);
    for (const fiche of assets.filter((f) => ids.includes(f.id))) expect(fiche.origine, fiche.id).toBe('dérivé');
});

it('échoue sur un dérivé sans transformation', () => {
    const { tables, assets } = charger();
    const { derive } = premierDerive(tables);
    derive.transformations = [];
    expect(controlerDerives(tables, assets)).toContain(`dérivé sans transformation : ${derive.id}`);
    delete derive.transformations;
    expect(controlerDerives(tables, assets)).toContain(`dérivé sans transformation : ${derive.id}`);
});

it('échoue sur un dérivé déclaré aussi en redessin', () => {
    const { tables, assets } = charger();
    const { table, derive } = premierDerive(tables);
    table.redessines = [...(table.redessines ?? []), { id: derive.id, boite: derive.boite, element: derive.element }];
    expect(controlerDerives(tables, assets)).toContain(`déclaré à la fois dérivé et redessin : ${derive.id}`);
});

it('échoue sur un sprite dont l’origine diffère entre chaine.json et provenance.json', () => {
    const { tables, assets } = charger();
    const { derive } = premierDerive(tables);
    const fiche = assets.find((f) => f.id === derive.id);
    if (!fiche) throw new Error(`${derive.id} absent de provenance.json`);
    fiche.origine = 'planche';
    expect(controlerDerives(tables, assets)).toContain(
        `origine différente entre chaine.json (dérivé) et provenance.json (planche) : ${derive.id}`,
    );
});

it('échoue sur une transformation hors forme ou des `retouches` résiduelles', () => {
    const { tables, assets } = charger();
    const { table, derive } = premierDerive(tables);
    derive.transformations = ['crop'];
    table.retouches = [];
    const erreurs = controlerDerives(tables, assets);
    expect(erreurs).toContain(`transformation hors forme pour ${derive.id} : "crop"`);
    expect(erreurs).toContain(`${table.decoupe} : \`retouches\` est remplacé par \`derives\``);
});
