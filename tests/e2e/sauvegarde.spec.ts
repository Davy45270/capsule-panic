import { test, expect } from '@playwright/test';
import { score, startGame } from './helpers';

test('reload mid-fall resumes at the start of the same capsule, paused', async ({ page }) => {
    await startGame(page, { seed: 'reprise' });
    await page.keyboard.press(' ');
    await expect.poll(() => score(page)).toBeGreaterThan(0);
    const saved = await score(page);
    const capsule = await page.locator('.reactor').getAttribute('data-capsule');
    expect(capsule).toBe('c2 3,1,0');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.reactor')).toHaveAttribute('data-capsule', /^c2 1,/);
    await page.reload();
    await page.getByRole('button', { name: 'Reprendre la partie' }).click();
    await expect(page.getByRole('dialog', { name: 'Pause' })).toBeVisible();
    await expect(page.locator('.reactor')).toHaveAttribute('data-capsule', 'c2 3,1,0');
    expect(await score(page)).toBe(saved);
});

test('a corrupt save shows a readable message and offers a new game', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('button', { name: 'Jouer' })).toBeVisible();
    await page.evaluate(() => new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('capsule-panic', 1);
        open.onsuccess = () => {
            const tx = open.result.transaction('games', 'readwrite');
            tx.objectStore('games').put('{ abîmée', 'courante');
            tx.oncomplete = () => { open.result.close(); resolve(); };
            tx.onerror = () => reject(new Error('écriture impossible'));
        };
        open.onerror = () => reject(new Error('ouverture impossible'));
    }));
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('Sauvegarde illisible');
    await expect(page.getByRole('button', { name: 'Reprendre la partie' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Jouer' })).toBeVisible();
});

test('no network request besides the application files', async ({ page, baseURL }) => {
    const foreign: string[] = [];
    page.on('request', r => { if (!r.url().startsWith(baseURL ?? '') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) foreign.push(r.url()); });
    await startGame(page);
    await page.keyboard.press(' ');
    expect(foreign).toEqual([]);
});
