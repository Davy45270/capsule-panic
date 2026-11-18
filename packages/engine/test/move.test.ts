import { describe, it, expect } from 'vitest';
import { step } from '../src/index';
import { boardFrom, deepFreeze, stateWith } from './helpers';

describe('moves and collisions', () => {
    it('move right emits MOVED and shifts both segments', () => {
        const t = step(stateWith(boardFrom([])), { type: 'MOVE_RIGHT' });
        expect(t.state.active).toMatchObject({ x: 4, y: 1 });
        expect(t.events.map(e => e.type)).toEqual(['MOVED']);
        expect(t.events[0]).toMatchObject({ seq: 0, tick: 0 });
    });
    it('T03 move left at x=0 is a no-op without event', () => {
        const s = stateWith(boardFrom([]), { x: 0 });
        const t = step(s, { type: 'MOVE_LEFT' });
        expect(t.state).toEqual(s);
        expect(t.events).toEqual([]);
    });
    it('T03 move right at x=7 is a no-op', () => {
        expect(step(stateWith(boardFrom([]), { x: 7 }), { type: 'MOVE_RIGHT' }).events).toEqual([]);
    });
    it('T04 move into an obstacle is a no-op', () => {
        const board = boardFrom([]);
        board[0 * 8 + 4] = { kind: 'obstacle', id: 'oX', color: 'cyan' };
        const s = stateWith(board, {}, { obstaclesRemaining: 1 });
        const t = step(s, { type: 'MOVE_RIGHT' });
        expect(t.state).toEqual(s);
        expect(t.events).toEqual([]);
    });
    it('moves do not advance tick', () => {
        expect(step(stateWith(boardFrom([])), { type: 'MOVE_LEFT' }).state.tick).toBe(0);
    });
    it('step never mutates its input', () => {
        const s = deepFreeze(stateWith(boardFrom(['C......M'])));
        for (const type of ['MOVE_LEFT', 'MOVE_RIGHT', 'ROTATE_CW', 'ROTATE_CCW', 'SOFT_DROP', 'HARD_DROP', 'TICK', 'PAUSE'] as const) {
            expect(() => step(s, { type })).not.toThrow();
        }
    });
});
