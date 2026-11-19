import { defineConfig } from 'vitest/config';
export default defineConfig({
    test: {
        include: ['tests/*.test.ts', 'packages/*/test/**/*.test.ts', 'apps/web/test/**/*.test.ts'],
        pool: 'threads',
        maxWorkers: 2,
        coverage: {
            provider: 'v8',
            include: ['packages/engine/src/**'],
            thresholds: {
                branches: 95,
                'packages/engine/src/step.ts': { branches: 95 },
                'packages/engine/src/match.ts': { branches: 95 },
                'packages/engine/src/gravity.ts': { branches: 95 },
                'packages/engine/src/resolve.ts': { branches: 95 }
            }
        }
    }
});
