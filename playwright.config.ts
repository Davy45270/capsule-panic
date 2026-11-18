// Repris d'echecs-kid (playwright.config.ts) ; les trois moteurs arrivent avec l'interface (jalon M2).
import { defineConfig } from '@playwright/test';
export default defineConfig({
    testDir: 'tests/e2e',
    workers: 1,
    fullyParallel: false,
    timeout: 60_000,
    forbidOnly: Boolean(process.env.CI),
    use: { locale: 'fr-FR', baseURL: 'http://127.0.0.1:4173', browserName: 'chromium' },
    projects: [
        { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
        { name: 'mobile', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
    ],
    webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: false }
});
