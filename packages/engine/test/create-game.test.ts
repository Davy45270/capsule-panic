import { describe, it, expect } from 'vitest';
import { validateGameState } from '@capsule-panic/contracts';
import type { Speed } from '@capsule-panic/contracts';
import { capsuleCells, createGame, SPAWN } from '../src/index';

describe('createGame', () => {
    it('[E064][E235] T01 fresh game shows two segments inside the board, at the spawn', () => {
        const s = createGame({ seed: 'capsule', level: 0, speed: 'low' });
        expect(SPAWN).toEqual({ x: 3, y: 1, orientation: 0 });
        expect(s.phase).toBe('FALLING');
        expect(s.active).toMatchObject({ id: 'c1', x: 3, y: 1, orientation: 0 });
        expect(capsuleCells(s.active ?? SPAWN_CAPSULE)).toEqual([{ x: 3, y: 1 }, { x: 3, y: 0 }]);
        expect(s.nextQueue).toHaveLength(1);
        expect(s).toMatchObject({ score: 0, tick: 0, chainCount: 0, obstaclesRemaining: 4, level: 0, speed: 'low', seed: 'capsule' });
    });
    it('[E044][E095] is deterministic and keeps level and speed', () => {
        const a = createGame({ seed: 's', level: 7, speed: 'high' });
        expect(createGame({ seed: 's', level: 7, speed: 'high' })).toEqual(a);
        expect(a).toMatchObject({ level: 7, speed: 'high', obstaclesRemaining: 32 });
        expect(createGame({ seed: 't', level: 7, speed: 'high' })).not.toEqual(a);
    });
    it('stable capsule colours for seed "capsule"', () => {
        const s = createGame({ seed: 'capsule', level: 0, speed: 'low' });
        expect([s.active?.colors, s.nextQueue[0]]).toEqual(GOLDEN_COLOURS);
    });
    it('[E059] fresh state passes validateGameState at every level', () => {
        for (let level = 0; level <= 20; level++) {
            const state = createGame({ seed: `v${String(level)}`, level, speed: 'medium' });
            expect(state.level).toBe(level);
            expect(state.board.every(cell => cell === null || cell.kind === 'obstacle')).toBe(true);
            const r = validateGameState(state);
            expect(r.ok ? [] : r.errors).toEqual([]);
        }
    });
    it('rejects invalid configurations', () => {
        for (const config of [{ seed: 's', level: 21, speed: 'low' }, { seed: 's', level: -1, speed: 'low' }, { seed: 's', level: 1.5, speed: 'low' },
            { seed: '', level: 0, speed: 'low' }, { seed: 's', level: 0, speed: 'turbo' }]) {
            expect(() => createGame(config as { seed: string; level: number; speed: Speed })).toThrow(RangeError);
        }
    });
});

const SPAWN_CAPSULE = { id: 'none', colors: ['cyan', 'cyan'] as ['cyan', 'cyan'], x: -9, y: -9, orientation: 0 as const };
const GOLDEN_COLOURS: unknown[] = [['magenta', 'cyan'], ['amber', 'magenta']];
