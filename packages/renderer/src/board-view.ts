// Rendu PixiJS du réacteur. Aucune règle ici : on dessine un état et on anime des événements déjà résolus.
import { Application, Assets, Container, Graphics, loadTextures, Sprite } from 'pixi.js';
import { HEIGHT, WIDTH } from '@capsule-panic/contracts';
import type { ActiveCapsule, Cell, Color, BoardEvent, GameState, Position } from '@capsule-panic/contracts';
import { animationDuration, cellPoints, TOKENS } from './art';
import { boardLayout } from './layout';
import { LockFlashSprite } from './lock-flash';
import { pieceArtwork, textureFor } from './pieces';
import type { Artwork } from './pieces';

export interface ViewOptions {
    reducedMotion: boolean;
    highContrast: boolean;
    colorBlind?: boolean;
}
export interface BoardView {
    render(state: GameState, ghost: readonly Position[], before?: GameState): void;
    play(events: readonly BoardEvent[], before: GameState, onMatch: (match: Match) => void): Promise<void>;
    setOptions(options: ViewOptions): void;
    destroy(): void;
    readonly canvas: HTMLCanvasElement;
}

export interface Match {
    cells: number[];
    chain: number;
    points: number;
}

const ORIENT: Record<ActiveCapsule['orientation'], Position> = {
    0: { x: 0, y: -1 },
    1: { x: 1, y: 0 },
    2: { x: 0, y: 1 },
    3: { x: -1, y: 0 },
};

export async function createBoardView(host: HTMLElement, initial: ViewOptions): Promise<BoardView> {
    let options = initial;
    // Les workers blob sont interdits par la CSP de l’application.
    if (loadTextures.config) loadTextures.config.preferWorkers = false;
    await Assets.load(Object.values(pieceArtwork));
    const app = new Application();
    await app.init({
        backgroundAlpha: 0,
        resizeTo: host,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(globalThis.devicePixelRatio || 1, 2),
    });
    host.appendChild(app.canvas);
    const chamber = Sprite.from(pieceArtwork['reacteur-chambre-origine']);
    const tiles = new Container();
    const board = new Graphics();
    const pieces = new Container();
    const effects = new Container();
    app.stage.addChild(chamber, tiles, board, pieces, effects);
    let last: { state: GameState; ghost: readonly Position[]; angle?: number } | null = null;
    const geometry = (): ReturnType<typeof boardLayout> => boardLayout(app.screen.width, app.screen.height);
    function sprite(layer: Container, art: Artwork, x: number, y: number, w: number, h = w): Sprite {
        const image = Sprite.from(pieceArtwork[art]);
        image.position.set(x, y);
        image.setSize(w, h);
        layer.addChild(image);
        return image;
    }
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) sprite(tiles, 'case-sombre-jeu', x, y, 1);
    }
    const clearSprites = (layer: Container): void => {
        for (const child of layer.removeChildren()) child.destroy({ children: true });
    };
    const draw = (kind: 'obstacle' | 'segment', color: Color, x: number, y: number, s: number): Sprite => {
        const image = sprite(pieces, textureFor(kind, color, options.colorBlind ?? false).art, x, y, s);
        if (options.highContrast)
            board.poly(cellPoints(x + 1, y + 1, s - 2)).stroke({ width: 2, color: TOKENS.texte });
        return image;
    };
    const drawBridge = (a: Position, b: Position, ox: number, oy: number, s: number): void => {
        const horizontal = a.y === b.y;
        const x = ox + Math.min(a.x, b.x) * s;
        const y = oy + Math.min(a.y, b.y) * s;
        sprite(pieces, horizontal ? 'pont-droite' : 'pont-bas', x, y, s);
        sprite(
            pieces,
            horizontal ? 'pont-gauche' : 'pont-haut',
            x + (horizontal ? s : 0),
            y + (horizontal ? 0 : s),
            s,
        );
    };

    function drawFrame(state: GameState, ghost: readonly Position[], angle?: number): (Sprite | undefined)[] {
        last = { state, ghost, angle };
        const { cell: s, originX: ox, originY: oy } = geometry();
        clearSprites(pieces);
        const border = Math.min(10, s * 0.4);
        chamber.position.set(ox - border, oy - border);
        chamber.setSize(s * WIDTH + 2 * border, s * HEIGHT + 2 * border);
        tiles.position.set(ox, oy);
        tiles.scale.set(s);
        board.clear();
        const byId = new Map<string, Position>();
        state.board.forEach((c, i) => {
            if (c?.kind === 'segment') byId.set(c.id, { x: i % WIDTH, y: Math.floor(i / WIDTH) });
        });
        const cells = state.board.map((c: Cell, i) => {
            if (!c) return undefined;
            const x = i % WIDTH,
                y = Math.floor(i / WIDTH);
            return draw(c.kind, c.color, ox + x * s, oy + y * s, s);
        });
        state.board.forEach((c) => {
            if (c?.kind !== 'segment' || c.part !== 0 || c.linkedToId === null) return;
            const a = byId.get(c.id),
                b = byId.get(c.linkedToId);
            if (a && b) drawBridge(a, b, ox, oy, s);
        });
        for (const p of ghost) sprite(pieces, 'cellule-fantome', ox + p.x * s, oy + p.y * s, s);
        const active: ActiveCapsule | null = state.active;
        if (active) {
            const offset =
                angle === undefined
                    ? ORIENT[active.orientation]
                    : { x: Math.sin(angle), y: -Math.cos(angle) };
            const x = ox + active.x * s;
            const y = oy + active.y * s;
            draw('segment', active.colors[0], x, y, s);
            draw('segment', active.colors[1], x + offset.x * s, y + offset.y * s, s);
            if (angle === undefined) {
                drawBridge(active, { x: active.x + offset.x, y: active.y + offset.y }, ox, oy, s);
            } else {
                const rotation = angle - Math.PI / 2;
                const bridge = sprite(pieces, 'pont-droite', x + s / 2, y + s / 2, s);
                const end = sprite(
                    pieces,
                    'pont-gauche',
                    x + (offset.x + 0.5) * s,
                    y + (offset.y + 0.5) * s,
                    s,
                );
                for (const half of [bridge, end]) {
                    half.anchor.set(0.5);
                    half.rotation = rotation;
                }
            }
        }
        return cells;
    }

    function render(state: GameState, ghost: readonly Position[], before?: GameState): void {
        const from = before?.active;
        const to = state.active;
        const visible = last?.state.active;
        const visibleAngle = last?.angle;
        playbackVersion++;
        stopEffect?.();
        if (from && to && !options.reducedMotion) {
            const start = visible?.id === from.id ? visible : from;
            void tweenCapsule(
                state,
                ghost,
                start,
                to,
                visible?.id === from.id ? visibleAngle : undefined,
                () => drawFrame(state, ghost),
            );
        } else drawFrame(state, ghost);
    }

    function tweenCapsule(
        state: GameState,
        ghost: readonly Position[],
        from: ActiveCapsule,
        to: ActiveCapsule,
        visibleAngle?: number,
        finish?: () => void,
    ): Promise<void> {
        const quarter = Math.PI / 2;
        const start = visibleAngle ?? from.orientation * quarter;
        const end = to.orientation * quarter;
        const turn = Math.atan2(Math.sin(end - start), Math.cos(end - start));
        const rotating = Math.abs(turn) > 0.0001;
        const art = rotating
            ? 'fleche-rotation-jeu'
            : from.y !== to.y
              ? 'trainee-chute-jeu'
              : 'trainee-deplacement-apercu';
        const { cell: s, originX: ox, originY: oy } = geometry();
        const trail = sprite(effects, art, ox + (from.x - 0.25) * s, oy + (from.y - 0.5) * s, 1.5 * s);
        trail.alpha = 0.65;
        if (art === 'trainee-deplacement-apercu' && to.x < from.x) {
            trail.x += trail.width;
            trail.scale.x *= -1;
        }
        const frame = (progress: number): void => {
            const x = from.x + (to.x - from.x) * progress;
            const y = from.y + (to.y - from.y) * progress;
            drawFrame(
                {
                    ...state,
                    active: {
                        ...to,
                        x,
                        y,
                    },
                },
                ghost,
                rotating ? start + turn * progress : undefined,
            );
            if (art === 'trainee-chute-jeu') {
                const top = y + Math.min(0, ORIENT[to.orientation].y);
                trail.position.set(ox + (x - 0.25) * s, oy + (top - 0.5) * s);
            }
            trail.alpha = 0.65 * (1 - progress);
        };
        frame(0);
        return animate(animationDuration('gravity', false), frame, finish);
    }

    /** Éclats sur les cases supprimées ; la promesse se résout à la fin (immédiatement en mouvement réduit). */
    async function play(
        events: readonly BoardEvent[],
        before: GameState,
        onMatch: (match: Match) => void,
    ): Promise<void> {
        const version = ++playbackVersion;
        stopEffect?.();
        const stopped = () => disposed || options.reducedMotion || version !== playbackVersion;
        const ordinary = !events.some(({ type }) => type === 'MATCH_REMOVED');
        let frame: GameState = { ...before, phase: 'RESOLVING', active: null };
        for (const event of events) {
            if (stopped()) return;
            if (event.type === 'MATCH_REMOVED') {
                const match = event.payload as Match;
                onMatch(match);
                await fadeMatch(match, frame, animationDuration(match.chain > 1 ? 'combo' : 'match', false));
            }
            if (stopped()) return;
            if (event.board) {
                const active = before.active;
                const landing =
                    ordinary && event.type === 'LOCKED' && active
                        ? event.board.findIndex(
                              (cell) =>
                                  cell?.kind === 'segment' && cell.capsuleId === active.id && cell.part === 0,
                          )
                        : -1;
                if (active && landing >= 0 && Math.floor(landing / WIDTH) !== active.y) {
                    await tweenCapsule(before, [], active, { ...active, y: Math.floor(landing / WIDTH) });
                    if (stopped()) return;
                }
                frame = { ...frame, board: [...event.board] };
                const cells = drawFrame(frame, []);
                if (active && landing >= 0) {
                    const offset = ORIENT[active.orientation];
                    const partner = landing + offset.x + offset.y * WIDTH;
                    await flashLock(cells, landing, partner);
                }
            }
            if (stopped()) return;
            if (event.type === 'GRAVITY_STEP') await animate(animationDuration('gravity', false));
        }
    }

    let layoutLock: ((cells: (Sprite | undefined)[]) => void) | undefined;

    async function flashLock(
        cells: (Sprite | undefined)[],
        pivotIndex: number,
        partnerIndex: number,
    ): Promise<void> {
        const pivot = cells[pivotIndex];
        const partner = cells[partnerIndex];
        if (!pivot || !partner) return;

        const light = new Container();
        const accent = sprite(effects, 'trainee-verrouillage-jeu', pivot.x, pivot.y, pivot.width);
        const mask = effects.addChild(new Sprite(pivot.texture));
        accent.setMask({ mask, channel: 'alpha' });
        effects.addChild(light);

        const pivotFlash = light.addChild(new LockFlashSprite(pivot.texture));
        const partnerFlash = light.addChild(new LockFlashSprite(partner.texture));
        for (const flash of [pivotFlash, partnerFlash]) flash.blendMode = 'add';

        const align = (image: Sprite, segment: Sprite): void => {
            image.position.copyFrom(segment.position);
            image.setSize(segment.width, segment.height);
        };
        layoutLock = (next) => {
            const first = next[pivotIndex];
            const second = next[partnerIndex];
            if (!first || !second) return;
            pivotFlash.texture = mask.texture = first.texture;
            partnerFlash.texture = second.texture;
            for (const image of [pivotFlash, mask, accent]) align(image, first);
            align(partnerFlash, second);
        };
        layoutLock(cells);

        light.alpha = 0.74;
        accent.alpha = 0.35;
        await animate(animationDuration('lock', false), (progress) => {
            light.alpha = 0.74 * (1 - progress);
            accent.alpha = 0.35 * (1 - progress);
        });
    }

    let playbackVersion = 0;
    let disposed = false;
    let stopEffect: (() => void) | undefined;

    function fadeMatch(match: Match, before: GameState, duration: number): Promise<void> {
        const { cell: s, originX: ox, originY: oy } = geometry();
        const images = match.cells.map((i, index) => {
            const x = ox + (i % WIDTH) * s;
            const y = oy + Math.floor(i / WIDTH) * s;
            const oldCell = before.board[i];
            if (oldCell?.kind === 'obstacle') {
                const shade = oldCell.color === 'amber' ? 'ambre' : oldCell.color;
                sprite(effects, `cristal-brise-${shade}`, x, y, s);
            }
            const glows = [
                'explosion-effets-jeu',
                'fumee-effets-jeu',
                'etincelles-apercu',
                'particules-effets-jeu',
            ] as const;
            return sprite(effects, glows[index % glows.length] ?? glows[0], x - s / 2, y - s / 2, s * 2);
        });
        const sizes = images.map((image) => ({ image, width: image.width, height: image.height }));
        return animate(duration, (progress) => {
            effects.alpha = 1 - progress;
            for (const { image, width, height } of sizes) {
                const size = 1 + 0.18 * progress;
                image.setSize(width * size, height * size);
            }
        });
    }

    function animate(
        duration: number,
        advance?: (progress: number) => void,
        onFinish?: () => void,
    ): Promise<void> {
        effects.alpha = 1;
        return new Promise((resolve) => {
            let elapsed = 0;
            const finish = (): void => {
                app.ticker.remove(frame);
                layoutLock = undefined;
                clearSprites(effects);
                stopEffect = undefined;
                if (!disposed) onFinish?.();
                resolve();
            };
            const frame = (ticker: { deltaMS: number }): void => {
                elapsed += ticker.deltaMS;
                const progress = Math.min(1, elapsed / duration);
                advance?.(progress);
                if (progress >= 1 || options.reducedMotion) finish();
            };
            stopEffect = finish;
            app.ticker.add(frame);
        });
    }

    const onResize = (): void => {
        if (last) {
            const cells = drawFrame(last.state, last.ghost, last.angle);
            layoutLock?.(cells);
        }
    };
    app.renderer.on('resize', onResize);
    return {
        render,
        play,
        setOptions(next) {
            options = next;
            if (next.reducedMotion) stopEffect?.();
            onResize();
        },
        destroy() {
            disposed = true;
            stopEffect?.();
            app.renderer.off('resize', onResize);
            app.destroy(true, { children: true });
        },
        get canvas() {
            return app.canvas;
        },
    };
}
