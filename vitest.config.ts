import { defineConfig } from 'vitest/config';
export default defineConfig({
    test: {
        include: ['tests/*.test.ts', 'packages/*/test/**/*.test.ts', 'apps/web/test/**/*.test.ts'],
        pool: 'threads',
        maxWorkers: 2
    }
});
