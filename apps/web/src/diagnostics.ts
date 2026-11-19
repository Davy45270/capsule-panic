interface Metrics {
    durationMs: number;
    frames: number;
    fps: number;
    crashes: number;
}

const STORAGE_KEY = 'capsule-panic-metriques';

function update(durationMs: number, frames: number, crashes: number): void {
    try {
        const previous = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Metrics>;
        const duration = (previous.durationMs ?? 0) + durationMs;
        const totalFrames = (previous.frames ?? 0) + frames;
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                durationMs: duration,
                frames: totalFrames,
                fps: duration ? Math.round((1000 * totalFrames) / duration) : 0,
                crashes: (previous.crashes ?? 0) + crashes,
            } satisfies Metrics),
        );
    } catch {
        // Le jeu reste disponible si le navigateur bloque le stockage local.
    }
}

export const recordFrames = (durationMs: number, frames: number): void => update(durationMs, frames, 0);
export const recordCrash = (): void => update(0, 0, 1);

export function debug(
    enabled: boolean,
    event: 'partie ouverte' | 'partie terminée' | 'rendu indisponible',
): void {
    if (enabled) console.debug('Capsule Panic', event);
}
