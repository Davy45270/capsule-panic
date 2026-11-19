import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, expectTypeOf, it } from 'vitest';
import type * as Public from '../src/index';
import type * as Spec from '../src/spec-types';

const hash = (name: string): string =>
    createHash('sha256').update(readFileSync(new URL(`../schemas/${name}.schema.json`, import.meta.url))).digest('hex');

it('[E228] le schéma de partie est la copie exacte du contrat', () => {
    expect(hash('game')).toBe('39be2336368a199d333b9b26b46a8cdcc87219b7bf284ff73585188716b79d44');
});

it('[E233] le schéma de puzzle est la copie exacte du contrat', () => {
    expect(hash('puzzle')).toBe('16828748cdac2139abc578e069e468ed3be9960e0a40736888e1f3b5ed6012fd');
});

it('[E219] Color est identique au contrat', () => { expectTypeOf<Public.Color>().toEqualTypeOf<Spec.Color>(); });
it('[E220] Orientation est identique au contrat', () => { expectTypeOf<Public.Orientation>().toEqualTypeOf<Spec.Orientation>(); });
it('[E221] Phase est identique au contrat', () => { expectTypeOf<Public.Phase>().toEqualTypeOf<Spec.Phase>(); });
it('[E222] Cell est identique au contrat', () => { expectTypeOf<Public.Cell>().toEqualTypeOf<Spec.Cell>(); });
it('[E223] ActiveCapsule est identique au contrat', () => { expectTypeOf<Public.ActiveCapsule>().toEqualTypeOf<Spec.ActiveCapsule>(); });
it('[E224] GameState est identique au contrat', () => { expectTypeOf<Public.GameState>().toEqualTypeOf<Spec.GameState>(); });
it('[E225] GameCommand est identique au contrat', () => { expectTypeOf<Public.GameCommand>().toEqualTypeOf<Spec.GameCommand>(); });
it('[E226] GameEvent est identique au contrat', () => { expectTypeOf<Public.GameEvent>().toEqualTypeOf<Spec.GameEvent>(); });
it('[E227] Transition est identique au contrat', () => { expectTypeOf<Public.Transition>().toEqualTypeOf<Spec.Transition>(); });
