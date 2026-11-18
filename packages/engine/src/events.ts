import type { GameEvent } from '@capsule-panic/contracts';

/** Collecte les événements d'un `step` : `seq` séquentiel à partir de 0, horodaté par le tick logique. */
export class EventLog {
    readonly events: GameEvent[] = [];
    constructor(private tick: number) {}
    setTick(tick: number): void { this.tick = tick; }
    emit(type: GameEvent['type'], payload?: unknown): void {
        this.events.push(payload === undefined ? { seq: this.events.length, tick: this.tick, type } : { seq: this.events.length, tick: this.tick, type, payload });
    }
}
