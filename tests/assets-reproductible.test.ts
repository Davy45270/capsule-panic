// Construction reproductible des assets : aucun PNG livré ne porte de métadonnée variable (date d'écriture tIME,
// textes tEXt/zTXt/iTXt d'ImageMagick comme date:create), sans quoi deux constructions successives ne rendent pas
// les mêmes octets.
import { readFileSync, readdirSync } from 'node:fs';
import { extname } from 'node:path';
import { expect, it } from 'vitest';

const DOSSIER = 'packages/assets';
const VARIABLES = new Set(['tIME', 'tEXt', 'zTXt', 'iTXt']);

/** Types des blocs d'un PNG, dans l'ordre. */
export function blocsPng(image: Buffer): string[] {
    const blocs: string[] = [];
    for (let i = 8; i + 8 <= image.length;) {
        const longueur = image.readUInt32BE(i);
        blocs.push(image.toString('ascii', i + 4, i + 8));
        i += 12 + longueur;
    }
    return blocs;
}

it('aucun PNG de packages/assets ne porte de bloc tIME ou tEXt', () => {
    const pngs = readdirSync(DOSSIER, { recursive: true, encoding: 'utf8' }).filter(
        (nom) => extname(nom) === '.png',
    );
    expect(pngs.length).toBeGreaterThan(100);
    const fautifs = pngs.filter((nom) =>
        blocsPng(readFileSync(`${DOSSIER}/${nom}`)).some((bloc) => VARIABLES.has(bloc)),
    );
    expect(fautifs).toEqual([]);
});
