import * as assert from 'node:assert/strict'

import { WordMatcherService } from '../../src/core/word-matcher-service'
import type { HiWordsSettings, MorphologyLanguage, VocabularyBook, WordDefinition } from '../../src/utils/types'

const matcher = createMatcher(
    [
        {
            word: '気付く',
            pronunciation: 'きづく'
        }
    ],
    'japanese'
)

const matches = matcher.findMatches('ようやく違和感に気づけるようになった。')
const matched = matches.find((entry) => entry.matchedText === '気づける')

assert.ok(matched, 'japanese matcher should highlight 気付く(きづく) from surface 気づける')
assert.equal(matched?.baseForm, '気付く', '気づける should resolve to the stored 気付く definition')
assert.equal(matched?.payload?.word, '気付く', '気づける should keep the stored vocabulary payload')

console.log('PASS japanese-matcher-runtime')

function createMatcher(
    definitionsInput: Array<{ word: string; pronunciation?: string }>,
    languagePolicy: MorphologyLanguage
): WordMatcherService {
    const book = createBook(languagePolicy)
    const definitions = new Map<string, WordDefinition>(
        definitionsInput.map((entry) => [
            entry.word,
            createDefinition(entry.word, book.path, entry.pronunciation)
        ])
    )
    const baseWords = definitionsInput.map((entry) => entry.word)

    const settings: HiWordsSettings = {
        vocabularyBooks: [book],
        showDefinitionOnHover: true,
        enableAutoHighlight: true,
        highlightStyle: 'underline',
        enableMasteredFeature: false,
        showMasteredInSidebar: false,
        blurDefinitions: false,
        morphologyEngineMode: 'hybrid',
        morphologyFallbackMode: 'conservative'
    }

    const fakeUnifiedMorphologyService = {
        detectLanguage: () => 'japanese',
        isKoreanLoaded: () => false,
        isJapaneseLoaded: () => true,
        getLoader: () => ({})
    }

    const vocabularyManager = {
        getUnifiedMorphologyService: () => fakeUnifiedMorphologyService,
        getMatcherSnapshotVersion: () => 1,
        getAllWordsForHighlight: () => baseWords,
        getAllWords: () => baseWords,
        getDefinition: (word: string) => definitions.get(word) ?? null,
        getAllInflectionForms: () => new Set<string>(),
        getSettings: () => settings
    }

    return new WordMatcherService(vocabularyManager as never)
}

function createBook(languagePolicy: MorphologyLanguage): VocabularyBook {
    return {
        path: `${languagePolicy}-book.jsonl`,
        name: `${languagePolicy}-book`,
        enabled: true,
        languagePolicy
    }
}

function createDefinition(word: string, source: string, pronunciation?: string): WordDefinition {
    return {
        word,
        pronunciation,
        definition: `${word}-definition`,
        source,
        nodeId: `node-${word}`
    }
}
