import { test, expect } from '@playwright/test';
import { score, startGame } from './helpers';

test('home, setup and game screens with the HUD', async ({ page }) => {
    const errors = await startGame(page, { level: 3 });
    await expect(page.getByTestId('level')).toHaveText('3');
    await expect(page.getByTestId('crystals')).toHaveText('16');
    await expect(page.getByRole('img', { name: /Capsule suivante/ })).toBeVisible();
    expect(errors).toEqual([]);
});

test('[E038] [E110] keyboard: hard drop scores, P pauses and resumes', async ({ page }) => {
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

test('touch buttons are at least 48 px and play the game', async ({ page }, info) => {
    await startGame(page);
    for (const name of ['Gauche', 'Pivoter', 'Descendre', 'Poser', 'Droite']) {
        const box = await page.getByRole('button', { name, exact: true }).boundingBox();
        expect(box && Math.min(box.width, box.height)).toBeGreaterThanOrEqual(48);
    }
    const poser = page.getByRole('button', { name: 'Poser', exact: true });
    if (info.project.use.hasTouch) await poser.tap();
    else await poser.click();
    await expect.poll(() => score(page)).toBeGreaterThan(0);
});
