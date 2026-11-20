import { dirname, resolve, sep } from 'node:path';
import { expect, it } from 'vitest';
import { sourceImports } from '../../../tests/source-imports';

it('[E128] le renderer reçoit les états et événements sans importer les règles du moteur', () => {
    const engine = resolve('packages/engine');
    const imports = sourceImports('packages/renderer/src');
    expect(imports.length).toBeGreaterThan(0);

    const forbidden = imports.filter(({ file, module }) => {
        if (module === '@capsule-panic/engine' || module.startsWith('@capsule-panic/engine/')) return true;
        const target = resolve(dirname(file), module);
        return module.startsWith('.') && (target === engine || target.startsWith(engine + sep));
    });
    expect(forbidden).toEqual([]);
});
