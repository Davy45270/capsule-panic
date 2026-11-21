import { readFileSync } from 'node:fs';

function lireSprite(name: string) {
    const file = readFileSync(`packages/assets/runtime/sprite-${name}.webp`);
    if (file.toString('ascii', 0, 4) !== 'RIFF' || file.toString('ascii', 8, 12) !== 'WEBP') {
        throw new Error(`Sprite WebP invalide (${name})`);
    }

    const chunks = new Map<string, Buffer>();
    const end = file.readUInt32LE(4) + 8;
    if (end > file.length) throw new Error('Conteneur WebP tronqué');
    for (let offset = 12; offset < end;) {
        const size = file.readUInt32LE(offset + 4);
        const start = offset + 8;
        const next = start + size + (size % 2);
        if (next > end) throw new Error('Chunk WebP tronqué');
        chunks.set(file.toString('ascii', offset, offset + 4), file.subarray(start, start + size));
        offset = next;
    }
    return chunks;
}

function dimensions(chunks: Map<string, Buffer>) {
    const extended = chunks.get('VP8X');
    if (extended) {
        return { width: extended.readUIntLE(4, 3) + 1, height: extended.readUIntLE(7, 3) + 1 };
    }
    const lossless = chunks.get('VP8L');
    if (lossless?.[0] === 0x2f) {
        const header = lossless.readUInt32LE(1);
        return { width: (header & 0x3fff) + 1, height: ((header >>> 14) & 0x3fff) + 1 };
    }
    const lossy = chunks.get('VP8 ');
    if (lossy?.readUIntLE(3, 3) === 0x2a019d) {
        return { width: lossy.readUInt16LE(6) & 0x3fff, height: lossy.readUInt16LE(8) & 0x3fff };
    }
    throw new Error('Dimensions WebP introuvables');
}

export function dimensionsSprite(name: string) {
    return dimensions(lireSprite(name));
}

type LireBits = (count: number) => number;

function lecteurBits(data: Buffer): LireBits {
    let offset = 0;
    return (count) => {
        if (offset + count > data.length * 8) throw new Error('Flux alpha WebP tronqué');
        let value = 0;
        for (let bit = 0; bit < count; bit++, offset++) {
            value |= ((data.readUInt8(offset >>> 3) >>> (offset & 7)) & 1) << bit;
        }
        return value;
    };
}

// Codes de Huffman canoniques, triés par longueur puis par symbole.
function decodeurPrefixe(read: LireBits, lengths: number[]) {
    const symbols = lengths
        .map((length, symbol) => ({ length, symbol }))
        .filter(({ length }) => length > 0)
        .sort((a, b) => a.length - b.length || a.symbol - b.symbol);
    const [first] = symbols;
    if (first && symbols.length === 1) return () => first.symbol;

    const codes = new Map<number, number>();
    let code = 0;
    let previousLength = 0;
    for (const { length, symbol } of symbols) {
        code <<= length - previousLength;
        codes.set((1 << length) | code, symbol);
        code++;
        previousLength = length;
    }
    return () => {
        let prefix = 1;
        for (let length = 1; length <= previousLength; length++) {
            prefix = (prefix << 1) | read(1);
            const symbol = codes.get(prefix);
            if (symbol !== undefined) return symbol;
        }
        throw new Error('Code de Huffman WebP invalide');
    };
}

const ordreLongueurs = [17, 18, 0, 1, 2, 3, 4, 5, 16, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

function lirePrefixe(read: LireBits, alphabet: number) {
    const lengths = Array<number>(alphabet).fill(0);
    if (read(1)) {
        const count = read(1) + 1;
        lengths[read(read(1) ? 8 : 1)] = 1;
        if (count === 2) lengths[read(8)] = 1;
        return decodeurPrefixe(read, lengths);
    }

    const codeLengths = Array<number>(ordreLongueurs.length).fill(0);
    const count = read(4) + 4;
    for (const symbol of ordreLongueurs.slice(0, count)) codeLengths[symbol] = read(3);
    const nextLength = decodeurPrefixe(read, codeLengths);
    const limit = read(1) ? read(2 + 2 * read(3)) + 2 : alphabet;
    if (limit > alphabet) throw new Error('Alphabet de Huffman WebP invalide');

    let previous = 8;
    let offset = 0;
    for (let i = 0; i < limit && offset < alphabet; i++) {
        const length = nextLength();
        if (length < 16) {
            lengths[offset++] = length;
            if (length > 0) previous = length;
        } else {
            const extraBits = length === 18 ? 7 : length - 14;
            const end = offset + read(extraBits) + (length === 18 ? 11 : 3);
            if (end > alphabet) throw new Error('Répétition de Huffman WebP invalide');
            lengths.fill(length === 16 ? previous : 0, offset, end);
            offset = end;
        }
    }
    return decodeurPrefixe(read, lengths);
}

function lireEntierPrefixe(read: LireBits, prefix: number) {
    if (prefix < 4) return prefix + 1;
    const extraBits = (prefix >>> 1) - 1;
    return ((2 + (prefix & 1)) << extraBits) + read(extraBits) + 1;
}

// Distances de voisinage VP8L, codées sous la forme (ligne << 4) | (8 - colonne).
// https://developers.google.com/speed/webp/docs/webp_lossless_bitstream_specification
const voisins = [
    0x18, 0x07, 0x17, 0x19, 0x28, 0x06, 0x27, 0x29, 0x16, 0x1a, 0x26, 0x2a, 0x38, 0x05, 0x37, 0x39, 0x15,
    0x1b, 0x36, 0x3a, 0x25, 0x2b, 0x48, 0x04, 0x47, 0x49, 0x14, 0x1c, 0x35, 0x3b, 0x46, 0x4a, 0x24, 0x2c,
    0x45, 0x4b, 0x34, 0x3c, 0x58, 0x03, 0x57, 0x59, 0x13, 0x1d, 0x56, 0x5a, 0x23, 0x2d, 0x44, 0x4c, 0x55,
    0x5b, 0x33, 0x3d, 0x68, 0x02, 0x67, 0x69, 0x12, 0x1e, 0x66, 0x6a, 0x22, 0x2e, 0x54, 0x5c, 0x43, 0x4d,
    0x65, 0x6b, 0x32, 0x3e, 0x78, 0x01, 0x77, 0x79, 0x53, 0x5d, 0x11, 0x1f, 0x64, 0x6c, 0x42, 0x4e, 0x76,
    0x7a, 0x21, 0x2f, 0x75, 0x7b, 0x31, 0x3f, 0x63, 0x6d, 0x52, 0x5e, 0x00, 0x74, 0x7c, 0x41, 0x4f, 0x10,
    0x20, 0x62, 0x6e, 0x30, 0x73, 0x7d, 0x51, 0x5f, 0x40, 0x72, 0x7e, 0x61, 0x6f, 0x50, 0x71, 0x7f, 0x60,
    0x70,
];

function decodeAlpha(data: Buffer, width: number, height: number) {
    // Les pilules utilisent ALPH compressé, sans filtre ni prétraitement.
    if (data[0] !== 1) throw new Error('Mode ALPH WebP non pris en charge');
    const read = lecteurBits(data.subarray(1));
    // Le flux VP8L des pilules utilise un seul groupe de codes, sans transformation ni cache.
    if (read(3) !== 0) throw new Error('Mode de compression alpha VP8L non pris en charge');

    const green = lirePrefixe(read, 280);
    const red = lirePrefixe(read, 256);
    const blue = lirePrefixe(read, 256);
    const alpha = lirePrefixe(read, 256);
    const distance = lirePrefixe(read, 40);
    const pixels = Buffer.alloc(width * height);

    let offset = 0;
    while (offset < pixels.length) {
        const symbol = green();
        if (symbol < 256) {
            // Dans ALPH, seul le canal vert du flux VP8L représente l’opacité.
            pixels[offset++] = symbol;
            red();
            blue();
            alpha();
        } else {
            const length = lireEntierPrefixe(read, symbol - 256);
            const code = lireEntierPrefixe(read, distance());
            const neighbour = voisins[code - 1];
            const back =
                neighbour === undefined
                    ? code - voisins.length
                    : Math.max(1, (neighbour >>> 4) * width + 8 - (neighbour & 15));
            const end = offset + length;
            if (back > offset || end > pixels.length) throw new Error('Copie alpha VP8L invalide');
            for (; offset < end; offset++) pixels[offset] = pixels.readUInt8(offset - back);
        }
    }
    return pixels;
}

export function alphaSprite(name: string) {
    const chunks = lireSprite(name);
    const { width, height } = dimensions(chunks);
    const alpha = chunks.get('ALPH');
    if (!alpha) {
        if ((chunks.get('VP8X')?.[0] ?? 0) & 0x10 || (chunks.get('VP8L')?.[4] ?? 0) & 0x10) {
            throw new Error('Canal alpha WebP sans chunk ALPH');
        }
        return '1 1 1 1 1';
    }
    const pixels = decodeAlpha(alpha, width, height);
    const bottom = (height - 1) * width;
    const center = Math.floor(height / 2) * width + Math.floor(width / 2);
    return [0, width - 1, bottom, bottom + width - 1, center]
        .map((offset) => pixels.readUInt8(offset) / 255)
        .join(' ');
}
