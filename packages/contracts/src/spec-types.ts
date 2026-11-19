// Copie de specifications/contracts/types.ts dans la spécification originale de Capsule Panic.
export type Color = 'cyan'|'amber'|'magenta';
export type Orientation = 0|1|2|3;
export type Phase = 'READY'|'FALLING'|'RESOLVING'|'PAUSED'|'WON'|'LOST';
export type Cell = null | {kind:'obstacle';id:string;color:Color} | {kind:'segment';id:string;capsuleId:string;part:0|1;color:Color;linkedToId:string|null};
export interface ActiveCapsule {id:string;colors:[Color,Color];x:number;y:number;orientation:Orientation}
export interface GameState {schemaVersion:1;ruleset:'CP-CLASSIC-1';seed:string;rngState:number[];width:8;height:16;board:Cell[];active:ActiveCapsule|null;nextQueue:[Color,Color][];phase:Phase;score:number;level:number;speed:'low'|'medium'|'high';obstaclesRemaining:number;tick:number;chainCount:number}
export type GameCommand = {type:'MOVE_LEFT'|'MOVE_RIGHT'|'ROTATE_CW'|'ROTATE_CCW'|'SOFT_DROP'|'HARD_DROP'|'TICK'|'PAUSE'|'RESUME'};
export interface GameEvent {seq:number;tick:number;type:'MOVED'|'ROTATED'|'LOCKED'|'MATCH_REMOVED'|'GRAVITY_STEP'|'CASCADE_END'|'SPAWNED'|'WON'|'LOST'|'PAUSED'|'RESUMED';payload?:unknown}
export interface Transition {state:GameState;events:GameEvent[]}
