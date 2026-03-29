import * as assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { KoreanMorphologyService } from '../../src/core/korean-morphology-service'

function readKoreanWasmBytes(): ArrayBuffer {
    const wasmPath = path.join(
        process.cwd(),
        'node_modules',
        'lindera-wasm-ko-dic',
        'lindera_wasm_bg.wasm'
    )
    const buffer = fs.readFileSync(wasmPath)
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

async function main(): Promise<void> {
    const service = new KoreanMorphologyService(undefined, {
        getWasmBytes: async () => readKoreanWasmBytes()
    })

    try {
        const expectedWordLevelMappings = new Map<string, string>([
            ['따사롭다', '따사롭다'],
            ['따사로운', '따사롭다'],
            ['위태롭다', '위태롭다'],
            ['위태로운', '위태롭다']
        ])

        for (const [surface, expectedBaseForm] of expectedWordLevelMappings.entries()) {
            const wordResult = await service.analyzeWord(surface)
            assert.equal(wordResult?.baseForm, expectedBaseForm, `${surface} should restore to ${expectedBaseForm}`)
        }

        const result = await service.analyzeDocument('흐물거렸다 나불거렸다 거나하게 따사로운 위태로운')

        const expectedMappings = new Map<string, string[]>([
            ['흐물거리다', ['흐물거렸다']],
            ['나불거리다', ['나불거렸다']],
            ['거나하다', ['거나하게']],
            ['따사롭다', ['따사로운']],
            ['위태롭다', ['위태로운']]
        ])

        for (const [baseForm, surfaces] of expectedMappings.entries()) {
            const actualSurfaces = Array.from(result.morphologyIndex.get(baseForm) ?? []).sort()
            assert.deepEqual(actualSurfaces, surfaces, `${baseForm} should index ${surfaces.join(', ')}`)
        }

        assert.equal(result.morphologyIndex.has('물하다'), false, 'document indexing must not regress to 물하다')
        assert.equal(result.morphologyIndex.has('나불하다'), false, 'document indexing must not regress to 나불하다')
        assert.equal(result.morphologyIndex.has('하다'), false, 'document indexing must not regress to bare 하다 for 거나하게')
        assert.equal(result.morphologyIndex.has('따사하다'), false, 'document indexing must not regress to 따사하다')
        assert.equal(result.morphologyIndex.has('위태하다'), false, 'document indexing must not regress to 위태하다')

        console.log('PASS korean-document-index-runtime')
    } finally {
        service.destroy()
    }
}

main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    console.error(`FAIL korean-document-index-runtime - ${message}`)
    process.exitCode = 1
})
