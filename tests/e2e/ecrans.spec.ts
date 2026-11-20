import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { cascade, defaite, victoire } from './parcours';
import { startGame } from './helpers';

async function capture(page: Page, info: TestInfo, name: string, errors: string[]): Promise<void> {
    const before = errors.length;
    const path = info.outputPath(`${name}.png`);
    await page.screenshot({ path, animations: 'disabled', fullPage: true });
    if (info.project.use.browserName === 'webkit') {
        // Le moteur de capture ajoute puis retire <style>body {}</style> pour synchroniser les animations.
        // La CSP le bloque. Retirer au plus un message exact émis pendant la capture elle-même.
        const injectedStyle = errors.findIndex(
            (error, index) =>
                index >= before &&
                error ===
                    "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy.",
        );
        if (injectedStyle !== -1) errors.splice(injectedStyle, 1);
    }
    await info.attach(name, { path, contentType: 'image/png' });
}

function errorsOn(page: Page): string[] {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });
    return errors;
}

const PAS = 16;

/**
 * Fige l'horloge de la page (installée avant le chargement) : seul `avancer` fait ensuite passer le temps du jeu.
 * En temps réel, une chute (un pas toutes les 750 ms en vitesse lente) pouvait s'intercaler entre l'apparition d'une
 * capsule et la chute rapide sur une machine chargée, et le score perdait 2 points.
 */
async function figer(page: Page): Promise<void> {
    // L'horodatage passé à requestAnimationFrame par l'horloge factice ne suit pas performance.now() : on le repasse.
    await page.evaluate(() => {
        const raf = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (cb) => raf(() => cb(performance.now()));
    });
    for (let essai = 1; ; essai++) {
        try {
            await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 50);
            break;
        } catch (erreur) {
            // Machine chargée : plus de 50 ms entre la lecture de l'heure et la pause ; on relit l'heure.
            if (essai >= 3 || !String(erreur).includes('to the past')) throw erreur;
        }
    }
}

/** Fait passer le temps du jeu image par image jusqu'à `fini`, au plus `ms` millisecondes. */
async function avancer(page: Page, fini: () => Promise<boolean>, ms = 10_000): Promise<void> {
    for (let t = 0; t < ms && !(await fini()); t += PAS) await page.clock.runFor(PAS);
}

/**
 * Joue les poses, l'horloge figée pendant la saisie. `lent` attend ce temps réel avant la dernière touche de chaque
 * pose (contre-épreuve : la saisie lente ne doit rien changer). Après la dernière pose, le temps avance jusqu'à `jusqua`.
 */
async function play(
    page: Page,
    placements: string[][],
    { lent = 0, jusqua }: { lent?: number; jusqua?: () => Promise<boolean> } = {},
): Promise<void> {
    await figer(page);
    const reactor = page.locator('.reactor');
    for (const [index, keys] of placements.entries()) {
        for (const [rang, key] of keys.entries()) {
            if (lent && rang === keys.length - 1) await page.waitForTimeout(lent);
            await page.keyboard.press(key);
        }
        if (index < placements.length - 1) {
            const attendu = String(index + 1);
            await avancer(page, async () => (await reactor.getAttribute('data-spawns')) === attendu);
            await expect(reactor).toHaveAttribute('data-spawns', attendu);
        } else if (jusqua) await avancer(page, jusqua);
    }
}

async function localScores(page: Page): Promise<number[]> {
    return page.evaluate(
        () =>
            new Promise<number[]>((resolve, reject) => {
                const open = indexedDB.open('capsule-panic');
                open.onerror = () => reject(new Error('Ouverture des scores impossible'));
                open.onsuccess = () => {
                    const db = open.result;
                    const transaction = db.transaction('scores', 'readonly');
                    const read = transaction.objectStore('scores').getAll();
                    transaction.oncomplete = () => {
                        db.close();
                        const rows = read.result as { level: number; speed: string; score: number }[];
                        resolve(
                            rows
                                .filter((row) => row.level === 0 && row.speed === 'low')
                                .map((row) => row.score),
                        );
                    };
                    transaction.onabort = () => {
                        db.close();
                        reject(new Error('Lecture des scores impossible'));
                    };
                };
            }),
    );
}

test('[E048] [E094] [E313] [E385] [E386] [E387] [E388] [E526] [E529] la partie gagnée au clavier ouvre le niveau réussi', async ({
    page,
}, info) => {
    const errors = errorsOn(page);
    await page.clock.install();
    await startGame(page, victoire);
    const reussi = page.getByRole('heading', { name: 'Niveau réussi !' });
    await play(page, victoire.placements, { jusqua: () => reussi.isVisible() });
    await page.clock.resume();
    await expect(page.getByRole('heading', { name: 'Niveau réussi !' })).toBeVisible();
    await expect(page.getByText('Tous les cristaux éliminés')).toBeVisible();
    await expect(page.getByTestId('final-score')).toHaveText('704');
    await expect.poll(() => localScores(page)).toContain(704);
    await expect(page.getByText('Combo max ×1')).toBeVisible();
    await expect(page.locator('[data-art="ruban-reussite"]')).toBeVisible();
    await expect(page.locator('.end-characters .character')).toHaveCount(2);
    await capture(page, info, 'niveau-reussi', errors);
    await page.getByRole('button', { name: 'Niveau suivant' }).click();
    await expect(page.getByTestId('level')).toHaveText('1');
    expect(errors).toEqual([]);
});

test('[E048] contre-épreuve : une saisie lente ne change pas le score de la partie gagnée', async ({
    page,
}, info) => {
    test.skip(info.project.name !== 'chromium-bureau', 'contre-épreuve de la course, un seul projet suffit');
    await page.clock.install();
    await startGame(page, victoire);
    const reussi = page.getByRole('heading', { name: 'Niveau réussi !' });
    // 1 s réelle entre l'apparition et la chute rapide : en temps réel, plus d'un pas de chute (750 ms).
    await play(page, victoire.placements, { lent: 1000, jusqua: () => reussi.isVisible() });
    await page.clock.resume();
    await expect(page.getByTestId('final-score')).toHaveText('704');
});

test('[E047] [E313] [E416] la pile ferme la chambre et Rejouer repart du même niveau', async ({
    page,
}, info) => {
    const errors = errorsOn(page);
    await page.clock.install();
    await startGame(page, defaite);
    const perdu = page.getByRole('heading', { name: 'Défaite !' });
    await play(page, defaite.placements, { jusqua: () => perdu.isVisible() });
    await page.clock.resume();
    await expect(page.getByRole('heading', { name: 'Défaite !' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible();
    await expect(page.locator('[data-art="defaite-bannieres-jeu"]')).toBeVisible();
    await capture(page, info, 'defaite', errors);
    await page.getByRole('button', { name: 'Rejouer' }).click();
    await expect(page.locator('.reactor[data-ready="oui"]')).toBeVisible();
    await expect(page.getByTestId('score')).toHaveText('000000');
    expect(errors).toEqual([]);
});

async function activate(page: Page, name: string): Promise<void> {
    const button = page.getByRole('button', { name, exact: true });
    for (let attempt = 0; attempt < 30; attempt++) {
        await page.keyboard.press('Tab');
        if (await button.evaluate((element) => element === document.activeElement)) {
            await page.keyboard.press('Enter');
            return;
        }
    }
    await expect(button).toBeFocused();
}

async function checkLayout(page: Page): Promise<void> {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        page.viewportSize()?.width ?? 0,
    );
    if (page.viewportSize()?.width === 390) {
        const targets = await page.getByRole('button').all();
        for (const target of targets) {
            if (!(await target.isVisible())) continue;
            const size = await target.boundingBox();
            expect(Math.min(size?.width ?? 0, size?.height ?? 0)).toBeGreaterThanOrEqual(44);
        }
    }
}

test('[E037] [E041] [E099] [E100] [E110] [E125] [E313] [E371] [E374] [E375] [E378] [E379] [E380] [E417] [E445] [E450] [E451] [E452] [E454] [E470] [E471] [E472] [E473] navigation et captures des écrans', async ({
    page,
}, info) => {
    const errors = errorsOn(page);
    await page.goto('./?graine=preuve-0');
    await expect(page.getByRole('heading', { name: 'Capsule Panic' })).toBeVisible();
    await checkLayout(page);
    await capture(page, info, 'accueil', errors);
    await activate(page, 'Aide');
    await expect(page.locator('.tutorial img')).toHaveCount(4);
    await checkLayout(page);
    await capture(page, info, 'aide', errors);
    await activate(page, 'Menu');
    await activate(page, 'Options');
    await expect(page.getByRole('checkbox', { name: /daltonien/i })).toBeVisible();
    await checkLayout(page);
    await capture(page, info, 'options', errors);
    await activate(page, 'Menu');
    await activate(page, 'Crédits');
    await expect(page.getByText(/CC BY/)).toBeVisible();
    await activate(page, 'Menu');
    await activate(page, 'Jouer');
    await expect(page).toHaveURL(/#game$/);
    await activate(page, 'Commencer');
    const reactor = page.locator('.reactor[data-ready="oui"]');
    await expect(reactor.locator('canvas')).toBeVisible();
    await expect(reactor).toHaveAttribute('data-ghost', '2');
    await expect(page.getByRole('img', { name: /Capsule suivante/ })).toBeVisible();
    await checkLayout(page);
    await capture(page, info, 'partie', errors);
    await page.keyboard.press('p');
    await expect(page.getByRole('dialog', { name: 'Pause' })).toBeVisible();
    await checkLayout(page);
    await capture(page, info, 'pause', errors);
    await page.keyboard.press('p');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goto('./#settings');
    await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible();
    await page.goto('./#home');
    await expect(page.getByRole('heading', { name: 'Capsule Panic' })).toBeVisible();
    expect(errors).toEqual([]);
});

test('[E125] le retour du navigateur depuis les options affiche l’accueil', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Options', exact: true }).click();
    await expect(page).toHaveURL(/#settings$/);
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Capsule Panic' })).toBeVisible();
});

test('[E037] les écrans restent dans la largeur à 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto('./');
    await checkLayout(page);
    await page.getByRole('button', { name: 'Options' }).click();
    await checkLayout(page);
    await startGame(page);
    await checkLayout(page);
    await page.keyboard.press('p');
    await expect(page.getByRole('dialog')).toBeVisible();
    await checkLayout(page);
});

test('[E039] [E110] [E343] [E344] [E345] [E346] les commandes tactiles déplacent, pivotent et posent', async ({
    page,
}, info) => {
    await startGame(page, { seed: 'preuve-0' });
    const reactor = page.locator('.reactor');
    const press = async (name: string) => {
        const button = page.getByRole('button', { name, exact: true });
        if (info.project.use.hasTouch) await button.tap();
        else await button.click();
    };
    await press('Gauche');
    await expect(reactor).toHaveAttribute('data-capsule', /^c1 2,/);
    await press('Droite');
    await expect(reactor).toHaveAttribute('data-capsule', /^c1 3,/);
    await press('Pivoter');
    await expect(reactor).toHaveAttribute('data-capsule', /,1$/);
    await press('Descendre');
    await expect(page.getByTestId('score')).toHaveText('000001');
    await press('Poser');
    await expect(reactor).toHaveAttribute('data-spawns', '1');
});

test('[E154] le JSON exporté peut être réimporté et les données invalides sont refusées', async ({
    page,
}, info) => {
    const errors = errorsOn(page);
    await startGame(page, { seed: 'import' });
    await page.keyboard.press('Space');
    await expect(page.locator('.reactor')).toHaveAttribute('data-spawns', '1');
    await page.keyboard.press('p');
    await expect(page.getByRole('dialog', { name: 'Pause' })).toBeVisible();
    const capsule = await page.locator('.reactor').getAttribute('data-capsule');
    await page.getByRole('button', { name: 'Accueil', exact: true }).click();
    await page.getByRole('button', { name: 'Options', exact: true }).click();
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter la partie JSON' }).click();
    const file = info.outputPath('partie.json');
    await (await downloaded).saveAs(file);
    const original = await readFile(file, 'utf8');

    await startGame(page, { seed: 'partie-a-remplacer', level: 2 });
    await page.keyboard.press('Space');
    await expect(page.locator('.reactor')).toHaveAttribute('data-spawns', '1');
    await page.keyboard.press('p');
    await page.getByRole('button', { name: 'Accueil', exact: true }).click();
    await page.getByRole('button', { name: 'Options', exact: true }).click();
    const competingDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter la partie JSON' }).click();
    const competingFile = info.outputPath('autre-partie.json');
    await (await competingDownload).saveAs(competingFile);
    expect(await readFile(competingFile, 'utf8')).not.toBe(original);

    await page.locator('input[type=file]').setInputFiles({
        name: 'partie-invalide.json',
        mimeType: 'application/json',
        buffer: Buffer.from('{"schemaVersion":1}'),
    });
    await expect(page.getByRole('alert')).toContainText('état invalide');
    const originalState: unknown = JSON.parse(original);
    if (typeof originalState !== 'object' || originalState === null) throw new Error('État exporté absent');
    await page.locator('input[type=file]').setInputFiles({
        name: 'partie-transitoire.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({ ...originalState, phase: 'RESOLVING', active: null })),
    });
    await expect(page.getByRole('alert')).toContainText('reprise impossible');
    const preservedDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter la partie JSON' }).click();
    const preservedFile = info.outputPath('partie-conservee.json');
    await (await preservedDownload).saveAs(preservedFile);
    expect(await readFile(preservedFile, 'utf8')).toBe(await readFile(competingFile, 'utf8'));

    await page.locator('input[type=file]').setInputFiles(file);
    await expect(page.getByRole('alert')).toContainText('Partie importée');
    const importedDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter la partie JSON' }).click();
    const importedFile = info.outputPath('partie-reimportee.json');
    await (await importedDownload).saveAs(importedFile);
    expect(await readFile(importedFile, 'utf8')).toBe(original);
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('button', { name: 'Reprendre la partie' }).click();
    await expect(page.getByRole('dialog', { name: 'Pause' })).toBeVisible();
    await expect(page.locator('.reactor')).toHaveAttribute('data-capsule', capsule ?? '');
    expect(errors).toEqual([]);
});

test('[E101] [E102] [E294] [E528] deux réactions successives affichent les points du combo', async ({
    page,
}, info) => {
    const errors = errorsOn(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.clock.install();
    await startGame(page, cascade);
    const combo = page.locator('.combo');
    // Le temps avance jusqu'au second combo : la capture le montre pendant qu'il est affiché.
    await play(page, cascade.placements, {
        jusqua: async () =>
            (await combo.count()) > 0 && /COMBO ×2/.test((await combo.first().textContent()) ?? ''),
    });
    await expect(combo).toHaveText(/COMBO ×2\s*\+80/);
    await expect(combo).toHaveAttribute('data-match', '92 100 108 116');
    await expect(combo).toHaveCSS('font-weight', '950');
    await expect(combo).toHaveCSS('text-shadow', /rgb\(246, 80, 28\).*14px/);
    await capture(page, info, 'partie-combo', errors);
    await expect(page.locator('.reactor')).toHaveAttribute('data-ready', 'oui');
    // Le score est publié à la fin des effets : le temps avance jusqu'à lui, puis recoule normalement.
    await avancer(page, async () => (await page.getByTestId('score').textContent()) === '000494');
    await page.clock.resume();
    await expect(page.getByTestId('score')).toHaveText('000494');
    expect(errors).toEqual([]);
});

for (const { system, user } of [
    { system: 'reduce', user: false },
    { system: 'no-preference', user: true },
] as const) {
    test(`[E104] [E305] le jeu saute les effets avec la préférence ${user ? 'du jeu' : 'du système'} seule`, async ({
        page,
    }) => {
        await page.emulateMedia({ reducedMotion: system });
        await page.clock.install();
        await page.goto(`./?graine=${victoire.seed}`);
        await page.getByRole('button', { name: 'Options', exact: true }).click();
        await page.getByRole('checkbox', { name: 'Animations réduites' }).setChecked(user);
        await page.getByRole('button', { name: 'Menu', exact: true }).click();
        await page.getByRole('button', { name: 'Jouer', exact: true }).click();
        await page.getByLabel('Lente').check();
        await page.getByRole('button', { name: 'Commencer' }).click();
        const reactor = page.locator('.reactor');
        await expect(reactor).toHaveAttribute('data-ready', 'oui');
        const showedCombo = await page.evaluateHandle(() => {
            const seen = { value: false };
            new MutationObserver((entries) => {
                for (const entry of entries) {
                    for (const node of entry.addedNodes) {
                        if (
                            node instanceof Element &&
                            (node.matches('.combo') || node.querySelector('.combo'))
                        )
                            seen.value = true;
                    }
                }
            }).observe(document.body, { childList: true, subtree: true });
            return seen;
        });
        await play(page, victoire.placements.slice(0, 4), {
            jusqua: async () => (await reactor.getAttribute('data-spawns')) === '4',
        });
        await page.clock.resume();
        await expect(page.getByTestId('score')).toHaveText('000180');
        await expect(reactor).toHaveAttribute('data-spawns', '4');
        expect(await showedCombo.evaluate((seen) => seen.value)).toBe(false);
        await showedCombo.dispose();
    });
}

test.describe('gestes directs sur le réacteur', () => {
    test.use({ hasTouch: true });

    test('[E110] toucher la chambre pivote la capsule active', async ({ page }) => {
        await startGame(page, victoire);
        const reactor = page.locator('.reactor');
        await expect(reactor).toHaveAttribute('data-capsule', /^c1 3,\d+,0$/);
        await reactor.tap();
        await expect(reactor).toHaveAttribute('data-capsule', /^c1 3,\d+,1$/);
    });
});
