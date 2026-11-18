import type { ActiveCapsule, Cell, Color, GameState } from '@capsule-panic/contracts';

const COLOR_OF: Record<string, Color> = { c: 'cyan', a: 'amber', m: 'magenta' };

/**
 * Plateau depuis 16 lignes de 8 caractères (lignes manquantes en haut = vides) :
 * `.` vide ; `C` `A` `M` obstacle cyan/ambre/magenta ; `c` `a` `m` segment isolé.
 */
export function boardFrom(rows: readonly string[]): Cell[] {
    const full = [...Array.from({ length: 16 - rows.length }, () => '........'), ...rows];
    const board: Cell[] = [];
    let n = 0;
    full.forEach(row => {
        if (row.length !== 8) throw new Error(`row "${row}" is not 8 wide`);
        for (const ch of row) {
            n++;
            if (ch === '.') board.push(null);
            else if (ch === ch.toUpperCase()) board.push({ kind: 'obstacle', id: `o${String(n)}`, color: COLOR_OF[ch.toLowerCase()] ?? 'cyan' });
            else board.push({ kind: 'segment', id: `s${String(n)}`, capsuleId: `s${String(n)}`, part: 0, color: COLOR_OF[ch] ?? 'cyan', linkedToId: null });
        }
    });
    return board;
}

/** Ajoute une paire intacte `id` : segment a en (x0,y0), segment b en (x1,y1). */
export function withPair(board: readonly Cell[], id: string, [x0, y0]: [number, number], [x1, y1]: [number, number], colors: [Color, Color]): Cell[] {
    const out = [...board];
    out[y0 * 8 + x0] = { kind: 'segment', id: `${id}a`, capsuleId: id, part: 0, color: colors[0], linkedToId: `${id}b` };
    out[y1 * 8 + x1] = { kind: 'segment', id: `${id}b`, capsuleId: id, part: 1, color: colors[1], linkedToId: `${id}a` };
    return out;
}

/** État en chute sur ce plateau, capsule active donnée (par défaut au point d'apparition). */
export function stateWith(board: readonly Cell[], active: Partial<ActiveCapsule> | null = {}, extra: Partial<GameState> = {}): GameState {
    return {
        schemaVersion: 1, ruleset: 'CP-CLASSIC-1', seed: 'test', rngState: [1, 2, 3, 4], width: 8, height: 16, board: [...board],
        active: active === null ? null : { id: 'c90', colors: ['cyan', 'amber'], x: 3, y: 1, orientation: 0, ...active },
        nextQueue: [['magenta', 'magenta']], phase: 'FALLING', score: 0, level: 0, speed: 'low',
        obstaclesRemaining: board.filter(c => c?.kind === 'obstacle').length, tick: 0, chainCount: 0, capsuleSerial: 99, ...extra
    };
}

/** Gel profond, pour prouver qu'une fonction ne modifie pas son argument. */
export function deepFreeze<T>(x: T): T {
    if (x && typeof x === 'object') { Object.values(x).forEach(deepFreeze); Object.freeze(x); }
    return x;
}
