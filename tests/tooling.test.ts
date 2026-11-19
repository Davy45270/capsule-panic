import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parse } from 'yaml';
import { publicLines } from '../scripts/public-files';
import { propertyRuns } from '../packages/engine/test/property-runs';

const read = (file: string): string => readFileSync(file, 'utf8');

it('[E001] le dépôt déclare et contient la licence MIT', () => {
    expect(read('package.json')).toMatch(/"license": "MIT"/);
    expect(read('LICENSE')).toContain('Permission is hereby granted, free of charge');
});

it('[E005][E115] TypeScript vérifie aussi les accès indexés', () => {
    expect(read('tsconfig.json')).toMatch(/"strict": true/);
    expect(read('tsconfig.json')).toMatch(/"noUncheckedIndexedAccess": true/);
});

it('[E113] la version Node est la branche LTS de la machine CI', () => {
    expect(read('.nvmrc').trim()).toBe('26');
    expect(read('package.json')).toContain('"node": ">=26.13.0 <27"');
    expect(read('.woodpecker/checks.yml')).toMatch(/node:26\b/);
});

it('[E121][E122] lint exige les trois outils et zéro avertissement', () => {
    const manifest = read('package.json');
    expect(manifest).toMatch(
        /"lint": "oxlint --max-warnings=0 && eslint --max-warnings=0 \. && prettier --check /,
    );
});

it('[E164] le document déclare une CSP stricte côté scripts', () => {
    const html = read('apps/web/index.html');
    expect(html).toMatch(/http-equiv="Content-Security-Policy"/i);
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("script-src 'self'");
    expect(html).toContain("object-src 'none'");
    expect(html).toContain("base-uri 'none'");
    expect(html).not.toMatch(/unsafe-eval|script-src[^;"]*unsafe-inline/);
});

it('[E165] les sources ne compilent pas de code au démarrage', () => {
    const files = publicLines(process.cwd()).filter(({ file }) =>
        /(?:^|\/)src\/.*\.[cm]?[jt]sx?$/.test(file),
    );
    expect(files.length).toBeGreaterThan(0);
    expect(files.filter(({ line }) => /\beval\s*\(|\bnew\s+Function\s*\(/.test(line))).toEqual([]);
    expect(read('packages/contracts/src/validate.ts')).not.toMatch(/\bnew\s+Ajv/);
});

it('[E182] l’image statique est versionnée et lance Nginx en utilisateur non-root', () => {
    const dockerfile = read('Dockerfile');
    expect(dockerfile).toMatch(/^FROM nginxinc\/nginx-unprivileged:\d+\.\d+\.\d+-alpine$/m);
    expect(dockerfile).toMatch(/^USER 101:101$/m);
    expect(dockerfile).toMatch(/^COPY dist\/ \/usr\/share\/nginx\/html\/$/m);
});

it('[E276] les propriétés critiques utilisent au moins 1000 cas en CI par défaut', () => {
    expect(propertyRuns({ CI: 'true' })).toBe(1000);
    expect(propertyRuns({})).toBe(50);
    expect(propertyRuns({ CI: 'true', FC_RUNS: '1500' })).toBe(1500);
    expect(propertyRuns({ FC_RUNS: '50' })).toBe(50);
});

interface Workflow {
    steps: { name: string; commands: string[] }[];
}
it('[E167][E168][E170][E172] Woodpecker enchaîne les contrôles jusqu’à l’artefact', () => {
    const { steps } = parse(read('.woodpecker/checks.yml')) as Workflow;
    const stages = [
        'npm ci',
        'npm run lint',
        'npm run typecheck',
        'npm test',
        'npm run build',
        'npm run test:e2e',
        'npm audit',
        'npm run check:sast',
        'tar -czf',
    ];
    let previous = -1;
    for (const stage of stages) {
        const commands = steps.flatMap((step) => step.commands);
        const index = commands.findIndex((command) => command.trimStart().startsWith(stage));
        expect(index, stage).toBeGreaterThan(previous);
        previous = index;
    }
    expect(steps.find((step) => step.name === 'build')?.commands.join('\n')).toContain('empreinte dist');
});

interface Manifest {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
}
const manifests = [
    'package.json',
    'apps/web/package.json',
    'packages/contracts/package.json',
    'packages/engine/package.json',
    'packages/input/package.json',
    'packages/renderer/package.json',
];
const declarations = (file: string): Record<string, string> => {
    const manifest = JSON.parse(read(file)) as Manifest;
    return { ...manifest.dependencies, ...manifest.devDependencies };
};

it('[E007][E116][E117][E118][E119][E120] la pile est déclarée dans les paquets qui l’utilisent', () => {
    expect(Object.keys(declarations('package.json'))).toEqual(
        expect.arrayContaining(['vite', 'vitest', 'fast-check', '@playwright/test']),
    );
    expect(Object.keys(declarations('apps/web/package.json'))).toEqual(
        expect.arrayContaining(['react', 'react-dom']),
    );
    expect(declarations('packages/renderer/package.json')['pixi.js']).toBeDefined();
});

it('[E123][E166] chaque dépendance déclarée est épinglée et reportée au lockfile', () => {
    const lock = JSON.parse(read('package-lock.json')) as { packages: Record<string, Manifest> };
    for (const file of manifests) {
        const path = file.replace(/\/?package\.json$/, '');
        const deps = declarations(file);
        expect({ ...lock.packages[path]?.dependencies, ...lock.packages[path]?.devDependencies }).toEqual(
            deps,
        );
        for (const version of Object.values(deps)) expect(version).toMatch(/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/);
    }
});

it('[E011][E124] la pile exclut les moteurs et plateformes externes interdits', () => {
    const prohibited = /(?:^|[/@-])(?:phaser|opencade|qwarkle)(?=$|[/@-])/i;
    const lock = JSON.parse(read('package-lock.json')) as { packages: Record<string, unknown> };
    expect(Object.keys(lock.packages).filter((name) => prohibited.test(name))).toEqual([]);
    const imports = publicLines(process.cwd()).filter(
        ({ file, line }) => /\/src\//.test(file) && /\b(?:import|from)\b/.test(line),
    );
    expect(
        imports.filter(({ line }) =>
            [...line.matchAll(/['"]([^'"]+)['"]/g)].some((match) => prohibited.test(match[1] ?? '')),
        ),
    ).toEqual([]);
});
