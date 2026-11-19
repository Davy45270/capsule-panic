import { readFileSync, statSync } from 'node:fs';
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
