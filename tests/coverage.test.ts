import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import config from '../vitest.config';

it('[E275][E323] la couverture de branches protège les règles, les alignements, la gravité et le score', () => {
    expect(config.test?.coverage).toMatchObject({
        include: ['packages/engine/src/**'],
        thresholds: {
            branches: 95,
            'packages/engine/src/step.ts': { branches: 95 },
            'packages/engine/src/match.ts': { branches: 95 },
            'packages/engine/src/gravity.ts': { branches: 95 },
            'packages/engine/src/resolve.ts': { branches: 95 },
        },
    });
    expect(readFileSync('package.json', 'utf8')).toMatch(/"test": "vitest run [^"]*--coverage/);
});
