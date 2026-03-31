import * as assert from 'node:assert/strict'

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
    buildArticleVocabularyExportFilePath,
    buildArticleVocabularyExportRows,
    ensureFolderExists,
    getDefaultArticleVocabularyExportConfig,
    serializeArticleVocabularyRowsToCsv
} = require('../src/utils/vocabulary-export.ts') as typeof import('../src/utils/vocabulary-export')
import type { ArticleVocabularyExportRow } from '../src/utils/vocabulary-export'
import type { ArticleVocabularySnapshot, HiWordsSettings } from '../src/utils/types'

function createSnapshot(): ArticleVocabularySnapshot {
    return {
        filePath: 'Articles/Example.md',
        fileName: 'Example Article',
        status: 'ready',
        words: [
            {
                word: 'zebra',
                definition: 'line one,\nline two',
                pronunciation: '/ˈziː.brə/',
                etymology: 'from "zebra"',
                source: 'Books/animals.jsonl',
                nodeId: 'node-zebra',
                color: '4',
                mastered: true
            },
            {
                word: 'apple',
                definition: 'fruit',
                pronunciation: '/ˈæp.əl/',
                etymology: 'Old English',
                source: 'Books/fruits.canvas',
                nodeId: 'node-apple',
                color: '2',
                mastered: false
            }
        ]
    }
}

async function main(): Promise<void> {
    const settings: HiWordsSettings = {
        vocabularyBooks: [
            { path: 'Books/animals.jsonl', name: 'Animals', enabled: true, languagePolicy: 'none' },
            { path: 'Books/fruits.canvas', name: 'Fruits', enabled: true, languagePolicy: 'none' }
        ],
        showDefinitionOnHover: true,
        enableAutoHighlight: true,
        highlightStyle: 'underline',
        enableMasteredFeature: true,
        showMasteredInSidebar: true,
        blurDefinitions: false,
        showWordSource: true,
        ttsTemplate: 'https://dict.youdao.com/dictvoice?audio={{word}}&type=2',
        debugMode: false,
        aiDictionary: {
            apiUrl: 'https://api.openai.com/v1/chat/completions',
            apiKey: '',
            model: 'gpt-4o-mini',
            prompt: ''
        },
        highlightMode: 'all',
        highlightPaths: '',
        fileNodeParseMode: 'filename-with-content',
        morphologyEngineMode: 'hybrid',
        morphologyFallbackMode: 'conservative',
        exportOrder: 'document',
        exportFields: ['word', 'definition', 'pronunciation', 'etymology', 'sourceBookName', 'mastered']
    }

    const defaults = getDefaultArticleVocabularyExportConfig(settings)
    assert.deepEqual(defaults.fields, settings.exportFields, 'default export fields should follow settings')
    assert.equal(defaults.order, 'document', 'default export order should follow settings')

    const snapshot = createSnapshot()
    const alphabeticalRows = buildArticleVocabularyExportRows(snapshot, settings, 'alphabetical')
    assert.deepEqual(
        alphabeticalRows.map((row: ArticleVocabularyExportRow) => row.word),
        ['apple', 'zebra'],
        'alphabetical export should sort by word'
    )
    assert.equal(alphabeticalRows[0].sourceBookName, 'Fruits', 'source book should map to configured book name')
    assert.equal(alphabeticalRows[1].orderInDocument, '1', 'document order should remain available after sorting')

    const csv = serializeArticleVocabularyRowsToCsv(
        ['word', 'definition', 'sourceBookName', 'mastered'],
        buildArticleVocabularyExportRows(snapshot, settings, 'document')
    )
    assert.equal(
        csv,
        'word,definition,sourceBookName,mastered\n'
        + 'zebra,"line one,\nline two",Animals,true\n'
        + 'apple,fruit,Fruits,false',
        'csv export should preserve field order and escape multiline/comma cells'
    )

    const exportPath = buildArticleVocabularyExportFilePath(
        'Exports/Sub Folder',
        'Example:/Article?',
        new Date('2026-03-31T09:07:00+08:00')
    )
    assert.equal(
        exportPath,
        'Exports/Sub Folder/Example--Article--hiwords-export-20260331-0907.csv',
        'export path should sanitize invalid filename characters and append timestamp'
    )

    const createdFolders: string[] = []
    const existingFolders = new Set<string>(['Exports'])
    await ensureFolderExists(
        async (path: string) => {
            createdFolders.push(path)
            existingFolders.add(path)
        },
        (path: string) => existingFolders.has(path),
        'Exports/Sub Folder/Nested'
    )
    assert.deepEqual(
        createdFolders,
        ['Exports/Sub Folder', 'Exports/Sub Folder/Nested'],
        'ensureFolderExists should create only missing nested vault folders'
    )

    console.log('PASS article-vocabulary-export-utils')
}

main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    console.error(`FAIL article-vocabulary-export-utils - ${message}`)
    process.exitCode = 1
})
