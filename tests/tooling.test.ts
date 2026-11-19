import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    expect(propertyRuns({ CI: '' })).toBe(1000);
    expect(propertyRuns({})).toBe(50);
    expect(propertyRuns({ CI: 'true', FC_RUNS: '1500' })).toBe(1500);
    expect(propertyRuns({ CI: 'true', FC_RUNS: '50' })).toBe(1000);
    expect(propertyRuns({ FC_RUNS: '50' })).toBe(50);
});

interface Workflow {
    steps: { name: string; commands: string[] }[];
}
it('[E167][E170][E172] Woodpecker enchaîne les contrôles jusqu’à l’artefact', () => {
    // checks.yml puis e2e.yml, qui en dépend (tests/ci-ordre.test.ts vérifie cette dépendance).
    const steps = ['checks', 'e2e'].flatMap(
        (nom) => (parse(read(`.woodpecker/${nom}.yml`)) as Workflow).steps,
    );
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
    const commands = steps.flatMap((step) => step.commands);
    for (const stage of stages) {
        const index = commands.findIndex((command) => command.trimStart().startsWith(stage));
        expect(index, stage).toBeGreaterThan(previous);
        previous = index;
    }
    expect(steps.find((step) => step.name === 'build')?.commands.join('\n')).toContain('empreinte dist');
});

interface Manifest {
    version?: string;
    link?: boolean;
    resolved?: string;
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
        for (const [name, version] of Object.entries(deps)) {
            expect(version).toMatch(/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/);
            const entry =
                lock.packages[path ? `${path}/node_modules/${name}` : `node_modules/${name}`] ??
                lock.packages[`node_modules/${name}`];
            const resolved = entry?.link && entry.resolved ? lock.packages[entry.resolved] : entry;
            expect(resolved?.version, name).toBe(version);
        }
    }
});

it('[E011][E124] la pile exclut les moteurs et plateformes externes interdits', () => {
    const names = [
        ['pha', 'ser'],
        ['open', 'cade'],
        ['qwar', 'kle'],
    ].map((parts) => parts.join(''));
    const prohibited = new RegExp(`(?:^|[/@-])(?:${names.join('|')})(?=$|[/@-])`, 'i');
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

it('[E171] le build de CI compare les empreintes de deux générations de dist', () => {
    const { steps } = parse(read('.woodpecker/checks.yml')) as Workflow;
    const script = steps.find((step) => step.name === 'build')?.commands.join('\n') ?? '';
    expect(script.match(/npm run build/g)).toHaveLength(2);
    expect(script).toContain('find . -type f -print0');
    expect(script).toContain('test "$$avant" = "$$apres"');
    expect(script).toContain('empreinte dist $$apres');
});

it('[E020][E169] le contrôle de licences accepte le verrou courant et refuse une licence interdite', () => {
    const script = 'scripts/check-licenses.js';
    expect(read('.woodpecker/e2e.yml')).toContain('npm run check:licenses');
    expect(spawnSync(process.execPath, [script], { encoding: 'utf8' }).status).toBe(0);

    const root = mkdtempSync(join(tmpdir(), 'licences-'));
    try {
        // Le script résout package-lock relativement au sous-répertoire scripts.
        const scripts = join(root, 'scripts');
        mkdirSync(scripts);
        copyFileSync(script, join(scripts, 'check-licenses.mjs'));
        const lock = { packages: { 'node_modules/exemple': { license: 'AGPL' } } };
        writeFileSync(join(root, 'package-lock.json'), JSON.stringify(lock));
        const result = spawnSync(process.execPath, [join(scripts, 'check-licenses.mjs')], {
            encoding: 'utf8',
        });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('node_modules/exemple');
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

it('[E050][E163][E180] les sources et le document d’entrée ne déclarent aucune requête externe', () => {
    const html = read('apps/web/index.html');
    expect(html).toContain("script-src 'self'");
    expect(html).toContain("connect-src 'self'");
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);
    expect(scripts).toEqual(['/src/main.tsx']);
    const source = publicLines(process.cwd()).filter(({ file }) => /(?:^|\/)src\/.*\.[jt]sx?$/.test(file));
    expect(source.length).toBeGreaterThan(0);
    expect(
        source.filter(({ line }) =>
            /\b(?:fetch|sendBeacon|XMLHttpRequest|WebSocket|EventSource)\s*\(/.test(line),
        ),
    ).toEqual([]);
    const inertSvgNamespace = 'xmlns="http://www.w3.org/2000/svg"';
    expect(
        source.filter(({ line }) => /['"`]https?:\/\//i.test(line.replaceAll(inertSvgNamespace, ''))),
    ).toEqual([]);
});

it('[E168] le SAST signale une construction non littérale sur un fichier source TypeScript', () => {
    const args = [
        'node_modules/eslint/bin/eslint.js',
        '--config',
        'eslint.security.config.mjs',
        '--max-warnings=0',
        '--stdin',
        '--stdin-filename',
        'apps/web/src/probe.ts',
    ];
    const result = spawnSync(process.execPath, args, {
        input: 'export const pattern = (value: string) => new RegExp(value);',
        encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('security/detect-non-literal-regexp');
});
