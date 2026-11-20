import type { Speed } from '@capsule-panic/contracts';
export interface Settings {
    highContrast: boolean;
    gestures: boolean;
    reducedMotion: boolean;
    colorBlind: boolean;
    debug: boolean;
    level: number;
    speed: Speed;
}

export const defaultSettings = (): Settings => ({
    highContrast: false,
    gestures: true,
    colorBlind: false,
    debug: false,
    level: 0,
    speed: 'low',
    reducedMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
});

/** Graine de partie : `?graine=` dans l'adresse (tests, partage), sinon tirée au hasard par le navigateur. */
export function newSeed(search: string): string {
    const fromUrl = new URLSearchParams(search).get('graine');
    if (fromUrl) return fromUrl;
    const bytes = new Uint32Array(2);
    crypto.getRandomValues(bytes);
    return [...bytes].map((v) => v.toString(36)).join('-');
}
