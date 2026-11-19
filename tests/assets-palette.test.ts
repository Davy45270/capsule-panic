// Construction des assets : le contrôle de palette du journal (scripts/assets_spec.py) passe les jetons de la
// spec comme le contrôle de chaîne, et chaque recoloration déclarée est lisible par une machine (plage de teintes
// source, cible, ton source).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { TOKENS } from '../packages/renderer/src/art.ts';

it('mesure_palette appelle style-palette.py avec --couleurs, jetons lus dans art.ts', () => {
    const outils = mkdtempSync(join(tmpdir(), 'outils-'));
    // Faux contrôle : il rend ses arguments, pour vérifier la commande exacte.
    writeFileSync(join(outils, 'style-palette.py'), 'import json, sys\nprint(json.dumps(sys.argv[1:]))\n');
    const sortie = execFileSync(
        'python3',
        [
            '-B',
            '-c',
            'import io, sys; sys.path.insert(0, "scripts"); from assets_spec import mesure_palette; ' +
                'j = io.StringIO(); mesure_palette("ref.png", "sprite.png", sys.argv[1], j); print(j.getvalue())',
            outils,
        ],
        { encoding: 'utf8' },
    );
    const argv = JSON.parse(sortie.split('\n')[0] ?? '') as string[];
    expect(argv).toEqual([
        'ref.png',
        'sprite.png',
        '--couleurs',
        [TOKENS.cyan, TOKENS.amber, TOKENS.magenta].join(','),
    ]);
});

it('chaque recoloration de chaine.json déclare sa plage de teintes source, sa cible et son ton source', () => {
    const chaine = JSON.parse(readFileSync('packages/assets/chaine.json', 'utf8')) as {
        tables: { derives?: { id: string; transformations: string[] }[] }[];
    };
    const recolorations = chaine.tables.flatMap((t) =>
        (t.derives ?? []).flatMap((d) => d.transformations.filter((x) => x.startsWith('recoloration'))),
    );
    expect(recolorations.length).toBeGreaterThan(0);
    // Forme lue par le contrôle de chaîne : « recoloration <nom> H1–H2°→#CIBLE », puis (source #RRGGBB, mode).
    for (const r of recolorations)
        expect(r).toMatch(/^recoloration [^\d→#]+\d+–\d+°→#[0-9A-F]{6} \(source #[0-9A-F]{6}, [^()]+\)$/u);
});
