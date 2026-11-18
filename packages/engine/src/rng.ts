// PRNG xoshiro128** à état explicite : chaque fonction rend la valeur ET le nouvel état, sans rien modifier.
export type RngState = [number, number, number, number];

const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;

/** Graine textuelle → quatre uint32 (cyrb128). Un état tout à zéro, interdit pour xoshiro, est remplacé. */
export function seedToState(seed: string): RngState {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0; i < seed.length; i++) {
        const k = seed.charCodeAt(i);
        h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
        h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
        h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
        h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= h2 ^ h3 ^ h4;
    h2 ^= h1;
    h3 ^= h1;
    h4 ^= h1;
    return nonZero([h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0]);
}

/** xoshiro reste bloqué sur l'état nul : il est remplacé par une constante fixe. */
export function nonZero(state: RngState): RngState {
    return state.every(v => v === 0) ? [0x9e3779b9, 0x243f6a88, 0xb7e15162, 0x6a09e667] : state;
}

/** Une sortie uint32 de xoshiro128** et l'état suivant. */
export function nextUint32([a, b, c, d]: Readonly<RngState>): [number, RngState] {
    const result = Math.imul(rotl(Math.imul(b, 5) >>> 0, 7), 9) >>> 0;
    const t = (b << 9) >>> 0;
    c = (c ^ a) >>> 0;
    d = (d ^ b) >>> 0;
    b = (b ^ c) >>> 0;
    a = (a ^ d) >>> 0;
    c = (c ^ t) >>> 0;
    d = rotl(d, 11);
    return [result, [a, b, c, d]];
}

/** Entier uniforme dans [0, max) par rejet (pas de biais de modulo). */
export function randomInt(max: number, s: Readonly<RngState>): [number, RngState] {
    if (!Number.isInteger(max) || max < 1 || max > 0x100000000) throw new RangeError(`randomInt: max ${String(max)}`);
    const limit = Math.floor(0x100000000 / max) * max;
    let state: RngState = [s[0], s[1], s[2], s[3]];
    for (;;) {
        const [v, next] = nextUint32(state);
        state = next;
        if (v < limit) return [v % max, state];
    }
}

/** Mélange de Fisher–Yates, sur une copie. */
export function shuffle<T>(items: readonly T[], s: Readonly<RngState>): [T[], RngState] {
    const out = [...items];
    let state: RngState = [s[0], s[1], s[2], s[3]];
    for (let i = out.length - 1; i > 0; i--) {
        const [j, next] = randomInt(i + 1, state);
        state = next;
        [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return [out, state];
}
