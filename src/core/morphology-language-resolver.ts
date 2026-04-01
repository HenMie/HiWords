import type { MorphologyLanguage, VocabularyBook } from '../utils/types'
import { isKoreanText } from '../utils/korean-text-utils'
import { getScriptStatistics, isJapaneseText } from '../utils/japanese-text-utils'
import type {
    MorphologyAnalyzeOptions,
    MorphologyDetectionLanguage
} from './morphology-types'

const MORPHOLOGY_LANGUAGE_VALUES: readonly MorphologyLanguage[] = [
    'none',
    'korean',
    'japanese',
    'english',
    'auto'
]

export const DEFAULT_LANGUAGE_POLICY: MorphologyLanguage = 'none'

export function isMorphologyLanguage(value: unknown): value is MorphologyLanguage {
    return typeof value === 'string' && MORPHOLOGY_LANGUAGE_VALUES.includes(value as MorphologyLanguage)
}

export function normalizeLanguagePolicy(
    value: unknown,
    fallback: MorphologyLanguage = DEFAULT_LANGUAGE_POLICY
): MorphologyLanguage {
    if (isMorphologyLanguage(value)) {
        return value
    }

    return fallback
}

export function getBookLanguagePolicy(
    book?: Pick<VocabularyBook, 'languagePolicy'> | null
): MorphologyLanguage {
    return normalizeLanguagePolicy(book?.languagePolicy)
}

export function detectMorphologyLanguage(
    text: string,
    options?: MorphologyAnalyzeOptions
): MorphologyDetectionLanguage {
    const normalizedText = text.trim()
    if (!normalizedText) {
        return 'unknown'
    }

    if (isKoreanText(normalizedText)) {
        return 'korean'
    }

    if (isJapaneseText(normalizedText)) {
        return 'japanese'
    }

    const contextText = options?.contextText || ''
    const scriptStats = getScriptStatistics(`${contextText}${normalizedText}`)

    if (scriptStats.korean > 0 && scriptStats.korean >= scriptStats.kana) {
        return 'korean'
    }

    if (scriptStats.kana > 0) {
        return 'japanese'
    }

    return 'unknown'
}

export function resolveMorphologyTargetLanguage(
    text: string,
    language: MorphologyLanguage,
    options?: MorphologyAnalyzeOptions
): MorphologyDetectionLanguage {
    const languagePolicy = normalizeLanguagePolicy(options?.languagePolicy ?? language, language)
    if (languagePolicy === 'none') {
        return 'unknown'
    }

    if (languagePolicy === 'korean' || languagePolicy === 'japanese' || languagePolicy === 'english') {
        return languagePolicy
    }

    return detectMorphologyLanguage(text, options)
}

export function toDetectionPreference(
    languagePolicy?: MorphologyLanguage
): MorphologyDetectionLanguage | 'none' {
    if (!languagePolicy || languagePolicy === 'auto') {
        return 'unknown'
    }

    if (languagePolicy === 'none') {
        return 'none'
    }

    return languagePolicy
}
