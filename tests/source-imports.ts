import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSync, traverse, types } from '@babel/core';

export function sourceImports(root: string) {
    return globSync('**/*.{ts,tsx,js,jsx,mts,mjs,cts,cjs}', { cwd: root }).flatMap((name) => {
        const file = join(root, name);
        const source = readFileSync(file, 'utf8');
        const ast = parseSync(source, {
            filename: file,
            babelrc: false,
            configFile: false,
            parserOpts: { plugins: ['typescript', 'jsx'] },
        });
        if (!ast) throw new Error(`Source non analysée : ${file}`);

        const imports: { file: string; module: string; statement: string }[] = [];
        function record(module: string, node: types.Node) {
            imports.push({ file, module, statement: source.slice(node.start ?? 0, node.end ?? 0) });
        }

        traverse(ast, {
            ImportDeclaration({ node }) {
                if (node.importKind === 'type') return;
                if (
                    node.specifiers.length > 0 &&
                    node.specifiers.every(
                        (specifier) => types.isImportSpecifier(specifier) && specifier.importKind === 'type',
                    )
                )
                    return;
                record(node.source.value, node);
            },
            ExportNamedDeclaration({ node }) {
                if (node.source && node.exportKind !== 'type') record(node.source.value, node);
            },
            ExportAllDeclaration({ node }) {
                if (node.exportKind !== 'type') record(node.source.value, node);
            },
            ImportExpression({ node }) {
                if (types.isStringLiteral(node.source)) record(node.source.value, node);
            },
            CallExpression({ node }) {
                const [argument] = node.arguments;
                if (types.isIdentifier(node.callee, { name: 'require' }) && types.isStringLiteral(argument)) {
                    record(argument.value, node);
                }
            },
        });
        return imports;
    });
}
