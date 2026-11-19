// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { dimensions } from '../scripts/assets.js';
import inventaire from '../packages/assets/source/inventaire.json';

// Fichiers du dépôt : `git ls-files` dans un clone, sinon (archive du commit, sans .git, comme dans les contrôles
// de qualité) l'arbre entier hors dépendances et sorties de construction. Le contrôle reste le même.
const IGNORES = new Set(['node_modules', '.git', 'dist', 'coverage', 'test-results', 'playwright-report']);
function fichiersDuDepot(sous = '.'): string[] {
    const git = spawnSync('git', ['ls-files', '-z', '--', sous], { encoding: 'utf8' });
    if (git.status === 0) return git.stdout.split('\0').filter(Boolean);
    const vus: string[] = [];
    const parcourir = (dir: string): void => {
        for (const entree of readdirSync(dir, { withFileTypes: true })) {
            if (IGNORES.has(entree.name)) continue;
            const chemin = dir === '.' ? entree.name : join(dir, entree.name);
            if (entree.isDirectory()) parcourir(chemin);
            else vus.push(chemin);
        }
    };
    parcourir(sous);
    return vus;
}

const dossier = 'packages/assets';
const atlas = join(dossier, 'atlas');
const lire = (nom: string) => readFileSync(join(dossier, nom));

interface Cadre { x: number; y: number; w: number; h: number }

function alphaCoin(png: Buffer): number {
    const blocs: Buffer[] = [];
    let palette: Buffer | undefined;
    for (let i = 8; i < png.length;) {
        const longueur = png.readUInt32BE(i);
        const type = png.toString('ascii', i + 4, i + 8);
        const data = png.subarray(i + 8, i + 8 + longueur);
        if (type === 'IDAT') blocs.push(data);
        if (type === 'tRNS') palette = data;
        i += 12 + longueur;
    }
    const pixels = inflateSync(Buffer.concat(blocs));
    const premier = pixels.readUInt8(1);
    switch (png.readUInt8(25)) {
        case 3: return palette?.[premier >>> (8 - png.readUInt8(24))] ?? 255;
        case 4: return pixels.readUInt8(2);
        case 6: return pixels.readUInt8(4);
        default: return 255;
    }
}

const fichiers = readdirSync(atlas).filter(nom => nom.endsWith('.json'));
const mappings = fichiers.map(nom => {
    const { frames, meta } = JSON.parse(lire(join('atlas', nom)).toString()) as {
        frames: Record<string, { frame: Cadre }>;
        meta: { image: string; scale: string; size: { w: number; h: number } };
    };
    return { nom, frames, meta };
});

for (const [exigence, ids] of Object.entries(inventaire)) {
    it(`[${exigence}] les sprites identifiés figurent aux deux échelles`, () => {
        for (const id of ids) {
            for (const echelle of [2, 3]) {
                expect(mappings.filter(({ nom, frames }) =>
                    nom.endsWith(`@${echelle}x.json`) && Object.hasOwn(frames, `sprite-${id}`)
                )).toHaveLength(1);
            }
        }
    });
}

it('[E299] [E300] [E311] dimensions, marges et correspondance des atlas', () => {
    expect(mappings.length).toBeGreaterThan(0);
    for (const { frames, meta } of mappings) {
        const png = lire(join('atlas', meta.image));
        const [w, h] = dimensions(png, '.png');
        expect(meta.size).toEqual({ w, h });
        expect(meta.image).toMatch(/@[23]x\.png$/u);
        expect(meta.scale).toBe(meta.image.slice(-6, -5));
        expect(Math.max(w, h)).toBeLessThanOrEqual(2048);
        expect(alphaCoin(png)).toBe(0);
        const webp = join('atlas', meta.image.replace(/\.png$/, '.webp'));
        if (existsSync(join(dossier, webp))) {
            const image = lire(webp);
            expect(image.length).toBeLessThan(png.length);
            expect(dimensions(image, '.webp')).toEqual([w, h]);
        }
        const cadres = Object.values(frames).map(({ frame }) => frame);
        for (const [index, a] of cadres.entries()) {
            expect(Math.min(a.x, a.y, w - a.x - a.w, h - a.y - a.h)).toBeGreaterThanOrEqual(2);
            for (const b of cadres.slice(index + 1)) {
                expect(Math.max(b.x - a.x - a.w, a.x - b.x - b.w, b.y - a.y - a.h, a.y - b.y - b.h))
                    .toBeGreaterThanOrEqual(2);
            }
        }
    }
});

it('[E301] chaque atlas est décliné et la cellule cyan mesure 64 puis 96 pixels', () => {
    for (const { nom, frames } of mappings.filter(item => item.nom.endsWith('@2x.json'))) {
        const grand = mappings.find(item => item.nom === nom.replace('@2x.json', '@3x.json'));
        expect(Object.keys(grand?.frames ?? {})).toEqual(Object.keys(frames));
    }
    for (const echelle of [2, 3]) {
        const pieces = mappings.find(item => item.nom === `pieces-origine@${echelle}x.json`);
        expect(pieces?.frames['sprite-cellule-cyan']?.frame).toMatchObject({ w: 32 * echelle, h: 32 * echelle });
    }
});

it('[E009] [E018] [E310] provenance, sources et licence couvrent chaque cadre', () => {
    const { assets } = JSON.parse(lire('provenance.json').toString()) as {
        assets: {
            id: string;
            origine: string;
            planche: string;
            planche_sha256: string;
            transformations: string[];
            etapes?: string[];
            boite?: number[];
            element_remplace?: string;
            svg?: string;
            masque?: string;
        }[];
    };
    const licences = JSON.parse(lire('licences.json').toString()) as {
        assets: string[]; titulaire: string; licence: string;
    };
    const ids = [...new Set(mappings.flatMap(({ frames }) => Object.keys(frames)))].sort();
    expect(assets.map(item => item.id).sort()).toEqual(ids);
    expect(licences).toEqual({ titulaire: 'David Sevin', licence: 'CC BY 4.0', assets: ids });
    for (const fiche of assets) {
        const sprite = lire(join('sprites', `${fiche.id}.png`));
        expect(dimensions(sprite, '.png')[0]).toBeGreaterThan(0);
        expect(alphaCoin(sprite), fiche.id).toBe(0);
        expect(fiche.planche).toMatch(/\.png$/u);
        expect(fiche.planche_sha256).toMatch(/^[a-f0-9]{64}$/u);
        // Un dérivé porte ses transformations de pixels ; la chaîne d'outils est dans `etapes`.
        expect(fiche.origine === 'dérivé' ? fiche.etapes : fiche.transformations).toContain('atlas json-hash');
        if (fiche.origine === 'redessiné (marque)') {
            expect(fiche.element_remplace).toMatch(/^\d+x\d+\+\d+\+\d+$/u);
            expect(readFileSync(fiche.svg ?? '', 'utf8')).toContain('<svg');
        } else {
            expect(['planche', 'dérivé']).toContain(fiche.origine);
            expect(fiche.boite).toHaveLength(4);
            expect(fiche.boite?.every(v => Number.isInteger(v) && v >= 0)).toBe(true);
        }
        if (fiche.masque) expect(readFileSync(fiche.masque, 'utf8')).toContain('<svg');
    }
});

it('[E331] [E332] [E526] [E527] [E534] les personnages proviennent de découpes retouchées', () => {
    const { assets } = JSON.parse(lire('provenance.json').toString()) as {
        assets: { id: string; transformation?: string; signes_retires?: string[] }[];
    };
    const ids = [...new Set(mappings.flatMap(({ frames }) => Object.keys(frames)))]
        .filter(id => /^sprite-(chercheu|responsable-)/u.test(id));
    expect(ids).toHaveLength(2);
    for (const id of ids) {
        const fiche = assets.find(item => item.id === id);
        expect(fiche?.transformation).toBe('découpe + retouche (signes médicaux retirés)');
        expect(fiche?.signes_retires?.length).toBeGreaterThan(0);
        expect(fiche?.signes_retires?.every(signe => signe.trim().length > 0)).toBe(true);
    }
});

it('[E370] [E377] [E381] [E383] [E429] [E430] [E431] [E432] les maquettes entières restent des références', () => {
    const { references_mise_en_page: references, tables } = JSON.parse(lire('chaine.json').toString()) as {
        references_mise_en_page: { planche: string; boite: number[]; ecran: string }[];
        tables: { decoupe: string }[];
    };
    expect(references).toHaveLength(8);
    expect(new Set(references.map(reference => reference.ecran)).size).toBe(8);
    for (const { decoupe } of tables) {
        const { planche, elements } = JSON.parse(readFileSync(decoupe, 'utf8')) as {
            planche: string; elements: { boite: number[] }[];
        };
        const boites = references.filter(reference => reference.planche === planche)
            .map(reference => reference.boite);
        for (const { boite } of elements) expect(boites).not.toContainEqual(boite);
    }
});

it('[E309] la planche livrée est transparente et les planches privées sont absentes du paquet', () => {
    expect(alphaCoin(lire('planche-transparente.png'))).toBe(0);
    const provenance = JSON.parse(lire('provenance.json').toString()) as {
        assets: { planche_sha256: string; planche: string }[];
    };
    const pixelsLivres = readdirSync(dossier, { recursive: true, encoding: 'utf8' })
        .map(nom => join(dossier, nom));
    const suivis = fichiersDuDepot();
    const originaux = new Map(provenance.assets.map(fiche => [fiche.planche, fiche.planche_sha256]));
    for (const nom of new Set(pixelsLivres.concat(suivis).filter(f => f.endsWith('.png') && existsSync(f)))) {
        const hash = createHash('sha256').update(readFileSync(nom)).digest('hex');
        for (const [planche, empreinte] of originaux) {
            expect(nom.endsWith(planche)).toBe(false);
            expect(hash).not.toBe(empreinte);
        }
    }
});

// Chemin absolu en tête de valeur : /home/…, /Users/…, /tmp/…, ou C:\…. Les binaires ne sont fouillés que
// pour /home/, Users et tmp : la forme Windows, trop courte, s'y trouverait par hasard dans les données compressées.
const CHEMIN_UNIX = /(?:^|[\s"'(=,:[])\/(?:home|Users|root|tmp|mnt|media|srv|opt|var|run)\//u;
const CHEMIN_WINDOWS = /(?:^|[\s"'(=,:[])[A-Za-z]:\\/u;
const TEXTE = /\.(?:json|md|svg|txt|css|js|ts)$/u;

it('aucun fichier du paquet d’assets ne contient de chemin absolu', () => {
    const suivis = fichiersDuDepot(dossier);
    const presents = readdirSync(dossier, { recursive: true, encoding: 'utf8' }).map(nom => join(dossier, nom));
    const noms = [...new Set(suivis.concat(presents))].filter(nom => existsSync(nom) && !statSync(nom).isDirectory());
    expect(noms.length).toBeGreaterThan(0);
    const fautifs = noms.filter(nom => {
        const contenu = readFileSync(nom).toString('latin1');
        if (contenu.includes('/home/') || CHEMIN_UNIX.test(contenu)) return true;
        return TEXTE.test(nom) && CHEMIN_WINDOWS.test(contenu);
    });
    expect(fautifs).toEqual([]);
});

it('chaine.json désigne chaque planche par son nom de fichier et le sha256 de la provenance', () => {
    const { tables } = JSON.parse(lire('chaine.json').toString()) as {
        tables: { planche: string; planche_sha256: string }[];
    };
    const { assets } = JSON.parse(lire('provenance.json').toString()) as {
        assets: { planche: string; planche_sha256: string }[];
    };
    const empreintes = new Map(assets.map(fiche => [fiche.planche, fiche.planche_sha256]));
    expect(tables.length).toBeGreaterThan(0);
    for (const { planche, planche_sha256: empreinte } of tables) {
        expect(planche).toMatch(/^[\w.-]+\.png$/u);
        expect(empreinte, planche).toMatch(/^[a-f0-9]{64}$/u);
        expect(empreinte, planche).toBe(empreintes.get(planche));
    }
});

it('chaque fichier de packages/assets/sprites a une entrée dans provenance.json', () => {
    const { assets } = JSON.parse(lire('provenance.json').toString()) as { assets: { id: string }[] };
    const ids = new Set(assets.map(fiche => fiche.id));
    const sprites = readdirSync(join(dossier, 'sprites'));
    expect(sprites.length).toBeGreaterThan(0);
    expect(sprites.filter(nom => !ids.has(nom.replace(/\.png$/u, '')))).toEqual([]);
});

it('la commande échoue sur les budgets par image, par côté et au total', () => {
    const temporaire = mkdtempSync(join(tmpdir(), 'budget-capsule-'));
    const nom = 'planche-transparente.png';
    try {
        mkdirSync(join(temporaire, 'packages', 'assets'), { recursive: true });
        mkdirSync(join(temporaire, 'scripts'));
        copyFileSync(join(dossier, nom), join(temporaire, 'packages', 'assets', nom));
        copyFileSync('scripts/assets.js', join(temporaire, 'scripts', 'assets.js'));
        writeFileSync(join(temporaire, 'package.json'), '{"type":"module"}');
        writeFileSync(join(temporaire, 'assets-budget.json'), '{"maxImage":1,"maxSide":1,"maxTotal":1}');

        const resultat = spawnSync(process.execPath, ['scripts/assets.js', 'check'], {
            cwd: temporaire, encoding: 'utf8',
        });
        expect(resultat.status).toBe(1);
        expect(resultat.stderr.trim().split('\n')).toEqual([
            `${nom} dépasse le budget par image`, `${nom} dépasse le budget par côté`,
            'Le poids total dépasse le budget',
        ]);
    } finally {
        rmSync(temporaire, { recursive: true, force: true });
    }
});
