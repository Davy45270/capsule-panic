import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Ouvre le jeu avec une graine fixe et démarre une partie ; rend la liste des erreurs de page. */
export async function startGame(page: Page, { level = 0, speed = 'Lente', seed = 'essai' }: { level?: number; speed?: string; seed?: string } = {}): Promise<string[]> {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`./?graine=${seed}`);
    await page.getByRole('button', { name: 'Jouer' }).click();
    if (level) await page.getByRole('slider', { name: 'Niveau' }).fill(String(level));
    await page.getByLabel(speed).check();
    await page.getByRole('button', { name: 'Commencer' }).click();
    await expect(page.locator('.reactor[data-ready="oui"] canvas')).toBeVisible();
    return errors;
}
export const score = async (page: Page): Promise<number> => Number(await page.getByTestId('score').textContent());
