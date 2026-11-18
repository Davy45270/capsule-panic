import { HEIGHT, WIDTH } from '@capsule-panic/contracts';
import type { Cell } from '@capsule-panic/contracts';
import { colorAt, index } from './board';

export const MIN_RUN = 4;

/** Indices des cases appartenant à un alignement maximal ≥ 4 de même couleur, horizontal ou vertical (union). */
export function findMatches(board: readonly Cell[]): Set<number> {
    const found = new Set<number>();
    const scan = (length: number, lines: number, at: (line: number, k: number) => [number, number]): void => {
        for (let line = 0; line < lines; line++) {
            let start = 0;
            for (let k = 1; k <= length; k++) {
                const [sx, sy] = at(line, start);
                const color = colorAt(board, sx, sy);
                const [kx, ky] = at(line, k);
                if (k < length && color !== null && colorAt(board, kx, ky) === color) continue;
                if (color !== null && k - start >= MIN_RUN) for (let j = start; j < k; j++) { const [x, y] = at(line, j); found.add(index(x, y)); }
                start = k;
            }
        }
    };
    scan(WIDTH, HEIGHT, (y, x) => [x, y]);
    scan(HEIGHT, WIDTH, (x, y) => [x, y]);
    return found;
}
