// Inventaire des assets livrés (packages/assets/assets.inventaire.json, généré par scripts/assets-inventaire.ts).
// Il échoue si un sprite ou un fichier d'atlas présent sur le disque manque à l'inventaire, si une empreinte
// a changé sans régénération, ou si une planche y est désignée par un chemin absolu.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
    FICHIER_INVENTAIRE,
    ecarts,
    fichiersLivres,
    genererInventaire,
    serialiser,
    type Inventaire,
} from '../scripts/assets-inventaire.ts';

const ecrit = readFileSync(FICHIER_INVENTAIRE, 'utf8');
const inventaire = JSON.parse(ecrit) as Inventaire;
const livres = fichiersLivres(process.cwd());

it('[E176] [E312] chaque sprite et chaque fichier d’atlas livré figure à l’inventaire avec son sha256', () => {
    expect(livres.filter((f) => f.chemin.includes('/atlas/')).length).toBeGreaterThan(0);
    expect(livres.filter((f) => f.chemin.includes('/sprites/')).length).toBeGreaterThan(0);
    expect(ecarts(inventaire, livres)).toEqual([]);
    // L'inventaire écrit est exactement celui que produit le générateur depuis provenance, licences et chaîne.
    expect(ecrit).toBe(serialiser(genererInventaire(process.cwd())));
});

it('[E176] [E312] chaque entrée porte origine, planche, licence et titulaire, sans chemin absolu', () => {
    expect(ecrit).not.toMatch(/"\/(?:home|Users|root|tmp)\//u);
    for (const entree of inventaire.fichiers) {
        if (entree.anomalie) continue;
        expect(entree.licence, entree.chemin).toBe('CC BY 4.0');
        expect(entree.titulaire, entree.chemin).toBe('David Sevin');
        expect(entree.planche?.fichier, entree.chemin).toMatch(/^[\w.-]+\.png$/u);
        expect(entree.planche?.sha256, entree.chemin).toMatch(/^[a-f0-9]{64}$/u);
        if (entree.type === 'sprite') {
            expect(['découpe', 'redessin', 'dérivé'], entree.chemin).toContain(entree.origine);
            expect(entree.boite, entree.chemin).toMatch(/^\d+x\d+\+\d+\+\d+$/u);
        } else {
            expect(entree.cadres?.length, entree.chemin).toBeGreaterThan(0);
        }
    }
});

it('le contrôle distingue un fichier absent, une empreinte modifiée et un fichier disparu', () => {
    // Référence régénérée : ce test reste valable même si l'inventaire écrit est faux.
    const reference = genererInventaire(process.cwd());
    expect(ecarts(reference, livres)).toEqual([]);
    const [premier, second] = reference.fichiers;
    const sans = { ...reference, fichiers: reference.fichiers.slice(1) };
    expect(ecarts(sans, livres)).toEqual([`absent de l'inventaire : ${premier?.chemin}`]);
    const modifie = {
        ...reference,
        fichiers: reference.fichiers.map((e) => (e === second ? { ...e, sha256: '0'.repeat(64) } : e)),
    };
    expect(ecarts(modifie, livres)).toEqual([`sha256 différent : ${second?.chemin}`]);
    expect(ecarts(reference, livres.slice(1))).toEqual([`fichier disparu : ${premier?.chemin}`]);
});
