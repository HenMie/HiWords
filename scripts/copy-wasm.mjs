import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const FILE_MAPPINGS = [
    ['node_modules/lindera-wasm-ko-dic/lindera_wasm_bg.wasm', 'lindera_wasm_bg.wasm'],
    ['node_modules/lindera-wasm-ko-dic/lindera_wasm.js', 'lindera_wasm.js'],
    ['node_modules/lindera-wasm-ipadic/lindera_wasm_bg.wasm', 'lindera_wasm_ja_bg.wasm'],
    ['node_modules/lindera-wasm-ipadic/lindera_wasm.js', 'lindera_wasm_ja.js']
];

for (const [source, target] of FILE_MAPPINGS) {
    const sourcePath = resolve(source);
    const targetPath = resolve(target);

    if (!existsSync(sourcePath)) {
        throw new Error(`[copy-wasm] Missing source file: ${source}`);
    }

    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(sourcePath, targetPath);
    console.log(`[copy-wasm] ${source} -> ${target}`);
}
