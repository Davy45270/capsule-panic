import { describe, it, expect } from 'vitest';
import { createLoop, FRAMES_PER_TICK } from '../src/loop';

/** Horloge manuelle : `advance(n)` joue n images de 1/60 s. */
function manualClock() {
    let t = 0;
    let pending: ((time: number) => void) | null = null;
    return {
        now: () => t,
        schedule: (cb: (time: number) => void) => { pending = cb; return 1; },
        cancel: () => { pending = null; },
        advance(frames: number, frameMs = 1000 / 60) { for (let i = 0; i < frames; i++) { t += frameMs; const cb = pending; pending = null; cb?.(t); } }
    };
}

describe('fixed-step loop', () => {
    it('emits one TICK every 45 / 30 / 15 frames at low / medium / high', () => {
        expect(FRAMES_PER_TICK).toEqual({ low: 45, medium: 30, high: 15 });
        for (const [speed, expected] of [['low', 1], ['medium', 2], ['high', 4]] as const) {
            const clock = manualClock();
            let ticks = 0;
            createLoop({ speed, onTick: () => { ticks++; }, ...clock }).start();
            clock.advance(60);
            expect(ticks).toBe(expected);
        }
    });
    it('stop() stops the ticks', () => {
        const clock = manualClock();
        let ticks = 0;
        const loop = createLoop({ speed: 'high', onTick: () => { ticks++; }, ...clock });
        loop.start();
        clock.advance(15);
        loop.stop();
        clock.advance(60);
        expect(ticks).toBe(1);
    });
    it('a long gap between frames does not replay the missed ticks', () => {
        const clock = manualClock();
        let ticks = 0;
        createLoop({ speed: 'high', onTick: () => { ticks++; }, ...clock }).start();
        clock.advance(1, 30_000);
        expect(ticks).toBeLessThanOrEqual(1);
    });
});
