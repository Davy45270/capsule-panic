import { defineConfig } from 'vitest/config';
export default defineConfig({
    test: {
        include: ['tests/*.test.ts', 'packages/*/test/**/*.test.ts', 'apps/web/test/**/*.test.ts'],
        pool: 'threads',
        maxWorkers: 2,
        // Seuil de la spec : 95 % des branches du moteur (règles, alignements, gravité, score), mesuré par `npm test`.
        coverage: { provider: 'v8', include: ['packages/engine/src/**'], thresholds: { branches: 95 } }
    }
});
