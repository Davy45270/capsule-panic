// Adapté d'echecs-kid (tests/pwa.test.ts).
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { manifest } from '../apps/web/pwa-manifest';

it('declares the French app identity', () => {
    expect(manifest.name).toBe('Capsule Panic');
    expect(manifest.short_name).toBe('Capsule Panic');
    expect(manifest.lang).toBe('fr');
    expect(manifest.display).toBe('standalone');
    expect(manifest.orientation).toBe('any');
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
});
it('ships three PNG icons with the declared sizes', () => {
    expect(manifest.icons).toHaveLength(3);
    for (const icon of manifest.icons ?? []) {
        const bytes = readFileSync('apps/web/public/' + icon.src);
        expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
        const size = Number(icon.sizes?.split('x')[0]);
        expect(bytes.readUInt32BE(16)).toBe(size);
        expect(bytes.readUInt32BE(20)).toBe(size);
    }
});
// Le précache est versionné et complet ; le seul cache à l'exécution est celui que la spec impose
// (manifeste en network-first, assets hashés en cache-first), vérifié en détail par tests/build/static.test.ts.
it('[E008] uses a relative, versioned, complete precache', () => {
    const config = readFileSync('apps/web/vite.config.ts', 'utf8');
    expect(config).toContain("base: './'");
    expect(config).toContain("strategies: 'generateSW'");
    expect(config).toContain("cacheId: 'capsule-panic-v1'");
    expect(config).toContain("globPatterns: ['**/*.{html,js,css,png,webp,svg}']");
    expect(config.match(/handler: '(\w+)'/g)).toEqual(["handler: 'NetworkFirst'", "handler: 'CacheFirst'"]);
});
