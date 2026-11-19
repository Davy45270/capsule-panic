import { propertyRuns } from './property-runs';
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { Cell } from '@capsule-panic/contracts';
import { canPlace, findMatches, getAvailableMoves, resolve, restore, serialize, SPAWN, step } from '../src/index';
import { boardFrom, stateWith } from './helpers';

const runs = propertyRuns(process.env);
const types = (events: { type: string }[]): string[] => events.map(e => e.type);
// Column 3 is a full, match-free stack of singletons: the spawn point is blocked.
const blockedSpawn = (rows: string[]): Cell[] => {
    const b = boardFrom(rows);
    for (let y = 0; y < 16; y++) b[y * 8 + 3] = { kind: 'segment', id: `w${String(y)}`, capsuleId: `w${String(y)}`, part: 0, color: y % 2 ? 'magenta' : 'amber', linkedToId: null };
    return b;
};

describe('resolution, score, end of level', () => {
    it('[E027][E091][E206][E207][E251][E319] T17 a chain reaction applies multiplier 2', () => {
        const board = boardFrom(['c.......', 'c.......', 'aaa.....', 'CAMAM...', 'CMAMA...']);
        const s = stateWith(board, { x: 3, y: 1, orientation: 1, colors: ['amber', 'magenta'] });
        const t = step(s, { type: 'HARD_DROP' });
        // Drop 12 rows (24) ; chain 1: 4 segments (40) ; chain 2: 2 obstacles + 2 segments, x2 (440).
        expect(t.state.score).toBe(24 + 40 + 440);
        expect(t.state.chainCount).toBe(2);
        expect(t.state.obstaclesRemaining).toBe(s.obstaclesRemaining - 2);
        expect(types(t.events).filter(e => e === 'MATCH_REMOVED')).toHaveLength(2);
        expect(types(t.events)).toContain('GRAVITY_STEP');
        expect(types(t.events).slice(-2)).toEqual(['CASCADE_END', 'SPAWNED']);
        expect(t.state.board[13 * 8]).toBeNull();
        expect(t.state.board[13 * 8 + 4]).toMatchObject({ color: 'magenta', linkedToId: null });
        expect(t.state.phase).toBe('FALLING');
    });
    it('les événements livrent le plateau verrouillé, la suppression et chaque chute de la cascade', () => {
        const board = boardFrom(['c.......', 'c.......', 'aaa.....', 'CAMAM...', 'CMAMA...']);
        const s = stateWith(board, { x: 3, y: 1, orientation: 1, colors: ['amber', 'magenta'] });
        const t = step(s, { type: 'HARD_DROP' });
        const events = t.events.filter(e => e.type === 'LOCKED' || e.type === 'MATCH_REMOVED' || e.type === 'GRAVITY_STEP');
        const frames = events.map(e => (e as { board?: Cell[] }).board);
        expect(frames[0]?.[13 * 8 + 3]).toMatchObject({ kind: 'segment', color: 'amber' });
        expect(frames[1]?.[13 * 8 + 3]).toBeNull();
        expect(frames[2]?.[13 * 8]).toMatchObject({ kind: 'segment', color: 'cyan' });
        expect(frames.at(-1)).toEqual(t.state.board);
    });
    it('[E036][E088][E090][E252] T18 removing the last obstacle gives WON before the spawn test', () => {
        const s = restore(serialize(stateWith(blockedSpawn(['....Ccc.']), { x: 7, y: 1, orientation: 0, colors: ['cyan', 'amber'] })));
        const t = step(s, { type: 'HARD_DROP' });
        expect(t.state.phase).toBe('WON');
        expect(canPlace(t.state.board, SPAWN)).toBe(false);
        expect(t.state.active).toBeNull();
        expect(t.state.obstaclesRemaining).toBe(0);
        expect(types(t.events).at(-1)).toBe('WON');
    });
    it('[E065][E089][E236] T02 a blocked spawn gives LOST', () => {
        const s = restore(serialize(stateWith(blockedSpawn(['....Ccc.']), { x: 7, y: 1, orientation: 0, colors: ['amber', 'amber'] })));
        const t = step(s, { type: 'HARD_DROP' });
        expect(t.state.phase).toBe('LOST');
        expect(t.state.active).toBeNull();
        expect(types(t.events).at(-1)).toBe('LOST');
    });
    it('[E253] T19 no removal spawns the next capsule from the queue', () => {
        const t = step(stateWith(boardFrom(['M.......'])), { type: 'HARD_DROP' });
        expect(t.state.chainCount).toBe(0);
        expect(t.state.active?.colors).toEqual(['magenta', 'magenta']);
        expect(types(t.events)).toEqual(['LOCKED', 'SPAWNED']);
    });
    it('[E196][E485] the state returned by step is never RESOLVING', () => {
        const board = boardFrom(['c.......', 'c.......', 'aaa.....', 'CAMAM...', 'CMAMA...']);
        const initial = stateWith(board, { orientation: 1, colors: ['amber', 'magenta'] });
        const transition = step(initial, { type: 'HARD_DROP' });
        const events = types(transition.events);
        expect(events.slice(0, 2)).toEqual(['LOCKED', 'MATCH_REMOVED']);
        expect(events.slice(-2)).toEqual(['CASCADE_END', 'SPAWNED']);
        expect(transition.state.phase).toBe('FALLING');
        expect(transition.state.active?.colors).toEqual(initial.nextQueue[0]);
        expect(transition.state.nextQueue).toHaveLength(1);
        expect(transition.state.rngState).not.toEqual(initial.rngState);
        expect(findMatches(transition.state.board).size).toBe(0);
    });
    it('[E268][E269][E273] findMatches is empty after resolve, and resolve never increases obstacles', () => {
        const cell = fc.oneof(fc.constant(null), fc.constant(null), fc.constantFrom('C', 'A', 'M', 'c', 'a', 'm'));
        fc.assert(fc.property(fc.array(cell, { minLength: 128, maxLength: 128 }), raw => {
            const rows = Array.from({ length: 16 }, (_, y) => raw.slice(y * 8, y * 8 + 8).map(c => c ?? '.').join(''));
            const board = boardFrom(rows);
            const r = resolve(board);
            expect(findMatches(r.board).size).toBe(0);
            expect(r.chain).toBeLessThanOrEqual(Math.floor(board.filter(Boolean).length / 4));
            expect(r.obstaclesRemoved).toBeGreaterThanOrEqual(0);
            expect(r.board.filter(c => c?.kind === 'obstacle').length).toBe(board.filter(c => c?.kind === 'obstacle').length - r.obstaclesRemoved);
            expect(r.scoreDelta).toBeGreaterThanOrEqual(0);
        }), { numRuns: runs });
    });
});

describe('getAvailableMoves', () => {
    it('[E137] lists the 30 resting placements reachable on an empty board', () => {
        const moves = getAvailableMoves(stateWith(boardFrom(['.......C'])));
        expect(moves).toHaveLength(30);
        expect(moves).toContainEqual({ x: 0, y: 15, orientation: 0 });
        expect(moves).toContainEqual({ x: 6, y: 14, orientation: 1 });
    });
    it('does not reach behind a wall', () => {
        const rows = Array.from({ length: 15 }, () => '..A.....');
        const board = boardFrom([...rows.map((r, i) => (i % 2 ? '..M.....' : r)), '..A.....']);
        const moves = getAvailableMoves(stateWith(board, { x: 5, y: 1 }, { obstaclesRemaining: 16 }));
        expect(moves.every(m => m.x >= 3 && (m.orientation !== 3 || m.x >= 4))).toBe(true);
        expect(getAvailableMoves(stateWith(board, null))).toEqual([]);
    });
});
