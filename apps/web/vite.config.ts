// Repris d'echecs-kid (vite.config.ts), racine dans apps/web et build dans dist/ à la racine du dépôt.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import type { VitePluginPWAAPI } from 'vite-plugin-pwa';
import { manifest } from './pwa-manifest.ts';

const pwa = VitePWA({
    strategies: 'generateSW',
    registerType: 'autoUpdate',
    includeManifestIcons: false,
    manifest,
    workbox: {
        cacheId: 'capsule-panic-v1',
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{html,js,css,png,webp,svg}'],
        runtimeCaching: [
            {
                urlPattern: /\/manifest\.webmanifest$/,
                handler: 'NetworkFirst',
                options: {
                    cacheName: 'capsule-panic-manifeste-v1',
                    precacheFallback: { fallbackURL: 'manifest.webmanifest?hors-ligne' },
                },
            },
            {
                urlPattern: /\/assets\/[^/?]+-[\w-]{8}\.[a-z]+$/,
                handler: 'CacheFirst',
                options: { cacheName: 'capsule-panic-assets-v1', expiration: { maxEntries: 100 } },
            },
        ],
    },
});

export default defineConfig({
    base: './',
    build: {
        outDir: '../../dist',
        emptyOutDir: true,
        // Pixi charge les textures depuis leur URL, soumise à connect-src.
        assetsInlineLimit: 0,
    },
    plugins: [
        react(),
        {
            name: 'csp-vite-dev',
            apply: 'serve',
            // Vite injecte ses styles et le préambule React pendant le développement uniquement.
            transformIndexHtml(html) {
                return html.replace(
                    "script-src 'self'; style-src 'self'",
                    "script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
                );
            },
        },
        ...pwa,
        {
            name: 'precache-manifeste-hors-ligne',
            apply: 'build',
            buildStart() {
                // Le manifeste public passe par NetworkFirst. Un double révisé sert de secours hors ligne.
                const api = pwa.find((plugin) => plugin.name === 'vite-plugin-pwa')?.api as
                    VitePluginPWAAPI | undefined;
                api?.extendManifestEntries((entries) =>
                    entries.map((entry) =>
                        typeof entry !== 'string' && entry.url === 'manifest.webmanifest'
                            ? { ...entry, url: 'manifest.webmanifest?hors-ligne' }
                            : entry,
                    ),
                );
            },
        },
    ],
});
