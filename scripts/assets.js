import { Buffer } from 'node:buffer';
import { readdirSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

export function dimensions(image, extension) {
    if (extension === '.png' && image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
        return [image.readUInt32BE(16), image.readUInt32BE(20)];
    }
    if (extension === '.webp' && image.toString('ascii', 0, 4) === 'RIFF' &&
        image.toString('ascii', 8, 15) === 'WEBPVP8' && image[15] === 76 && image[20] === 47) {
        const size = image.readUInt32LE(21);
        return [(size & 0x3fff) + 1, ((size >>> 14) & 0x3fff) + 1];
    }
    if (extension === '.svg') {
        const vue = /viewBox="[-.\d]+\s+[-.\d]+\s+([.\d]+)\s+([.\d]+)"/u.exec(image.toString('utf8'));
        if (vue) return [Number(vue[1]), Number(vue[2])];
    }
    throw new Error('Image attendue au format PNG, WebP sans perte ou SVG avec viewBox');
}

function verifier(images, budget) {
    const erreurs = [];
    let total = 0;
    for (const [nom, image] of images) {
        const [largeur, hauteur] = dimensions(image, extname(nom));
        total += image.length;
        if (image.length > budget.maxImage) erreurs.push(`${nom} dépasse le budget par image`);
        if (Math.max(largeur, hauteur) > budget.maxSide) erreurs.push(`${nom} dépasse le budget par côté`);
    }
    if (total > budget.maxTotal) erreurs.push('Le poids total dépasse le budget');
    if (images.length === 0) erreurs.push('Aucune image à contrôler');
    return { total, erreurs };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    if (process.argv[2] !== 'check') throw new Error('Usage attendu : npm run assets -- check');
    const dossier = `${root}packages/assets`;
    const images = readdirSync(dossier, { recursive: true, encoding: 'utf8' })
        .filter(nom => ['.png', '.webp', '.svg'].includes(extname(nom)))
        .map(nom => [nom, readFileSync(`${dossier}/${nom}`)]);
    const budget = JSON.parse(readFileSync(`${root}assets-budget.json`, 'utf8'));
    const { total, erreurs } = verifier(images, budget);
    process.stdout.write(`${images.length} images, ${total} octets (${budget.maxTotal} autorisés)\n`);
    for (const erreur of erreurs) process.stderr.write(`${erreur}\n`);
    process.exitCode = Number(erreurs.length > 0);
}
