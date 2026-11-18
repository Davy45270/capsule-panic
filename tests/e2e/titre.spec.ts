import { test, expect } from '@playwright/test';

test('the title screen runs the engine in the browser', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Capsule Panic' })).toBeVisible();
    await expect(page.getByText('4 cristaux instables attendent')).toBeVisible();
    expect(errors).toEqual([]);
});
