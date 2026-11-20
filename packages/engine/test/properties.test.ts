import { propertyRuns } from './property-runs';
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateGameState } from '@capsule-panic/contracts';
import type { GameCommand, GameState } from '@capsule-panic/contracts';
import { capsuleCells, createGame, restore, serialize, step } from '../src/index';
import { deepFreeze } from './helpers';

const runs = propertyRuns(process.env);
const command = fc.constantFrom<GameCommand['type']>('MOVE_LEFT', 'MOVE_RIGHT', 'ROTATE_CW', 'ROTATE_CCW', 'SOFT_DROP', 'HARD_DROP', 'TICK', 'PAUSE', 'RESUME');
const filled = (s: GameState): number => s.board.filter(Boolean).length;

describe('engine properties over random games', () => {
    it('[E093][E323][E144][E265][E266][E267][E270][E271] every step keeps the invariants, never mutates its input, and is roundtrip-stable', () => {
        fc.assert(fc.property(fc.string({ minLength: 1 }), fc.integer({ min: 0, max: 20 }), fc.array(command, { maxLength: 120 }), (seed, level, commands) => {
            let s = createGame({ seed, level, speed: 'low' });
            for (const type of commands) {
                const before = serialize(s);
                const t = step(deepFreeze(s), { type });
                expect(serialize(s)).toBe(before);
                const next = t.state;
                const check = validateGameState(next);
                expect(check.ok ? [] : check.errors).toEqual([]);
                expect(restore(serialize(next))).toEqual(next);
                // Score monotone et entier, obstacles non croissants, jamais RESOLVING en sortie.
                expect(next.score).toBeGreaterThanOrEqual(s.score);
                expect(Number.isInteger(next.score)).toBe(true);
                expect(next.obstaclesRemaining).toBeLessThanOrEqual(s.obstaclesRemaining);
                expect(next.phase).not.toBe('RESOLVING');
                // Conservation : +2 cases au verrouillage, moins les cases supprimées, rien d'autre.
                const locked = t.events.filter(e => e.type === 'LOCKED').length * 2;
                const removed = t.events.filter(e => e.type === 'MATCH_REMOVED')
                    .reduce((n, e) => n + (e.payload as { obstacles: number; segments: number }).obstacles + (e.payload as { segments: number }).segments, 0);
                expect(filled(next)).toBe(filled(s) + locked - removed);
                const ids = next.board.flatMap(cell => cell ? [cell.id] : []);
                const known = new Set(s.board.flatMap(cell => cell ? [cell.id] : []));
                if (locked && s.active) {
                    known.add(`${s.active.id}a`);
                    known.add(`${s.active.id}b`);
                }
                expect(ids.every(id => known.has(id))).toBe(true);
                expect(new Set(ids).size).toBe(ids.length);
                if (next.active) {
                    for (const id of [`${next.active.id}a`, `${next.active.id}b`]) expect(ids).not.toContain(id);
                    for (const { x, y } of capsuleCells(next.active)) expect(next.board[y * 8 + x]).toBeNull();
                }
                // Les événements sont numérotés sans trou.
                expect(t.events.map(e => e.seq)).toEqual(t.events.map((_, i) => i));
                s = next;
            }
        }), { numRuns: runs });
    });
});
