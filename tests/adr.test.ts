import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const decisions = [
    'prng', 'score', 'gravite', 'cadence', 'rotation', 'niveau-20',
    'identifiants', 'resolution', 'file', 'phase-initiale', 'performance',
];

it('[E015] chaque décision de la passe référence un test discriminant nommé', () => {
    for (const name of decisions) {
        const adr = new URL(`../docs/adr/${name}.md`, import.meta.url);
        const content = readFileSync(adr, 'utf8');
        const section = content.split('## Test discriminant')[1] ?? '';
        const links = [...section.matchAll(/^\[([^\]]+)\]\(([^)]+\.test\.ts)\)$/gm)];
        expect(links.length, name).toBeGreaterThan(0);
        for (const [, title, file] of links) {
            const tests = readFileSync(new URL(file ?? '', adr), 'utf8');
            expect(tests, name).toContain(title ?? '');
        }
    }
});
