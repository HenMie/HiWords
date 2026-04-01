import * as assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { JapaneseMorphologyService } from '../../src/core/japanese-morphology-service'
import { generateJapaneseInflections } from '../../src/utils/japanese-inflection-generator'

function readJapaneseWasmBytes(): ArrayBuffer {
    const wasmPath = path.join(
        process.cwd(),
        'node_modules',
        'lindera-wasm-ipadic',
        'lindera_wasm_bg.wasm'
    )
    const buffer = fs.readFileSync(wasmPath)
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

async function main(): Promise<void> {
    const expectedGeneratedInflections = new Map<string, string>([
        ['ちやほやする', 'ちやほやし'],
        ['妬む', '妬み'],
        ['ねたむ', 'ねたみ'],
        ['庇う', '庇った'],
        ['かばう', 'かばった'],
        ['欺く', '欺き'],
        ['あざむく', 'あざむき'],
        ['脅す', '脅して'],
        ['おどす', 'おどして']
    ])

    for (const [baseForm, expectedSurface] of expectedGeneratedInflections.entries()) {
        const generated = generateJapaneseInflections(baseForm)
        assert.equal(
            generated.includes(expectedSurface),
            true,
            `${baseForm} should generate ${expectedSurface}`
        )
    }

    const service = new JapaneseMorphologyService(undefined, {
        getWasmBytes: async () => readJapaneseWasmBytes()
    })

    try {
        const expectedWordLevelMappings = new Map<string, string>([
            ['ちやほやし', 'ちやほやする'],
            ['ねたみ', 'ねたむ'],
            ['かばった', 'かばう'],
            ['あざむき', 'あざむく'],
            ['おどして', 'おどす']
        ])

        for (const [surface, expectedBaseForm] of expectedWordLevelMappings.entries()) {
            const wordResult = await service.analyzeWord(surface)
            assert.equal(wordResult?.baseForm, expectedBaseForm, `${surface} should restore to ${expectedBaseForm}`)
        }

        const result = await service.analyzeDocument('ちやほやし ねたみ かばった あざむき おどして')

        const expectedMappings = new Map<string, string[]>([
            ['ちやほやする', ['ちやほやし']],
            ['ねたむ', ['ねたみ']],
            ['かばう', ['かばった']],
            ['あざむく', ['あざむき']],
            ['おどす', ['おどして']]
        ])

        for (const [baseForm, surfaces] of expectedMappings.entries()) {
            const actualSurfaces = Array.from(result.morphologyIndex.get(baseForm) ?? []).sort()
            assert.deepEqual(actualSurfaces, surfaces, `${baseForm} should index ${surfaces.join(', ')}`)
        }

        assert.equal(result.morphologyIndex.has('しねたむ'), false, 'document indexing must not merge across whitespace after suru stems')
        assert.equal(result.morphologyIndex.has('あざむきおどす'), false, 'document indexing must not merge independent verbs across whitespace')

        console.log('PASS japanese-document-index-runtime')
    } finally {
        service.destroy()
    }
}

main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    console.error(`FAIL japanese-document-index-runtime - ${message}`)
    process.exitCode = 1
})
