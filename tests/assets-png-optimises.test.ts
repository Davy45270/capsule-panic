// Les PNG livrés dans dist (donc au précache) sortent de la construction déjà optimisés sans perte :
// les icônes de apps/web/public/icons et les sprites importés par le jeu. Une passe de plus de
// `oxipng -o max --strip safe` (l'étape de scripts/assets-build.sh) ne doit plus rien gagner, et donc
// rendre les mêmes octets : oxipng n'écrit un fichier que s'il le rend plus léger.
// oxipng n'existe que sur la machine qui construit les assets (Zalman), pas dans l'image node de la CI :
// là, le test est sauté et ce sont les sha256 de l'inventaire qui figent les octets construits.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { expect, it } from 'vitest';

const OXIPNG = ['-q', '-o', 'max', '--strip', 'safe'];
const SOURCES = ['apps/web/src', 'packages/renderer/src'];

const fichiers = (dossier: string): string[] =>
    readdirSync(dossier, { recursive: true, encoding: 'utf8' }).map((nom) => join(dossier, nom));

/** Les PNG que le build copie dans dist : icônes publiques et sprites importés par les sources. */
export function pngLivres(): string[] {
    const icones = fichiers('apps/web/public/icons').filter((f) => f.endsWith('.png'));
    const importes = SOURCES.flatMap(fichiers)
        .filter((f) => /\.(?:tsx?|css)$/u.test(f))
        .flatMap((f) =>
            [...readFileSync(f, 'utf8').matchAll(/['"](\.{1,2}\/[^'"\s]+\.png)['"]/gu)].map((m) =>
                resolve(f, '..', m[1] ?? ''),
            ),
        )
        .map((f) => f.slice(process.cwd().length + 1));
    return [...new Set([...icones, ...importes])].sort();
}

const oxipng = spawnSync('oxipng', ['--version'], { encoding: 'utf8' }).status === 0;

it('la liste des PNG livrés couvre les icônes et les sprites du jeu', () => {
    const livres = pngLivres();
    expect(livres.filter((f) => f.startsWith('apps/web/public/icons/')).length).toBe(3);
    expect(livres.filter((f) => f.startsWith('packages/assets/sprites/')).length).toBeGreaterThan(15);
    expect(livres.filter((f) => !existsSync(f))).toEqual([]);
});

it.skipIf(!oxipng)(
    'oxipng -o max --strip safe ne gagne plus un octet sur les PNG livrés',
    () => {
        const dossier = mkdtempSync(join(tmpdir(), 'capsule-oxipng-'));
        try {
            const livres = pngLivres();
            const copies = livres.map((f, i) => {
                const copie = join(dossier, `${i}-${basename(f)}`);
                copyFileSync(f, copie);
                return copie;
            });
            execFileSync('oxipng', [...OXIPNG, ...copies]);
            const gagnants = livres.filter((f, i) => !readFileSync(f).equals(readFileSync(copies[i] ?? '')));
            expect(gagnants).toEqual([]);
        } finally {
            rmSync(dossier, { recursive: true, force: true });
        }
    },
    120_000,
);
