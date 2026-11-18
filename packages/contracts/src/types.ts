// Contrat de partie v1 (types publics), plus `capsuleSerial` : nombre de capsules déjà créées, pour que les
// identifiants restent uniques après rechargement.
export type Color = 'cyan' | 'amber' | 'magenta';
export type Orientation = 0 | 1 | 2 | 3;
export type Phase = 'READY' | 'FALLING' | 'RESOLVING' | 'PAUSED' | 'WON' | 'LOST';
export type Speed = 'low' | 'medium' | 'high';
export interface ObstacleCell { kind: 'obstacle'; id: string; color: Color }
export interface SegmentCell { kind: 'segment'; id: string; capsuleId: string; part: 0 | 1; color: Color; linkedToId: string | null }
export type Cell = null | ObstacleCell | SegmentCell;
export interface ActiveCapsule { id: string; colors: [Color, Color]; x: number; y: number; orientation: Orientation }
export interface GameState {
    schemaVersion: 1; ruleset: 'CP-CLASSIC-1'; seed: string; rngState: number[]; width: 8; height: 16; board: Cell[];
    active: ActiveCapsule | null; nextQueue: [Color, Color][]; phase: Phase; score: number; level: number; speed: Speed;
    obstaclesRemaining: number; tick: number; chainCount: number; capsuleSerial: number;
}
export type GameCommand = { type: 'MOVE_LEFT' | 'MOVE_RIGHT' | 'ROTATE_CW' | 'ROTATE_CCW' | 'SOFT_DROP' | 'HARD_DROP' | 'TICK' | 'PAUSE' | 'RESUME' };
export interface GameEvent {
    seq: number; tick: number;
    type: 'MOVED' | 'ROTATED' | 'LOCKED' | 'MATCH_REMOVED' | 'GRAVITY_STEP' | 'CASCADE_END' | 'SPAWNED' | 'WON' | 'LOST' | 'PAUSED' | 'RESUMED';
    payload?: unknown;
}
export interface Transition { state: GameState; events: GameEvent[] }
export interface Position { x: number; y: number }

export const WIDTH = 8;
export const HEIGHT = 16;
export const RULESET = 'CP-CLASSIC-1';
export const COLORS: readonly Color[] = ['cyan', 'amber', 'magenta'];
/** Décalage du second segment par rapport au pivot, selon l'orientation. */
export const ORIENTATION_OFFSETS: Readonly<Record<Orientation, Position>> = { 0: { x: 0, y: -1 }, 1: { x: 1, y: 0 }, 2: { x: 0, y: 1 }, 3: { x: -1, y: 0 } };
