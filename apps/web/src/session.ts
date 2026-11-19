import { getLandingProjection, obstacleCount, step } from '@capsule-panic/engine';
import type { GameEvent, GameState, Position } from '@capsule-panic/contracts';
import type { CommandType } from '@capsule-panic/input';

export interface SessionHooks {
    render(state: GameState, ghost: readonly Position[]): void;
    play(events: readonly GameEvent[], before: GameState): Promise<void>;
    onChange?(state: GameState): void;
    onSpawn?(state: GameState): void;
    onEnd?(state: GameState): void;
}
export interface LevelStats {
    capsules: number;
    bestChain: number;
    crystalsAtStart: number;
}

/**
 * Une partie en cours côté application : soumet les commandes au moteur, fait jouer les animations, et ignore
 * (sans les mettre en file) les commandes reçues pendant une animation de résolution.
 */
export class GameSession {
    #state: GameState;
    #animating = false;
    #pauseAfterAnimation = false;
    readonly stats: LevelStats;
    constructor(
        state: GameState,
        private readonly hooks: SessionHooks,
    ) {
        this.#state = state;
        this.stats = {
            capsules: 0,
            bestChain: state.chainCount,
            crystalsAtStart: obstacleCount(state.level),
        };
        this.#show();
    }
    get state(): GameState {
        return this.#state;
    }
    get animating(): boolean {
        return this.#animating;
    }

    /** Applique une commande ; rend `false` si elle est ignorée (animation en cours) ou refusée par le moteur. */
    command(type: CommandType): boolean {
        if (this.#animating) return false;
        if (type === 'PAUSE' && this.#state.phase === 'PAUSED') return this.#apply('RESUME');
        return this.#apply(type);
    }
    tick(): void {
        if (!this.#animating) this.#apply('TICK');
    }
    togglePause(): void {
        this.command('PAUSE');
    }
    /** Onglet caché : la partie se met en pause et y reste jusqu'à une reprise explicite. */
    visibilityChanged(hidden: boolean): void {
        if (!hidden || this.#state.phase !== 'FALLING') return;
        if (this.#animating) this.#pauseAfterAnimation = true;
        else this.#apply('PAUSE');
    }

    #apply(type: CommandType): boolean {
        const before = this.#state;
        const t = step(before, { type });
        if (t.events.length === 0) return false;
        this.#state = t.state;
        if (t.events.some((e) => e.type === 'LOCKED')) {
            this.stats.capsules++;
            this.stats.bestChain = Math.max(this.stats.bestChain, t.state.chainCount);
        }
        const done = (): void => {
            if (t.events.some((e) => e.type === 'SPAWNED')) this.hooks.onSpawn?.(this.#state);
            if (this.#state.phase === 'WON' || this.#state.phase === 'LOST') this.hooks.onEnd?.(this.#state);
        };
        if (t.events.some((e) => e.type === 'MATCH_REMOVED')) {
            this.#animating = true;
            this.#show();
            const finish = (): void => {
                this.#animating = false;
                if (this.#pauseAfterAnimation) {
                    this.#pauseAfterAnimation = false;
                    this.#apply('PAUSE');
                } else this.#show();
                done();
            };
            void this.hooks.play(t.events, before).then(finish, finish);
        } else {
            this.#show();
            done();
        }
        return true;
    }
    #show(): void {
        this.hooks.render(this.#state, getLandingProjection(this.#state));
        this.hooks.onChange?.(this.#state);
    }
}
