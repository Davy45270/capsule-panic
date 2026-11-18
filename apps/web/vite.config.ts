// Repris d'echecs-kid (vite.config.ts), racine dans apps/web et build dans dist/ à la racine du dépôt.
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { manifest } from './pwa-manifest.ts';

export default defineConfig({
    base: './',
    build: { outDir: '../../dist', emptyOutDir: true },
    plugins: [VitePWA({
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
