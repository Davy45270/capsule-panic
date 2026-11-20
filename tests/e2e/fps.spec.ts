import { expect, test } from '@playwright/test';
import { startGame } from './helpers';

// Renderers logiciels : la cadence y mesure le processeur de la machine de test, pas le jeu.
const LOGICIEL = /SwiftShader|llvmpipe|softpipe|Software|Microsoft Basic Render/i;
const FENETRES = 5;

test('[E156] le rendu de la partie tient une médiane de 60 images par seconde', async ({ page }) => {
    const info = test.info();
    test.skip(
        !['chromium-bureau', 'chromium-gpu'].includes(info.project.name),
        'mesure de cadence sur Chromium bureau, avec GPU',
    );

    await startGame(page);
    await expect(page.locator('.reactor canvas')).toBeVisible();
    const renderer = await page.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl');
        if (!gl) return 'aucun contexte WebGL';
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        return String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    });
    info.annotations.push({ type: 'renderer', description: renderer });
    test.skip(LOGICIEL.test(renderer), `renderer logiciel, cadence non représentative : ${renderer}`);

    const fps = await page.evaluate(
        (fenetres) =>
            new Promise<number[]>((resolve) => {
                const mesures = Array.from<number>({ length: fenetres }).fill(0);
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
        FENETRES,
    );
    const mediane = [...fps].sort((a, b) => a - b)[Math.floor(FENETRES / 2)] ?? 0;
    info.annotations.push({
        type: 'FPS',
        description: `Renderer : ${renderer}. Fenêtres : ${fps.join(', ')} images/s. Médiane : ${String(mediane)} images/s.`,
    });
    expect(mediane).toBeGreaterThanOrEqual(60);
});
