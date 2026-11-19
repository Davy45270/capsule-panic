import { readFileSync, writeFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import standalone from 'ajv/dist/standalone/index.js';

const contracts = new URL('../packages/contracts/', import.meta.url);
const readSchema = (name) =>
    JSON.parse(readFileSync(new URL(`schemas/${name}.schema.json`, contracts), 'utf8'));
const game = readSchema('game');
const puzzle = readSchema('puzzle');
const puzzleId = new URL('puzzle.schema.json', game.$id).href;
const ajv = new Ajv2020({ allErrors: true, strict: true, code: { source: true, esm: true } });
ajv.addSchema(game);
ajv.addSchema({ ...puzzle, $id: puzzleId });

const source = standalone(ajv, { checkShape: game.$id, checkPuzzle: puzzleId });
// Ajv émet encore un require pour ce helper même avec code.esm.
const moduleSource = source.replace('require("ajv/dist/runtime/ucs2length").default', 'unicodeLength');
if (moduleSource.includes('require(')) throw new Error('Un auxiliaire Ajv doit être converti en import ESM');
writeFileSync(
    new URL('src/schema-validators.mjs', contracts),
    `import ucs2length from 'ajv/dist/runtime/ucs2length.js';
const unicodeLength = typeof ucs2length === 'function' ? ucs2length : ucs2length.default;
${moduleSource}
`,
);
