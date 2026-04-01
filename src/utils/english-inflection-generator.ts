/**
 * 英语屈折变化生成/还原工具
 * v1 只覆盖显式 english policy 下的常见、低歧义规则
 */

const ENGLISH_WORD_REGEX = /^[A-Za-z][A-Za-z'-]*$/
const COMMON_IRREGULAR_FORMS: Record<string, readonly string[]> = {
    be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'],
    do: ['does', 'did', 'done', 'doing'],
    go: ['goes', 'went', 'gone', 'going'],
    have: ['has', 'had', 'having'],
    run: ['ran', 'running', 'runs']
}
const IRREGULAR_REVERSE_INDEX = buildIrregularReverseIndex(COMMON_IRREGULAR_FORMS)
const AMBIGUOUS_REVERSE_REJECTS = new Set(['saw', 'left', 'axes'])

export interface EnglishMorphologyAnalysis {
    surface: string
    baseForm: string
    partOfSpeech: string
    confidence: number
    analysisSource: 'reverse-rule' | 'fallback'
    rejectionHint?: 'ambiguous-top-candidates' | 'fallback-only-candidate'
}

export function isLikelyEnglishWord(word: string): boolean {
    return ENGLISH_WORD_REGEX.test(word.trim())
}

export function generateEnglishInflections(baseWord: string): string[] {
    const normalized = normalizeEnglishWord(baseWord)
    if (!normalized) {
        return []
    }

    const forms = new Set<string>([normalized])
    for (const irregular of COMMON_IRREGULAR_FORMS[normalized] ?? []) {
        forms.add(irregular)
    }

    for (const form of generateRegularEnglishInflections(normalized)) {
        forms.add(form)
    }

    return Array.from(forms)
}

export function analyzeEnglishWord(word: string): EnglishMorphologyAnalysis | null {
    const normalized = normalizeEnglishWord(word)
    if (!normalized) {
        return null
    }

    if (AMBIGUOUS_REVERSE_REJECTS.has(normalized)) {
        return {
            surface: normalized,
            baseForm: normalized,
            partOfSpeech: 'UNKNOWN',
            confidence: 0.3,
            analysisSource: 'fallback',
            rejectionHint: 'ambiguous-top-candidates'
        }
    }

    const irregularBase = IRREGULAR_REVERSE_INDEX.get(normalized)
    if (irregularBase) {
        return {
            surface: normalized,
            baseForm: irregularBase,
            partOfSpeech: 'ENGLISH-IRREGULAR',
            confidence: 0.94,
            analysisSource: 'reverse-rule'
        }
    }

    const candidate = inferRegularEnglishBaseForm(normalized)
    if (!candidate || candidate === normalized) {
        return {
            surface: normalized,
            baseForm: normalized,
            partOfSpeech: 'UNKNOWN',
            confidence: 0.3,
            analysisSource: 'fallback',
            rejectionHint: 'fallback-only-candidate'
        }
    }

    return {
        surface: normalized,
        baseForm: candidate,
        partOfSpeech: 'ENGLISH-INFLECTED',
        confidence: 0.88,
        analysisSource: 'reverse-rule'
    }
}

function normalizeEnglishWord(word: string): string {
    const normalized = word.trim().toLowerCase()
    return isLikelyEnglishWord(normalized) ? normalized : ''
}

function buildIrregularReverseIndex(
    dictionary: Record<string, readonly string[]>
): Map<string, string> {
    const reverseIndex = new Map<string, string>()
    for (const [baseForm, forms] of Object.entries(dictionary)) {
        for (const form of forms) {
            reverseIndex.set(form, baseForm)
        }
    }
    return reverseIndex
}

function generateRegularEnglishInflections(baseWord: string): Set<string> {
    const forms = new Set<string>()
    for (const form of buildPluralForms(baseWord)) {
        forms.add(form)
    }
    for (const form of buildThirdPersonSingularForms(baseWord)) {
        forms.add(form)
    }
    for (const form of buildPastForms(baseWord)) {
        forms.add(form)
    }
    for (const form of buildProgressiveForms(baseWord)) {
        forms.add(form)
    }
    return forms
}

function buildPluralForms(baseWord: string): string[] {
    if (endsWithConsonantY(baseWord)) {
        return [replaceSuffix(baseWord, 1, 'ies')]
    }
    if (needsEsSuffix(baseWord)) {
        return [`${baseWord}es`]
    }
    return [`${baseWord}s`]
}

function buildThirdPersonSingularForms(baseWord: string): string[] {
    return buildPluralForms(baseWord)
}

function buildPastForms(baseWord: string): string[] {
    const forms = new Set<string>()
    if (endsWithConsonantY(baseWord)) {
        forms.add(replaceSuffix(baseWord, 1, 'ied'))
    } else if (baseWord.endsWith('e')) {
        forms.add(`${baseWord}d`)
    } else {
        forms.add(`${baseWord}ed`)
    }

    const doubled = maybeDoubleFinalConsonant(baseWord)
    if (doubled) {
        forms.add(`${baseWord}${baseWord.slice(-1)}ed`)
    }

    return Array.from(forms)
}

function buildProgressiveForms(baseWord: string): string[] {
    const forms = new Set<string>()
    if (baseWord.endsWith('ie')) {
        forms.add(`${replaceSuffix(baseWord, 2, 'ying')}`)
        return Array.from(forms)
    }

    if (baseWord.endsWith('e') && !baseWord.endsWith('ee')) {
        forms.add(`${replaceSuffix(baseWord, 1, 'ing')}`)
    } else {
        forms.add(`${baseWord}ing`)
    }

    const doubled = maybeDoubleFinalConsonant(baseWord)
    if (doubled) {
        forms.add(`${baseWord}${baseWord.slice(-1)}ing`)
    }

    return Array.from(forms)
}

function inferRegularEnglishBaseForm(surface: string): string | null {
    if (surface.endsWith('ies') && surface.length > 3) {
        return selectFirstRoundTripCandidate(surface, [
            `${replaceSuffix(surface, 3, 'y')}`
        ])
    }
    if (surface.endsWith('ied') && surface.length > 3) {
        return selectFirstRoundTripCandidate(surface, [
            `${replaceSuffix(surface, 3, 'y')}`
        ])
    }
    if (surface.endsWith('ing') && surface.length > 4) {
        const stem = surface.slice(0, -3)
        const undoubled = maybeUndoubleFinalConsonant(stem)
        return selectFirstRoundTripCandidate(surface, [
            `${stem}e`,
            undoubled,
            stem
        ])
    }
    if (surface.endsWith('ed') && surface.length > 3) {
        const stem = surface.slice(0, -2)
        const undoubled = maybeUndoubleFinalConsonant(stem)
        return selectFirstRoundTripCandidate(surface, [
            undoubled,
            `${stem}e`,
            stem
        ])
    }
    if (surface.endsWith('es') && surface.length > 3) {
        return selectFirstRoundTripCandidate(surface, [
            surface.slice(0, -2)
        ])
    }
    if (surface.endsWith('s') && surface.length > 2 && !surface.endsWith('ss')) {
        return selectFirstRoundTripCandidate(surface, [
            surface.slice(0, -1)
        ])
    }

    return null
}

function needsEsSuffix(baseWord: string): boolean {
    return /(s|sh|ch|x|z|o)$/i.test(baseWord)
}

function endsWithConsonantY(baseWord: string): boolean {
    return /[^aeiou]y$/i.test(baseWord)
}

function maybeDoubleFinalConsonant(baseWord: string): boolean {
    return /[aeiou][^aeiouwxy]$/i.test(baseWord)
}

function maybeUndoubleFinalConsonant(stem: string): string | null {
    if (/([b-df-hj-np-tv-z])\1$/i.test(stem)) {
        return stem.slice(0, -1)
    }
    return null
}

function replaceSuffix(value: string, suffixLength: number, replacement: string): string {
    return `${value.slice(0, -suffixLength)}${replacement}`
}

function selectFirstRoundTripCandidate(
    surface: string,
    candidates: Array<string | null | undefined>
): string | null {
    for (const candidate of candidates) {
        const normalizedCandidate = normalizeEnglishWord(candidate ?? '')
        if (!normalizedCandidate) {
            continue
        }
        if (generateEnglishInflections(normalizedCandidate).includes(surface)) {
            return normalizedCandidate
        }
    }
    return null
}
