import * as assert from 'node:assert/strict'

import {
    analyzeEnglishWord,
    generateEnglishInflections,
    setEnglishMorphologyAssetData
} from '../../src/utils/english-inflection-generator'

const generationPairs = new Map<string, string>([
    ['study', 'studies'],
    ['try', 'tried'],
    ['make', 'making'],
    ['watch', 'watches'],
    ['stop', 'stopped'],
    ['city', 'cities'],
    ['go', 'went']
])

for (const [baseForm, surface] of generationPairs.entries()) {
    const generated = generateEnglishInflections(baseForm)
    assert.equal(generated.includes(surface), true, `${baseForm} should generate ${surface}`)
}

const restorePairs = new Map<string, string>([
    ['studies', 'study'],
    ['tried', 'try'],
    ['making', 'make'],
    ['watches', 'watch'],
    ['stopped', 'stop'],
    ['running', 'run'],
    ['went', 'go']
])

for (const [surface, baseForm] of restorePairs.entries()) {
    const result = analyzeEnglishWord(surface)
    assert.equal(result?.baseForm, baseForm, `${surface} should restore to ${baseForm}`)
}

setEnglishMorphologyAssetData({
    schemaVersion: 1,
    verbs: {},
    nouns: {
        child: ['children'],
        mouse: ['mice']
    },
    adjectives: {
        good: ['better', 'best']
    }
})

for (const [surface, baseForm] of new Map<string, string>([
    ['children', 'child'],
    ['mice', 'mouse']
]).entries()) {
    const result = analyzeEnglishWord(surface)
    assert.equal(result?.baseForm, baseForm, `${surface} should restore to ${baseForm} via external asset`)
    assert.equal(result?.analysisSource, 'external-resource', `${surface} should be tagged as external-resource`)
}

for (const rejected of ['saw', 'left', 'axes']) {
    const result = analyzeEnglishWord(rejected)
    assert.equal(result?.analysisSource, 'fallback', `${rejected} should remain conservative fallback`)
    assert.equal(result?.baseForm, rejected, `${rejected} should not be silently rewritten`) 
}

for (const rejected of ['better', 'best']) {
    const result = analyzeEnglishWord(rejected)
    assert.equal(result?.analysisSource, 'fallback', `${rejected} should remain conservative fallback`)
    assert.equal(result?.baseForm, rejected, `${rejected} should not be silently rewritten via external asset`)
}

console.log('PASS english-word-restore-runtime')
