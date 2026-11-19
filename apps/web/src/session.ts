import { getLandingProjection, obstacleCount, step } from '@capsule-panic/engine';
import type { BoardEvent, GameState, Position } from '@capsule-panic/contracts';
import type { CommandType } from '@capsule-panic/input';

export interface SessionHooks {
    render(state: GameState, ghost: readonly Position[]): void;
    play(events: readonly BoardEvent[], before: GameState): Promise<void>;
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

/**
 * Une partie en cours côté application : soumet les commandes au moteur, fait jouer les animations, et ignore
 * (sans les mettre en file) les commandes reçues pendant une animation de résolution.
 */
export class GameSession {
    #state: GameState;
    #animating = false;
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
        if (this.#saving) {
            this.#pendingCommands.push(type);
            return true;
        }
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
        if (this.#animating) this.#pauseWhenReady = true;
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
        const spawned = t.events.some((event) => event.type === 'SPAWNED');
        const publish = (): void => {
            this.#saving = false;
            this.#animating = false;
            this.#pauseIfRequested();
            this.#show(spawned);
            if (this.#state.phase === 'WON' || this.#state.phase === 'LOST') this.hooks.onEnd?.(this.#state);
            this.#drainCommands();
        };
        const finish = (): void => {
            this.#pauseIfRequested();
            const checkpoint = spawned ? this.hooks.onSpawn?.(this.#state) : undefined;
            if (checkpoint) {
                this.#saving = true;
                this.#animating = true;
                void checkpoint.then(publish, publish);
            } else publish();
        };
        if (t.events.some((e) => e.type === 'MATCH_REMOVED')) {
            this.#animating = true;
            void this.hooks.play(t.events, before).then(finish, finish);
        } else {
            finish();
        }
        return true;
    }
    #drainCommands(): void {
        if (this.#drainingCommands) return;
        this.#drainingCommands = true;
        while (!this.#animating) {
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
    #render(): void {
        this.hooks.render(this.#state, getLandingProjection(this.#state));
    }
    #show(spawned = false): void {
        this.#render();
        this.hooks.onChange?.(this.#state, spawned);
    }
}
