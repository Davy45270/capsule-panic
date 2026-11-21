// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { Assets, CanvasSource, Graphics, Sprite, Texture } from 'pixi.js';
import type { Container } from 'pixi.js';
import { createGame, getLandingProjection, step } from '@capsule-panic/engine';
import type { BoardEvent, GameState, Position } from '@capsule-panic/contracts';
import expectTrail from '../../assets/sprites/sprite-trainee-deplacement-apercu.png';
import expectRotation from '../../assets/sprites/sprite-fleche-rotation-jeu.png';
import expectLock from '../../assets/sprites/sprite-trainee-verrouillage-jeu.png';
import { createBoardView } from '../src/board-view';
import * as lockFlash from '../src/lock-flash';
import { pieceArtwork, textureFor } from '../src/pieces';
import { animationDuration, cellPoints, TOKENS } from '../src/art';
import { boardFrom, stateWith } from '../../engine/test/helpers';
import { boardLayout } from '../src/layout';
import expectCase from '../../assets/sprites/sprite-case-sombre-jeu.png';

// Les exports sont absents du moteur de rendu avant le correctif.
const { blanchirSilhouette, silhouetteSource } = lockFlash as unknown as {
    blanchirSilhouette?: (pixels: ImageData) => ImageData;
    silhouetteSource?: (texture: Texture) => Texture | undefined;
};

const display = vi.hoisted(() => ({
    stage: undefined as Container | undefined,
    rendererName: 'webgl',
    screen: { width: 390, height: 600 },
    frames: new Set<(ticker: { deltaMS: number }) => void>(),
}));

vi.mock('pixi.js', async (original) => {
    const pixi = await original<typeof import('pixi.js')>();
    return {
        ...pixi,
        Application: class {
            canvas = document.createElement('canvas');
            screen = display.screen;
            renderer = { name: display.rendererName, on: vi.fn(), off: vi.fn() };
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
    display.rendererName = 'webgl';
    display.screen = { width: 390, height: 600 };
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

// Oracles des animations visibles. Une planche de captures en jeu (horloge figée) a montré deux défauts :
// l'éclat de verrouillage n'était qu'un assombrissement d'un seul segment, et la traînée de chute restait
// à la case de départ pendant que la capsule tombait. Ces tests ne nomment pas l'image de l'éclat : ils
// cherchent, dans l'ordre de dessin réel de la scène, ce qui éclaircit les segments posés.

const LIGHTENING = new Set(['add', 'screen', 'lighten', 'color-dodge']);

/** Sprites de la scène dans l'ordre où Pixi les dessine (parcours en profondeur). */
function drawOrder(): Sprite[] {
    const out: Sprite[] = [];
    const walk = (node: Container): void => {
        if (node instanceof Sprite) out.push(node);
        for (const child of node.children) walk(child);
    };
    if (display.stage) walk(display.stage);
    return out;
}

/** Opacité réellement appliquée : celle du sprite multipliée par celle de ses calques. */
function effectiveAlpha(node: Container): number {
    let alpha = 1;
    for (let current: Container | null = node; current; current = current.parent) alpha *= current.alpha;
    return alpha;
}

/** Fait tourner l'horloge du rendu jusqu'à la fin de la lecture (descente, puis verrouillage). */
async function finish(played: Promise<void>): Promise<void> {
    const state = { done: false };
    void played.then(() => {
        state.done = true;
    });
    for (let i = 0; i < 100 && !state.done; i++) {
        advance(10);
        await Promise.resolve();
    }
    await played;
}

function dropFixture() {
    const before = {
        ...createGame({ seed: 'animation', level: 0, speed: 'low' }),
        active: { id: 'c1', colors: ['cyan', 'magenta'], x: 3, y: 1, orientation: 0 },
    } satisfies GameState;
    const { events } = step(before, { type: 'HARD_DROP' });
    expect(events.some(({ type }) => type === 'MATCH_REMOVED')).toBe(false);
    const landing = Math.max(...getLandingProjection(before).map(({ y }) => y));
    return { before, events, landing };
}

it('[E531] la traînée de chute suit la capsule pendant la descente', async () => {
    const fixture = await createView();
    try {
        const { before, events, landing } = dropFixture();
        const { cell, originY } = boardLayout(390, 600);
        expect(landing - before.active.y).toBeGreaterThanOrEqual(4);
        fixture.view.render(before, []);
        const played = fixture.view.play(events, before, () => undefined);
        const trail = () => {
            const sprites = fixture.sprites(pieceArtwork['trainee-chute-jeu']);
            expect(sprites).toHaveLength(1);
            const [sprite] = sprites;
            if (!sprite) throw new Error('Traînée de chute attendue');
            return { bounds: sprite.getBounds(), alpha: effectiveAlpha(sprite) };
        };
        // Haut de la capsule : segment magenta, au-dessus du cyan (orientation 0).
        const capsuleTop = () => fixture.sprites(pieceArtwork['segment-magenta']).at(0)?.y ?? NaN;

        advance(30);
        const early = trail();
        const earlyTop = capsuleTop();
        advance(30);
        const middle = trail();
        const middleTop = capsuleTop();
        // La capsule est bien loin de sa case de départ à mi-chute.
        expect(middleTop - (originY + (before.active.y - 1) * cell)).toBeGreaterThanOrEqual(1.5 * cell);
        // La traînée descend avec la capsule (au moins la moitié de son trajet entre les deux images)…
        expect(middleTop - earlyTop).toBeGreaterThanOrEqual(cell);
        expect(middle.bounds.minY - early.bounds.minY).toBeGreaterThanOrEqual(0.5 * (middleTop - earlyTop));
        // … reste accrochée derrière elle (au plus deux cases au-dessus, sans s'en détacher) …
        expect(middle.bounds.maxY).toBeGreaterThanOrEqual(middleTop - 0.25 * cell);
        expect(middle.bounds.minY).toBeGreaterThanOrEqual(middleTop - 2 * cell);
        // … et se voit encore à mi-chute.
        expect(middle.alpha).toBeGreaterThan(0.2);
        await finish(played);
    } finally {
        fixture.view.destroy();
    }
});

it('[E438] [E531] le verrouillage fait un éclat clair au-dessus des deux segments posés', async () => {
    const fixture = await createView();
    try {
        const { before, events, landing } = dropFixture();
        const { cell, originX, originY } = boardLayout(390, 600);
        fixture.view.render(before, []);
        const played = fixture.view.play(events, before, () => undefined);
        advance(60);
        advance(60);
        await Promise.resolve();
        // Les deux segments posés, verticaux en colonne 3 : magenta au-dessus du cyan.
        const segments = [
            ...fixture.sprites(pieceArtwork['segment-cyan']),
            ...fixture.sprites(pieceArtwork['segment-magenta']),
        ];
        expect(segments.map(({ x, y }) => [x, y]).sort()).toEqual(
            [
                [originX + 3 * cell, originY + landing * cell],
                [originX + 3 * cell, originY + (landing - 1) * cell],
            ].sort(),
        );

        // Les deux cases posées, en pixels.
        const cells = [landing, landing - 1].map((row) => ({ x: originX + 3 * cell, y: originY + row * cell }));
        const covers = (flash: Sprite, { x, y }: { x: number; y: number }) => {
            const b = flash.getBounds();
            return b.minX <= x + 1 && b.minY <= y + 1 && b.maxX >= x + cell - 1 && b.maxY >= y + cell - 1;
        };
        let brightest = 0;
        let coversBoth = false;
        const lock = animationDuration('lock', false);
        for (let t = 0; t < lock; t += 10) {
            const order = drawOrder();
            const lit = order.filter((sprite) => LIGHTENING.has(sprite.blendMode) && effectiveAlpha(sprite) > 0);
            if (t === 0) {
                // Éclat dessiné APRÈS les segments posés, donc au-dessus d'eux.
                expect(lit.length).toBeGreaterThan(0);
                const last = Math.max(...segments.map((segment) => order.indexOf(segment)));
                for (const flash of lit) expect(order.indexOf(flash)).toBeGreaterThan(last);
            }
            const alpha = Math.max(0, ...lit.map(effectiveAlpha));
            if (alpha > brightest) {
                brightest = alpha;
                coversBoth = cells.every((c) => lit.some((flash) => covers(flash, c)));
            }
            advance(10);
            await Promise.resolve();
        }
        // Un éclat franc : une opacité forte à son maximum, avec un mode de fusion qui éclaircit…
        expect(brightest).toBeGreaterThanOrEqual(0.6);
        // … qui couvre, à ce maximum, les deux cases posées.
        expect(coversBoth).toBe(true);
        await finish(played);
        expect(drawOrder().filter((sprite) => LIGHTENING.has(sprite.blendMode))).toHaveLength(0);
    } finally {
        fixture.view.destroy();
    }
});

it('[E438] [E531] en mouvement réduit, ni traînée de chute ni éclat de verrouillage', async () => {
    const fixture = await createView();
    try {
        const { before, events } = dropFixture();
        fixture.view.setOptions({ reducedMotion: true, highContrast: false });
        fixture.view.render(before, []);
        await fixture.view.play(events, before, () => undefined);
        expect(fixture.sprites(pieceArtwork['trainee-chute-jeu'])).toHaveLength(0);
        expect(drawOrder().filter((sprite) => LIGHTENING.has(sprite.blendMode))).toHaveLength(0);
        expect(display.frames.size).toBe(0);
    } finally {
        fixture.view.destroy();
    }
});

it('[E438] [E531] l’éclat de verrouillage suit la forme des segments', async () => {
    const fixture = await createView();
    try {
        const factory = vi.spyOn(Sprite, 'from');
        const from = factory.getMockImplementation();
        if (!from) throw new Error('Fabrique de sprites attendue');
        const arts = [pieceArtwork['segment-cyan'], pieceArtwork['segment-magenta']];
        const textures = new Map(arts.map((art) => [art, new Texture({ source: Texture.EMPTY.source })]));
        factory.mockImplementation((asset) => {
            const sprite = from(asset);
            const texture = typeof asset === 'string' ? textures.get(asset) : undefined;
            if (texture) sprite.texture = texture;
            return sprite;
        });

        const { before, events } = dropFixture();
        fixture.view.render(before, []);
        const played = fixture.view.play(events, before, () => undefined);
        advance(animationDuration('gravity', false));
        await Promise.resolve();
        const flashes = drawOrder().filter((sprite) => LIGHTENING.has(sprite.blendMode));
        expect(flashes.some((sprite) => sprite.texture === Texture.WHITE)).toBe(false);
        const segments = arts.flatMap((art) => fixture.sprites(art));
        expect(segments).toHaveLength(2);
        expect(flashes).toHaveLength(2);
        for (const { texture, x, y } of segments) {
            expect(
                flashes.some(
                    (flash) =>
                        (flash.texture === texture || silhouetteSource?.(flash.texture) === texture) &&
                        flash.x === x &&
                        flash.y === y,
                ),
            ).toBe(true);
        }
        await finish(played);
    } finally {
        fixture.view.destroy();
    }
});

function segmentPixels(): ImageData {
    return new ImageData(
        new Uint8ClampedArray([0, 63, 255, 255, 159, 0, 70, 127, 21, 72, 139, 1, 200, 30, 90, 0]),
        4,
        1,
    );
}

it('blanchit chaque canal RVB de la silhouette en conservant exactement son alpha', () => {
    const source = segmentPixels();
    const original = source.data.slice();
    expect(blanchirSilhouette).toBeTypeOf('function');
    if (!blanchirSilhouette) throw new Error('Dérivation de silhouette attendue');
    const derived = blanchirSilhouette(source);
    expect([derived.width, derived.height]).toEqual([source.width, source.height]);
    expect(source.data).toEqual(original);
    for (let i = 0; i < original.length; i += 1) {
        const channel = original[i]!;
        if (i % 4 === 3) {
            expect(derived.data[i]).toBe(channel);
        } else {
            expect(Math.abs(derived.data[i]! - (channel * 0.07 + 255 * 0.93))).toBeLessThanOrEqual(1);
        }
    }
    expect(derived.data[15]).toBe(0);
});

it.each(['canvas', 'webgl'])('sélectionne les textures des deux éclats en %s', async (backend) => {
    display.rendererName = backend;
    const pixels = segmentPixels();
    const drawImage = vi.fn();
    const context = { drawImage, getImageData: vi.fn(() => pixels), putImageData: vi.fn() };
    const canvasPrototype: { getContext(kind: '2d'): CanvasRenderingContext2D | null } =
        HTMLCanvasElement.prototype;
    vi.spyOn(canvasPrototype, 'getContext').mockReturnValue(
        context as unknown as CanvasRenderingContext2D,
    );
    const fixture = await createView();
    try {
        const factory = vi.spyOn(Sprite, 'from');
        const from = factory.getMockImplementation();
        if (!from) throw new Error('Fabrique de sprites attendue');
        const arts = [pieceArtwork['segment-cyan'], pieceArtwork['segment-magenta']];
        const textures = new Map(
            arts.map((art) => {
                const canvas = document.createElement('canvas');
                canvas.width = pixels.width;
                canvas.height = pixels.height;
                return [art, new Texture({ source: new CanvasSource({ resource: canvas, resolution: 1 }) })];
            }),
        );
        factory.mockImplementation((asset) => {
            const sprite = from(asset);
            const texture = typeof asset === 'string' ? textures.get(asset) : undefined;
            if (texture) sprite.texture = texture;
            return sprite;
        });
        const { before, events } = dropFixture();
        fixture.view.render(before, []);
        const played = fixture.view.play(events, before, () => undefined);
        advance(animationDuration('gravity', false));
        await Promise.resolve();
        const flashes = drawOrder().filter((sprite) => LIGHTENING.has(sprite.blendMode));
        expect(flashes).toHaveLength(2);
        for (const { texture, x, y } of arts.flatMap((art) => fixture.sprites(art))) {
            const flash = flashes.find((image) => image.x === x && image.y === y);
            expect(flash).toBeDefined();
            if (backend === 'canvas') {
                expect(flash?.texture).not.toBe(texture);
                expect(silhouetteSource?.(flash!.texture)).toBe(texture);
                expect([flash?.texture.width, flash?.texture.height]).toEqual([
                    texture.width,
                    texture.height,
                ]);
            } else {
                expect(flash?.texture).toBe(texture);
            }
        }
        expect(drawImage).toHaveBeenCalledTimes(backend === 'canvas' ? 2 : 0);
        await finish(played);
    } finally {
        fixture.view.destroy();
    }
});


it.each([
    [302, 620],
    [242, 654],
    [220, 550],
])('logement de %d × %d : les cases d’angle restent au-delà des coins du cadre', async (width, height) => {
    display.screen = { width, height };
    const { view } = await createView();
    try {
        view.render(createGame({ seed: 'angle', level: 0, speed: 'low' }), []);
        const frame = display.stage?.children[0]?.getBounds();
        const { cell, originX, originY } = boardLayout(width, height);
        expect(frame?.minX).toBeLessThanOrEqual(originX - 16);
        expect(frame?.minY).toBeLessThanOrEqual(originY - 16);
        expect(frame?.maxX).toBeGreaterThanOrEqual(originX + 8 * cell + 16);
        expect(frame?.maxY).toBeGreaterThanOrEqual(originY + 16 * cell + 16);
        expect(frame?.minX).toBeGreaterThanOrEqual(0);
        expect(frame?.minY).toBeGreaterThanOrEqual(0);
        expect(frame?.maxX).toBeLessThanOrEqual(width);
        expect(frame?.maxY).toBeLessThanOrEqual(height);
    } finally {
        view.destroy();
    }
});
