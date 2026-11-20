import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { sourceImports } from './source-imports';

// assets-inventaire.test.ts vérifie les sprites livrés et leurs empreintes.
// Le jeu charge ses sprites depuis packages/assets/runtime : chacun doit être importé par le renderer ou
// l'application, sinon il n'entre pas dans le build. Les atlas de packages/assets/atlas sont des sorties de la
// chaîne graphique ; seul celui des personnages est chargé à l'exécution.
function importsRelatifs(): Set<string> {
    const imports = ['packages/renderer/src', 'apps/web/src'].flatMap(sourceImports);
    return new Set(
        imports
            .filter(({ module }) => module.startsWith('.'))
            .map(({ file, module }) => resolve(dirname(file), module)),
    );
}

it('[E133] chaque sprite d’exécution est chargé par le renderer ou l’application', () => {
    const directory = 'packages/assets/runtime';
    const sprites = readdirSync(directory)
        .filter((name) => name.endsWith('.webp'))
        .sort();
    expect(sprites.length).toBeGreaterThan(0);

    const referenced = importsRelatifs();
    expect(sprites.filter((name) => !referenced.has(resolve(directory, name)))).toEqual([]);
});

it('[E133] l’atlas des personnages est chargé avec sa description', () => {
    const referenced = importsRelatifs();
    for (const name of ['personnages-origine@3x.webp', 'personnages-origine@3x.json']) {
        expect(referenced.has(resolve('packages/assets/atlas', name)), name).toBe(true);
    }
});
