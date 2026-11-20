import { expect, test } from '@playwright/test';
import { startGame } from './helpers';

test('[E156] le rendu de la partie tient une médiane de 60 images par seconde', async ({ page }) => {
    const info = test.info();
    test.skip(info.project.name !== 'chromium-bureau', 'mesure de cadence sur Chromium bureau');

    await startGame(page);
    const fps = await page.evaluate(
        () =>
            new Promise<number[]>((resolve) => {
                const mesures = [0, 0, 0];
                requestAnimationFrame((debut) => {
                    function compter(temps: number): void {
                        const fenetre = Math.floor((temps - debut) / 1000);
                        if (fenetre >= mesures.length) {
                            resolve(mesures);
                            return;
                        }
                        mesures[fenetre] = (mesures[fenetre] ?? 0) + 1;
                        requestAnimationFrame(compter);
                    }
                    compter(debut);
                });
            }),
    );
    await expect(page.locator('.reactor canvas')).toBeVisible();
    const mediane = [...fps].sort((a, b) => a - b)[1] ?? 0;
    info.annotations.push({
        type: 'FPS',
        description: `Fenêtres : ${fps.join(', ')} images/s. Médiane : ${String(mediane)} images/s.`,
    });
    expect(mediane).toBeGreaterThanOrEqual(60);
});
