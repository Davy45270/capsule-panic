// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { Assets, Graphics, Sprite, Texture } from 'pixi.js';
import type { Container } from 'pixi.js';
import { createGame, getLandingProjection, step } from '@capsule-panic/engine';
import type { BoardEvent, GameState, Position } from '@capsule-panic/contracts';
import expectTrail from '../../assets/sprites/sprite-trainee-deplacement-apercu.png';
import expectRotation from '../../assets/sprites/sprite-fleche-rotation-jeu.png';
import expectLock from '../../assets/sprites/sprite-trainee-verrouillage-jeu.png';
import { createBoardView } from '../src/board-view';
import { pieceArtwork, textureFor } from '../src/pieces';
import { animationDuration, cellPoints, TOKENS } from '../src/art';
import { boardFrom, stateWith } from '../../engine/test/helpers';
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
        expect(fixture.sprites(pieceArtwork['segment-cyan'])).toHaveLength(1);
        expect(fixture.sprites(pieceArtwork['segment-magenta'])).toHaveLength(1);

        fixture.view.setOptions({ colorBlind: true, highContrast: false, reducedMotion: false });
        const { cell, originX, originY } = boardLayout(390, 600);
        expect(fixture.sprites(pieceArtwork['cellule-cyan']).map(({ x, y }) => [x, y])).toEqual([
            [originX + 3 * cell, originY + cell],
        ]);
        expect(fixture.sprites(pieceArtwork['cellule-magenta']).map(({ x, y }) => [x, y])).toEqual([
            [originX + 3 * cell, originY],
        ]);
        expect(fixture.sprites(pieceArtwork['segment-cyan'])).toHaveLength(0);
        expect(fixture.sprites(pieceArtwork['segment-magenta'])).toHaveLength(0);
    } finally {
        fixture.view.destroy();
    }
});

function advance(deltaMS: number): void {
    for (const frame of [...display.frames]) frame({ deltaMS });
}

it.each([
    { command: 'MOVE_LEFT', art: expectTrail, axis: 'x' },
    { command: 'ROTATE_CW', art: expectRotation, axis: 'y' },
] as const)(
    '[E438] anime $command à chaque image et respecte le mouvement réduit',
    async ({ command, art, axis }) => {
        const fixture = await createView();
        try {
            const before = {
                ...createGame({ seed: 'animation', level: 0, speed: 'low' }),
                active: { id: 'c1', colors: ['cyan', 'magenta'], x: 3, y: 1, orientation: 0 },
            } satisfies GameState;
            const after = step(before, { type: command }).state;
            const render: (state: GameState, ghost: readonly Position[], before?: GameState) => void =
                fixture.view.render.bind(fixture.view);
            const position = () => fixture.sprites(pieceArtwork['segment-magenta']).at(0)?.[axis] ?? NaN;
            fixture.view.render(before, []);
            const start = position();
            fixture.view.render(after, []);
            const end = position();
            expect(start).not.toBe(end);
            fixture.view.render(before, []);
            render(after, [], before);
            expect(fixture.sprites(art)).toHaveLength(1);
            advance(60);
            expect(position()).toBeGreaterThan(Math.min(start, end));
            expect(position()).toBeLessThan(Math.max(start, end));
            advance(59);
            expect(fixture.sprites(art)).toHaveLength(1);
            advance(1);
            expect(position()).toBe(end);
            expect(fixture.sprites(art)).toHaveLength(0);
            fixture.view.setOptions({ reducedMotion: true, highContrast: false });
            render(after, [], before);
            expect(position()).toBe(end);
            expect(fixture.sprites(art)).toHaveLength(0);
            expect(display.frames.size).toBe(0);
        } finally {
            fixture.view.destroy();
        }
    },
);

it('[E531] montre une descente puis le verrouillage avant de permettre l’apparition', async () => {
    const fixture = await createView();
    try {
        const before = {
            ...createGame({ seed: 'animation', level: 0, speed: 'low' }),
            active: { id: 'c1', colors: ['cyan', 'magenta'], x: 3, y: 1, orientation: 0 },
        } satisfies GameState;
        const { state: after, events } = step(before, { type: 'HARD_DROP' });
        expect(events.some(({ type }) => type === 'MATCH_REMOVED')).toBe(false);
        const { cell, originY } = boardLayout(390, 600);
        const landing = Math.max(...getLandingProjection(before).map(({ y }) => y));
        fixture.view.render(before, []);
        let finished = false;
        const played = fixture.view
            .play(events, before, () => {
                throw new Error('Alignement inattendu');
            })
            .then(() => {
                finished = true;
            });
        advance(60);
        const cyan = () => fixture.sprites(pieceArtwork['segment-cyan']).at(0)?.y ?? NaN;
        expect(cyan()).toBeGreaterThan(originY + cell);
        expect(cyan()).toBeLessThan(originY + landing * cell);
        advance(60);
        await Promise.resolve();
        expect(cyan()).toBe(originY + landing * cell);
        expect(fixture.sprites(expectLock)).toHaveLength(1);
        advance(119);
        expect(finished).toBe(false);
        advance(1);
        await played;
        expect(fixture.sprites(expectLock)).toHaveLength(0);
        expect(after.active?.id).not.toBe(before.active.id);
        expect(cyan()).toBe(originY + landing * cell);

        fixture.view.setOptions({ reducedMotion: true, highContrast: false });
        fixture.view.render(before, []);
        await fixture.view.play(events, before, () => {
            throw new Error('Alignement inattendu');
        });
        expect(cyan()).toBe(originY + cell);
        expect(display.frames.size).toBe(0);
    } finally {
        fixture.view.destroy();
    }
});

it('[E400] la texture couvre toute la largeur et toute la hauteur de chaque case', async () => {
    const fixture = await createView();
    try {
        fixture.view.render(createGame({ seed: 'grille', level: 0, speed: 'low' }), []);
        const { cell } = boardLayout(390, 600);
        const tiles = fixture.sprites(expectCase);
        expect(tiles).toHaveLength(128);
        for (const tile of tiles) {
            const bounds = tile.getBounds();
            expect(bounds.width).toBe(cell);
            expect(bounds.height).toBe(cell);
        }
    } finally {
        fixture.view.destroy();
    }
});

it('[E103] le contraste ajoute un contour clair aux cellules du réacteur', async () => {
    const fixture = await createView();
    try {
        const paint = vi.spyOn(Graphics.prototype, 'stroke');
        const state = stateWith(boardFrom(['.......A']));
        fixture.view.render(state, []);
        expect(paint).not.toHaveBeenCalled();
        fixture.view.setOptions({ highContrast: true, reducedMotion: false });
        expect(paint).toHaveBeenCalledTimes(3);
        expect(paint).toHaveBeenCalledWith({ width: 2, color: TOKENS.texte });
        const outline = display.stage?.children.find((child): child is Graphics => child instanceof Graphics);
        const { cell, originX, originY } = boardLayout(390, 600);
        const pivot = state.active;
        if (!pivot || !outline) throw new Error('Capsule et contours attendus');
        expect(outline.context.instructions.map((instruction) => instruction.action)).toEqual([
            'stroke',
            'stroke',
            'stroke',
        ]);
        expect(outline.context.instructions[1]).toMatchObject({
            data: {
                path: {
                    shapePath: {
                        shapePrimitives: [
                            {
                                shape: {
                                    points: cellPoints(
                                        originX + pivot.x * cell + 1,
                                        originY + pivot.y * cell + 1,
                                        cell - 2,
                                    ),
                                },
                            },
                        ],
                    },
                },
            },
        });
    } finally {
        fixture.view.destroy();
    }
});

it('[E207] garde l’image verrouillée pendant le retrait et laisse chaque micro-pas visible sur le réacteur', async () => {
    const fixture = await createView();
    try {
        const before = stateWith(boardFrom(['c.......', 'c.......', 'aaa.....', 'CAMAM...', 'CMAMA...']), {
            x: 3,
            y: 1,
            orientation: 1,
            colors: ['amber', 'magenta'],
        });
        const { events } = step(before, { type: 'HARD_DROP' });
        const frames = (events as BoardEvent[]).filter(({ board }) => board);
        const coordinates = ({ x, y }: { x: number; y: number }) => [x, y];
        const { cell, originX, originY } = boardLayout(390, 600);
        const visible = (frame: BoardEvent) => {
            for (const kind of ['segment', 'obstacle'] as const) {
                for (const color of ['cyan', 'amber', 'magenta'] as const) {
                    expect(
                        fixture.sprites(pieceArtwork[textureFor(kind, color, false).art]).map(coordinates),
                    ).toEqual(
                        frame.board?.flatMap((tile, index) =>
                            tile?.kind === kind && tile.color === color
                                ? [[originX + (index % 8) * cell, originY + Math.floor(index / 8) * cell]]
                                : [],
                        ),
                    );
                }
            }
        };
        const locked = frames[0];
        if (!locked) throw new Error('Verrouillage attendu');
        const gravity = frames.filter(({ type }) => type === 'GRAVITY_STEP');
        expect(gravity.length).toBeGreaterThan(1);
        const played = fixture.view.play(events, before, () => undefined);
        const matchTime = animationDuration('match', false);
        advance(matchTime - 1);
        await Promise.resolve();
        visible(locked);
        advance(1);
        await Promise.resolve();
        const gravityTime = animationDuration('gravity', false);
        for (const frame of gravity) {
            visible(frame);
            advance(gravityTime - 1);
            await Promise.resolve();
            visible(frame);
            advance(1);
            await Promise.resolve();
        }
        advance(animationDuration('combo', false));
        await played;
        const final = frames.at(-1);
        if (!final) throw new Error('Plateau final attendu');
        visible(final);
    } finally {
        fixture.view.destroy();
    }
});
