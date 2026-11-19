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

// Palette de référence SANS biais vers le blanc : celle du contrôle de chaîne (coupe médiane des seuls pixels opaques,
// alpha seuillé à 95 %), jamais l'image aplatie sur fond blanc. Oracle : style-palette.py (coupe_mediane) sur les mêmes
// pixels fabriqués — cinq blancs transparents et un blanc à demi transparent, qui ne comptent pas.
it('la palette de référence est la coupe médiane des seuls pixels opaques, comme le contrôle de chaîne', () => {
    const lignes = [
        '# ImageMagick pixel enumeration: 6,2,0,255,srgba',
        ...[0, 1, 2, 3, 4].map((x) => `${x},0: (255,255,255,0)  #FFFFFF00  srgba(255,255,255,0)`),
        '5,0: (255,255,255,120)  #FFFFFF78  srgba(255,255,255,0.47)',
        '0,1: (237,40,41,255)  #ED2829FF  srgba(237,40,41,1)',
        '1,1: (240,31,35,255)  #F01F23FF  srgba(240,31,35,1)',
        '2,1: (120,10,20,255)  #780A14FF  srgba(120,10,20,1)',
        '3,1: (0,135,236,255)  #0087ECFF  srgba(0,135,236,1)',
        '4,1: (8,14,34,255)  #080E22FF  srgba(8,14,34,1)',
        '5,1: (250,250,250,255)  #FAFAFAFF  srgba(250,250,250,1)',
        '0,2: (12,200,30)  #0CC81E  srgb(12,200,30)',
    ];
    const sortie = execFileSync(
        'python3',
        [
            '-B',
            '-c',
            'import json, sys; sys.path.insert(0, "scripts"); from assets_reference import coupe_mediane, pixels_opaques; ' +
                'p = pixels_opaques(sys.stdin.read()); print(json.dumps([len(p), coupe_mediane(p, 4)]))',
        ],
        { encoding: 'utf8', input: lignes.join('\n') },
    );
    const [opaques, palette] = JSON.parse(sortie) as [number, number[][]];
    expect(opaques).toBe(7);
    const oracle = [
        [20 / 3, 349 / 3, 100],
        [180, 20.5, 27.5],
        [237, 40, 41],
        [250, 250, 250],
    ];
    expect(palette).toHaveLength(oracle.length);
    palette.forEach((couleur, i) => couleur.forEach((v, k) => expect(v).toBeCloseTo(oracle[i]?.[k] ?? Number.NaN, 9)));
});

// Blocs et segments du plateau : une seule méthode de recoloration, la rampe projetée, déclarée sous la forme que le
// contrôle de chaîne lit (« recoloration <nom> H1–H2°→#CIBLE » et « rampe #SOMBRE→#CIBLE→#CLAIR »), sans rabattement
// ajouté après coup. Ni rampe luminance (bleus) ni rampe linéaire sur le gris à pivot 188 (jaunes), non déclarables.
it('les blocs et segments du plateau sont recolorés par la seule rampe projetée, déclarée telle que calculée', () => {
    const chaine = JSON.parse(readFileSync('packages/assets/chaine.json', 'utf8')) as {
        tables: { derives?: { id: string; transformations: string[] }[] }[];
    };
    const blocs = chaine.tables.flatMap((t) => (t.derives ?? []).filter((d) => /^sprite-(bloc|segment)-/u.test(d.id)));
    expect(blocs.map((d) => d.id).sort()).toEqual(
        ['bloc-bleu-plateau-apercu', 'bloc-bleu-plateau-jeu', 'bloc-jaune-plateau-apercu', 'bloc-jaune-plateau-jeu',
            'bloc-rouge-plateau-apercu', 'bloc-rouge-plateau-jeu', 'segment-bleu-plateau-apercu',
            'segment-jaune-plateau-apercu', 'segment-rouge-plateau-apercu'].map((id) => `sprite-${id}`),
    );
    const cibles = { bleu: TOKENS.cyan, jaune: TOKENS.amber, rouge: TOKENS.magenta };
    for (const { id, transformations } of blocs) {
        const recolorations = transformations.filter((x) => x.startsWith('recoloration'));
        expect(recolorations, id).toHaveLength(1);
        const m = /^recoloration (bleu|jaune|rouge) \d+–\d+°→(#[0-9A-F]{6}) \(source #[0-9A-F]{6}, rampe projetée\)$/u.exec(
            recolorations[0] ?? '',
        );
        expect(m, `${id} : ${recolorations[0]}`).not.toBeNull();
        const [, nom, cible] = m ?? [];
        expect(cible, id).toBe(cibles[nom as keyof typeof cibles]);
        expect(transformations.filter((x) => x.includes(`rampe #080E22→${cible}→#FFFFFF`)), id).toHaveLength(1);
        expect(transformations.filter((x) => /rabattement|luminance|#fff8ff/u.test(x)), id).toEqual([]);
    }
});

// Redessins des tables rouges au contrôle (animations, cascade, logos, paires, ponts, mode) : rabattus sur la palette
// SANS biais de leur planche, en ne déplaçant que les pixels hors tolérance et jamais un neutre vers une couleur (un
// reflet blanc ne vire pas au saumon). Le médaillon reste tel quel : rabattu, son biseau se postérisait.
it('les redessins des tables rouges sont rabattus sur la palette sans biais, sans changer de famille de couleur', () => {
    const provenance = JSON.parse(readFileSync('packages/assets/provenance.json', 'utf8')) as {
        assets: { id: string; transformations?: string[] }[];
    };
    const rabattus = [
        'chute-animations-jeu', 'rotation-animations-jeu', 'deplacement-animations-jeu', 'verrouillage-animations-jeu',
        'chute-animations-apercu', 'rotation-animations-apercu', 'deplacement-animations-apercu',
        'verrouillage-animations-apercu', 'cascade-apercu', 'transformation-apercu', 'logo-jeu', 'logo-apercu',
        'mode-classique-jeu', 'paire-horizontale-cyan-magenta', 'paire-horizontale-magenta-ambre',
        'paire-verticale-cyan-magenta', 'paire-verticale-cyan-ambre', 'paire-verticale-magenta-ambre',
        'pont-haut', 'pont-droite', 'pont-bas', 'pont-gauche',
    ];
    const sansBiais = (id: string) =>
        (provenance.assets.find((a) => a.id === `sprite-${id}`)?.transformations ?? []).filter(
            (t) =>
                t.includes('palette sans biais de la planche (coupe médiane des seuls pixels opaques') &&
                t.includes('pixels à plus de 48 de la palette') &&
                t.includes("un pixel neutre dont la couleur la plus proche est colorée, ou l'inverse, reste tel quel"),
        );
    for (const id of rabattus) expect(sansBiais(id), id).toHaveLength(1);
    expect(sansBiais('medaillon-cellule')).toEqual([]);
});
