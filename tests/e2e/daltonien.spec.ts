// ORACLE ÉCRIT AVANT LE CODE DES ÉCRANS. Ce fichier échouera tant que la passe r3 (écrans de apps/web/src)
// n'a pas livré le contrat ci-dessous : c'est attendu, ce n'est pas une régression.
//
// Spec : acceptance/TESTS.md, fixture « T29 mode daltonien différencie les couleurs par forme » ;
// PRD : « options de contraste et formes additionnelles ».
// Formes de référence, lues dans packages/assets/source/svg/cellule-*.svg :
//   cyan → hexagone, amber (ambre) → triangle, magenta → losange.
//
// CONTRAT ATTENDU DE r3 (le plateau est dessiné dans un canvas : le test ne peut pas lire les formes
// dans le DOM sans ce miroir) :
//   1. Écran Options : une case à cocher dont le nom accessible contient « daltonien » ; le réglage est
//      enregistré comme les autres réglages et survit au rechargement.
//   2. L'élément `.reactor` de l'écran de jeu porte :
//      - `data-daltonien="oui"` quand le mode est actif, `"non"` sinon ;
//      - `data-cellules` : la liste, séparée par des espaces, des cellules occupées du plateau (capsule
//        active exclue), chacune au format `x,y,couleur,forme`, avec `couleur` ∈ {cyan, amber, magenta}
//        (valeurs du moteur) et `forme` ∈ {hexagone, triangle, losange, aucune}.
//      `forme` décrit la texture RÉELLEMENT choisie par le rendu (packages/renderer) pour cette cellule,
//      pas une table recopiée dans l'écran : sinon le test prouverait l'attribut, pas l'affichage.
//   3. Graine et niveau du test : `?graine=daltonien`, niveau 3. Relevé du moteur (createGame) le
//      2026-11-19 : ce plateau contient les trois couleurs, ce qui rend le test discriminant.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { startGame } from './helpers';

const FORME_ATTENDUE: Record<string, string> = { cyan: 'hexagone', amber: 'triangle', magenta: 'losange' };

interface Cellule {
    x: number;
    y: number;
    couleur: string;
    forme: string;
}

async function cellules(page: Page): Promise<Cellule[]> {
    const brut = (await page.locator('.reactor').getAttribute('data-cellules')) ?? '';
    return brut
        .split(/\s+/)
        .filter(Boolean)
        .map((jeton) => {
            const [x, y, couleur, forme] = jeton.split(',');
            return { x: Number(x), y: Number(y), couleur: couleur ?? '', forme: forme ?? '' };
        });
}

async function activerDaltonien(page: Page): Promise<void> {
    await page.goto('./');
    await page.getByRole('button', { name: 'Options' }).click();
    const caseDaltonien = page.getByRole('checkbox', { name: /daltonien/i });
    await caseDaltonien.check();
    await expect(caseDaltonien).toBeChecked();
}

test('[E042] [E263] T29 colour-blind mode gives each of the three colours its own shape', async ({
    page,
}) => {
    await activerDaltonien(page);
    const errors = await startGame(page, { level: 3, seed: 'daltonien' });
    const reacteur = page.locator('.reactor');
    await expect(reacteur).toHaveAttribute('data-daltonien', 'oui');

    const plateau = await cellules(page);
    expect(plateau.length, 'le plateau du niveau 3 porte des cristaux').toBeGreaterThan(0);
    // Les trois couleurs sont présentes : sinon une forme commune à deux couleurs passerait inaperçue.
    expect(new Set(plateau.map((c) => c.couleur))).toEqual(new Set(['cyan', 'amber', 'magenta']));
    // Chaque cellule porte la forme de sa couleur, et aucune n'est sans forme.
    expect(plateau.filter((c) => c.forme !== FORME_ATTENDUE[c.couleur])).toEqual([]);
    // Bijection couleur → forme : trois couleurs, trois formes distinctes.
    const formes = new Map(plateau.map((c) => [c.couleur, c.forme]));
    expect(new Set(formes.values()).size).toBe(3);
    expect(errors).toEqual([]);
});

test('[E263] T29 colour-blind mode survives a reload and can be switched off', async ({ page }) => {
    await activerDaltonien(page);
    await page.reload();
    await expect(page).toHaveURL(/#settings$/);
    await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible();
    const caseDaltonien = page.getByRole('checkbox', { name: /daltonien/i });
    await expect(caseDaltonien).toBeChecked();
    await caseDaltonien.uncheck();
    await startGame(page, { level: 3, seed: 'daltonien' });
    await expect(page.locator('.reactor')).toHaveAttribute('data-daltonien', 'non');
    // Le miroir reste présent hors mode daltonien : seul le réglage change, pas le contrat de test.
    expect((await cellules(page)).length).toBeGreaterThan(0);
});
