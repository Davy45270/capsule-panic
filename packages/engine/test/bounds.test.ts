import { describe, it, expect } from 'vitest';
import type { Cell } from '@capsule-panic/contracts';
import { settle } from '../src/gravity';
import { placeObstacles } from '../src/generate';
import { getAvailableMoves } from '../src/moves';
import { resolve } from '../src/resolve';
import { nonZero, randomInt, seedToState } from '../src/rng';
import { boardFrom, stateWith } from './helpers';

describe('safety bounds and rare branches', () => {
    it('gravity stops with an internal error past its step bound', () => {
        expect(() => settle(boardFrom(['c.......', '........']), undefined, 0)).toThrow('gravity did not settle');
    });
    it('resolution stops with an internal error past its cycle bound', () => {
        expect(() => resolve(boardFrom(['cccc....']), undefined, 0)).toThrow('resolution did not end');
    });
    it('the all-zero xoshiro state is replaced', () => {
        expect(nonZero([0, 0, 0, 0])).not.toEqual([0, 0, 0, 0]);
        expect(nonZero([0, 0, 0, 7])).toEqual([0, 0, 0, 7]);
    });
    it('randomInt rejects a bad bound and redraws above the unbiased limit', () => {
        expect(() => randomInt(0, [1, 2, 3, 4])).toThrow(RangeError);
        expect(() => randomInt(1.5, [1, 2, 3, 4])).toThrow(RangeError);
        let s = seedToState('rejet');
        for (let i = 0; i < 64; i++) { const [v, next] = randomInt(0x80000001, s); expect(v).toBeLessThan(0x80000001); s = next; }
    });
    it('a rejected position is skipped and another one is used', () => {
        const b: Cell[] = boardFrom([]);
        for (let i = 40; i < 128; i++) b[i] = { kind: 'obstacle', id: `f${String(i)}`, color: 'cyan' };
        b[40] = null;
        b[127] = null;
        for (const [x, y, color] of [[1, 5, 'cyan'], [2, 5, 'cyan'], [3, 5, 'cyan'], [0, 6, 'amber'], [0, 7, 'amber'], [0, 8, 'amber'], [0, 2, 'magenta'], [0, 3, 'magenta'], [0, 4, 'magenta']] as const) {
            b[y * 8 + x] = { kind: 'obstacle', id: `p${String(x)}-${String(y)}`, color };
        }
        for (let k = 0; k < 8; k++) {
            const r = placeObstacles(b, 1, seedToState(`r${String(k)}`), 2);
            expect(r.board[127]).toMatchObject({ kind: 'obstacle', id: 'o1' });
            expect(r.board[40]).toBeNull();
        }
    });
    it('no available move outside the falling phase', () => {
        expect(getAvailableMoves(stateWith(boardFrom(['C.......']), {}, { phase: 'PAUSED' }))).toEqual([]);
    });
});
