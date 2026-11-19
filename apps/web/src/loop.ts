import type { Speed } from '@capsule-panic/contracts';

/** Cadence : un TICK (un pas de chute) toutes les N images de la simulation à 60 Hz. */
export const FRAMES_PER_TICK: Readonly<Record<Speed, number>> = { low: 45, medium: 30, high: 15 };
const FRAME_MS = 1000 / 60;
/** Au retour d'une longue absence, on ne rattrape pas plus de 250 ms de simulation. */
const MAX_CATCH_UP_MS = 250;

export interface LoopOptions {
    speed: Speed;
    onTick: () => void;
    onFrame?: (elapsed: number) => void;
    now?: () => number;
    schedule?: (cb: (time: number) => void) => number;
    cancel?: (handle: number) => void;
}

/** Boucle à pas fixe, découplée du rafraîchissement de l'écran. */
export function createLoop({
    speed,
    onTick,
    onFrame,
    now = () => performance.now(),
    schedule = (cb) => requestAnimationFrame(cb),
    cancel = (h) => cancelAnimationFrame(h),
}: LoopOptions): { start(): void; stop(): void; sync(): void; resetCadence(): void } {
    let handle: number | null = null;
    let last = 0,
        lastFrame = 0,
        carry = 0,
        frames = 0;
    const advance = (time: number): void => {
        const elapsed = Math.max(0, time - last);
        carry += Math.min(elapsed, MAX_CATCH_UP_MS);
        last += elapsed;
        while (carry >= FRAME_MS - 1e-6) {
            carry -= FRAME_MS;
            if (++frames >= FRAMES_PER_TICK[speed]) {
                frames = 0;
                onTick();
            }
        }
    };
    const frame = (time: number): void => {
        onFrame?.(time - lastFrame);
        lastFrame = time;
        advance(time);
        if (handle !== null) handle = schedule(frame);
    };
    return {
        sync() {
            if (handle !== null) advance(now());
        },
        resetCadence() {
            last = Math.max(last, now());
            frames = 0;
            carry = 0;
        },
        start() {
            if (handle !== null) return;
            last = lastFrame = now();
            carry = 0;
            handle = schedule(frame);
        },
        stop() {
            if (handle !== null) cancel(handle);
            handle = null;
        },
    };
}
