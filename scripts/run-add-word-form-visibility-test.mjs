import esbuild from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tempDir = mkdtempSync(path.join(tmpdir(), 'hiwords-add-word-visibility-'))
const bundlePath = path.join(tempDir, 'add-word-form-visibility.test.mjs')

try {
    await esbuild.build({
        entryPoints: [path.join(repoRoot, 'tests/add-word-form-visibility.test.ts')],
        outfile: bundlePath,
        bundle: true,
        platform: 'node',
        format: 'esm',
        logLevel: 'silent'
    })

    await import(pathToFileURL(bundlePath).href)
} finally {
    rmSync(tempDir, { recursive: true, force: true })
}
