// Repris d'echecs-kid (pwa-manifest.ts).
import type { ManifestOptions } from 'vite-plugin-pwa';
export const manifest: Partial<ManifestOptions> = {
    name: 'Capsule Panic',
    short_name: 'Capsule Panic',
    description: 'Aligne quatre cellules d’énergie de même couleur pour dissoudre les cristaux instables.',
    lang: 'fr',
    display: 'standalone',
    orientation: 'any',
    theme_color: '#111827',
    background_color: '#111827',
    start_url: './',
    scope: './',
    icons: [
        { src: 'icons/capsule-panic-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icons/capsule-panic-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'icons/capsule-panic-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
};
