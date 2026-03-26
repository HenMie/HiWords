import * as assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

export type MatrixEntrypoint =
    | 'word-analysis'
    | 'document-index'
    | 'matcher-highlighting'

export type MatrixServiceState = 'service-loaded' | 'generated-fallback-path'
export type MatrixExpectedOutcome =
    | 'accept'
    | 'reject'
    | 'index'
    | 'non-goal'
    | 'match-if-generated-form-exists'

export interface KoreanBehaviorMatrixCase {
    id: string
    surface: string
    entrypoint: MatrixEntrypoint
    languagePolicy: 'korean' | 'auto' | 'none' | 'japanese'
    serviceState: MatrixServiceState
    generatedFallbackAllowed: boolean
    expected: {
        outcome: MatrixExpectedOutcome
        baseForm: string | null
        reason?: string
    }
    uiParity: {
        addWord: string
        popover: string
    }
    documentExpectation: string
    matcherExpectation: string
}

export interface KoreanBehaviorMatrix {
    meta: {
        name: string
        version: number
        sourcePlan: string
        notes: string[]
    }
    cases: KoreanBehaviorMatrixCase[]
}

export interface VerificationResult {
    name: string
    passed: boolean
    details?: string
}

export interface VerificationSummary {
    matrixPath: string
    matrix: KoreanBehaviorMatrix
    results: VerificationResult[]
}

function repoRoot(): string {
    return path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')
}

function readSource(relativePath: string): string {
    return fs.readFileSync(path.join(repoRoot(), relativePath), 'utf8')
}

function requireMatch(source: string, pattern: RegExp, message: string): void {
    assert.match(source, pattern, message)
}

function extractArrayBlock(source: string, fieldName: 'wordRules' | 'documentRules'): string[] {
    const match = source.match(new RegExp(`${fieldName}: \\[(.*?)\\]`, 's'))
    const arrayBlock = match?.[1] ?? ''
    assert.ok(arrayBlock, `${fieldName} array must exist`)
    return arrayBlock
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
}

export function loadBehaviorMatrix(matrixPath?: string): KoreanBehaviorMatrix {
    const resolvedPath = matrixPath
        ? path.resolve(matrixPath)
        : path.join(repoRoot(), 'tests', 'korean-morphology', 'fixtures', 'behavior-matrix.json')

    const raw = fs.readFileSync(resolvedPath, 'utf8')
    const matrix = JSON.parse(raw) as KoreanBehaviorMatrix
    assert.ok(matrix.meta?.name, 'matrix.meta.name is required')
    assert.ok(Array.isArray(matrix.cases) && matrix.cases.length > 0, 'matrix.cases must be non-empty')
    return matrix
}

export function verifyMatrixStructure(matrix: KoreanBehaviorMatrix): VerificationResult {
    const ids = new Set<string>()
    let wordParityCaseCount = 0
    let documentCaseCount = 0
    let fallbackContractCount = 0

    for (const entry of matrix.cases) {
        assert.ok(entry.id, 'case.id is required')
        assert.ok(!ids.has(entry.id), `duplicate case id: ${entry.id}`)
        ids.add(entry.id)
        assert.ok(entry.surface.trim().length > 0, `case ${entry.id} surface is required`)
        assert.ok(entry.expected, `case ${entry.id} expected is required`)
        assert.ok(entry.uiParity?.addWord, `case ${entry.id} uiParity.addWord is required`)
        assert.ok(entry.uiParity?.popover, `case ${entry.id} uiParity.popover is required`)

        if (entry.entrypoint === 'word-analysis') {
            wordParityCaseCount += 1
            assert.equal(entry.uiParity.addWord, 'same-as-word-analysis')
            assert.equal(entry.uiParity.popover, 'same-as-word-analysis')
        }

        if (entry.entrypoint === 'document-index') {
            documentCaseCount += 1
        }

        if (entry.serviceState === 'generated-fallback-path') {
            fallbackContractCount += 1
            assert.equal(entry.generatedFallbackAllowed, true)
        }
    }

    assert.ok(wordParityCaseCount > 0, 'matrix must include word-analysis parity cases')
    assert.ok(documentCaseCount > 0, 'matrix must include document-index cases')
    assert.ok(fallbackContractCount > 0, 'matrix must include generated fallback contract cases')

    return {
        name: 'matrix-structure',
        passed: true,
        details: `cases=${matrix.cases.length}, word=${wordParityCaseCount}, document=${documentCaseCount}, fallback=${fallbackContractCount}`
    }
}

export function verifyLanguagePolicyContracts(): VerificationResult {
    const source = readSource('src/core/morphology-language-resolver.ts')

    requireMatch(source, /return normalizeLanguagePolicy\(book\?\.languagePolicy\)/, 'book language policy must stay runtime truth source')
    requireMatch(source, /const languagePolicy = normalizeLanguagePolicy\(options\?\.languagePolicy \?\? language, language\)/, 'target language must prioritize runtime languagePolicy')
    requireMatch(source, /if \(languagePolicy === 'none'\) \{\s*return 'unknown'/s, 'languagePolicy none must disable morphology')
    requireMatch(source, /if \(languagePolicy === 'korean' \|\| languagePolicy === 'japanese'\) \{\s*return languagePolicy/s, 'explicit korean or japanese policy must short-circuit detection')
    requireMatch(source, /return detectMorphologyLanguage\(text, options\)/, 'auto path must delegate to detectMorphologyLanguage')
    requireMatch(source, /if \(!languagePolicy \|\| languagePolicy === 'auto'\) \{\s*return 'unknown'/s, 'auto preference must remain unknown sentinel')
    requireMatch(source, /if \(languagePolicy === 'none'\) \{\s*return 'none'/s, 'none preference must remain none sentinel')

    return {
        name: 'language-policy-runtime-truth',
        passed: true,
        details: 'resolver source preserves languagePolicy as runtime truth without silent fallback'
    }
}

export function verifyAuxiliaryBoundaryContracts(): VerificationResult {
    const source = readSource('src/core/korean-morphology/token-normalizer.ts')

    requireMatch(source, /LEMMA_PRESERVING_AUXILIARY_BASE_FORMS = new Set\(\['있다', '없다', '않다'\]\)/, 'lemma-preserving auxiliary set must stay explicit')
    requireMatch(source, /isLemmaPreservingAuxiliaryToken[\s\S]*LEMMA_PRESERVING_AUXILIARY_BASE_FORMS\.has\(token\.baseForm\)/, 'preserving auxiliary check must be base-form driven')
    requireMatch(source, /isLemmaChangingAuxiliaryToken[\s\S]*!isLemmaPreservingAuxiliaryToken\(token\)/, 'lemma-changing auxiliaries must stay negation of preserving set')
    requireMatch(source, /Prevent partial highlights like "먹고" inside "먹고싶다"\./, 'partial-highlight guard comment must stay anchored')
    requireMatch(source, /blockedByLemmaChangingAuxiliary: true/, 'lemma-changing auxiliary merge must block instead of silently merging')

    return {
        name: 'auxiliary-boundary-safety',
        passed: true,
        details: 'token-normalizer source still preserves explicit lemma-changing auxiliary boundary rules'
    }
}

export function verifyGeneratedFallbackContracts(): VerificationResult {
    const source = readSource('src/core/word-matcher-service.ts')

    requireMatch(source, /const engineMode = settings\.morphologyEngineMode \|\| 'hybrid'/, 'engine mode default must remain hybrid')
    requireMatch(source, /const fallbackMode = settings\.morphologyFallbackMode \|\| 'conservative'/, 'fallback mode default must remain conservative')
    requireMatch(source, /if \(engineMode === 'legacy'\) \{\s*return true/s, 'legacy mode must force generated inflections')
    requireMatch(source, /if \(fallbackMode === 'aggressive'\) \{\s*return true/s, 'aggressive fallback must force generated inflections')
    requireMatch(source, /if \(morphologyLang === 'korean'\) \{\s*return !this\.unifiedMorphologyService\.isKoreanLoaded\(\)/s, 'korean generated fallback must stay availability-based when not forced')
    requireMatch(source, /if \(morphologyLang === 'japanese'\) \{\s*return !this\.unifiedMorphologyService\.isJapaneseLoaded\(\)/s, 'japanese generated fallback must stay availability-based when not forced')

    return {
        name: 'generated-fallback-contract',
        passed: true,
        details: 'generated inflections remain limited to legacy/aggressive/availability fallback contract'
    }
}

export function verifyRulePipelineFamilies(): VerificationResult {
    const source = readSource('src/core/korean-morphology/rule-definitions.ts')
    const wordRules = extractArrayBlock(source, 'wordRules')
    const documentRules = extractArrayBlock(source, 'documentRules')

    assert.deepEqual(wordRules, [
        'compoundNounRule',
        'nounHadaRule',
        'rootWithSuffixRule',
        'passiveRule',
        'verbWithEndingRule'
    ])
    assert.deepEqual(documentRules, [
        'nounHadaRule',
        'rootWithSuffixRule',
        'passiveRule',
        'verbWithEndingRule',
        'auxiliaryCombinationRule'
    ])

    return {
        name: 'rule-family-split',
        passed: true,
        details: `word=${wordRules.join(',')} | document=${documentRules.join(',')}`
    }
}

export function runVerificationSuite(matrixPath?: string): VerificationSummary {
    const matrix = loadBehaviorMatrix(matrixPath)
    const matrixResolvedPath = matrixPath
        ? path.resolve(matrixPath)
        : path.join(repoRoot(), 'tests', 'korean-morphology', 'fixtures', 'behavior-matrix.json')

    const results: VerificationResult[] = []
    results.push(verifyMatrixStructure(matrix))
    results.push(verifyLanguagePolicyContracts())
    results.push(verifyAuxiliaryBoundaryContracts())
    results.push(verifyGeneratedFallbackContracts())
    results.push(verifyRulePipelineFamilies())

    return {
        matrixPath: matrixResolvedPath,
        matrix,
        results
    }
}
