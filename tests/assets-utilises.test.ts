import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { sourceImports } from './source-imports';

// assets-inventaire.test.ts vérifie les sprites livrés et leurs empreintes.
it('[E133] chaque atlas déclaré est chargé par le renderer ou l’application', () => {
    const directory = 'packages/assets/atlas';
    const atlases = readdirSync(directory)
        .filter((name) => name.endsWith('.json'))
        .sort();
    expect(atlases.length).toBeGreaterThan(0);

    const imports = ['packages/renderer/src', 'apps/web/src'].flatMap(sourceImports);
    const referenced = new Set(
        imports
            .filter(({ module }) => module.startsWith('.'))
            .map(({ file, module }) => resolve(dirname(file), module)),
    );
    expect(atlases.filter((name) => !referenced.has(resolve(directory, name)))).toEqual([]);
});
