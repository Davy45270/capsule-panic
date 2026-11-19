import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { it, expect } from 'vitest';

// The pure packages must not reach the clock, the DOM, randomness or the UI libraries: oxlint enforces it.
it('[E006][E062][E189] engine purity is enforced by lint', () => {
    const probe = 'packages/engine/src/__lint_probe.ts';
    writeFileSync(probe, "import 'react';\nimport '@capsule-panic/renderer';\nexport const a = Math.random();\nexport const b = new Date();\n");
    try {
        let output = '';
        let failed = false;
        try {
            execFileSync('npx', ['oxlint', '--max-warnings=0', probe], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        } catch (error) {
            failed = true;
            const { stdout, stderr } = error as { stdout: string; stderr: string };
            output = stdout + stderr;
        }
        expect(failed).toBe(true);
        expect(output).toContain('no-restricted-imports');
        expect(output).toMatch(/no-restricted-imports[^\n]*@capsule-panic\/renderer/);
        expect(output).toContain('no-restricted-properties');
        expect(output).toContain('no-restricted-globals');
    } finally { rmSync(probe, { force: true }); }
}, 60_000);
