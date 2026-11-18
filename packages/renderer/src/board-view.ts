// Rendu PixiJS du réacteur. Aucune règle ici : on dessine un état et on anime des événements déjà résolus.
import { Application, Graphics } from 'pixi.js';
import { HEIGHT, WIDTH } from '@capsule-panic/contracts';
import type { ActiveCapsule, Cell, Color, GameEvent, GameState, Position } from '@capsule-panic/contracts';
import { animationDuration, cellPoints, COLOR_HEX, SHAPE_OF, shapePoints, TOKENS } from './art';
import { boardLayout } from './layout';

export interface ViewOptions { reducedMotion: boolean; highContrast: boolean }
export interface BoardView {
    render(state: GameState, ghost: readonly Position[]): void;
    play(events: readonly GameEvent[]): Promise<void>;
    setOptions(options: ViewOptions): void;
    destroy(): void;
    readonly canvas: HTMLCanvasElement;
}

const ORIENT: Record<number, Position> = { 0: { x: 0, y: -1 }, 1: { x: 1, y: 0 }, 2: { x: 0, y: 1 }, 3: { x: -1, y: 0 } };

export async function createBoardView(host: HTMLElement, initial: ViewOptions): Promise<BoardView> {
    let options = initial;
    const app = new Application();
    await app.init({ background: TOKENS.fond, resizeTo: host, antialias: true, autoDensity: true, resolution: Math.min(globalThis.devicePixelRatio || 1, 2) });
    host.appendChild(app.canvas);
    const board = new Graphics();
    const effects = new Graphics();
    app.stage.addChild(board, effects);
    let last: { state: GameState; ghost: readonly Position[] } | null = null;
    const geometry = (): ReturnType<typeof boardLayout> => boardLayout(app.screen.width, app.screen.height);
    const stroke = (): number => (options.highContrast ? 3 : 1.5);

    const drawCrystal = (g: Graphics, color: Color, x: number, y: number, s: number): void => {
        const cx = x + s / 2, cy = y + s / 2;
        g.poly(shapePoints(SHAPE_OF[color], cx, cy, s * 0.44)).fill(COLOR_HEX[color]).stroke({ width: stroke(), color: TOKENS.texte });
        g.poly(shapePoints(SHAPE_OF[color], cx, cy, s * 0.2)).fill({ color: TOKENS.fond, alpha: 0.4 });
    };
    const drawCell = (g: Graphics, color: Color, x: number, y: number, s: number, alpha = 1): void => {
        const inset = s * 0.06;
        g.poly(cellPoints(x + inset, y + inset, s - 2 * inset)).fill({ color: COLOR_HEX[color], alpha }).stroke({ width: stroke(), color: TOKENS.texte, alpha });
        g.poly(shapePoints(SHAPE_OF[color], x + s / 2, y + s / 2, s * (options.highContrast ? 0.26 : 0.22))).fill({ color: TOKENS.fond, alpha: 0.55 * alpha });
    };
    const drawBridge = (g: Graphics, a: Position, b: Position, ox: number, oy: number, s: number): void => {
        const cx = ox + (Math.min(a.x, b.x) + (a.x === b.x ? 0.5 : 1)) * s, cy = oy + (Math.min(a.y, b.y) + (a.y === b.y ? 0.5 : 1)) * s;
        const horizontal = a.y === b.y;
        const w = horizontal ? s * 0.4 : s * 0.2, h = horizontal ? s * 0.2 : s * 0.4;
        g.roundRect(cx - w / 2, cy - h / 2, w, h, s * 0.1).fill({ color: TOKENS.texte, alpha: 0.85 });
    };

    function render(state: GameState, ghost: readonly Position[]): void {
        last = { state, ghost };
        const { cell: s, originX: ox, originY: oy } = geometry();
        const g = board.clear();
        g.roundRect(ox - 6, oy - 6, s * WIDTH + 12, s * HEIGHT + 12, 14).fill(TOKENS.panneau).stroke({ width: 3, color: TOKENS.cyan, alpha: 0.7 });
        for (let x = 1; x < WIDTH; x++) g.moveTo(ox + x * s, oy).lineTo(ox + x * s, oy + s * HEIGHT);
        for (let y = 1; y < HEIGHT; y++) g.moveTo(ox, oy + y * s).lineTo(ox + s * WIDTH, oy + y * s);
        g.stroke({ width: 1, color: TOKENS.texte, alpha: 0.06 });
        const byId = new Map<string, Position>();
        state.board.forEach((c, i) => { if (c?.kind === 'segment') byId.set(c.id, { x: i % WIDTH, y: Math.floor(i / WIDTH) }); });
        state.board.forEach((c: Cell, i) => {
            if (!c) return;
            const x = i % WIDTH, y = Math.floor(i / WIDTH);
            if (c.kind === 'obstacle') drawCrystal(g, c.color, ox + x * s, oy + y * s, s);
            else drawCell(g, c.color, ox + x * s, oy + y * s, s);
        });
        state.board.forEach(c => {
            if (c?.kind !== 'segment' || c.part !== 0 || c.linkedToId === null) return;
            const a = byId.get(c.id), b = byId.get(c.linkedToId);
            if (a && b) drawBridge(g, a, b, ox, oy, s);
        });
        for (const p of ghost) g.poly(cellPoints(ox + p.x * s + s * 0.12, oy + p.y * s + s * 0.12, s * 0.76)).stroke({ width: 2, color: TOKENS.texte, alpha: 0.35 });
        const active: ActiveCapsule | null = state.active;
        if (active) {
            const o = ORIENT[active.orientation] ?? { x: 0, y: -1 };
            const cells = [{ x: active.x, y: active.y }, { x: active.x + o.x, y: active.y + o.y }];
            cells.forEach((p, k) => drawCell(g, active.colors[k] ?? 'cyan', ox + p.x * s, oy + p.y * s, s));
            drawBridge(g, cells[0] ?? { x: 0, y: 0 }, cells[1] ?? { x: 0, y: 0 }, ox, oy, s);
        }
    }

    /** Éclats sur les cases supprimées ; la promesse se résout à la fin (immédiatement en mouvement réduit). */
    function play(events: readonly GameEvent[]): Promise<void> {
        const removed = events.filter(e => e.type === 'MATCH_REMOVED').flatMap(e => (e.payload as { cells: number[] }).cells);
        const combo = events.some(e => e.type === 'MATCH_REMOVED' && (e.payload as { chain: number }).chain >= 2);
        const duration = animationDuration(combo ? 'combo' : 'match', options.reducedMotion);
        if (removed.length === 0 || duration === 0) return Promise.resolve();
        const { cell: s, originX: ox, originY: oy } = geometry();
        return new Promise(resolve => {
            let elapsed = 0;
            const frame = (ticker: { deltaMS: number }): void => {
                elapsed += ticker.deltaMS;
                const t = Math.min(1, elapsed / duration);
                const g = effects.clear();
                for (const i of removed) {
                    const cx = ox + ((i % WIDTH) + 0.5) * s, cy = oy + (Math.floor(i / WIDTH) + 0.5) * s;
                    g.star(cx, cy, 8, s * (0.3 + 0.5 * t), s * 0.15).fill({ color: TOKENS.amber, alpha: 1 - t });
                }
                if (t >= 1) { app.ticker.remove(frame); effects.clear(); resolve(); }
            };
            app.ticker.add(frame);
        });
    }

    const onResize = (): void => { if (last) render(last.state, last.ghost); };
    app.renderer.on('resize', onResize);
    return {
        render, play,
        setOptions(next) { options = next; onResize(); },
        destroy() { app.renderer.off('resize', onResize); app.destroy(true, { children: true }); },
        get canvas() { return app.canvas; }
    };
}
