import { test, expect } from '@playwright/test';
import { score, startGame } from './helpers';

test('home, setup and game screens with the HUD', async ({ page }) => {
    const errors = await startGame(page, { level: 3 });
    await expect(page.getByTestId('level')).toHaveText('3');
    await expect(page.getByTestId('crystals')).toHaveText('16');
    await expect(page.getByRole('img', { name: /Capsule suivante/ })).toBeVisible();
    expect(errors).toEqual([]);
});

test('keyboard: hard drop scores, P pauses and resumes', async ({ page }) => {
    await startGame(page);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('x');
    await page.keyboard.press('Space');
    await expect.poll(() => score(page)).toBeGreaterThan(0);
    await page.keyboard.press('p');
    await expect(page.getByRole('dialog', { name: 'Pause' })).toBeVisible();
    await page.keyboard.press('p');
    await expect(page.getByRole('dialog', { name: 'Pause' })).toBeHidden();
});

test('stacking in one column ends on the defeat screen', async ({ page }) => {
    await startGame(page);
    for (let i = 0; i < 12; i++) {
        if (await page.getByText('Défaite !').isVisible()) break;
        await page.keyboard.press('Space');
    }
    await expect(page.getByText('Défaite !')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rejouer' })).toBeVisible();
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(page.getByRole('heading', { name: 'Capsule Panic' })).toBeVisible();
});

test('touch buttons are at least 48 px and play the game', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'viewport mobile seulement');
    await startGame(page);
    for (const name of ['Gauche', 'Pivoter', 'Descendre', 'Poser', 'Droite']) {
        const box = await page.getByRole('button', { name, exact: true }).boundingBox();
        expect(box && Math.min(box.width, box.height)).toBeGreaterThanOrEqual(48);
    }
    await page.getByRole('button', { name: 'Poser', exact: true }).tap();
    await expect.poll(() => score(page)).toBeGreaterThan(0);
});
