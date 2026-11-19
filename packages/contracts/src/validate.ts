import type { ErrorObject } from 'ajv';
import { checkShape, checkPuzzle } from './schema-validators.mjs';
import { HEIGHT, ORIENTATION_OFFSETS, WIDTH } from './types';
import type { GameState, SegmentCell } from './types';

function describeErrors(errors: ErrorObject[] | null | undefined): string[] {
    return (errors ?? []).map(error => {
        const unknownField: unknown = error.params['additionalProperty'];
        const detail = typeof unknownField === 'string' ? `: ${unknownField}` : '';
        return `${error.instancePath || '/'} ${error.message ?? 'invalid'}${detail}`;
    });
}

export type Validation = { ok: true; value: GameState } | { ok: false; errors: string[] };

const inBounds = (x: number, y: number): boolean => x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;

/** Invariants que le schéma ne peut pas exprimer : identifiants, liens des paires, compteurs, capsule active. */
function invariantErrors(state: GameState): string[] {
    const errors: string[] = [];
    if (state.nextQueue.length !== 1) errors.push('/nextQueue must contain exactly one capsule');
    const seen = new Set<string>();
    const segments = new Map<string, { cell: SegmentCell; x: number; y: number }>();
    let obstacles = 0;
    state.board.forEach((cell, i) => {
        if (!cell) return;
        if (seen.has(cell.id)) errors.push(`duplicate id ${cell.id}`);
        seen.add(cell.id);
        if (cell.kind === 'obstacle') obstacles++;
        else segments.set(cell.id, { cell, x: i % WIDTH, y: Math.floor(i / WIDTH) });
    });
    for (const { cell, x, y } of segments.values()) {
        if (cell.linkedToId === null) continue;
        const other = segments.get(cell.linkedToId);
        if (!other) { errors.push(`segment ${cell.id}: dangling link to ${cell.linkedToId}`); continue; }
        if (other.cell.linkedToId !== cell.id) errors.push(`segment ${cell.id}: link to ${other.cell.id} is not reciprocal`);
        if (other.cell.capsuleId !== cell.capsuleId) errors.push(`segment ${cell.id}: linked to another capsule`);
        if (other.cell.part === cell.part) errors.push(`segment ${cell.id}: linked segments share part ${String(cell.part)}`);
        if (Math.abs(other.x - x) + Math.abs(other.y - y) !== 1) errors.push(`segment ${cell.id}: linked segment ${other.cell.id} is not adjacent`);
    }
    if (obstacles !== state.obstaclesRemaining) errors.push(`obstaclesRemaining ${String(state.obstaclesRemaining)} but ${String(obstacles)} obstacles on the board`);
    const active = state.active;
    if (active) {
        const offset = ORIENTATION_OFFSETS[active.orientation];
        for (const [x, y] of [[active.x, active.y], [active.x + offset.x, active.y + offset.y]] as const) {
            if (!inBounds(x, y)) errors.push(`active capsule ${active.id}: cell (${String(x)},${String(y)}) out of bounds`);
            else if (state.board[y * WIDTH + x]) errors.push(`active capsule ${active.id}: cell (${String(x)},${String(y)}) is occupied`);
        }
        if (seen.has(active.id) || seen.has(`${active.id}a`) || seen.has(`${active.id}b`) || [...segments.values()].some(s => s.cell.capsuleId === active.id)) errors.push(`active capsule ${active.id}: id already used on the board`);
    }
    return errors;
}

/** Valide un état inconnu : schéma JSON d'abord, puis invariants. */
export function validateGameState(x: unknown): Validation {
    if (!checkShape(x)) {
        return { ok: false, errors: describeErrors(checkShape.errors) };
    }
    const state = x;
    const errors = invariantErrors(state);
    return errors.length ? { ok: false, errors } : { ok: true, value: state };
}

/** Forme d'un puzzle (schéma seulement ; la solvabilité relève du solveur). */
export function validatePuzzleShape(x: unknown): string[] {
    return checkPuzzle(x) ? [] : describeErrors(checkPuzzle.errors);
}
