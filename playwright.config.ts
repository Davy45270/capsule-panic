// Repris d'echecs-kid (playwright.config.ts) ; Chromium, Firefox et WebKit au bureau, Chromium en mobile tactile.
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
    testDir: 'tests/e2e',
    workers: 1,
    fullyParallel: false,
    timeout: 60_000,
    forbidOnly: Boolean(process.env.CI),
    use: { locale: 'fr-FR', baseURL: 'http://127.0.0.1:4183' },
    projects: [
        { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } } },
        { name: 'firefox', use: { browserName: 'firefox', viewport: { width: 1280, height: 900 } } },
        { name: 'webkit', use: { browserName: 'webkit', viewport: { width: 1280, height: 900 } } },
        { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, userAgent: devices['Pixel 7'].userAgent } },
    ],
    webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 4183 --strictPort', url: 'http://127.0.0.1:4183', reuseExistingServer: false }
});
