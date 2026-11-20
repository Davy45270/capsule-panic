// Repris d'echecs-kid (tests/brand-guard.test.ts), liste étendue aux jeux de capsules.
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publicLines } from '../scripts/public-files';
import { it, expect } from 'vitest';
const forbidden = [
    ['metal', ' slug'],
    ['gala', 'ga'],
    ['wor', 'ms'],
    ['lemm', 'ings'],
    ['puzzle', ' bobble'],
    ['bust', '-a-move'],
    ['zu', 'ma'],
    ['bomber', 'man'],
    ['arka', 'noid'],
    ['break', 'out'],
    ['space', ' invaders'],
    ['pac', '-man'],
    ['tet', 'ris'],
    ['soko', 'ban'],
    ['frog', 'ger'],
    ['cut', ' the rope'],
    ['om', ' nom'],
    ['boulder', ' dash'],
    ['lunar', ' lander'],
    ['mar', 'io'],
    ['nin', 'tendo'],
    ['vi', 'rus'],
    ['vir', 'uses'],
    ['puyo', ' puyo'],
    ['columns', ' crown'],
].map((parts) => parts.join(''));
const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const brand = new RegExp(`\\b(?:${forbidden.map(escape).join('|')})\\b`, 'i');
const ticket = /\b[A-Z]{2,10}-\d+\b/;
// Seule exception au motif de ticket : le nom de la règle, imposé par le contrat de partie.
const ruleset = ['CP', 'CLASSIC', '1'].join('-');
const ticketLike = (line: string): boolean => ticket.test(line.split(ruleset).join(''));
it('public text has no commercial names or internal ticket identifiers', () => {
    const violations = publicLines(process.cwd())
        .filter(({ line }) => brand.test(line) || ticketLike(line))
        .map(({ file, number }) => `${file}:${number}`);
    expect(violations).toEqual([]);
});
it('the guard matches separated commercial names and uppercase ticket shapes only', () => {
    for (const name of forbidden) {
        expect(brand.test(`(${name.toUpperCase()})`)).toBe(true);
        expect(brand.test(`prefix${name}suffix`)).toBe(false);
    }
    expect(ticket.test(['AB', '123'].join('-'))).toBe(true);
    expect(ticket.test('ordinary-123')).toBe(false);
});
it('the ruleset constant is the only tolerated ticket shape', () => {
    expect(ticketLike(`ruleset: '${ruleset}'`)).toBe(false);
    expect(ticketLike(`${ruleset} ${['CP', '07'].join('-')}`)).toBe(true);
    expect(ticketLike(['CLASSIC', '1'].join('-'))).toBe(true);
});

it('ignored and untracked files are never read, including without git', () => {
    const root = mkdtempSync(join(tmpdir(), 'public-text-'));
    try {
        mkdirSync(join(root, 'packages'));
        writeFileSync(join(root, 'packages', 'visible.ts'), 'source');
        writeFileSync(join(root, 'untracked.txt'), 'untracked');
        const ignored = [
            '.home/.npm/_cacache',
            '.cache',
            'node_modules',
            'dist',
            'test-results',
            'packages/.hidden',
        ];
        for (const folder of ignored) {
            mkdirSync(join(root, folder), { recursive: true });
            // Invalid UTF encoding would pollute the result if these files were read.
            writeFileSync(join(root, folder, 'private.txt'), Buffer.from([255]));
        }
        const tracked = () => ['packages/visible.ts', ...ignored.map((folder) => `${folder}/private.txt`)];
        const reads: string[] = [];
        const read = (file: string): string => {
            reads.push(file);
            return readFileSync(file, 'utf8');
        };
        expect(publicLines(root, tracked, read)).toEqual([
            { file: 'packages/visible.ts', line: 'source', number: 1 },
        ]);
        const fallback = publicLines(
            root,
            () => {
                throw new Error('git unavailable');
            },
            read,
        );
        expect(fallback.map((entry) => entry.line).sort()).toEqual(['source', 'untracked']);
        expect(reads).toEqual([
            join(root, 'packages/visible.ts'),
            join(root, 'packages/visible.ts'),
            join(root, 'untracked.txt'),
        ]);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

// Empreintes des deux sprites et de l’atlas comparés pixel pour pixel avec la planche de contrôle.
// Sprites réempreints après `oxipng -o max --strip safe` : octets changés, décodage RGBA identique.
it('[E002] [E284] les chercheurs contrôlés sont sans croix, blouse médicale, stéthoscope, seringue ou pilule', () => {
    const approved = {
        'sprites/sprite-chercheuse-origine.png':
            'c7479e37f2aa8d8e66c4bc47be9b053b4518bbe5664bc9b197ef79265fb1afe1',
        'sprites/sprite-responsable-origine.png':
            '1596d381e6ae3ee0b1e4253d120d744c6173c4d8b91f83abdbeb4c25001f0418',
        'atlas/personnages-origine@3x.webp':
            'b1443119e6bf42d76874cd6029507b694e9b79ba43a189caa8e02baeb4738e2f',
        'atlas/personnages-origine@3x.json':
            'c7bad848d0ff61d192b9f33f5810c2adf9682a55408097065adbc9d7bb54f98f',
    };
    for (const [file, digest] of Object.entries(approved)) {
        expect(
            createHash('sha256')
                .update(readFileSync(`packages/assets/${file}`))
                .digest('hex'),
            file,
        ).toBe(digest);
    }
});
