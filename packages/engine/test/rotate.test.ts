import { describe, it, expect } from 'vitest';
import { capsuleCells, step } from '../src/index';
import { boardFrom, stateWith } from './helpers';

describe('rotation without wall kick', () => {
    it('[E239] T05 rotate CW from 0 gives 1, second segment at pivot + (1,0)', () => {
        const t = step(stateWith(boardFrom([]), { x: 3, y: 5 }), { type: 'ROTATE_CW' });
        expect(t.state.active?.orientation).toBe(1);
        expect(capsuleCells(t.state.active ?? { x: 0, y: 0, orientation: 0 })).toEqual([{ x: 3, y: 5 }, { x: 4, y: 5 }]);
        expect(t.events.map(e => e.type)).toEqual(['ROTATED']);
    });
    it('[E067] rotate CCW from 0 gives 3, and four CW turns come back to 0', () => {
        expect(step(stateWith(boardFrom([]), { y: 5 }), { type: 'ROTATE_CCW' }).state.active?.orientation).toBe(3);
        let s = stateWith(boardFrom([]), { y: 5 });
        for (const orientation of [1, 2, 3, 0]) {
            s = step(s, { type: 'ROTATE_CW' }).state;
            expect(s.active?.orientation).toBe(orientation);
        }
        expect(s.active).toMatchObject({ x: 3, y: 5, orientation: 0 });
        const edge = stateWith(boardFrom([]), { x: 0, y: 5 });
        expect(step(edge, { type: 'ROTATE_CCW' })).toEqual({ state: edge, events: [] });
        const otherEdge = stateWith(boardFrom([]), { x: 7, y: 5 });
        expect(step(otherEdge, { type: 'ROTATE_CW' })).toEqual({ state: otherEdge, events: [] });
    });
    it('[E030][E240] T06 rotate at the right wall without kick is a no-op', () => {
        const s = stateWith(boardFrom([]), { x: 7, y: 5 });
        const t = step(s, { type: 'ROTATE_CW' });
        expect(t.state).toEqual(s);
        expect(t.events).toEqual([]);
    });
    it('rotation from 3 to 0 at the top row is refused when the second cell would leave the board', () => {
        const s = stateWith(boardFrom([]), { x: 3, y: 0, orientation: 1 });
        expect(step(s, { type: 'ROTATE_CCW' }).events).toEqual([]);
    });
    it('[E068][E192] rotation checks locked cells only, not the old position of the capsule', () => {
        // Orientation 1 occupies (3,5)-(4,5); CW to 2 needs (3,6): free, even if (4,5) was the old second segment.
        const s = stateWith(boardFrom([]), { x: 3, y: 5, orientation: 1 });
        expect(step(s, { type: 'ROTATE_CW' }).state.active).toMatchObject({ x: 3, y: 5, orientation: 2 });
        const top = stateWith(boardFrom([]), { x: 3, y: 0, orientation: 1 });
        expect(step(top, { type: 'ROTATE_CCW' })).toEqual({ state: top, events: [] });
        const blocked = boardFrom([]);
        blocked[6 * 8 + 3] = { kind: 'obstacle', id: 'oX', color: 'amber' };
        const atObstacle = stateWith(blocked, { x: 3, y: 5, orientation: 1 });
        expect(step(atObstacle, { type: 'ROTATE_CW' })).toEqual({ state: atObstacle, events: [] });
    });
});
