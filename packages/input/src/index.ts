import type { GameCommand } from '@capsule-panic/contracts';

export type CommandType = GameCommand['type'];

const KEYS: Readonly<Record<string, CommandType>> = {
    ArrowLeft: 'MOVE_LEFT', ArrowRight: 'MOVE_RIGHT', ArrowDown: 'SOFT_DROP', ArrowUp: 'ROTATE_CW', ' ': 'HARD_DROP',
    x: 'ROTATE_CW', X: 'ROTATE_CW', z: 'ROTATE_CCW', Z: 'ROTATE_CCW', p: 'PAUSE', P: 'PAUSE', Escape: 'PAUSE'
};

/** Touche du clavier → commande de jeu (la bascule pause / reprise est faite par l'application). */
export const mapKey = (key: string): CommandType | null => KEYS[key] ?? null;

/** Geste tactile facultatif : toucher court = rotation, glisser horizontal = une case par largeur de case, glisser vers le bas = descente brusque. */
export function gestureCommands({ dx, dy, ms, cell }: { dx: number; dy: number; ms: number; cell: number }): CommandType[] {
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax < 12 && ay < 12) return ms < 300 ? ['ROTATE_CW'] : [];
    if (ax > ay) return Array.from({ length: Math.max(1, Math.round(ax / cell)) }, () => (dx < 0 ? 'MOVE_LEFT' : 'MOVE_RIGHT'));
    if (dy > 2 * cell) return ['HARD_DROP'];
    return [];
}
