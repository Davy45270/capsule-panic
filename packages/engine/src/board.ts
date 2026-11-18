import { HEIGHT, WIDTH } from '@capsule-panic/contracts';
import type { Cell, Color } from '@capsule-panic/contracts';

export const index = (x: number, y: number): number => y * WIDTH + x;
export const inBounds = (x: number, y: number): boolean => x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;
export const cellAt = (board: readonly Cell[], x: number, y: number): Cell => (inBounds(x, y) ? board[index(x, y)] ?? null : null);
export const colorAt = (board: readonly Cell[], x: number, y: number): Color | null => cellAt(board, x, y)?.color ?? null;
