import { expect, it } from 'vitest';
import { step } from '../src/index';
import { boardFrom, stateWith } from './helpers';

// Revue P7 (6d97d47) : `LOCKED.board` et les plateaux de gravité ne doivent pas partager leurs cellules avec l'état.
it('[E140] modifier une cellule du plateau d’un événement ne touche ni l’état d’entrée ni l’état suivant', () => {
    const state = stateWith(boardFrom(['.......C']), {}, { tick: 11 });
    const avant = JSON.stringify(state);
    const transition = step(state, { type: 'HARD_DROP' });
    const apres = JSON.stringify(transition.state);

    const plateaux = transition.events.flatMap((event) =>
        'board' in event && Array.isArray(event.board) ? [event.board] : [],
    );
    expect(plateaux.length).toBeGreaterThan(0);
    for (const plateau of plateaux) {
        for (const cell of plateau) {
            if (cell && typeof cell === 'object') (cell as { color: string }).color = 'altere';
        }
    }

    expect(JSON.stringify(state)).toBe(avant);
    expect(JSON.stringify(transition.state)).toBe(apres);
});
