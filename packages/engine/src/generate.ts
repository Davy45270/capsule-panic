import { COLORS, WIDTH } from '@capsule-panic/contracts';
import type { Cell, Color } from '@capsule-panic/contracts';
import { colorAt, index } from './board';
import { MIN_RUN } from './match';
import { randomInt, shuffle } from './rng';
import type { RngState } from './rng';

/** Échec contrôlé de la génération (spec : « max 1000 essais par obstacle, puis échec contrôlé »). */
export class GenerationError extends Error {
    constructor(message: string) { super(message); this.name = 'GenerationError'; }
}

export const FIRST_OBSTACLE_ROW = 5;
export const MAX_OBSTACLES = 72;
export const MAX_REJECTIONS = 1000;

export const obstacleCount = (level: number): number => Math.min(4 + 4 * level, MAX_OBSTACLES);

/** Vrai si poser `color` en (x, y) compléterait un alignement de quatre ou plus. */
function createsRun(board: readonly Cell[], x: number, y: number, color: Color): boolean {
    const along = (dx: number, dy: number): number => {
        let n = 0;
        while (colorAt(board, x + dx * (n + 1), y + dy * (n + 1)) === color) n++;
        return n;
    };
    return along(-1, 0) + along(1, 0) + 1 >= MIN_RUN || along(0, -1) + along(0, 1) + 1 >= MIN_RUN;
}

/**
 * Pose `count` obstacles sur les cases libres des lignes y ≥ 5. Positions tirées sans remise ; pour chacune, les
 * trois couleurs sont essayées dans un ordre tiré ; une position où aucune ne passe est écartée (elle ne passera
 * jamais plus : ajouter des obstacles n'ôte aucune contrainte). Identifiants o1… dans l'ordre de pose.
 */
export function placeObstacles(board: readonly Cell[], count: number, rng: Readonly<RngState>, maxRejections = MAX_REJECTIONS): { board: Cell[]; rng: RngState } {
    const out = [...board];
    let state: RngState = [rng[0], rng[1], rng[2], rng[3]];
    const free: number[] = [];
    for (let i = index(0, FIRST_OBSTACLE_ROW); i < out.length; i++) if (out[i] === null) free.push(i);
    for (let n = 1; n <= count; n++) {
        let rejections = 0;
        for (let placed = false; !placed;) {
            if (free.length === 0) throw new GenerationError(`obstacle ${String(n)} : plus de position libre`);
            const [k, afterPick] = randomInt(free.length, state);
            const [order, afterOrder] = shuffle(COLORS, afterPick);
            state = afterOrder;
            const position = free.splice(k, 1)[0] as number;
            const x = position % WIDTH, y = Math.floor(position / WIDTH);
            const color = order.find(c => !createsRun(out, x, y, c));
            if (color) { out[position] = { kind: 'obstacle', id: `o${String(n)}`, color }; placed = true; }
            else if (++rejections >= maxRejections) throw new GenerationError(`obstacle ${String(n)} : ${String(rejections)} rejets`);
        }
    }
    return { board: out, rng: state };
}

/** Plateau initial d'un niveau : vide, puis `obstacleCount(level)` obstacles. */
export function generateBoard(level: number, rng: Readonly<RngState>): { board: Cell[]; rng: RngState } {
    return placeObstacles(Array.from({ length: 128 }, () => null), obstacleCount(level), rng);
}
