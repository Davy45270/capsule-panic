import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COLORS } from '@capsule-panic/contracts';
import {
    animationDuration,
    capsuleSvg,
    cellSvg,
    crystalSvg,
    SHAPE_OF,
    shapePoints,
    TOKENS,
} from '../src/art';
import { boardLayout } from '../src/layout';
import { pieceArtwork, textureFor } from '../src/pieces';

const hexes = (svg: string): string[] => [...svg.matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => m[0].toLowerCase());
const allowed = new Set(Object.values(TOKENS).map((v) => v.toLowerCase()));

describe('original art', () => {
    it('each colour has its own crystal shape: hexagon cyan, triangle amber, diamond magenta', () => {
        expect(SHAPE_OF).toEqual({ cyan: 'hexagon', amber: 'triangle', magenta: 'diamond' });
        expect(COLORS.map((c) => shapePoints(SHAPE_OF[c], 0, 0, 1).length / 2)).toEqual([6, 3, 4]);
    });
    it('T29 colour-blind check: crystals and cells differ by shape, not only by colour', () => {
        const strip = (svg: string): string => svg.replace(/#[0-9a-f]{6}/gi, '#');
        expect(new Set(COLORS.map((c) => strip(crystalSvg(c)))).size).toBe(3);
        expect(new Set(COLORS.map((c) => strip(cellSvg(c)))).size).toBe(3);
    });
    it('a capsule preview draws two cells joined by a bridge', () => {
        const svg = capsuleSvg(['cyan', 'magenta']);
        expect(svg).toContain('data-part="bridge"');
        expect(svg.match(/data-part="cell"/g)).toHaveLength(2);
    });
    it('art uses only the spec tokens', () => {
        for (const c of COLORS)
            for (const svg of [crystalSvg(c), cellSvg(c), crystalSvg(c, 32, true), capsuleSvg([c, c])]) {
                for (const hex of hexes(svg)) expect(allowed).toContain(hex);
            }
        expect(TOKENS).toEqual({
            fond: '#111827',
            panneau: '#1F2937',
            cyan: '#38BDF8',
            amber: '#FBBF24',
            magenta: '#F472B6',
            texte: '#F9FAFB',
        });
    });
    it('animations last 120 to 350 ms and are skipped under reduced motion', () => {
        for (const kind of ['lock', 'match', 'gravity', 'combo'] as const) {
            expect(animationDuration(kind, false)).toBeGreaterThanOrEqual(120);
            expect(animationDuration(kind, false)).toBeLessThanOrEqual(350);
            expect(animationDuration(kind, true)).toBe(0);
        }
    });
});

describe('layout', () => {
    it('fits the 8x16 reactor in the space, keeping square cells and a 16 px gutter', () => {
        const l = boardLayout(390, 600);
        expect(l.cell).toBe(Math.floor((600 - 32) / 16));
        expect(l.originX * 2 + l.cell * 8).toBeCloseTo(390, 0);
        expect(boardLayout(1280, 900).cell).toBe(Math.floor((900 - 32) / 16));
        expect(boardLayout(200, 900).cell).toBe(Math.floor((200 - 32) / 8));
    });
});

describe('purity of the engine', () => {
    it('no file of the engine or the contracts imports pixi.js or react', () => {
        for (const dir of ['packages/engine/src', 'packages/contracts/src']) {
            for (const f of readdirSync(dir))
                expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(/from ['"](pixi\.js|react)/);
        }
    });
});

// [E422] Décision de l'auteur de la spec : par défaut, les segments sont les segments unis carrés de la planche
// Gameplay 03 (ancre 200x55+938+49), recolorés aux jetons A2 ; la forme ne distingue les couleurs qu'en mode
// daltonien (PRD « options de contraste et formes additionnelles », T29), dont les textures ne changent pas.
it('[E422] les segments par défaut sont les segments carrés recolorés de Gameplay 03, le mode daltonien est inchangé', () => {
    const provenance = (
        JSON.parse(readFileSync('packages/assets/provenance.json', 'utf8')) as {
            assets: { id: string; planche: string; boite: number[]; transformations?: string[] }[];
        }
    ).assets;
    const attendu = {
        cyan: {
            art: 'segment-cyan',
            sprite: 'sprite-segment-bleu-plateau-apercu',
            jeton: '#38BDF8',
            forme: 'hexagone',
        },
        amber: {
            art: 'segment-ambre',
            sprite: 'sprite-segment-jaune-plateau-apercu',
            jeton: '#FBBF24',
            forme: 'triangle',
        },
        magenta: {
            art: 'segment-magenta',
            sprite: 'sprite-segment-rouge-plateau-apercu',
            jeton: '#F472B6',
            forme: 'losange',
        },
    } as const;
    const shade = { cyan: 'cyan', amber: 'ambre', magenta: 'magenta' } as const;
    for (const color of COLORS) {
        const { art, sprite, jeton, forme } = attendu[color];
        expect(textureFor('segment', color, false)).toEqual({ art, form: 'aucune' });
        expect(pieceArtwork[textureFor('segment', color, false).art]).toContain(`/sprites/${sprite}.png`);
        // Provenance : découpe de Gameplay 03 centrée dans l'ancre 200x55+938+49 (la boîte de l'ambre déborde
        // de 2 px à droite), recolorée au jeton de la spec.
        const origine = provenance.find((item) => item.id === sprite);
        expect(origine?.planche).toBe('Capsule_Panic_Assets_Gameplay_03.png');
        const [w = 0, h = 0, x = 0, y = 0] = origine?.boite ?? [];
        expect(x + w / 2).toBeGreaterThan(938);
        expect(x + w / 2).toBeLessThan(938 + 200);
        expect(y + h / 2).toBeGreaterThan(49);
        expect(y + h / 2).toBeLessThan(49 + 55);
        expect(origine?.transformations?.join(' ')).toContain(`→${jeton}`);
        // Mode daltonien inchangé : cellule à motif de la couleur.
        expect(textureFor('segment', color, true)).toEqual({ art: `cellule-${shade[color]}`, form: forme });
    }
    const polygons = (name: string) =>
        [
            ...readFileSync(`packages/assets/source/svg/${name}.svg`, 'utf8').matchAll(
                /<polygon points="([^"]+)"/g,
            ),
        ].map((m) => m[1]?.split(' ').length);
    expect(['cyan', 'ambre', 'magenta'].map((s) => polygons(`cellule-${s}`)[1])).toEqual([6, 3, 4]);
});
