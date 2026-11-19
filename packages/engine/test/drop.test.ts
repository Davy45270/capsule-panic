import { describe, it, expect } from 'vitest';
import type { GameCommand } from '@capsule-panic/contracts';
import { getLandingProjection, restore, serialize, step } from '../src/index';
import { boardFrom, deepFreeze, stateWith } from './helpers';

const types = (t: { events: { type: string }[] }): string[] => t.events.map(e => e.type);

describe('falling, drops and lock', () => {
    it('[E072][E193][E241] T07 hard drop locks at the bottom and scores 2 per row', () => {
        const t = step(stateWith(boardFrom(['.......C'])), { type: 'HARD_DROP' });
        expect(t.state.score).toBe(28);
        expect(t.state.board[15 * 8 + 3]).toEqual({ kind: 'segment', id: 'c90a', capsuleId: 'c90', part: 0, color: 'cyan', linkedToId: 'c90b' });
        expect(t.state.board[14 * 8 + 3]).toEqual({ kind: 'segment', id: 'c90b', capsuleId: 'c90', part: 1, color: 'amber', linkedToId: 'c90a' });
        expect(types(t)).toEqual(['LOCKED', 'SPAWNED']);
    });
    it('[E092][E242] T08 soft drop one row scores 1', () => {
        const initial = stateWith(boardFrom(['.......C']));
        const t = step(initial, { type: 'SOFT_DROP' });
        expect(t.state.active).toMatchObject({ x: 3, y: 2 });
        expect(t.state.score).toBe(1);
        expect(types(t)).toEqual(['MOVED']);
        expect(step(t.state, { type: 'HARD_DROP' }).state.score).toBe(1 + 2 * 13);
    });
    it('[E071] soft drop on contact locks without score', () => {
        const t = step(stateWith(boardFrom(['.......C']), { y: 15 }), { type: 'SOFT_DROP' });
        expect(t.state.score).toBe(0);
        expect(t.state.phase).toBe('FALLING');
        expect(types(t)[0]).toBe('LOCKED');
        const falls = step(stateWith(boardFrom(['.......C'])), { type: 'SOFT_DROP' });
        expect(falls.state.active?.y).toBe(2);
    });
    it('[E069] TICK moves down one row, increments tick and stamps events with it', () => {
        const t = step(stateWith(boardFrom([])), { type: 'TICK' });
        expect(t.state.active).toMatchObject({ y: 2 });
        expect(t.state.tick).toBe(1);
        expect(t.events[0]).toMatchObject({ type: 'MOVED', tick: 1 });
        expect(t.state.score).toBe(0);
    });
    it('[E070] TICK on contact locks immediately and spawns the queued capsule', () => {
        const board = boardFrom(['C.......', 'M.......']);
        const t = step(stateWith(board, { y: 15 }, { obstaclesRemaining: 2 }), { type: 'TICK' });
        expect(types(t)).toEqual(['LOCKED', 'SPAWNED']);
        expect(t.state.active).toEqual({ id: 'c91', colors: ['magenta', 'magenta'], x: 3, y: 1, orientation: 0 });
        expect(t.state.nextQueue).toHaveLength(1);
        expect(t.state.rngState).not.toEqual([1, 2, 3, 4]);
    });
    it('[E046][E255] T21 pause: TICK is refused and tick does not move', () => {
        const paused = step(stateWith(boardFrom([])), { type: 'PAUSE' });
        expect(paused.state.phase).toBe('PAUSED');
        expect(types(paused)).toEqual(['PAUSED']);
        const t = step(paused.state, { type: 'TICK' });
        expect(t.state).toBe(paused.state);
        expect(t.events).toEqual([]);
    });
    it('RESUME from PAUSED or READY gives FALLING', () => {
        for (const phase of ['PAUSED', 'READY'] as const) {
            const t = step(stateWith(boardFrom([]), {}, { phase }), { type: 'RESUME' });
            expect(t.state.phase).toBe('FALLING');
            expect(types(t)).toEqual(['RESUMED']);
        }
    });
    it('[E262] T28 every command on a RESOLVING state is refused', () => {
        const s = restore(serialize(stateWith(boardFrom([]), null, { phase: 'RESOLVING' })));
        for (const type of ['MOVE_LEFT', 'MOVE_RIGHT', 'ROTATE_CW', 'ROTATE_CCW', 'SOFT_DROP', 'HARD_DROP', 'TICK', 'PAUSE', 'RESUME'] satisfies GameCommand['type'][]) {
            expect(step(s, { type })).toEqual({ state: s, events: [] });
        }
    });
    it('[E190] le jeu et la pause obéissent à la phase', () => {
        for (const phase of ['READY', 'PAUSED', 'WON', 'LOST'] as const) {
            const state = stateWith(boardFrom([]), phase === 'READY' || phase === 'PAUSED' ? {} : null, { phase });
            for (const type of ['MOVE_LEFT', 'MOVE_RIGHT', 'ROTATE_CW', 'ROTATE_CCW', 'SOFT_DROP', 'HARD_DROP', 'TICK', 'PAUSE'] as const) {
                expect(step(state, { type })).toEqual({ state, events: [] });
            }
            const resumed = step(state, { type: 'RESUME' });
            if (phase === 'READY' || phase === 'PAUSED') expect(resumed.state.phase).toBe('FALLING');
            else expect(resumed).toEqual({ state, events: [] });
        }
        const initial = stateWith(boardFrom([]));
        expect(step(initial, { type: 'PAUSE' }).state.phase).toBe('PAUSED');
        expect(step(initial, { type: 'RESUME' })).toEqual({ state: initial, events: [] });
    });
    it('[E136][E261] T27 getLandingProjection gives the hard drop cells and does not change the state', () => {
        const s = deepFreeze(stateWith(boardFrom(['...A....']), { x: 3, y: 1, orientation: 1 }, { obstaclesRemaining: 1 }));
        expect(getLandingProjection(s)).toEqual([{ x: 3, y: 14 }, { x: 4, y: 14 }]);
        expect(getLandingProjection(stateWith(boardFrom([]), null))).toEqual([]);
    });
});
