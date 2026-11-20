import { getLandingProjection, obstacleCount, step } from '@capsule-panic/engine';
import type { BoardEvent, GameState, Position } from '@capsule-panic/contracts';
import type { CommandType } from '@capsule-panic/input';

export interface SessionHooks {
    render(state: GameState, ghost: readonly Position[], before?: GameState): void;
    play(events: readonly BoardEvent[], before: GameState): Promise<void>;
    playPlacement?(events: readonly BoardEvent[], before: GameState): Promise<void> | undefined;
    onChange?(state: GameState, spawned: boolean): void;
    /** Une promesse retarde la publication et la reprise des commandes jusqu'à la fin de l'écriture. */
    onSpawn?(state: GameState): void | Promise<void>;
    onEnd?(state: GameState): void;
}
export interface LevelStats {
    capsules: number;
    bestChain: number;
    crystalsAtStart: number;
}

export function initialLevelStats(state: GameState): LevelStats {
    return { capsules: 0, bestChain: state.chainCount, crystalsAtStart: obstacleCount(state.level) };
}

/** Suspend les transitions du moteur pendant la lecture d'une cascade et l'écriture du point de reprise. */
export class GameSession {
    #state: GameState;
    #playback: Promise<void> | undefined;
    #pauseWhenReady = false;
    #saving = false;
    #pendingCommands: CommandType[] = [];
    #drainingCommands = false;
    readonly stats: LevelStats;
    constructor(
        state: GameState,
        private readonly hooks: SessionHooks,
        stats = initialLevelStats(state),
    ) {
        this.#state = state;
        this.stats = { ...stats };
        this.#showIfReady();
        this.hooks.onChange?.(this.#state, false);
    }
    get state(): GameState {
        return this.#state;
    }
    get animating(): boolean {
        return this.#playback !== undefined || this.#saving;
    }

    /** Diffère la pause, refuse les autres commandes pendant la lecture et les conserve pendant l'écriture. */
    command(type: CommandType): boolean {
        if (type === 'PAUSE' && this.animating) {
            this.#pauseWhenReady = true;
            return true;
        }
        if (this.#playback) return false;
        if (this.#saving) {
            this.#pendingCommands.push(type);
            return true;
        }
        if (type === 'PAUSE' && this.#state.phase === 'PAUSED') return this.#apply('RESUME');
        return this.#apply(type);
    }
    tick(): void {
        if (!this.animating) this.#apply('TICK');
    }
    togglePause(): void {
        this.command('PAUSE');
    }
    /** Onglet caché : la partie se met en pause et y reste jusqu'à une reprise explicite. */
    visibilityChanged(hidden: boolean): void {
        if (!hidden || this.#state.phase !== 'FALLING') return;
        if (this.animating) this.#pauseWhenReady = true;
        else this.#apply('PAUSE');
    }

    #apply(type: CommandType): boolean {
        const before = this.#state;
        const t = step(before, { type });
        if (t.events.length === 0) return false;
        this.#state = t.state;
        const locked = t.events.some((e) => e.type === 'LOCKED');
        if (locked) {
            this.stats.capsules++;
            this.stats.bestChain = Math.max(this.stats.bestChain, t.state.chainCount);
        }
        const spawned = t.events.some((event) => event.type === 'SPAWNED');
        const motion = t.events.some((e) => e.type === 'MOVED' || e.type === 'ROTATED') ? before : undefined;
        const publish = (): void => {
            this.#saving = false;
            this.#pauseIfRequested();
            this.hooks.onChange?.(this.#state, spawned);
            this.#showIfReady(motion);
            this.#drainCommands();
        };
        const finishPlayback = (): void => {
            this.#playback = undefined;
            const checkpoint = spawned ? this.hooks.onSpawn?.(this.#state) : undefined;
            if (checkpoint) {
                this.#saving = true;
                void checkpoint.then(publish, publish);
            } else publish();
        };
        if (locked) {
            const matched = t.events.some((e) => e.type === 'MATCH_REMOVED');
            if (matched) this.#playback = this.hooks.play(t.events, before);
            else {
                const placement = this.hooks.playPlacement?.(t.events, before);
                void placement?.catch(() => undefined);
            }
        }
        if (this.#playback) void this.#playback.then(finishPlayback, finishPlayback);
        else finishPlayback();
        return true;
    }
    #drainCommands(): void {
        if (this.#drainingCommands) return;
        this.#drainingCommands = true;
        while (!this.animating) {
            const type = this.#pendingCommands.shift();
            if (!type) break;
            this.command(type);
        }
        this.#drainingCommands = false;
    }
    #pauseIfRequested(): void {
        if (!this.#pauseWhenReady) return;
        this.#pauseWhenReady = false;
        this.#state = step(this.#state, { type: 'PAUSE' }).state;
    }
    #showIfReady(before?: GameState): void {
        if (this.animating) return;
        this.hooks.render(this.#state, getLandingProjection(this.#state), before);
        if (this.#state.phase === 'WON' || this.#state.phase === 'LOST') this.hooks.onEnd?.(this.#state);
    }
}
