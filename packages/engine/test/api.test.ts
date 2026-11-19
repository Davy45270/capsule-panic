import { expectTypeOf, it } from 'vitest';
import type { GameCommand, GameState, Position, Transition } from '@capsule-panic/contracts';
import {
    createGame,
    getAvailableMoves,
    getLandingProjection,
    restore,
    serialize,
    step,
} from '@capsule-panic/engine';
import type { GameConfig, Move } from '@capsule-panic/engine';

it('[E483] un consommateur peut typer ses appels à l’API publique du moteur', () => {
    expectTypeOf(createGame).toEqualTypeOf<(config: GameConfig) => GameState>();
    expectTypeOf(step).toEqualTypeOf<(state: Readonly<GameState>, command: GameCommand) => Transition>();
    expectTypeOf(getAvailableMoves).toEqualTypeOf<(state: Readonly<GameState>) => Move[]>();
    expectTypeOf(getLandingProjection).toEqualTypeOf<(state: Readonly<GameState>) => Position[]>();
    expectTypeOf(serialize).toEqualTypeOf<(state: GameState) => string>();
    expectTypeOf(restore).toEqualTypeOf<(json: string) => GameState>();
});
