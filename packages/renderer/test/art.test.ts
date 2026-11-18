import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COLORS } from '@capsule-panic/contracts';
import { animationDuration, capsuleSvg, cellSvg, crystalSvg, SHAPE_OF, shapePoints, TOKENS } from '../src/art';
import { boardLayout } from '../src/layout';

const hexes = (svg: string): string[] => [...svg.matchAll(/#[0-9a-f]{6}\b/gi)].map(m => m[0].toLowerCase());
const allowed = new Set(Object.values(TOKENS).map(v => v.toLowerCase()));

describe('original art', () => {
    it('each colour has its own crystal shape: hexagon cyan, triangle amber, diamond magenta', () => {
        expect(SHAPE_OF).toEqual({ cyan: 'hexagon', amber: 'triangle', magenta: 'diamond' });
        expect(COLORS.map(c => shapePoints(SHAPE_OF[c], 0, 0, 1).length / 2)).toEqual([6, 3, 4]);
    });
    it('T29 colour-blind check: crystals and cells differ by shape, not only by colour', () => {
        const strip = (svg: string): string => svg.replace(/#[0-9a-f]{6}/gi, '#');
        expect(new Set(COLORS.map(c => strip(crystalSvg(c)))).size).toBe(3);
        expect(new Set(COLORS.map(c => strip(cellSvg(c)))).size).toBe(3);
    });
    it('a capsule preview draws two cells joined by a bridge', () => {
        const svg = capsuleSvg(['cyan', 'magenta']);
        expect(svg).toContain('data-part="bridge"');
        expect(svg.match(/data-part="cell"/g)).toHaveLength(2);
    });
    it('art uses only the spec tokens', () => {
        for (const c of COLORS) for (const svg of [crystalSvg(c), cellSvg(c), crystalSvg(c, 32, true), capsuleSvg([c, c])]) {
            for (const hex of hexes(svg)) expect(allowed).toContain(hex);
        }
        expect(TOKENS).toEqual({ fond: '#111827', panneau: '#1F2937', cyan: '#38BDF8', amber: '#FBBF24', magenta: '#F472B6', texte: '#F9FAFB' });
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
            for (const f of readdirSync(dir)) expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(/from ['"](pixi\.js|react)/);
        }
    });
});
