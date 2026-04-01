import * as assert from 'node:assert/strict'

import { WordMatcherService } from '../../src/core/word-matcher-service'
import type { UnifiedMorphologyService } from '../../src/core/unified-morphology-service'
import type { HiWordsSettings, MorphologyLanguage, VocabularyBook, WordDefinition } from '../../src/utils/types'

type MatcherProbe = {
    baseForm: string
    surface: string
}

const EXPLICIT_ENGLISH_MATCHER_PROBES: MatcherProbe[] = [
    { baseForm: 'study', surface: 'studies' },
    { baseForm: 'try', surface: 'tried' },
    { baseForm: 'make', surface: 'making' },
    { baseForm: 'watch', surface: 'watches' },
    { baseForm: 'stop', surface: 'stopped' },
    { baseForm: 'go', surface: 'went' },
    { baseForm: 'run', surface: 'running' }
]

const explicitEnglishMatcher = createMatcher(
    EXPLICIT_ENGLISH_MATCHER_PROBES.map((probe) => probe.baseForm),
    'english'
)

for (const probe of EXPLICIT_ENGLISH_MATCHER_PROBES) {
    const matches = explicitEnglishMatcher.findMatches(`We saw ${probe.surface} in the article.`)
    const matched = matches.find((entry) => entry.matchedText?.toLowerCase() === probe.surface)

    assert.ok(matched, `explicit english policy should highlight ${probe.baseForm} -> ${probe.surface}`)
    assert.equal(matched?.baseForm, probe.baseForm, `${probe.surface} should map back to ${probe.baseForm}`)
    assert.equal(matched?.payload?.word, probe.baseForm, `${probe.surface} should resolve the stored base definition`)
}

const autoMatcher = createMatcher(['study'], 'auto')
const autoMatches = autoMatcher.findMatches('We saw studies in the article.')
assert.equal(
    autoMatches.some((entry) => entry.matchedText?.toLowerCase() === 'studies'),
    false,
    'auto policy must not implicitly enable english inflection matching in v1'
)

console.log('PASS english-matcher-runtime')

function createMatcher(baseWords: string[], languagePolicy: MorphologyLanguage): WordMatcherService {
    const book = createBook(languagePolicy)
    const definitions = new Map<string, WordDefinition>(
        baseWords.map((word) => [word, createDefinition(word, book.path)])
    )

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
        detectLanguage: () => 'unknown',
        isKoreanLoaded: () => false,
        isJapaneseLoaded: () => false
    } as unknown as UnifiedMorphologyService

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

function createDefinition(word: string, source: string): WordDefinition {
    return {
        word,
        definition: `${word}-definition`,
        source,
        nodeId: `node-${word}`
    }
}
