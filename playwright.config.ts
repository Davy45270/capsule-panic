// Repris d'echecs-kid (playwright.config.ts), puis étendu à la matrice de la spec :
// « Playwright Chromium/Firefox/WebKit desktop et viewport mobile ».
// Trois moteurs, chacun en bureau (1280×800) et en mobile tactile (390×844), plus un petit mobile
// (360×740) sur Chromium. tests/tooling-playwright.test.ts vérifie cette matrice ; la modifier ici
// sans la modifier là fait échouer `npm test`.
// Firefox n'accepte pas l'option `isMobile` (Playwright la refuse) : son projet mobile émule seulement
// la taille d'écran et le tactile. Les tests qui visent le mobile filtrent sur `hasTouch`, jamais sur le nom.
import { defineConfig, devices } from '@playwright/test';
import type { Project } from '@playwright/test';

const BUREAU = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };
const PETIT_MOBILE = { width: 360, height: 740 };

const projects: Project[] = [
    { name: 'chromium-bureau', use: { browserName: 'chromium', viewport: BUREAU } },
    {
        name: 'chromium-mobile',
        use: {
            browserName: 'chromium',
            viewport: MOBILE,
            hasTouch: true,
            isMobile: true,
            userAgent: devices['Pixel 7'].userAgent,
        },
    },
    {
        name: 'chromium-mobile-360',
        use: {
            browserName: 'chromium',
            viewport: PETIT_MOBILE,
            hasTouch: true,
            isMobile: true,
            userAgent: devices['Pixel 7'].userAgent,
        },
    },
    { name: 'firefox-bureau', use: { browserName: 'firefox', viewport: BUREAU } },
    { name: 'firefox-mobile', use: { browserName: 'firefox', viewport: MOBILE, hasTouch: true } },
    { name: 'webkit-bureau', use: { browserName: 'webkit', viewport: BUREAU } },
    {
        name: 'webkit-mobile',
        use: {
            browserName: 'webkit',
            viewport: MOBILE,
            hasTouch: true,
            isMobile: true,
            userAgent: devices['iPhone 13'].userAgent,
        },
    },
];

// Témoin de cadence avec GPU (E156) : projet ajouté seulement quand E2E_GPU=1, hors CI. Sur tank01, Chromium n'atteint le
// GPU (Intel Arc, /dev/dri) que par ANGLE sur EGL ; ses options par défaut retombent sur SwiftShader (rendu logiciel).
// Jamais sous Vitest : tests/tooling-playwright.test.ts vérifie la matrice de la CI, même dans un job lancé avec E2E_GPU=1.
if (process.env.E2E_GPU === '1' && !process.env.VITEST) {
    projects.push({
        name: 'chromium-gpu',
        use: {
            browserName: 'chromium',
            viewport: BUREAU,
            launchOptions: {
                args: ['--use-angle=gl-egl', '--use-gl=angle', '--ignore-gpu-blocklist', '--enable-gpu'],
            },
        },
    });
}

export default defineConfig({
    testDir: 'tests/e2e',
    workers: 1,
    fullyParallel: false,
    timeout: 60_000,
    forbidOnly: Boolean(process.env.CI),
    use: { locale: 'fr-FR', baseURL: 'http://127.0.0.1:4183' },
    projects,
    webServer: {
        command: 'npm run preview -- --host 127.0.0.1 --port 4183 --strictPort',
        url: 'http://127.0.0.1:4183',
        reuseExistingServer: false,
    },
});
