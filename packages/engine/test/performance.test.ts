import { performance } from 'node:perf_hooks';
import { expect, it } from 'vitest';
import type { Cell } from '@capsule-panic/contracts';
import { createGame, resolve } from '../src/index';

function loadedBoard(index: number): Cell[] {
    const board = [...createGame({ seed: `banc-${String(index)}`, level: 20, speed: 'high' }).board];
    const colors = ['cyan', 'amber', 'magenta'] as const;
    for (let y = 2; y < 5; y++) for (let x = 0; x < 8; x++) {
        const id = `banc-${String(x)}-${String(y)}`;
        const color = y === 2 && x < 4 ? 'cyan' : colors[(x + y + index) % colors.length] ?? 'cyan';
        board[y * 8 + x] = { kind: 'segment', id, capsuleId: id, part: 0, color, linkedToId: null };
    }
    return board;
}

it('[E160] resolve reste sous 16 ms au p95 sur des plateaux chargés', () => {
    const boards = Array.from({ length: 32 }, (_, index) => Object.freeze(loadedBoard(index)));
    for (const board of boards) {
        expect(board.filter(Boolean)).toHaveLength(96);
        const result = resolve(board);
        expect(result.chain).toBeGreaterThan(0);
        expect(result.board.filter(Boolean).length).toBeLessThan(96);
    }
    for (let pass = 0; pass < 3; pass++) for (const board of boards) resolve(board);

    const elapsed: number[] = [];
    for (let pass = 0; pass < 16; pass++) for (const board of boards) {
        const start = performance.now();
        resolve(board);
        elapsed.push(performance.now() - start);
    }
    elapsed.sort((a, b) => a - b);
    const p95 = elapsed[Math.ceil(0.95 * elapsed.length) - 1] ?? Infinity;
    console.info(`resolve : p95=${p95.toFixed(3)} ms sur ${String(elapsed.length)} mesures`);
    expect(p95).toBeLessThan(16);
}, 20_000);
