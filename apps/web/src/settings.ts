export interface Settings { highContrast: boolean; gestures: boolean; reducedMotion: boolean }

export const defaultSettings = (): Settings => ({
    highContrast: false,
    gestures: true,
    reducedMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
});

/** Étoiles de fin de niveau : une pour la victoire, une pour une réaction en chaîne, une pour l'économie de capsules. */
export function starsFor(won: boolean, stats: { capsules: number; bestChain: number; crystalsAtStart: number }): number {
    if (!won) return 0;
    return 1 + (stats.bestChain >= 2 ? 1 : 0) + (stats.capsules <= stats.crystalsAtStart ? 1 : 0);
}

/** Graine de partie : `?graine=` dans l'adresse (tests, partage), sinon tirée au hasard par le navigateur. */
export function newSeed(search: string): string {
    const fromUrl = new URLSearchParams(search).get('graine');
    if (fromUrl) return fromUrl;
    const bytes = new Uint32Array(2);
    crypto.getRandomValues(bytes);
    return [...bytes].map(v => v.toString(36)).join('-');
}
