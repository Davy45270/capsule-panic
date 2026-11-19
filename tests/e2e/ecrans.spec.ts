import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { cascade, defaite, victoire } from './parcours';
import { startGame } from './helpers';

async function capture(page: Page, info: TestInfo, name: string): Promise<void> {
    const path = info.outputPath(`${name}.png`);
    await page.screenshot({ path, animations: 'disabled', fullPage: true });
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

async function play(page: Page, placements: string[][]): Promise<void> {
    const reactor = page.locator('.reactor');
    for (const [index, keys] of placements.entries()) {
        for (const key of keys) await page.keyboard.press(key);
        if (index < placements.length - 1) {
            await expect(reactor).toHaveAttribute('data-spawns', String(index + 1));
            await expect(reactor).toHaveAttribute('data-ready', 'oui');
        }
    }
}

test('[E094] [E313] [E385] [E386] [E387] [E388] [E526] [E529] la partie gagnée au clavier ouvre le niveau réussi', async ({
    page,
}, info) => {
    const errors = errorsOn(page);
    await startGame(page, victoire);
    await play(page, victoire.placements);
    await expect(page.getByRole('heading', { name: 'Niveau réussi !' })).toBeVisible();
    await expect(page.getByText('Tous les cristaux éliminés')).toBeVisible();
    await expect(page.getByTestId('final-score')).toContainText(/\d/);
    await expect(page.getByText('Combo max ×1')).toBeVisible();
    await expect(page.locator('[data-art="ruban-reussite"]')).toBeVisible();
    await expect(page.locator('.end-characters .character')).toHaveCount(2);
    await capture(page, info, 'niveau-reussi');
    await page.getByRole('button', { name: 'Niveau suivant' }).click();
    await expect(page.getByTestId('level')).toHaveText('1');
    expect(errors).toEqual([]);
});

test('[E047] [E313] [E416] la pile ferme la chambre et Rejouer repart du même niveau', async ({
    page,
}, info) => {
    const errors = errorsOn(page);
    await startGame(page, defaite);
    await play(page, defaite.placements);
    await expect(page.getByRole('heading', { name: 'Défaite !' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible();
    await expect(page.locator('[data-art="defaite-bannieres-jeu"]')).toBeVisible();
    await capture(page, info, 'defaite');
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
    await capture(page, info, 'accueil');
    await activate(page, 'Aide');
    await expect(page.locator('.tutorial img')).toHaveCount(4);
    await checkLayout(page);
    await capture(page, info, 'aide');
    await activate(page, 'Menu');
    await activate(page, 'Options');
    await expect(page.getByRole('checkbox', { name: /daltonien/i })).toBeVisible();
    await checkLayout(page);
    await capture(page, info, 'options');
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
    await capture(page, info, 'partie');
    await page.keyboard.press('p');
    await expect(page.getByRole('dialog', { name: 'Pause' })).toBeVisible();
    await checkLayout(page);
    await capture(page, info, 'pause');
    await page.keyboard.press('p');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goto('./#settings');
    await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible();
    await page.goto('./#home');
    await expect(page.getByRole('heading', { name: 'Capsule Panic' })).toBeVisible();
    expect(errors).toEqual([]);
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
    const capsule = await page.locator('.reactor').getAttribute('data-capsule');
    await page.keyboard.press('p');
    await page.getByRole('button', { name: 'Accueil', exact: true }).click();
    await page.getByRole('button', { name: 'Options', exact: true }).click();
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter la partie JSON' }).click();
    const file = info.outputPath('partie.json');
    await (await downloaded).saveAs(file);
    await page.locator('input[type=file]').setInputFiles({
        name: 'partie-invalide.json',
        mimeType: 'application/json',
        buffer: Buffer.from('{"schemaVersion":1}'),
    });
    await expect(page.getByRole('alert')).toContainText('état invalide');
    await page.locator('input[type=file]').setInputFiles(file);
    await expect(page.getByRole('alert')).toContainText('Partie importée');
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
    await startGame(page, cascade);
    await play(page, cascade.placements);
    const combo = page.locator('.combo');
    await expect(combo).toContainText('COMBO ×2');
    await expect(combo).toHaveAttribute('data-match', /^\d+( \d+){3,}$/);
    await capture(page, info, 'partie-combo');
    await expect(page.locator('.reactor')).toHaveAttribute('data-ready', 'oui');
    expect(errors).toEqual([]);
});
