import type { Cell, BoardEvent } from '@capsule-panic/contracts';

/** Collecte les événements d'un `step` : `seq` séquentiel à partir de 0, horodaté par le tick logique. */
export class EventLog {
    readonly events: BoardEvent[] = [];
    constructor(private tick: number) {}
    setTick(tick: number): void { this.tick = tick; }
    emit(type: BoardEvent['type'], payload?: unknown, board?: readonly Cell[]): void {
        this.events.push({
            seq: this.events.length,
            tick: this.tick,
            type,
            ...(payload === undefined ? {} : { payload }),
            ...(board === undefined ? {} : { board: board.map((cell) => (cell === null ? null : { ...cell })) }),
        });
    }
}
