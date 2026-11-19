import { describe, it, expect } from 'vitest';
import type { Cell, Color } from '@capsule-panic/contracts';
import { findMatches } from '../src/match';
import { generateBoard, GenerationError, MAX_REJECTIONS, obstacleCount, placeObstacles } from '../src/generate';
import { canPlace, SPAWN } from '../src/capsule';
import { seedToState } from '../src/rng';

const empty = (): Cell[] => Array.from({ length: 128 }, () => null);
const obstacle = (id: string, color: Color): Cell => ({ kind: 'obstacle', id, color });
function hasInitialRun(board: readonly Cell[]): boolean {
    const suffix = [1, 2, 3];
    return board.some((cell, index) => cell !== null && (
        (index % 8 <= 4 && suffix.every(offset => board[index + offset]?.color === cell.color)) ||
        (index < 13 * 8 && suffix.every(offset => board[index + 8 * offset]?.color === cell.color))
    ));
}

const seeds = Array.from({ length: Number(process.env.GEN_SEEDS ?? 200) }, (_, i) => `graine-${String(i)}`);

describe('findMatches', () => {
    it('finds a horizontal run of 4 and ignores a run of 3', () => {
        const b = empty();
        for (const x of [0, 1, 2, 3]) b[15 * 8 + x] = obstacle(`h${String(x)}`, 'cyan');
        for (const x of [5, 6, 7]) b[14 * 8 + x] = obstacle(`t${String(x)}`, 'amber');
        expect([...findMatches(b)].sort((a, c) => a - c)).toEqual([120, 121, 122, 123]);
    });
    it('finds a vertical run of 5 and unions a cross without duplicates', () => {
        const b = empty();
        for (const y of [8, 9, 10, 11, 12]) b[y * 8 + 3] = obstacle(`v${String(y)}`, 'magenta');
        for (const x of [0, 1, 2, 4]) b[10 * 8 + x] = obstacle(`x${String(x)}`, 'magenta');
        expect(findMatches(b).size).toBe(9);
    });
    it('different colours never match together', () => {
        const b = empty();
        b[120] = obstacle('a', 'cyan'); b[121] = obstacle('b', 'amber'); b[122] = obstacle('c', 'cyan'); b[123] = obstacle('d', 'cyan');
        expect(findMatches(b).size).toBe(0);
    });
});

describe('generation', () => {
    it('[E096] obstacleCount follows min(4 + 4 x level, 72)', () => {
        expect([0, 5, 16, 17, 20].map(obstacleCount)).toEqual([4, 24, 68, 72, 72]);
    });
    it('[E032][E097][E259][E260] T25 no initial match, T26 cells in bounds, rows y >= 5 only, exact count and ids', () => {
        for (const [level, count] of [[0, 4], [10, 44], [20, 72]] as const) for (const seed of seeds.slice(0, 70)) {
            const { board } = generateBoard(level, seedToState(seed));
            expect(board).toHaveLength(128);
            expect(canPlace(board, SPAWN)).toBe(true);
            expect(hasInitialRun(board)).toBe(false);
            const placed = board.flatMap((c, i) => (c ? [{ c, i }] : []));
            expect(placed).toHaveLength(count);
            expect(placed.every(({ i }) => i >= 40 && i < 128)).toBe(true);
            expect(placed.map(({ c }) => c.id).sort()).toEqual(Array.from({ length: count }, (_, k) => `o${String(k + 1)}`).sort());
        }
    });
    it('level 20 generates for every seed', () => {
        for (const seed of seeds) expect(() => generateBoard(20, seedToState(seed))).not.toThrow();
    });
    it('same seed same board, different seed different board', () => {
        const a = generateBoard(5, seedToState('x'));
        expect(generateBoard(5, seedToState('x'))).toEqual(a);
        expect(generateBoard(5, seedToState('y')).board).not.toEqual(a.board);
    });
    it('[E317] stable vector for seed "capsule", level 0', () => {
        const { board } = generateBoard(0, seedToState('capsule'));
        expect(board.flatMap((c, i) => (c ? [`${String(i)}:${c.color}`] : []))).toEqual(GOLDEN_LEVEL_0);
        expect(findMatches(board).size).toBe(0);
    });
    it('fails with GenerationError when no position is left', () => {
        expect(() => placeObstacles(empty(), 89, seedToState('z'))).toThrow(GenerationError);
        expect(() => placeObstacles(empty(), 89, seedToState('z'))).toThrow(/position/);
    });
    it('[E210] rejette la case qui créerait un alignement et respecte le plafond d’essais', () => {
        const b = empty();
        for (let i = 40; i < 128; i++) b[i] = obstacle(`f${String(i)}`, 'cyan');
        // (0,5) is the only free cell, and each colour would complete a run of four through it.
        b[40] = null;
        for (const [x, y, color] of [[1, 5, 'cyan'], [2, 5, 'cyan'], [3, 5, 'cyan'], [0, 6, 'amber'], [0, 7, 'amber'], [0, 8, 'amber'], [0, 2, 'magenta'], [0, 3, 'magenta'], [0, 4, 'magenta']] as const) {
            b[y * 8 + x] = obstacle(`p${String(x)}-${String(y)}`, color);
        }
        expect(MAX_REJECTIONS).toBe(1000);
        expect(() => placeObstacles(b, 1, seedToState('z'), 1)).toThrow(/1 rejets/);
        expect(() => placeObstacles(b, 1, seedToState('z'))).toThrow(GenerationError);
        expect(b[40]).toBeNull();
        expect(canPlace(generateBoard(20, seedToState('z')).board, SPAWN)).toBe(true);
    });
    it('never mutates the board it receives', () => {
        const b = Object.freeze(empty());
        expect(() => placeObstacles(b, 4, seedToState('q'))).not.toThrow();
        expect(b.every(c => c === null)).toBe(true);
    });
});

const GOLDEN_LEVEL_0: string[] = ['83:magenta', '86:magenta', '98:magenta', '127:cyan'];

it('[E487] un tirage sur deux cases libres ne peut pas reprendre la première', () => {
    const board = empty();
    for (let i = 40; i < 128; i++) board[i] = obstacle(`r${String(i)}`, 'cyan');
    board[40] = null;
    board[47] = null;
    // L'ambre reste possible aux deux extrémités de la rangée.
    // Cette graine reprendrait l’index 0 au second tirage si la liste restait inchangée.
    const result = placeObstacles(board, 2, seedToState('sans-remise-6'));
    expect([result.board[40]?.id, result.board[47]?.id].sort()).toEqual(['o1', 'o2']);
    expect(board[40]).toBeNull();
    expect(board[47]).toBeNull();
});
