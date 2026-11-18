import { COLORS, ORIENTATION_OFFSETS } from '@capsule-panic/contracts';
import type { ActiveCapsule, Color, Position } from '@capsule-panic/contracts';
import { randomInt } from './rng';
import type { RngState } from './rng';

/** Point d'apparition : pivot (3,1), orientation 0, second segment au-dessus en (3,0). */
export const SPAWN = { x: 3, y: 1, orientation: 0 } as const;

/** Cases du pivot (segment 0) puis du second segment. */
export function capsuleCells(c: Pick<ActiveCapsule, 'x' | 'y' | 'orientation'>): [Position, Position] {
    const o = ORIENTATION_OFFSETS[c.orientation];
    return [{ x: c.x, y: c.y }, { x: c.x + o.x, y: c.y + o.y }];
}

/** Deux couleurs indépendantes et uniformes, segment 0 puis segment 1. */
export function drawCapsuleColors(rng: Readonly<RngState>): [[Color, Color], RngState] {
    const [a, s1] = randomInt(COLORS.length, rng);
    const [b, s2] = randomInt(COLORS.length, s1);
    return [[COLORS[a] as Color, COLORS[b] as Color], s2];
}
