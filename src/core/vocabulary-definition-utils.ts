import type { WordDefinition } from '../utils'
import { parsePhrase } from '../utils'

export function normalizeWordValue(word: string): string {
    return word.trim().toLowerCase()
}

export function parsePatternMetadata(
    rawWord: string
): Pick<WordDefinition, 'word' | 'isPattern' | 'patternParts'> {
    const phraseInfo = parsePhrase(rawWord)
    const normalizedWord = phraseInfo.isPattern ? phraseInfo.original : rawWord.trim()
    return {
        word: normalizedWord,
        isPattern: phraseInfo.isPattern,
        patternParts: phraseInfo.isPattern ? phraseInfo.parts : undefined
    }
}

export function applyPatternMetadata(definition: WordDefinition): WordDefinition {
    const patternMeta = parsePatternMetadata(definition.word)
    return {
        ...definition,
        word: patternMeta.word,
        isPattern: patternMeta.isPattern,
        patternParts: patternMeta.patternParts
    }
}

export function getColorString(color: number): string | undefined {
    return color >= 1 && color <= 6 ? color.toString() : undefined
}
