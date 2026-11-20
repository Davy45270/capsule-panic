// Construction des assets : le contrôle de palette du journal (scripts/assets_spec.py) passe les jetons de la
// spec comme le contrôle de chaîne, et chaque recoloration déclarée est lisible par une machine (plage de teintes
// source, cible, ton source).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
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
        // Bleus : arrêt sombre marine saturé (cyan de la spec retenu) ; rouges et jaunes : encrage marine des blocs bleus.
        // Le pivot est déclaré, et c'est celui de la construction (« rampe #S→#C→#L pivot P »).
        const sombre = nom === 'bleu' ? '#002A8C' : '#080E22';
        const motif = new RegExp(`rampe ${sombre}→${cible}→#FFFFFF pivot (0\\.\\d{3}) \\(clarté du ton source (#[0-9A-F]{6})\\)`, 'u');
        const rampes = transformations.map((x) => motif.exec(x)).filter((x) => x !== null);
        expect(rampes, id).toHaveLength(1);
        const [, pivot, source] = rampes[0] ?? [];
        const canaux = [1, 3, 5].map((k) => Number.parseInt((source ?? '').slice(k, k + 2), 16));
        expect(pivot, id).toBe(((Math.max(...canaux) + Math.min(...canaux)) / 510).toFixed(3));
        expect(transformations.filter((x) => /rabattement|luminance|#fff8ff/u.test(x)), id).toEqual([]);
    }
});

// Redessins des tables rouges au contrôle (animations, cascade, logos, paires, ponts, mode) : rabattus sur la palette
// SANS biais de leur planche, en ne déplaçant que les pixels hors tolérance et jamais un neutre vers une couleur (un
// reflet blanc ne vire pas au saumon). Le médaillon reste tel quel : rabattu, son biseau se postérisait.
// Exception : les redessins qui portent du magenta. Décision de l'auteur de la spec : tout le magenta est le rose de
// la spec (#F472B6) ; rabattus sur leur élément de planche, rouge, ils retombaient sur le framboise.
it('les redessins des tables rouges sont rabattus sur la palette sans biais, sans changer de famille de couleur', () => {
    const provenance = JSON.parse(readFileSync('packages/assets/provenance.json', 'utf8')) as {
        assets: { id: string; transformations?: string[] }[];
    };
    const rabattus = [
        'deplacement-animations-jeu', 'logo-jeu', 'logo-apercu', 'mode-classique-jeu', 'paire-verticale-cyan-ambre',
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
    for (const id of ['medaillon-cellule', ...DERIVES_MAGENTA]) expect(sansBiais(id), id).toEqual([]);
});

/** Redessins qui portent du magenta (paires, animations, cascade, transformation, tutoriels). */
const DERIVES_MAGENTA = [
    'paire-horizontale-cyan-magenta', 'paire-horizontale-magenta-ambre', 'paire-verticale-cyan-magenta',
    'paire-verticale-magenta-ambre', 'chute-animations-jeu', 'rotation-animations-jeu', 'verrouillage-animations-jeu',
    'chute-animations-apercu', 'rotation-animations-apercu', 'deplacement-animations-apercu',
    'verrouillage-animations-apercu', 'cascade-apercu', 'transformation-apercu', 'tutoriel-deplacer',
    'tutoriel-eliminer', 'tutoriel-pivoter',
];

/** Pixels RGBA d'un PNG 8 bits RGBA ou RGB non entrelacé (les sprites de la chaîne). */
function pixels(chemin: string): Uint8Array {
    const png = readFileSync(chemin);
    const largeur = png.readUInt32BE(16);
    const hauteur = png.readUInt32BE(20);
    const type = png[25];
    const canaux = type === 6 ? 4 : type === 2 ? 3 : 0;
    expect(png[24], chemin).toBe(8);
    expect(canaux, chemin).toBeGreaterThan(0);
    expect(png[28], chemin).toBe(0);
    const morceaux: Buffer[] = [];
    for (let i = 8; i < png.length;) {
        const taille = png.readUInt32BE(i);
        if (png.toString('latin1', i + 4, i + 8) === 'IDAT')
            morceaux.push(png.subarray(i + 8, i + 8 + taille));
        i += taille + 12;
    }
    const brut = inflateSync(Buffer.concat(morceaux));
    const ligne = largeur * canaux;
    const sortie = new Uint8Array(largeur * hauteur * 4);
    let precedente = new Uint8Array(ligne);
    for (let y = 0; y < hauteur; y++) {
        const filtre = brut[y * (ligne + 1)] ?? 0;
        const courante = new Uint8Array(brut.subarray(y * (ligne + 1) + 1, (y + 1) * (ligne + 1)));
        for (let i = 0; i < ligne; i++) {
            const a = i >= canaux ? (courante[i - canaux] ?? 0) : 0;
            const b = precedente[i] ?? 0;
            const c = i >= canaux ? (precedente[i - canaux] ?? 0) : 0;
            const p = a + b - c;
            const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
            const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            const ajout = [0, a, b, (a + b) >> 1, paeth][filtre] ?? 0;
            courante[i] = ((courante[i] ?? 0) + ajout) & 0xff;
        }
        for (let x = 0; x < largeur; x++)
            for (let k = 0; k < 4; k++)
                sortie[(y * largeur + x) * 4 + k] = k < canaux ? (courante[x * canaux + k] ?? 0) : 255;
        precedente = courante;
    }
    return sortie;
}

/** Teinte moyenne (circulaire, en degrés) des pixels opaques colorés : sans contour sombre ni reflet blanc. */
function teinteMoyenne(rgba: Uint8Array, zone = (_teinte: number) => true): { teinte: number; saturation: number } {
    let [x, y, saturation, n] = [0, 0, 0, 0];
    for (let i = 0; i < rgba.length; i += 4) {
        if ((rgba[i + 3] ?? 0) < 128) continue;
        const [r, g, b] = [rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0].map((v) => v / 255) as [
            number,
            number,
            number,
        ];
        const [max, min] = [Math.max(r, g, b), Math.min(r, g, b)];
        const l = (max + min) / 2;
        const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
        if (l < 0.25 || l > 0.9 || s < 0.25) continue;
        const d = max - min;
        const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        if (!zone(h * 60)) continue;
        x += Math.cos((h * Math.PI) / 3);
        y += Math.sin((h * Math.PI) / 3);
        saturation += s;
        n++;
    }
    return { teinte: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360, saturation: saturation / n };
}

// [E304] [E422] Décision de l'auteur de la spec : tout le magenta du jeu est le rose de la spec (#F472B6, teinte
// 329°), et non plus le framboise (#B71939, teinte 348°). Le segment carré, déjà conforme, sert de témoin : la
// tolérance (6° de teinte) le laisse passer et refuse le framboise.
it('[E304] [E422] la cellule, le cristal et le cristal brisé magenta portent le rose de la spec, comme le segment', () => {
    const cible = teinteMoyenne(new Uint8Array([0xf4, 0x72, 0xb6, 255])).teinte;
    for (const id of [
        'segment-rouge-plateau-apercu',
        'cellule-magenta',
        'cristal-magenta',
        'cristal-brise-magenta',
    ]) {
        const { teinte, saturation } = teinteMoyenne(pixels(`packages/assets/sprites/sprite-${id}.png`));
        const ecart = Math.abs(((teinte - cible + 540) % 360) - 180);
        expect(ecart, `${id} : teinte ${teinte.toFixed(1)}° pour ${cible.toFixed(1)}°`).toBeLessThanOrEqual(
            6,
        );
        expect(saturation, id).toBeGreaterThanOrEqual(0.6);
    }
    // Les sources qui dessinent ces mêmes objets (paires, animations, tutoriels) n'ont plus la rampe framboise.
    const framboise = readdirSync('packages/assets/source/svg').filter((f) =>
        /#(B71939|FF806D)\b/iu.test(readFileSync(`packages/assets/source/svg/${f}`, 'utf8')),
    );
    expect(framboise).toEqual([]);
});

// [E304] [E422] Même décision pour les redessins qui portent ces objets : leur zone magenta (teintes de 290° à 20°,
// où tombent le rose comme le framboise ; le cyan et l'ambre en sont loin) est à 6° au plus de #F472B6.
it('[E304] [E422] la zone magenta des paires, animations, cascade, transformation et tutoriels porte le rose de la spec', () => {
    const cible = teinteMoyenne(new Uint8Array([0xf4, 0x72, 0xb6, 255])).teinte;
    const magenta = (teinte: number) => teinte >= 290 || teinte <= 20;
    for (const id of DERIVES_MAGENTA) {
        const { teinte } = teinteMoyenne(pixels(`packages/assets/sprites/sprite-${id}.png`), magenta);
        const ecart = Math.abs(((teinte - cible + 540) % 360) - 180);
        expect(ecart, `${id} : teinte ${teinte.toFixed(1)}° pour ${cible.toFixed(1)}°`).toBeLessThanOrEqual(6);
    }
});
