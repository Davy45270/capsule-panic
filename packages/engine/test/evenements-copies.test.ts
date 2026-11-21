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

// Mutation P8 « instantane_gravite_partage » (137a70b) : la fixture précédente ne produit aucune chute de cascade. Celle-ci
// (T17) en produit : les plateaux GRAVITY_STEP ne doivent pas partager leurs cellules avec l'état suivant.
it('[E140] les plateaux des chutes de cascade sont des copies : les modifier ne touche pas l’état suivant', () => {
    const board = boardFrom(['c.......', 'c.......', 'aaa.....', 'CAMAM...', 'CMAMA...']);
    const state = stateWith(board, { x: 3, y: 1, orientation: 1, colors: ['amber', 'magenta'] });
    const transition = step(state, { type: 'HARD_DROP' });
    const apres = JSON.stringify(transition.state);
    const chutes = transition.events.flatMap((event) =>
        event.type === 'GRAVITY_STEP' && 'board' in event && Array.isArray(event.board) ? [event.board] : [],
    );
    expect(chutes.length).toBeGreaterThan(0);
    for (const chute of chutes) {
        for (const cell of chute) {
            if (cell && typeof cell === 'object') (cell as { color: string }).color = 'altere';
        }
    }
    expect(JSON.stringify(transition.state)).toBe(apres);
});
