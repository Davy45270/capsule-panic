import type { Speed } from '@capsule-panic/contracts';

/** Cadence : un TICK (un pas de chute) toutes les N images de la simulation à 60 Hz. */
export const FRAMES_PER_TICK: Readonly<Record<Speed, number>> = { low: 45, medium: 30, high: 15 };
const FRAME_MS = 1000 / 60;
/** Au retour d'une longue absence, on ne rattrape pas plus de 250 ms de simulation. */
const MAX_CATCH_UP_MS = 250;

export interface LoopOptions {
    speed: Speed;
    onTick: () => void;
    now?: () => number;
    schedule?: (cb: (time: number) => void) => number;
    cancel?: (handle: number) => void;
}

/** Boucle à pas fixe, découplée du rafraîchissement de l'écran. */
export function createLoop({ speed, onTick, now = () => performance.now(), schedule = cb => requestAnimationFrame(cb), cancel = h => cancelAnimationFrame(h) }: LoopOptions): { start(): void; stop(): void } {
    let handle: number | null = null;
    let last = 0, carry = 0, frames = 0;
    const frame = (time: number): void => {
        carry += Math.min(time - last, MAX_CATCH_UP_MS);
        last = time;
        while (carry >= FRAME_MS - 1e-6) {
            carry -= FRAME_MS;
            if (++frames >= FRAMES_PER_TICK[speed]) { frames = 0; onTick(); }
        }
        if (handle !== null) handle = schedule(frame);
    };
    return {
        start() { if (handle !== null) return; last = now(); carry = 0; handle = schedule(frame); },
        stop() { if (handle !== null) cancel(handle); handle = null; }
    };
}
