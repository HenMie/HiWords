import type { MorphologyLanguage, VocabularyBook } from '../utils'

export function selectInitialBookPath(
    enabledBooks: VocabularyBook[],
    isEditMode: boolean,
    definitionSource: string | null,
    lastSelectedBookPath: string | null
): string | null {
    if (enabledBooks.length === 0) {
        return null
    }

    if (isEditMode && definitionSource) {
        return definitionSource
    }

    if (lastSelectedBookPath && enabledBooks.some((book) => book.path === lastSelectedBookPath)) {
        return lastSelectedBookPath
    }

    return enabledBooks[0].path
}

export function getPronunciationPlaceholderKey(
    languagePolicy: MorphologyLanguage,
    text: string,
    isJapaneseText: (value: string) => boolean
): 'modals.pronunciation_placeholder_japanese' | 'modals.pronunciation_placeholder' | 'modals.pronunciation_placeholder_english' {
    if (languagePolicy === 'japanese' || isJapaneseText(text.trim())) {
        return 'modals.pronunciation_placeholder_japanese'
    }

    if (languagePolicy === 'english' || /^[A-Za-z][A-Za-z' -]*$/.test(text.trim())) {
        return 'modals.pronunciation_placeholder_english'
    }

    return 'modals.pronunciation_placeholder'
}
