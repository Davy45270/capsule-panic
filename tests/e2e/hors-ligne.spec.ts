import { test, expect } from '@playwright/test';

test('T30 the game starts offline after the first visit', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'service worker hors ligne vérifié sur Chromium');
    await page.goto('./');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Capsule Panic' })).toBeVisible();
    await page.getByRole('button', { name: 'Jouer' }).click();
    await page.getByRole('button', { name: 'Commencer' }).click();
    await expect(page.locator('.reactor[data-ready="oui"] canvas')).toBeVisible();
});
