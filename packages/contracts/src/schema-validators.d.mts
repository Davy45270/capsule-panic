import type { ValidateFunction } from 'ajv';
import type { GameState } from './types';

export const checkShape: ValidateFunction<GameState>;
export const checkPuzzle: ValidateFunction;
