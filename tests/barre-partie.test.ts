// Barre haute de la partie : le fond peint ne garde pas le bouton rond Pause de la maquette. Le CSS étire ce fond sur
// toute la largeur du HUD, derrière le vrai bouton Pause : un pictogramme peint y dessinerait une fausse commande.
// Mesure sur le sprite dont le WebP livré est la conversion directe (scripts/assets-runtime.py : rognage puis cwebp),
// décodé ici sans dépendance : zone du bouton comparée à la texture du panneau voisine.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';

interface Image { largeur: number; hauteur: number; rgba: Uint8Array }

/** PNG RGBA 8 bits non entrelacé, le format des sprites de packages/assets/sprites. */
function decoderPng(png: Buffer): Image {
    const largeur = png.readUInt32BE(16);
    const hauteur = png.readUInt32BE(20);
    if (png.readUInt8(24) !== 8 || png.readUInt8(25) !== 6 || png.readUInt8(28) !== 0)
        throw new Error('PNG RGBA 8 bits non entrelacé attendu');
    const blocs: Buffer[] = [];
    for (let i = 8; i + 8 <= png.length;) {
        const longueur = png.readUInt32BE(i);
        if (png.toString('ascii', i + 4, i + 8) === 'IDAT') blocs.push(png.subarray(i + 8, i + 8 + longueur));
        i += 12 + longueur;
    }
    const brut = inflateSync(Buffer.concat(blocs));
    const ligne = largeur * 4;
    const rgba = new Uint8Array(ligne * hauteur);
    for (let y = 0; y < hauteur; y++) {
        const filtre = brut[y * (ligne + 1)] ?? 0;
        for (let i = 0; i < ligne; i++) {
            const x = brut[y * (ligne + 1) + 1 + i] ?? 0;
            const a = i >= 4 ? (rgba[y * ligne + i - 4] ?? 0) : 0;
            const b = y > 0 ? (rgba[(y - 1) * ligne + i] ?? 0) : 0;
            const c = i >= 4 && y > 0 ? (rgba[(y - 1) * ligne + i - 4] ?? 0) : 0;
            const p = a + b - c;
            const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
            const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            const predit = [0, a, b, (a + b) >> 1, paeth][filtre] ?? 0;
            rgba[y * ligne + i] = (x + predit) & 0xff;
        }
    }
    return { largeur, hauteur, rgba };
}

/** Pixels opaques d'un rectangle : nombre de pixels clairs (canal max > 110) et écart type de la luminance. */
function mesurer(image: Image, x0: number, y0: number, largeur: number, hauteur: number) {
    const lum: number[] = [];
    let clairs = 0;
    for (let y = y0; y < y0 + hauteur; y++)
        for (let x = x0; x < x0 + largeur; x++) {
            const i = (y * image.largeur + x) * 4;
            const [r, v, b, a] = [0, 1, 2, 3].map((k) => image.rgba[i + k] ?? 0) as [number, number, number, number];
            if (a < 200) throw new Error(`pixel transparent en ${x},${y}`);
            if (Math.max(r, v, b) > 110) clairs++;
            lum.push(0.2126 * r + 0.7152 * v + 0.0722 * b);
        }
    const moyenne = lum.reduce((s, l) => s + l, 0) / lum.length;
    const ecart = Math.sqrt(lum.reduce((s, l) => s + (l - moyenne) ** 2, 0) / lum.length);
    return { clairs, ecart };
}

it('[E378] le fond de la barre de partie ne peint plus le bouton rond Pause', () => {
    const image = decoderPng(readFileSync('packages/assets/sprites/sprite-barre-partie.png'));
    // Sprite 126x126, barre de 126x21 en +0+52 : le bouton peint occupait x 107–124 sur toute la hauteur.
    expect([image.largeur, image.hauteur]).toEqual([126, 126]);
    const bouton = mesurer(image, 106, 53, 19, 19);
    const panneau = mesurer(image, 70, 53, 19, 19);
    expect(bouton.clairs).toBe(0);
    expect(bouton.ecart).toBeLessThanOrEqual(Math.max(4, 1.5 * panneau.ecart));
});
