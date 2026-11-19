// ORACLE ÉCRIT AVANT LE CODE DES ÉCRANS. Ce fichier peut échouer tant que la passe r3 (écrans de
// apps/web/src) n'a pas livré : c'est attendu. Il remplace l'ancien test T30, plus faible (il ne vérifiait
// ni que la page venait du service worker, ni qu'une partie avançait hors ligne).
//
// Spec : acceptance/TESTS.md, fixture « T30 offline après installation PWA » ; PRD : « jeu offline après
// installation PWA » ; ARCHITECTURE : cache PWA versionné.
//
// CONTRAT ATTENDU DE r3 : rien de nouveau, celui que tests/e2e/helpers.ts (startGame) suppose déjà —
// boutons « Jouer » et « Commencer », curseur « Niveau », choix de vitesse, `.reactor[data-ready="oui"]`
// et compteur `data-testid="score"` ; plus un `<link rel="manifest">` dans le document (installabilité).
//
// Moteur : Chromium seulement (bureau et mobiles). Playwright n'expose les service workers et
// `response.fromServiceWorker()` que sous Chromium ; sous Firefox et WebKit ce test serait muet.
import { test, expect } from '@playwright/test';
import { score, startGame } from './helpers';

test('[E264] T30 the installed PWA reloads and plays offline', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'service workers observables sous Chromium seulement');

    // Première visite en ligne : installation du service worker et précache.
    await page.goto('./');
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
    // L'enregistrement peut avoir un worker actif dont l'événement activate est encore en cours.
    await expect
        .poll(
            () =>
                page.evaluate(async () => {
                    const registration = await navigator.serviceWorker.getRegistration();
                    return registration?.active?.state ?? 'absent';
                }),
            { timeout: 15_000 },
        )
        .toBe('activated');
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    // Réseau coupé : le document et toutes ses sous-ressources viennent du cache.
    await context.setOffline(true);
    const echecs: string[] = [];
    // Le contrôle de mise à jour du service worker lui-même (sw.js) échoue hors ligne par construction.
    page.on('requestfailed', (request) => {
        if (!/\/sw\.js$/.test(new URL(request.url()).pathname)) echecs.push(request.url());
    });
    const reponse = await page.reload();
    expect(reponse?.fromServiceWorker(), 'document servi par le service worker').toBe(true);
    await expect(page.getByRole('heading', { name: 'Capsule Panic' })).toBeVisible();

    // La partie se lance ET avance : une chute franche rapporte des points.
    const errors = await startGame(page, { seed: 'hors-ligne' });
    await page.keyboard.press('Space');
    await expect.poll(() => score(page)).toBeGreaterThan(0);
    expect(errors).toEqual([]);
    expect(echecs, 'aucune ressource manquante hors ligne').toEqual([]);
});
