import { HEIGHT, WIDTH } from '@capsule-panic/contracts';

export const GUTTER = 16;

/** Taille de case et origine du réacteur 8 × 16 dans un espace donné, cases carrées, marge de 16 px. */
export function boardLayout(width: number, height: number): { cell: number; originX: number; originY: number } {
    const cell = Math.max(8, Math.floor(Math.min((width - 2 * GUTTER) / WIDTH, (height - 2 * GUTTER) / HEIGHT)));
    return { cell, originX: (width - cell * WIDTH) / 2, originY: (height - cell * HEIGHT) / 2 };
}
