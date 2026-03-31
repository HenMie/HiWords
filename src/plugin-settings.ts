import type { HiWordsSettings, VocabularyBook } from './utils/types'
import { DEFAULT_LANGUAGE_POLICY, normalizeLanguagePolicy } from './core/morphology-language-resolver'
import {
    DEFAULT_ARTICLE_VOCABULARY_EXPORT_FIELDS,
    sanitizeExportFields,
    sanitizeExportOrder
} from './utils/vocabulary-export'

export const DEFAULT_SETTINGS: HiWordsSettings = {
    vocabularyBooks: [],
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
        prompt: 'Please provide a concise definition for the word "{{word}}" based on this context:\\n\\nSentence: {{sentence}}\\n\\nFormat:\\n1) Part of speech\\n2) English definition\\n3) Chinese translation\\n4) Example sentence (use the original sentence if appropriate)'
    },
    highlightMode: 'all',
    highlightPaths: '',
    fileNodeParseMode: 'filename-with-content',
    morphologyEngineMode: 'hybrid',
    morphologyFallbackMode: 'conservative',
    exportOrder: 'document',
    exportFields: [...DEFAULT_ARTICLE_VOCABULARY_EXPORT_FIELDS]
}

const LEGACY_CANVAS_LAYOUT_SETTING_KEYS = [
    'autoLayoutEnabled',
    'cardWidth',
    'cardHeight',
    'horizontalGap',
    'verticalGap',
    'leftPadding',
    'columnsAuto',
    'columns',
    'minLeftX',
    'maxColumns',
    'groupInnerPadding',
    'groupInnerColumns',
    'groupInnerGap'
] as const

export function buildNormalizedSettings(rawSettings: unknown): {
    settings: HiWordsSettings
    changed: boolean
} {
    const { sanitized, removed } = stripLegacyCanvasLayoutSettings(rawSettings)
    const { books, changed: booksChanged } = normalizeVocabularyBooks(sanitized.vocabularyBooks)
    const normalizedExportOrder = sanitizeExportOrder(sanitized.exportOrder as HiWordsSettings['exportOrder'])
    const normalizedExportFields = sanitizeExportFields(
        sanitized.exportFields as HiWordsSettings['exportFields'],
        DEFAULT_ARTICLE_VOCABULARY_EXPORT_FIELDS
    )
    const exportChanged =
        normalizedExportOrder !== sanitized.exportOrder
        || !sameStringArray(normalizedExportFields, sanitized.exportFields)

    const settings = Object.assign({}, DEFAULT_SETTINGS, sanitized, {
        vocabularyBooks: books,
        exportOrder: normalizedExportOrder,
        exportFields: normalizedExportFields
    })

    return {
        settings,
        changed: removed || booksChanged || exportChanged
    }
}

function normalizeVocabularyBooks(rawBooks: unknown): {
    books: VocabularyBook[]
    changed: boolean
} {
    if (!Array.isArray(rawBooks)) {
        return { books: [], changed: false }
    }

    let changed = false
    const books: VocabularyBook[] = rawBooks.flatMap((rawBook) => {
        if (!rawBook || typeof rawBook !== 'object') {
            changed = true
            return []
        }

        const book = rawBook as Record<string, unknown>
        const path = typeof book.path === 'string' ? book.path : ''
        const name = typeof book.name === 'string' ? book.name : ''
        const enabled = typeof book.enabled === 'boolean' ? book.enabled : true
        const languagePolicy = normalizeLanguagePolicy(
            book.languagePolicy ?? book.morphology,
            DEFAULT_LANGUAGE_POLICY
        )

        if (!path || !name) {
            changed = true
            return []
        }

        if (
            book.languagePolicy !== languagePolicy ||
            Object.prototype.hasOwnProperty.call(book, 'morphology')
        ) {
            changed = true
        }

        return [{
            path,
            name,
            enabled,
            languagePolicy
        }]
    })

    return { books, changed }
}

function stripLegacyCanvasLayoutSettings(data: unknown): {
    sanitized: Record<string, unknown>
    removed: boolean
} {
    if (!data || typeof data !== 'object') {
        return { sanitized: {}, removed: false }
    }

    const sanitized = { ...(data as Record<string, unknown>) }
    let removed = false
    for (const key of LEGACY_CANVAS_LAYOUT_SETTING_KEYS) {
        if (Object.prototype.hasOwnProperty.call(sanitized, key)) {
            delete sanitized[key]
            removed = true
        }
    }

    return { sanitized, removed }
}

function sameStringArray(left: unknown, right: unknown): boolean {
    if (!Array.isArray(left) || !Array.isArray(right)) {
        return false
    }

    if (left.length !== right.length) {
        return false
    }

    return left.every((value, index) => value === right[index])
}
