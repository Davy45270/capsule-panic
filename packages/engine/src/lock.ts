import type { ActiveCapsule, Cell } from '@capsule-panic/contracts';
import { index } from './board';
import { capsuleCells } from './capsule';

/** Copie la capsule dans le plateau : segments `<id>a` (pivot, partie 0) et `<id>b` (partie 1), liés. */
export function lockCapsule(board: readonly Cell[], active: ActiveCapsule): Cell[] {
    const out = [...board];
    const [p0, p1] = capsuleCells(active);
    out[index(p0.x, p0.y)] = { kind: 'segment', id: `${active.id}a`, capsuleId: active.id, part: 0, color: active.colors[0], linkedToId: `${active.id}b` };
    out[index(p1.x, p1.y)] = { kind: 'segment', id: `${active.id}b`, capsuleId: active.id, part: 1, color: active.colors[1], linkedToId: `${active.id}a` };
    return out;
}
