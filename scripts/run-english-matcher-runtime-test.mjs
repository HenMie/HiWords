import esbuild from 'esbuild'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tempDir = mkdtempSync(path.join(tmpdir(), 'hiwords-english-matcher-runtime-'))
const bundlePath = path.join(tempDir, 'matcher-runtime.test.mjs')
const obsidianStubPath = path.join(tempDir, 'obsidian-stub.mjs')

writeFileSync(
    obsidianStubPath,
    [
        'export class App {}',
        'export class ButtonComponent {}',
        'export class Component {}',
        'export class FuzzySuggestModal {}',
        'export class ItemView {}',
        'export class Modal {}',
        'export class Plugin {}',
        'export class PluginSettingTab {}',
        'export class TFile {}',
        'export class TFolder {}',
        'export class WorkspaceLeaf {}',
        'export class Notice {}',
        'export class MarkdownView {}',
        'export class Setting {}',
        'export class MarkdownRenderer {}',
        'export const setIcon = () => {}',
        'export const editorViewField = {}'
    ].join('\n')
)

try {
    await esbuild.build({
        entryPoints: [path.join(repoRoot, 'tests/english-morphology/matcher-runtime.test.ts')],
        outfile: bundlePath,
        bundle: true,
        platform: 'node',
        format: 'esm',
        logLevel: 'silent',
        plugins: [
            {
                name: 'obsidian-stub',
                setup(build) {
                    build.onResolve({ filter: /^obsidian$/ }, () => ({ path: obsidianStubPath }))
                }
            }
        ]
    })

    await import(pathToFileURL(bundlePath).href)
} finally {
    rmSync(tempDir, { recursive: true, force: true })
}
