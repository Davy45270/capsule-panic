// Art original de Capsule Panic (CC BY 4.0) : cristaux instables à facettes, cellules d'énergie biseautées
// reliées par un pont lumineux. Formes et couleurs décrites ici une seule fois, pour PixiJS et pour le SVG du DOM.
import type { Color } from '@capsule-panic/contracts';

export const TOKENS = { fond: '#111827', panneau: '#1F2937', cyan: '#38BDF8', amber: '#FBBF24', magenta: '#F472B6', texte: '#F9FAFB' } as const;
export const COLOR_HEX: Readonly<Record<Color, string>> = { cyan: TOKENS.cyan, amber: TOKENS.amber, magenta: TOKENS.magenta };
export type Shape = 'hexagon' | 'triangle' | 'diamond';
/** La forme accompagne toujours la couleur : jamais de distinction par la couleur seule. */
export const SHAPE_OF: Readonly<Record<Color, Shape>> = { cyan: 'hexagon', amber: 'triangle', magenta: 'diamond' };

/** Sommets (x, y à plat) d'une forme centrée en (cx, cy), de rayon r. */
export function shapePoints(shape: Shape, cx: number, cy: number, r: number): number[] {
    const sides = { hexagon: 6, triangle: 3, diamond: 4 }[shape];
    const start = shape === 'hexagon' ? Math.PI / 6 : -Math.PI / 2;
    const squash = shape === 'diamond' ? 0.72 : 1;
    const points: number[] = [];
    for (let k = 0; k < sides; k++) {
        const a = start + (2 * Math.PI * k) / sides;
        points.push(round(cx + r * Math.cos(a) * squash), round(cy + r * Math.sin(a) + (shape === 'triangle' ? r * 0.15 : 0)));
    }
    return points;
}

/** Carré à coins biseautés (octogone) : le corps d'une cellule d'énergie. */
export function cellPoints(x: number, y: number, size: number): number[] {
    const b = size * 0.22;
    return [x + b, y, x + size - b, y, x + size, y + b, x + size, y + size - b, x + size - b, y + size, x + b, y + size, x, y + size - b, x, y + b].map(round);
}

export type AnimationKind = 'lock' | 'match' | 'gravity' | 'combo';
const DURATION: Readonly<Record<AnimationKind, number>> = { lock: 120, gravity: 120, match: 250, combo: 350 };
/** Durées de la direction artistique (120 à 350 ms) ; zéro quand le mouvement réduit est demandé. */
export const animationDuration = (kind: AnimationKind, reducedMotion: boolean): number => (reducedMotion ? 0 : DURATION[kind]);

const round = (v: number): number => Math.round(v * 100) / 100;
const poly = (points: number[]): string => points.join(' ');

/** Cristal instable : forme pleine, facette intérieure sombre, contour clair. */
export function crystalSvg(color: Color, size = 32, highContrast = false): string {
    const c = size / 2;
    const shape = SHAPE_OF[color];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(size)} ${String(size)}" width="${String(size)}" height="${String(size)}">`
        + `<polygon points="${poly(shapePoints(shape, c, c, size * 0.44))}" fill="${COLOR_HEX[color]}" stroke="${TOKENS.texte}" stroke-width="${String(highContrast ? size * 0.1 : size * 0.05)}" stroke-linejoin="round"/>`
        + `<polygon points="${poly(shapePoints(shape, c, c, size * 0.2))}" fill="${TOKENS.fond}" opacity="0.4"/></svg>`;
}

/** Corps de cellule et petit glyphe de sa couleur, à placer en (x, y). */
function cellBody(color: Color, x: number, y: number, size: number): string {
    return `<g data-part="cell"><polygon points="${poly(cellPoints(x, y, size))}" fill="${COLOR_HEX[color]}" stroke="${TOKENS.texte}" stroke-width="${String(size * 0.05)}"/>`
        + `<polygon points="${poly(shapePoints(SHAPE_OF[color], x + size / 2, y + size / 2, size * 0.22))}" fill="${TOKENS.fond}" opacity="0.55"/></g>`;
}

/** Cellule d'énergie isolée. */
export function cellSvg(color: Color, size = 32): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(size)} ${String(size)}" width="${String(size)}" height="${String(size)}">${cellBody(color, 0, 0, size)}</svg>`;
}

/** Capsule horizontale (aperçu « Suivant ») : deux cellules et le pont lumineux qui les relie. */
export function capsuleSvg(colors: readonly [Color, Color], size = 32): string {
    const w = size * 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(w)} ${String(size)}" width="${String(w)}" height="${String(size)}">`
        + cellBody(colors[0], 0, 0, size) + cellBody(colors[1], size, 0, size)
        + `<rect data-part="bridge" x="${String(size * 0.8)}" y="${String(size * 0.4)}" width="${String(size * 0.4)}" height="${String(size * 0.2)}" rx="${String(size * 0.1)}" fill="${TOKENS.texte}" opacity="0.85"/></svg>`;
}
