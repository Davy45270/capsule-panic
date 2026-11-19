import type { Cell, GameState } from '../src/types';

/** État valide écrit à la main : deux cristaux, capsule active au point d'apparition, une capsule en file. */
export function validState(): GameState {
    const board: Cell[] = Array.from({ length: 128 }, () => null);
    board[15 * 8 + 0] = { kind: 'obstacle', id: 'o1', color: 'cyan' };
    board[15 * 8 + 7] = { kind: 'obstacle', id: 'o2', color: 'magenta' };
    return {
        schemaVersion: 1, ruleset: 'CP-CLASSIC-1', seed: 'fixture', rngState: [1, 2, 3, 4], width: 8, height: 16, board,
        active: { id: 'c1', colors: ['amber', 'cyan'], x: 3, y: 1, orientation: 0 }, nextQueue: [['magenta', 'magenta']],
        phase: 'FALLING', score: 0, level: 0, speed: 'low', obstaclesRemaining: 2, tick: 0, chainCount: 0
    };
}

/** Une paire verrouillée horizontale en bas, segments c3a (3,15) et c3b (4,15). */
export function withLockedPair(state: GameState): GameState {
    const board = [...state.board];
    board[15 * 8 + 3] = { kind: 'segment', id: 'c3a', capsuleId: 'c3', part: 0, color: 'amber', linkedToId: 'c3b' };
    board[15 * 8 + 4] = { kind: 'segment', id: 'c3b', capsuleId: 'c3', part: 1, color: 'cyan', linkedToId: 'c3a' };
    return { ...state, board };
}
