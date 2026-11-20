// Animations visibles en jeu, mesurées sur les pixels du réacteur avec une horloge figée.
// Une planche de captures (graine preuve-0, vitesse Lente) a montré deux défauts :
//  - l'éclat de verrouillage n'était qu'un léger assombrissement d'un segment : 57 sur 255 au pixel le plus
//    changé, quand le déplacement change les pixels de 242 ;
//  - la traînée de chute restait à la case de départ pendant que la capsule tombait.
// Méthode : page.clock fige le temps une fois la partie prête ; runFor(PAS) avance d'une image à la fois et
// chaque image est capturée sur la boîte du réacteur, puis décodée ici sans dépendance.
import { inflateSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const PAS = 8; // ms d'horloge entre deux images
const WIDTH = 8;
const HEIGHT = 16;
const GUTTER = 16; // packages/renderer/src/layout.ts : marge autour du réacteur
const DROP_MS = 120; // packages/renderer/src/art.ts : durée « gravity », celle de la descente animée
// Pour la graine preuve-0, après déplacement, rotation et 300 ms d'attente : la capsule horizontale part
// de (2,3)-(3,3) et se pose en (2,9)-(3,9). Constaté sur la planche de captures, vérifié ci-dessous.
const AVANT_POSE = 'c1 2,3,1';
const POSE = { x: 2, y: 3 };
const ARRIVEE = 9;

interface Image {
    largeur: number;
    hauteur: number;
    rgba: Uint8Array;
}
interface Rect {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}
interface ImageDatee {
    t: number;
    image: Image;
    capsule: string;
}

/** PNG RGBA 8 bits non entrelacé (captures de Chromium). Même décodeur que tests/barre-partie.test.ts. */
function decoderPng(png: Buffer): Image {
    const largeur = png.readUInt32BE(16);
    const hauteur = png.readUInt32BE(20);
    const type = png.readUInt8(25);
    if (png.readUInt8(24) !== 8 || (type !== 6 && type !== 2) || png.readUInt8(28) !== 0)
        throw new Error('PNG 8 bits non entrelacé attendu');
    const canaux = type === 6 ? 4 : 3;
    const blocs: Buffer[] = [];
    for (let i = 8; i + 8 <= png.length;) {
        const longueur = png.readUInt32BE(i);
        if (png.toString('ascii', i + 4, i + 8) === 'IDAT') blocs.push(png.subarray(i + 8, i + 8 + longueur));
        i += 12 + longueur;
    }
    const brut = inflateSync(Buffer.concat(blocs));
    const ligne = largeur * canaux;
    const pixels = new Uint8Array(ligne * hauteur);
    for (let y = 0; y < hauteur; y++) {
        const filtre = brut[y * (ligne + 1)] ?? 0;
        for (let i = 0; i < ligne; i++) {
            const x = brut[y * (ligne + 1) + 1 + i] ?? 0;
            const a = i >= canaux ? (pixels[y * ligne + i - canaux] ?? 0) : 0;
            const b = y > 0 ? (pixels[(y - 1) * ligne + i] ?? 0) : 0;
            const c = i >= canaux && y > 0 ? (pixels[(y - 1) * ligne + i - canaux] ?? 0) : 0;
            const p = a + b - c;
            const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
            const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            const predit = [0, a, b, (a + b) >> 1, paeth][filtre] ?? 0;
            pixels[y * ligne + i] = (x + predit) & 0xff;
        }
    }
    if (canaux === 4) return { largeur, hauteur, rgba: pixels };
    const rgba = new Uint8Array(largeur * hauteur * 4);
    for (let i = 0; i < largeur * hauteur; i++) {
        rgba.set(pixels.subarray(i * 3, i * 3 + 3), i * 4);
        rgba[i * 4 + 3] = 255;
    }
    return { largeur, hauteur, rgba };
}

const px = (image: Image, x: number, y: number, k: number): number =>
    image.rgba[(y * image.largeur + x) * 4 + k] ?? 0;

/** Écart d'un pixel : le plus grand écart absolu sur R, V, B. */
const ecart = (a: Image, b: Image, x: number, y: number): number =>
    Math.max(...[0, 1, 2].map((k) => Math.abs(px(a, x, y, k) - px(b, x, y, k))));
/** Éclaircissement d'un pixel : la plus grande hausse sur R, V, B (zéro s'il s'assombrit). */
const hausse = (a: Image, b: Image, x: number, y: number): number =>
    Math.max(0, ...[0, 1, 2].map((k) => px(a, x, y, k) - px(b, x, y, k)));

function valeurs(r: Rect, f: (x: number, y: number) => number): number[] {
    const out: number[] = [];
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) out.push(f(x, y));
    return out;
}
/** 90e centile : valeur dépassée par 10 % des pixels de la zone. Insensible aux quelques pixels de bord. */
function p90(v: number[]): number {
    const tri = [...v].sort((a, b) => a - b);
    return tri[Math.min(tri.length - 1, Math.floor(0.9 * tri.length))] ?? 0;
}

/** Cases occupées par une capsule « id x,y,orientation » (pivot, puis segment lié). */
function cases(capsule: string): { x: number; y: number }[] {
    const [, pos = ''] = capsule.split(' ');
    const [x = NaN, y = NaN, o = NaN] = pos.split(',').map(Number);
    const d = [
        { x: 0, y: -1 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
    ][o];
    if (!d) throw new Error(`capsule illisible : ${capsule}`);
    return [
        { x, y },
        { x: x + d.x, y: y + d.y },
    ];
}

async function demarrer(page: Page, reduit: boolean) {
    await page.emulateMedia({ reducedMotion: reduit ? 'reduce' : 'no-preference' });
    const erreurs: string[] = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    await page.clock.install({ time: new Date('2026-11-20T10:00:00Z') });
    await page.goto('./?graine=preuve-0');
    // L'horodatage passé à requestAnimationFrame par l'horloge factice ne suit pas performance.now() :
    // la boucle et le ticker Pixi verraient des pas énormes, plafonnés. On repasse performance.now().
    await page.evaluate(() => {
        const raf = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (cb) => raf(() => cb(performance.now()));
    });
    await page.getByRole('button', { name: 'Jouer' }).click();
    await page.getByLabel('Lente').check();
    await page.getByRole('button', { name: 'Commencer' }).click();
    const reacteur = page.locator('.reactor');
    for (let i = 0; i < 200; i++) {
        if ((await reacteur.getAttribute('data-ready').catch(() => null)) === 'oui') break;
        await page.clock.runFor(50);
    }
    await expect(page.locator('.reactor[data-ready="oui"] canvas')).toBeVisible();
    // install() laisse le temps couler : on le fige, seul runFor l'avance ensuite. Si la page a pris plus de
    // 50 ms entre la lecture de l'heure et la pause (machine chargée), pauseAt refuse de « reculer » : on relit.
    for (let essai = 1; ; essai++) {
        try {
            await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 50);
            break;
        } catch (erreur) {
            if (essai >= 3 || !String(erreur).includes('to the past')) throw erreur;
        }
    }
    const attendre = async (ms: number) => {
        for (let t = 0; t < ms; t += PAS) await page.clock.runFor(PAS);
    };
    await attendre(400);
    const boite = await reacteur.boundingBox();
    if (!boite) throw new Error('réacteur sans boîte');
    const clip = {
        x: Math.floor(boite.x),
        y: Math.floor(boite.y),
        width: Math.floor(boite.width),
        height: Math.floor(boite.height),
    };
    // Géométrie du réacteur dans la capture (même calcul que boardLayout, sur la taille de l'hôte).
    const hote = await reacteur.evaluate((e) => ({ w: e.clientWidth, h: e.clientHeight }));
    const cote = Math.max(
        8,
        Math.floor(Math.min((hote.w - 2 * GUTTER) / WIDTH, (hote.h - 2 * GUTTER) / HEIGHT)),
    );
    const ox = boite.x - clip.x + (hote.w - cote * WIDTH) / 2;
    const oy = boite.y - clip.y + (hote.h - cote * HEIGHT) / 2;
    /** Rectangle en pixels de capture des cases [cx0, cx1) × [cy0, cy1), rentré de `retrait` pixels. */
    const zone = (cx0: number, cy0: number, cx1: number, cy1: number, retrait = 3): Rect => ({
        x0: Math.max(0, Math.ceil(ox + cx0 * cote) + retrait),
        y0: Math.max(0, Math.ceil(oy + cy0 * cote) + retrait),
        x1: Math.min(clip.width, Math.floor(ox + cx1 * cote) - retrait),
        y1: Math.min(clip.height, Math.floor(oy + cy1 * cote) - retrait),
    });
    const englobe = (cs: { x: number; y: number }[]): Rect =>
        zone(
            Math.min(...cs.map((c) => c.x)),
            Math.min(...cs.map((c) => c.y)),
            Math.max(...cs.map((c) => c.x)) + 1,
            Math.max(...cs.map((c) => c.y)) + 1,
        );
    const capture = async (): Promise<Image> =>
        decoderPng(await page.screenshot({ clip, scale: 'css', animations: 'allow' }));
    /** Appuie sur une touche et capture une image tous les PAS ms pendant `total` ms. */
    async function serie(touche: string, total: number) {
        const capsuleAvant = (await reacteur.getAttribute('data-capsule')) ?? '';
        const avant = await capture();
        await page.keyboard.press(touche);
        const images: ImageDatee[] = [];
        for (let t = PAS; t <= total; t += PAS) {
            await page.clock.runFor(PAS);
            images.push({
                t,
                image: await capture(),
                capsule: (await reacteur.getAttribute('data-capsule')) ?? '',
            });
        }
        const capsuleApres = (await reacteur.getAttribute('data-capsule')) ?? '';
        await attendre(300);
        return { capsuleAvant, capsuleApres, avant, images };
    }
    return { serie, zone, englobe, cote, oy, erreurs };
}

/** Même séquence que la planche de captures : déplacement, rotation, puis pose de la capsule. */
async function sequence(page: Page, reduit: boolean) {
    const jeu = await demarrer(page, reduit);
    const deplacement = await jeu.serie('ArrowLeft', 160);
    await jeu.serie('ArrowUp', 160);
    const pose = await jeu.serie(' ', 320);
    expect(pose.capsuleAvant, 'état de départ de la pose (graine preuve-0)').toBe(AVANT_POSE);
    const final = pose.images.at(-1)?.image;
    if (!final) throw new Error('aucune image de pose');
    const arrivee = [0, 1].map((i) => jeu.zone(POSE.x + i, ARRIVEE, POSE.x + i + 1, ARRIVEE + 1));
    return { jeu, deplacement, pose, final, arrivee };
}

test.describe('animations visibles en jeu', () => {
    test.setTimeout(180_000);

    test('[E438] [E531] le verrouillage fait un éclat aussi visible que le déplacement', async ({ page }) => {
        const { jeu, deplacement, pose, final, arrivee } = await sequence(page, false);

        // Déplacement : écart de la zone de la capsule (cases de départ et d'arrivée) avec l'image « avant ».
        const zoneDep = jeu.englobe([...cases(deplacement.capsuleAvant), ...cases(deplacement.capsuleApres)]);
        const ecartDeplacement = Math.max(
            ...deplacement.images.map(({ image }) =>
                p90(valeurs(zoneDep, (x, y) => ecart(image, deplacement.avant, x, y))),
            ),
        );
        // Contrôle de la mesure : les cases d'arrivée sont vides pendant la descente et pleines à la fin.
        const pendant = pose.images.find(({ t }) => t >= 2 * PAS)?.image;
        if (!pendant) throw new Error('image de descente absente');
        for (const r of arrivee)
            expect(p90(valeurs(r, (x, y) => ecart(final, pendant, x, y)))).toBeGreaterThan(100);

        // Verrouillage : éclaircissement de CHACUNE des deux cases posées par rapport à l'image finale (capsule
        // posée, plus d'effet). Seules comptent les images après la descente (120 ms) et une image de marge :
        // avant, la case d'arrivée est encore vide et la comparer à la capsule posée ne dit rien de l'éclat.
        const parImage = pose.images
            .filter(({ t }) => t >= DROP_MS + 2 * PAS)
            .map(({ t, image }) => ({
                t,
                cases: arrivee.map((r) => p90(valeurs(r, (x, y) => hausse(image, final, x, y)))),
            }));
        const eclat = Math.max(...parImage.map(({ cases: c }) => Math.min(...c)));
        const meilleure = parImage.find(({ cases: c }) => Math.min(...c) === eclat);
        const mesures = {
            ecartDeplacement,
            eclatVerrouillage: eclat,
            meilleureImage: meilleure,
            erreurs: jeu.erreurs,
        };
        console.log(`MESURE verrouillage ${test.info().project.name} ${JSON.stringify(mesures)}`);
        test.info().annotations.push({ type: 'mesure', description: JSON.stringify(mesures) });

        // Sanity : le déplacement change franchement les pixels (sinon la référence ne vaut rien).
        expect(ecartDeplacement).toBeGreaterThanOrEqual(100);
        // Seuil relatif : l'éclat doit être du même ordre que le déplacement, au moins la moitié de son écart.
        expect(eclat, 'éclat ≥ 50 % de l’écart du déplacement').toBeGreaterThanOrEqual(
            0.5 * ecartDeplacement,
        );
        // Plancher absolu : 64 sur 255, un quart de la dynamique. L'ancien éclat (un assombrissement) culminait
        // à 57 au pixel le plus changé ; un éclat qui éclaircit 10 % des pixels de chaque segment d'au moins 64
        // se voit d'un coup d'œil sur un segment saturé, ce que l'assombrissement ne faisait pas.
        expect(eclat, 'éclat ≥ 64 sur 255').toBeGreaterThanOrEqual(64);
        expect(jeu.erreurs).toEqual([]);
    });

    test('[E531] la traînée de chute suit la capsule', async ({ page }) => {
        const { jeu, pose } = await sequence(page, false);
        const images = pose.images.map(({ image }) => image);
        const first = images[0];
        if (!first) throw new Error('aucune image');
        // Bande des colonnes de la capsule, une colonne de marge de chaque côté, de la ligne au-dessus du départ
        // jusqu'à la ligne d'arrivée exclue.
        const bande = jeu.zone(POSE.x - 1, POSE.y - 1, POSE.x + 3, ARRIVEE, 0);
        const colonnes = jeu.zone(POSE.x, POSE.y - 1, POSE.x + 2, ARRIVEE, 0);
        // Fond : médiane de chaque pixel sur toute la pose. La capsule et sa traînée ne passent que quelques
        // images sur un pixel donné ; la médiane rend donc la case vide.
        const fond = {
            largeur: first.largeur,
            hauteur: first.hauteur,
            rgba: new Uint8Array(first.rgba.length),
        };
        const pile: number[] = [];
        for (let y = bande.y0; y < bande.y1; y++)
            for (let x = bande.x0; x < bande.x1; x++)
                for (let k = 0; k < 3; k++) {
                    pile.length = 0;
                    for (const image of images) pile.push(px(image, x, y, k));
                    pile.sort((a, b) => a - b);
                    fond.rgba[(y * first.largeur + x) * 4 + k] = pile[Math.floor(pile.length / 2)] ?? 0;
                }
        const releves: { t: number; hautCapsule: number; loin: number; pixelsLoin: number }[] = [];
        for (const { t, image } of pose.images) {
            // Haut de la capsule : première ligne de pixels où plus de la moitié des colonnes de la capsule
            // s'écartent du fond de plus de 100.
            let haut = -1;
            for (let y = colonnes.y0; y < colonnes.y1 && haut < 0; y++) {
                let fort = 0;
                for (let x = colonnes.x0; x < colonnes.x1; x++) if (ecart(image, fond, x, y) > 100) fort++;
                if (fort > 0.5 * (colonnes.x1 - colonnes.x0)) haut = y;
            }
            if (haut < 0) continue;
            // « Loin » : tout ce qui est à plus de deux cases au-dessus du haut de la capsule, dans la bande.
            const limite = Math.floor(haut - 2 * jeu.cote);
            if (limite <= bande.y0) continue;
            const loin = valeurs({ ...bande, y1: limite }, (x, y) => ecart(image, fond, x, y));
            releves.push({
                t,
                hautCapsule: Math.round(((haut - jeu.oy) / jeu.cote) * 100) / 100,
                loin: Math.max(...loin),
                pixelsLoin: loin.filter((v) => v > 12).length,
            });
        }
        console.log(`MESURE traînée ${test.info().project.name} ${JSON.stringify(releves)}`);
        test.info().annotations.push({ type: 'mesure', description: JSON.stringify(releves) });
        // La capsule a bien été vue en pleine chute, à plus de deux cases de son départ.
        expect(releves.length).toBeGreaterThanOrEqual(2);
        // Rien ne reste à plus de deux cases derrière la capsule : la traînée l'accompagne. Seuil 12 sur 255 :
        // au-dessus du bruit de rendu (0 ici, l'image est figée), sous la traînée restée au départ (38 à 54).
        expect(
            Math.max(...releves.map((r) => r.loin)),
            'traînée restée loin derrière la capsule',
        ).toBeLessThanOrEqual(12);
        expect(jeu.erreurs).toEqual([]);
    });

    test('[E438] [E531] en mouvement réduit, aucune image intermédiaire ni effet', async ({ page }) => {
        const { jeu, deplacement, pose, final, arrivee } = await sequence(page, true);
        // Déplacement : dès la première image rendue, la capsule est à sa place ; tant que l'état ne change pas,
        // les images suivantes sont identiques (aucune interpolation, aucune traînée).
        const zoneDep = jeu.englobe([...cases(deplacement.capsuleAvant), ...cases(deplacement.capsuleApres)]);
        const premiere = deplacement.images.find(
            ({ t, capsule }, i) =>
                t >= 3 * PAS && [1, 2].every((k) => deplacement.images[i + k]?.capsule === capsule),
        );
        if (!premiere) throw new Error('image absente');
        expect(
            p90(valeurs(zoneDep, (x, y) => ecart(premiere.image, deplacement.avant, x, y))),
        ).toBeGreaterThan(100);
        // data-capsule est publié par React, qui peut avoir une image de retard sur le canevas : une image
        // n'est retenue que si l'état reste le même sur elle et sur les deux suivantes (aucune chute pendant).
        const stable = (i: number) =>
            [0, 1, 2].every((k) => deplacement.images[i + k]?.capsule === premiere.capsule);
        const suivantes = deplacement.images.filter(({ t }, i) => t > premiere.t && stable(i));
        expect(suivantes.length).toBeGreaterThan(0);
        const bougeDep = Math.max(
            ...suivantes.map(({ image }) =>
                Math.max(...valeurs(zoneDep, (x, y) => ecart(image, premiere.image, x, y))),
            ),
        );
        // Pose : dès la troisième image, les cases de départ et d'arrivée sont celles de l'image finale.
        const depart = jeu.zone(POSE.x, POSE.y - 1, POSE.x + 2, POSE.y + 1);
        const bougePose = Math.max(
            ...pose.images
                .filter(({ t }) => t >= 3 * PAS)
                .flatMap(({ image }) =>
                    [...arrivee, depart].map((r) =>
                        Math.max(...valeurs(r, (x, y) => ecart(image, final, x, y))),
                    ),
                ),
        );
        console.log(
            `MESURE réduit ${test.info().project.name} ${JSON.stringify({ bougeDep, bougePose, etats: deplacement.images.map(({ t, capsule }) => `${String(t)}:${capsule}`) })}`,
        );
        expect(bougeDep).toBeLessThanOrEqual(2);
        expect(bougePose).toBeLessThanOrEqual(2);
        expect(jeu.erreurs).toEqual([]);
    });
});
