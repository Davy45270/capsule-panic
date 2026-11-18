import { describe, it, expect } from 'vitest';
import { gestureCommands, mapKey } from '../src/index';

describe('keyboard', () => {
    it('maps arrows, X, Z, Space, P and Escape', () => {
        expect(['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' ', 'x', 'X', 'z', 'Z', 'p', 'P', 'Escape'].map(mapKey)).toEqual([
            'MOVE_LEFT', 'MOVE_RIGHT', 'SOFT_DROP', 'ROTATE_CW', 'HARD_DROP', 'ROTATE_CW', 'ROTATE_CW', 'ROTATE_CCW', 'ROTATE_CCW', 'PAUSE', 'PAUSE', 'PAUSE'
        ]);
    });
    it('ignores other keys', () => {
        expect(['a', 'Enter', 'Tab', 'Shift'].map(mapKey)).toEqual([null, null, null, null]);
    });
});

describe('gestures', () => {
    it('a short tap rotates', () => {
        expect(gestureCommands({ dx: 3, dy: -2, ms: 120, cell: 30 })).toEqual(['ROTATE_CW']);
    });
    it('a horizontal swipe moves one cell per cell width', () => {
        expect(gestureCommands({ dx: 95, dy: 10, ms: 300, cell: 30 })).toEqual(['MOVE_RIGHT', 'MOVE_RIGHT', 'MOVE_RIGHT']);
        expect(gestureCommands({ dx: -40, dy: 0, ms: 300, cell: 30 })).toEqual(['MOVE_LEFT']);
    });
    it('a downward swipe drops', () => {
        expect(gestureCommands({ dx: 10, dy: 120, ms: 200, cell: 30 })).toEqual(['HARD_DROP']);
    });
    it('a slow or ambiguous touch does nothing', () => {
        expect(gestureCommands({ dx: 4, dy: 4, ms: 900, cell: 30 })).toEqual([]);
        expect(gestureCommands({ dx: 10, dy: -80, ms: 200, cell: 30 })).toEqual([]);
    });
});
