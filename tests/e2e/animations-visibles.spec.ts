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
// Les cases de départ et d'arrivée de la pose ne sont pas écrites en dur : le nombre de pas de gravité avant la
// pose dépend de la cadence de la machine (temps réel écoulé avant que l'horloge soit figée). Le départ se lit
// dans data-capsule, l'arrivée se déduit des images (voir sequence).
const CHUTE_MIN = 4; // cases : assez de chute pour voir la capsule à plus de deux cases de son départ

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

/** Médiane de chaque pixel d'un rectangle sur une suite d'images (hors du rectangle : noir). */
function mediane(images: Image[], r: Rect): Image {
    const [premiere] = images;
    if (!premiere) throw new Error('aucune image');
    const fond = {
        largeur: premiere.largeur,
        hauteur: premiere.hauteur,
        rgba: new Uint8Array(premiere.rgba.length),
    };
    const pile: number[] = [];
    for (let y = r.y0; y < r.y1; y++)
        for (let x = r.x0; x < r.x1; x++)
            for (let k = 0; k < 3; k++) {
                pile.length = 0;
                for (const image of images) pile.push(px(image, x, y, k));
                pile.sort((a, b) => a - b);
                fond.rgba[(y * premiere.largeur + x) * 4 + k] = pile[Math.floor(pile.length / 2)] ?? 0;
            }
    return fond;
}

/** Même séquence que la planche de captures : déplacement, rotation, puis pose de la capsule. */
async function sequence(page: Page, reduit: boolean) {
    const jeu = await demarrer(page, reduit);
    const deplacement = await jeu.serie('ArrowLeft', 160);
    await jeu.serie('ArrowUp', 160);
    const pose = await jeu.serie(' ', 320);
    const final = pose.images.at(-1)?.image;
    if (!final) throw new Error('aucune image de pose');
    // La pose a bien eu lieu : une nouvelle capsule est apparue.
    const id = (capsule: string) => capsule.split(' ')[0] ?? '';
    expect(pose.capsuleAvant, 'capsule active avant la pose').not.toBe('');
    expect(id(pose.capsuleApres), 'une nouvelle capsule après la pose').not.toBe(id(pose.capsuleAvant));
    const depart = cases(pose.capsuleAvant);
    const gauche = Math.min(...depart.map((c) => c.x));
    const droite = Math.max(...depart.map((c) => c.x)) + 1;
    const haut = Math.min(...depart.map((c) => c.y));
    const bas = Math.max(...depart.map((c) => c.y)) + 1;
    // Arrivée : le fond (médiane sur la pose) montre la capsule posée, qui occupe la majorité des images.
    // L'image « avant » y montre le fantôme d'arrivée et, partout ailleurs sous le départ, la même chose que le
    // fond. La chute est donc le plus grand décalage d dont les cases décalées s'écartent franchement du fond.
    const fond = mediane(
        pose.images.map(({ image }) => image),
        jeu.zone(gauche, haut, droite, HEIGHT, 0),
    );
    let chute = 0;
    for (let d = 1; bas + d <= HEIGHT; d++) {
        const ecarts = depart.map(({ x, y }) =>
            p90(valeurs(jeu.zone(x, y + d, x + 1, y + d + 1), (px_, py) => ecart(pose.avant, fond, px_, py))),
        );
        if (Math.min(...ecarts) > 60) chute = d;
    }
    expect(chute, `chute de la capsule ${pose.capsuleAvant} (en cases)`).toBeGreaterThanOrEqual(CHUTE_MIN);
    const arrivee = depart.map(({ x, y }) => jeu.zone(x, y + chute, x + 1, y + chute + 1));
    const geometrie = { gauche, droite, haut, bas, chute };
    console.log(
        `MESURE pose ${test.info().project.name} ${pose.capsuleAvant} -> ${pose.capsuleApres} chute ${String(chute)}`,
    );
    return { jeu, deplacement, pose, final, arrivee, geometrie };
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
        const { jeu, pose, geometrie: g } = await sequence(page, false);
        const images = pose.images.map(({ image }) => image);
        // Bande des colonnes de la capsule, une colonne de marge de chaque côté, de la ligne au-dessus du départ
        // jusqu'au haut de la capsule posée (exclu). Le haut de la capsule se cherche à partir de la ligne de départ :
        // la nouvelle capsule, qui apparaît au-dessus, n'y entre pas.
        const bande = jeu.zone(g.gauche - 1, g.haut - 1, g.droite + 1, g.haut + g.chute, 0);
        const colonnes = jeu.zone(g.gauche, g.haut, g.droite, g.haut + g.chute, 0);
        // Fond : médiane de chaque pixel sur toute la pose. La capsule et sa traînée ne passent que quelques
        // images sur un pixel donné ; la médiane rend donc la case vide.
        const fond = mediane(images, bande);
        const releves: { t: number; hautCapsule: number; loin: number; pixelsLoin: number }[] = [];
        // Seules comptent les images de la descente (120 ms) : ensuite la nouvelle capsule apparaît.
        for (const { t, image } of pose.images.filter(({ t: temps }) => temps <= DROP_MS)) {
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
        const { jeu, deplacement, pose, final, arrivee, geometrie: g } = await sequence(page, true);
        // Le canevas peut avoir une ou deux images de retard sur data-capsule, ou l'inverse quand la machine est
        // chargée ; un pas de gravité tombe aussi parfois dans la fenêtre (une chute toutes les 750 ms en Lente).
        // On ne se fie donc pas à l'attribut : on découpe les images en paliers d'images identiques (écart ≤ 2).
        // En mouvement réduit, chaque changement est un saut d'un palier à l'autre, et chaque palier dure au moins
        // trois images (24 ms), sauf le dernier, coupé par la fin de la fenêtre. Une interpolation, elle, change
        // l'image à chaque rendu (toutes les 16 ms, soit deux images) : elle laisse des paliers trop courts.
        const paliers = (images: Image[], r: Rect): number[] => {
            const longueurs: number[] = [];
            images.forEach((image, i) => {
                const precedente = images[i - 1];
                const meme =
                    precedente !== undefined &&
                    Math.max(...valeurs(r, (x, y) => ecart(image, precedente, x, y))) <= 2;
                if (meme && longueurs.length > 0)
                    longueurs[longueurs.length - 1] = (longueurs.at(-1) ?? 0) + 1;
                else longueurs.push(1);
            });
            return longueurs;
        };
        const courts = (longueurs: number[]) => longueurs.slice(0, -1).filter((n) => n < 3).length;

        // Déplacement : dès la troisième image, la capsule a quitté sa place (le canevas a reçu le geste).
        const zoneDep = jeu.englobe([...cases(deplacement.capsuleAvant), ...cases(deplacement.capsuleApres)]);
        const apres = deplacement.images.filter(({ t }) => t >= 3 * PAS);
        const [premiere] = apres;
        if (!premiere) throw new Error('image absente');
        expect(
            p90(valeurs(zoneDep, (x, y) => ecart(premiere.image, deplacement.avant, x, y))),
        ).toBeGreaterThan(100);
        const paliersDep = paliers(
            apres.map(({ image }) => image),
            zoneDep,
        );
        // Pose : dès la troisième image, les cases d'arrivée sont celles de l'image finale (ni descente ni éclat) ;
        // la case de départ et celle du dessus (traînée) ne passent que par des paliers.
        const depart = jeu.zone(g.gauche, g.haut - 1, g.droite, g.bas);
        const imagesPose = pose.images.filter(({ t }) => t >= 3 * PAS).map(({ image }) => image);
        const bougeArrivee = Math.max(
            ...imagesPose.flatMap((image) =>
                arrivee.map((r) => Math.max(...valeurs(r, (x, y) => ecart(image, final, x, y)))),
            ),
        );
        const paliersPose = paliers(imagesPose, depart);
        const mesures = {
            paliersDep,
            paliersPose,
            bougeArrivee,
            etats: deplacement.images.map(({ t, capsule }) => `${String(t)}:${capsule}`),
        };
        console.log(`MESURE réduit ${test.info().project.name} ${JSON.stringify(mesures)}`);
        expect(courts(paliersDep), 'paliers trop courts pendant le déplacement').toBe(0);
        expect(courts(paliersPose), 'paliers trop courts au départ de la pose').toBe(0);
        expect(bougeArrivee).toBeLessThanOrEqual(2);
        expect(jeu.erreurs).toEqual([]);
    });
});
