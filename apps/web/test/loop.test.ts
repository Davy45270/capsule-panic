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
    it('[E029][E045][E157][E158][E159] emits one TICK every 45 / 30 / 15 frames at low / medium / high', () => {
        expect(FRAMES_PER_TICK).toEqual({ low: 45, medium: 30, high: 15 });
        for (const [speed, frames] of [['low', 45], ['medium', 30], ['high', 15]] as const) {
            for (const refreshHz of [30, 60, 120]) {
                const clock = manualClock();
                let ticks = 0;
                createLoop({ speed, onTick: () => { ticks++; }, ...clock }).start();
                clock.advance(Math.ceil(frames * refreshHz / 60) - 1, 1000 / refreshHz);
                expect(ticks).toBe(0);
                clock.advance(1, 1000 / refreshHz);
                expect(ticks).toBe(1);
            }
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

it('synchronise une commande arrivée après un tick, même entre deux images', () => {
    for (const lastFrame of [700, 750]) {
        let time = 0;
        let draw = (_time: number): void => undefined;
        let ticks = 0;
        const loop = createLoop({
            speed: 'low',
            now: () => time,
            schedule: (callback) => {
                draw = callback;
                return 1;
            },
            onTick: () => {
                ticks++;
            },
        });
        loop.start();
        for (time = 100; time <= 700; time += 100) draw(time);
        time = lastFrame;
        draw(time);
        time = 760;
        loop.sync();
        expect(ticks).toBe(1);
        time = 800;
        draw(time);
        expect(ticks).toBe(1);
        time = 1000;
        draw(time);
        time = 1250;
        draw(time);
        time = 1500;
        draw(time);
        expect(ticks).toBe(2);
    }
});
