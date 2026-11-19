// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { Assets, Sprite, Texture } from 'pixi.js';
import type { Container } from 'pixi.js';
import { createGame, getLandingProjection } from '@capsule-panic/engine';
import { createBoardView } from '../src/board-view';
import { pieceArtwork } from '../src/pieces';
import { boardLayout } from '../src/layout';
import expectCase from '../../assets/sprites/sprite-case-sombre-jeu.png';

const display = vi.hoisted(() => ({
    stage: undefined as Container | undefined,
    frames: new Set<(ticker: { deltaMS: number }) => void>(),
}));

vi.mock('pixi.js', async (original) => {
    const pixi = await original<typeof import('pixi.js')>();
    return {
        ...pixi,
        Application: class {
            canvas = document.createElement('canvas');
            screen = { width: 390, height: 600 };
            renderer = { on: vi.fn(), off: vi.fn() };
            stage = new pixi.Container();
            ticker = {
                add: (frame: (ticker: { deltaMS: number }) => void) => display.frames.add(frame),
                remove: (frame: (ticker: { deltaMS: number }) => void) => display.frames.delete(frame),
            };
            init() {
                display.stage = this.stage;
                return Promise.resolve();
            }
            destroy() {
                this.stage.destroy({ children: true });
            }
        },
    };
});

afterEach(() => {
    vi.restoreAllMocks();
});

async function createView(colorBlind = false) {
    const textures = new Map<Sprite, unknown>();
    vi.spyOn(Assets, 'load').mockResolvedValue({});
    vi.spyOn(Sprite, 'from').mockImplementation((asset) => {
        const sprite = new Sprite(Texture.EMPTY);
        textures.set(sprite, asset);
        return sprite;
    });
    const view = await createBoardView(document.createElement('div'), {
        reducedMotion: false,
        highContrast: false,
        colorBlind,
    });
    function sprites(asset: unknown): Sprite[] {
        const children = display.stage?.children.flatMap((layer) => [layer, ...layer.children]) ?? [];
        return children.filter(
            (child): child is Sprite => child instanceof Sprite && textures.get(child) === asset,
        );
    }
    return { view, sprites };
}

it('[E400] [E425] dessine la découpe sombre à chaque emplacement de la grille', async () => {
    const fixture = await createView();
    try {
        fixture.view.render(createGame({ seed: 'grille', level: 0, speed: 'low' }), []);
        const cells = fixture.sprites(expectCase);
        const { cell, originX, originY } = boardLayout(390, 600);
        expect(
            cells.map((sprite) => {
                const point = sprite.toGlobal({ x: 0, y: 0 });
                return [point.x, point.y];
            }),
        ).toEqual(
            Array.from({ length: 128 }, (_, index) => [
                originX + (index % 8) * cell,
                originY + Math.floor(index / 8) * cell,
            ]),
        );
    } finally {
        fixture.view.destroy();
    }
});

it('[E100] rend les deux segments fantômes à leur emplacement de chute', async () => {
    const fixture = await createView();
    try {
        const state = createGame({ seed: 'grille', level: 0, speed: 'low' });
        const ghost = getLandingProjection(state);
        expect(ghost).toHaveLength(2);
        fixture.view.render(state, ghost);
        const { cell, originX, originY } = boardLayout(390, 600);
        expect(fixture.sprites(pieceArtwork['cellule-fantome']).map(({ x, y }) => [x, y])).toEqual(
            ghost.map(({ x, y }) => [originX + x * cell, originY + y * cell]),
        );
    } finally {
        fixture.view.destroy();
    }
});

it('[E263] dessine les textures à motif renforcé sur les deux segments actifs', async () => {
    const fixture = await createView();
    try {
        const state = createGame({ seed: 'grille', level: 0, speed: 'low' });
        fixture.view.render(
            { ...state, active: { id: 'c1', colors: ['cyan', 'magenta'], x: 3, y: 1, orientation: 0 } },
            [],
        );
        expect(fixture.sprites(pieceArtwork['cellule-cyan-unie'])).toHaveLength(1);
        expect(fixture.sprites(pieceArtwork['cellule-magenta-unie'])).toHaveLength(1);

        fixture.view.setOptions({ colorBlind: true, highContrast: false, reducedMotion: false });
        const { cell, originX, originY } = boardLayout(390, 600);
        expect(fixture.sprites(pieceArtwork['cellule-cyan']).map(({ x, y }) => [x, y])).toEqual([
            [originX + 3 * cell, originY + cell],
        ]);
        expect(fixture.sprites(pieceArtwork['cellule-magenta']).map(({ x, y }) => [x, y])).toEqual([
            [originX + 3 * cell, originY],
        ]);
        expect(fixture.sprites(pieceArtwork['cellule-cyan-unie'])).toHaveLength(0);
        expect(fixture.sprites(pieceArtwork['cellule-magenta-unie'])).toHaveLength(0);
    } finally {
        fixture.view.destroy();
    }
});
