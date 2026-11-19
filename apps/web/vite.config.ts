// Repris d'echecs-kid (vite.config.ts), racine dans apps/web et build dans dist/ à la racine du dépôt.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { manifest } from './pwa-manifest.ts';

export default defineConfig({
    base: './',
    build: { outDir: '../../dist', emptyOutDir: true },
    plugins: [react(), {
        name: 'csp-vite-dev',
        apply: 'serve',
        // Vite injecte ses styles et le préambule React pendant le développement uniquement.
        transformIndexHtml(html) {
            return html.replace("script-src 'self'; style-src 'self'", "script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");
        }
    }, VitePWA({
        strategies: 'generateSW',
        registerType: 'autoUpdate',
        manifest,
        workbox: {
            cacheId: 'capsule-panic',
            clientsClaim: true,
            cleanupOutdatedCaches: true,
            globPatterns: ['**/*.{html,js,css,png,svg,webmanifest}']
        }
    })]
});
