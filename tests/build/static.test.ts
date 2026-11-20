import { readdirSync, readFileSync, statSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

const dist = new URL('../../dist/', import.meta.url);
const asset = (reference: string): URL => {
    const target = new URL(reference, dist);
    expect(target.protocol).toBe('file:');
    expect(target.href.startsWith(dist.href), reference).toBe(true);
    expect(statSync(target).isFile(), reference).toBe(true);
    return target;
};

it('[E181] le build contient une page et toutes ses ressources servies comme fichiers statiques', () => {
    const index = readFileSync(asset('index.html'), 'utf8');
    const references = [...index.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/gi)].map(
        (match) => match[1] ?? '',
    );
    expect(references.some((value) => value.includes('/assets/') && value.endsWith('.js'))).toBe(true);
    expect(references.some((value) => value.endsWith('.css'))).toBe(true);
    for (const reference of references) asset(reference);
});

it('[E164] le document construit charge ses scripts locaux sous une CSP stricte', () => {
    const index = readFileSync(asset('index.html'), 'utf8');
    const policy = /<meta\b[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/i.exec(index)?.[1];
    expect(policy).toBeDefined();
    const directives = new Map(
        policy?.split(';').map((directive) => {
            const [name, ...values] = directive.trim().split(/\s+/);
            return [name, values] as const;
        }),
    );
    expect(directives.get('default-src')).toEqual(["'none'"]);
    expect(directives.get('script-src')).toEqual(["'self'"]);
    expect(directives.get('object-src')).toEqual(["'none'"]);
    const scripts = [...index.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    expect(scripts.length).toBeGreaterThan(0);
    for (const [, attributes, body] of scripts) {
        const src = /\bsrc="([^"]+)"/.exec(attributes ?? '')?.[1];
        expect(src).toBeDefined();
        asset(src ?? '');
        expect(body?.trim()).toBe('');
    }
});

it('[E183] [E184] le manifeste public utilise le réseau et a un secours versionné', () => {
    const worker = readFileSync(asset('sw.js'), 'utf8');
    expect(worker).toContain('capsule-panic-v1');
    expect(worker).toMatch(/url:"manifest\.webmanifest\?hors-ligne",revision:"[a-f0-9]+"/);
    expect(worker).not.toContain('url:"manifest.webmanifest"');
    expect(worker).toMatch(/NetworkFirst\(\{cacheName:"capsule-panic-manifeste-v1"/);
    expect(worker).toMatch(/CacheFirst\(\{cacheName:"capsule-panic-assets-v1"/);
});

it('[E184] le routeur du worker sélectionne CacheFirst pour les fichiers hachés livrés', () => {
    class Strategy {
        constructor(readonly options?: { cacheName?: string }) {}
    }
    const routes: { matches: RegExp; strategy: Strategy; method: string }[] = [];
    const noop = () => undefined;
    const workbox = {
        setCacheNameDetails: noop,
        clientsClaim: noop,
        precacheAndRoute: noop,
        cleanupOutdatedCaches: noop,
        createHandlerBoundToURL: noop,
        NavigationRoute: Strategy,
        NetworkFirst: Strategy,
        CacheFirst: Strategy,
        PrecacheFallbackPlugin: Strategy,
        ExpirationPlugin: Strategy,
        registerRoute(matcher: unknown, strategy: Strategy, method: string) {
            if (Object.prototype.toString.call(matcher) === '[object RegExp]') {
                routes.push({ matches: matcher as RegExp, strategy, method });
            }
        },
    };
    const define = (_modules: readonly string[], factory: (api: typeof workbox) => void) => factory(workbox);
    runInNewContext(readFileSync(asset('sw.js'), 'utf8'), { define, self: { define, skipWaiting: noop } });
    const route = routes.find(({ strategy }) => strategy.options?.cacheName === 'capsule-panic-assets-v1');
    expect(route?.method).toBe('GET');
    const files = readdirSync(new URL('assets/', dist));
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
        const url = new URL(`assets/${name}`, 'https://jeu.example/capsule/');
        expect(route?.matches.test(url.href), url.pathname).toBe(true);
    }
    expect(route?.matches.test('https://jeu.example/capsule/icons/capsule-panic-192.png')).toBe(false);
});
