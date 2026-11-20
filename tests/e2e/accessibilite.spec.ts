import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { startGame } from './helpers';
import { HEIGHT, RULESET, WIDTH } from '../../packages/contracts/src/types';
import type { Cell, GameState } from '../../packages/contracts/src/types';

async function verifierBoutons(ecran: Page): Promise<void> {
    const boutons = ecran.getByRole('button').filter({ visible: true });
    await expect(boutons.first()).toBeVisible();
    for (const bouton of await boutons.all()) await expect(bouton).toHaveAccessibleName(/\S/);
}

test('[E126] accueil, partie et pause accessibles, installation PWA couverte par T30 (hors-ligne.spec.ts)', async ({
    page,
}) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Capsule Panic' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', /\S/);
    await expect(page).toHaveTitle(/\S/);
    await expect(page.locator('head link[rel="manifest"]')).toHaveAttribute('href', /\S/);
    await verifierBoutons(page);

    await startGame(page);
    await verifierBoutons(page);
    await page.keyboard.press('p');
    const pause = page.getByRole('dialog', { name: 'Pause' });
    await expect(pause).toBeVisible();
    await verifierBoutons(page);
});

for (const [titre, phase, level] of [
    ['Niveau réussi !', 'WON', 0],
    ['Défaite !', 'LOST', 0],
    ['Victoire !', 'WON', 20],
] as const) {
    test(`[E126] tous les boutons de l’écran « ${titre} » ont un nom accessible`, async ({ page }) => {
        await page.goto('./');
        await expect(page.getByRole('button', { name: 'Jouer', exact: true })).toBeVisible();

        // La reprise d’un état terminal ouvre le même écran de fin que le jeu.
        const board = Array.from<Cell>({ length: WIDTH * HEIGHT }).fill(null);
        if (phase === 'LOST') board[board.length - 1] = { kind: 'obstacle', id: 'o1', color: 'cyan' };
        const state: GameState = {
            schemaVersion: 1,
            ruleset: RULESET,
            seed: 'accessibilite',
            rngState: [1, 2, 3, 4],
            width: WIDTH,
            height: HEIGHT,
            board,
            active: null,
            nextQueue: [['cyan', 'amber']],
            phase,
            score: 704,
            level,
            speed: 'low',
            obstaclesRemaining: phase === 'LOST' ? 1 : 0,
            tick: 0,
            chainCount: 0,
        };
        await page.evaluate(
            (json) =>
                new Promise<void>((resolve, reject) => {
                    const open = indexedDB.open('capsule-panic', 1);
                    open.onerror = () =>
                        reject(new Error('Ouverture de la sauvegarde impossible', { cause: open.error }));
                    open.onsuccess = () => {
                        const db = open.result;
                        const tx = db.transaction('games', 'readwrite');
                        tx.objectStore('games').put(json, 'courante');
                        tx.oncomplete = () => {
                            db.close();
                            resolve();
                        };
                        tx.onabort = () => {
                            db.close();
                            reject(new Error('Écriture de la sauvegarde impossible', { cause: tx.error }));
                        };
                    };
                }),
            JSON.stringify(state),
        );
        await page.reload();
        await page.getByRole('button', { name: 'Reprendre la partie' }).click();
        await expect(page.getByRole('heading', { name: titre })).toBeVisible();
        await verifierBoutons(page);
    });
}
