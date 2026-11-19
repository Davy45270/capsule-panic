// Rendu PixiJS du réacteur. Aucune règle ici : on dessine un état et on anime des événements déjà résolus.
import { Application, Assets, Container, Graphics, loadTextures, Sprite } from 'pixi.js';
import { HEIGHT, WIDTH } from '@capsule-panic/contracts';
import type { ActiveCapsule, Cell, Color, BoardEvent, GameState, Position } from '@capsule-panic/contracts';
import { animationDuration, cellPoints, TOKENS } from './art';
import { boardLayout } from './layout';
import { pieceArtwork, textureFor } from './pieces';
import type { Artwork } from './pieces';

export interface ViewOptions {
    reducedMotion: boolean;
    highContrast: boolean;
    colorBlind?: boolean;
}
export interface BoardView {
    render(state: GameState, ghost: readonly Position[]): void;
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

const ORIENT: Record<number, Position> = {
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
    let last: { state: GameState; ghost: readonly Position[] } | null = null;
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
        for (const child of layer.removeChildren()) child.destroy();
    };
    const draw = (kind: 'obstacle' | 'segment', color: Color, x: number, y: number, s: number): void => {
        sprite(pieces, textureFor(kind, color, options.colorBlind ?? false).art, x, y, s);
        if (options.highContrast)
            board.poly(cellPoints(x + 1, y + 1, s - 2)).stroke({ width: 2, color: TOKENS.texte });
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

    function render(state: GameState, ghost: readonly Position[]): void {
        last = { state, ghost };
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
        state.board.forEach((c: Cell, i) => {
            if (!c) return;
            const x = i % WIDTH,
                y = Math.floor(i / WIDTH);
            draw(c.kind, c.color, ox + x * s, oy + y * s, s);
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
            const o = ORIENT[active.orientation] ?? { x: 0, y: -1 };
            const cells = [
                { x: active.x, y: active.y },
                { x: active.x + o.x, y: active.y + o.y },
            ];
            cells.forEach((p, k) =>
                draw('segment', active.colors[k] ?? 'cyan', ox + p.x * s, oy + p.y * s, s),
            );
            drawBridge(cells[0] ?? { x: 0, y: 0 }, cells[1] ?? { x: 0, y: 0 }, ox, oy, s);
        }
    }

    /** Éclats sur les cases supprimées ; la promesse se résout à la fin (immédiatement en mouvement réduit). */
    async function play(
        events: readonly BoardEvent[],
        before: GameState,
        onMatch: (match: Match) => void,
    ): Promise<void> {
        const stopped = () => disposed || options.reducedMotion;
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
                frame = { ...frame, board: [...event.board] };
                render(frame, []);
            }
            if (event.type === 'GRAVITY_STEP') await animate(animationDuration('gravity', false));
        }
    }

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
        effects.alpha = 1;
        return animate(duration, (progress) => {
            effects.alpha = 1 - progress;
            for (const { image, width, height } of sizes) {
                const size = 1 + 0.18 * progress;
                image.setSize(width * size, height * size);
            }
        });
    }

    function animate(duration: number, advance?: (progress: number) => void): Promise<void> {
        return new Promise((resolve) => {
            let elapsed = 0;
            const finish = (): void => {
                app.ticker.remove(frame);
                clearSprites(effects);
                stopEffect = undefined;
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
        if (last) render(last.state, last.ghost);
    };
    app.renderer.on('resize', onResize);
    return {
        render,
        play,
        setOptions(next) {
            options = next;
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
