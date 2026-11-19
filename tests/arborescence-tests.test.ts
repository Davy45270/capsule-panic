// Spec (acceptance/TESTS.md, § Qualité) : « Tests visuels séparés des tests moteur. »
// Les tests visuels et de bout en bout (Playwright, navigateur réel) vivent sous tests/e2e ; les tests
// du moteur (Vitest, sans DOM) vivent sous packages/engine/test. Ce test refuse les deux mélanges :
// une spec Playwright ailleurs que dans tests/e2e, un test Vitest qui ramasse tests/e2e, un test
// moteur qui importe Playwright ou un test e2e qui importe le moteur au lieu de passer par l'écran.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import playwright from '../playwright.config';
import vitest from '../vitest.config';

const IGNORES = new Set([
    'node_modules',
    'dist',
    'coverage',
    '.git',
    'test-results',
    'playwright-report',
    '.npm-cache',
]);
const fichiers = (dossier: string): string[] =>
    readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
        if (IGNORES.has(entree.name)) return [];
        const chemin = join(dossier, entree.name);
        return entree.isDirectory() ? fichiers(chemin) : [chemin];
    });

it('[E280] les tests visuels et e2e sont dans tests/e2e, séparés des tests moteur', () => {
    expect(playwright.testDir).toBe('tests/e2e');
    const inclus = vitest.test?.include ?? [];
    expect(inclus.length).toBeGreaterThan(0);
    // Vitest ne ramasse que des *.test.ts et jamais tests/e2e ; Playwright ne lit que des *.spec.ts.
    expect(inclus.filter((motif) => motif.includes('e2e') || !motif.endsWith('.test.ts'))).toEqual([]);

    const tous = fichiers('.');
    const specs = tous.filter((f) => f.endsWith('.spec.ts'));
    expect(specs.length).toBeGreaterThan(0);
    expect(specs.filter((f) => !f.startsWith('tests/e2e/'))).toEqual([]);

    const e2e = tous.filter((f) => f.startsWith('tests/e2e/') && f.endsWith('.ts'));
    expect(
        e2e.filter((f) =>
            /from ['"](?:@capsule-panic\/engine|[./]+packages\/engine)/.test(readFileSync(f, 'utf8')),
        ),
    ).toEqual([]);

    const moteur = fichiers('packages/engine/test').filter((f) => f.endsWith('.ts'));
    expect(moteur.length).toBeGreaterThan(0);
    expect(moteur.filter((f) => /@playwright\/test/.test(readFileSync(f, 'utf8')))).toEqual([]);
});
