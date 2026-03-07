import type {
    MorphologyAnalysisResult,
    NormalizedToken,
    Token
} from './types';

type DebugLog = ((...args: unknown[]) => void) | undefined;

export interface NormalizeTokensOptions {
    debugLog?: DebugLog;
}

export function normalizeTokens(tokens: Token[], options?: NormalizeTokensOptions): NormalizedToken[] {
    const normalized: NormalizedToken[] = [];
    const debugLog = options?.debugLog;

    for (const token of tokens) {
        const result = normalizeToken(token, debugLog);
        if (result) {
            normalized.push(result);
        }
    }

    return normalized;
}

export function isVerbOrAdjective(partOfSpeech: string | undefined): boolean {
    if (!partOfSpeech || typeof partOfSpeech !== 'string') {
        return false;
    }
    return partOfSpeech.startsWith('VV') ||
           partOfSpeech.startsWith('VA') ||
           partOfSpeech.startsWith('VX') ||
           partOfSpeech.startsWith('XSV') ||
           partOfSpeech.startsWith('VCN');
}

export function isEndingPartOfSpeech(partOfSpeech: string | undefined): boolean {
    if (!partOfSpeech || typeof partOfSpeech !== 'string') {
        return false;
    }
    return partOfSpeech.includes('EP') ||
           partOfSpeech.includes('ETM') ||
           partOfSpeech.includes('EC') ||
           partOfSpeech.includes('EF');
}

export function isNounToken(token: NormalizedToken | null | undefined): boolean {
    if (!token) {
        return false;
    }
    const pos = token.partOfSpeech;
    return typeof pos === 'string' && (pos.includes('NNG') || pos.includes('NNP'));
}

export function shouldMergeHadaEndings(nextToken: NormalizedToken): boolean {
    return !(nextToken.surface.startsWith('해') && nextToken.surface.length > 1);
}

export function mergeSubsequentEndings(
    tokens: NormalizedToken[],
    startIndex: number,
    maxLookAhead = 5,
    processedTokens?: Set<number>,
    debugLog?: DebugLog
): { mergedSurface: string; processedCount: number } {
    let mergedSurface = '';
    let processedCount = 0;

    for (let j = startIndex; j < tokens.length && j < startIndex + maxLookAhead; j++) {
        const subsequentTokenInfo = tokens[j];
        if (subsequentTokenInfo && isEndingPartOfSpeech(subsequentTokenInfo.partOfSpeech)) {
            debugLog?.(`[mergeSubsequentEndings] 添加语尾: ${subsequentTokenInfo.surface}`);
            mergedSurface += subsequentTokenInfo.surface;
            processedCount++;
            processedTokens?.add(j);
        } else {
            break;
        }
    }

    return { mergedSurface, processedCount };
}

export function buildCompoundWordResult(
    tokenInfos: NormalizedToken[],
    allTokens: NormalizedToken[],
    startIndexInAllTokens: number,
    baseForm: string,
    partOfSpeech: string,
    confidence: number,
    processedTokens: Set<number>,
    shouldMergeEndings = true,
    debugLog?: DebugLog
): { result: MorphologyAnalysisResult; processedCount: number } {
    let combinedSurface = tokenInfos.map(t => t.surface).join('');
    let processedCount = 0;

    if (shouldMergeEndings) {
        const nextIndex = startIndexInAllTokens + tokenInfos.length;
        const mergeResult = mergeSubsequentEndings(
            allTokens,
            nextIndex,
            5,
            processedTokens,
            debugLog
        );
        combinedSurface += mergeResult.mergedSurface;
        processedCount = mergeResult.processedCount;
    }

    debugLog?.(`[buildCompoundWordResult] 最终结果: ${combinedSurface} → ${baseForm}`);

    return {
        result: {
            surface: combinedSurface,
            baseForm,
            partOfSpeech,
            confidence
        },
        processedCount
    };
}

export function constructPassiveBaseForm(tokenInfos: NormalizedToken[], passiveIndex: number): string | null {
    for (let i = 0; i < passiveIndex; i++) {
        const token = tokenInfos[i];
        if (!token) {
            continue;
        }
        if (
            token.partOfSpeech.includes('NNG') ||
            token.partOfSpeech.includes('NNP') ||
            token.partOfSpeech.includes('VV') ||
            token.partOfSpeech.includes('VA')
        ) {
            return token.surface + '되다';
        }
    }

    if (passiveIndex > 0) {
        const stemParts = tokenInfos
            .slice(0, passiveIndex)
            .map(t => t?.surface || '')
            .join('');
        if (stemParts.length > 0) {
            return stemParts + '되다';
        }
    }

    return null;
}

export function isHadaRelatedToken(tokenInfo: NormalizedToken | null | undefined): boolean {
    if (!tokenInfo) {
        return false;
    }

    const { surface, baseForm, partOfSpeech } = tokenInfo;

    if (surface === '하' || surface === '해' || surface === '한') {
        return true;
    }

    if (surface.startsWith('해') || surface.startsWith('합') || surface.startsWith('했')) {
        return true;
    }

    if (partOfSpeech.includes('XSV') || partOfSpeech.includes('XSA')) {
        return true;
    }

    return !!(baseForm && baseForm.includes('하다'));
}

export function calculateConfidence(token: Token): number {
    if (!token) {
        return 0.5;
    }

    let confidence = 0.8;

    const dictionaryForm = (token as Record<string, unknown>).dictionary_form ??
        (token as Record<string, unknown>).base_form ??
        (token as Record<string, unknown>).lemma;
    const surface = (token as Record<string, unknown>).surface ??
        (token as Record<string, unknown>).text;

    if (typeof dictionaryForm === 'string' && typeof surface === 'string' && dictionaryForm !== surface) {
        confidence += 0.1;
    }

    const partOfSpeech = (token as Record<string, unknown>).part_of_speech ??
        (token as Record<string, unknown>).pos ??
        (token as Record<string, unknown>).tag;

    if (typeof partOfSpeech === 'string') {
        if (partOfSpeech.startsWith('VV') || partOfSpeech.startsWith('VA')) {
            confidence += 0.1;
        }
    }

    return Math.min(confidence, 1.0);
}

function normalizeToken(token: Token, debugLog?: DebugLog): NormalizedToken | null {
    if (!token) {
        return null;
    }

    let surface = '';
    let partOfSpeech = 'UNKNOWN';
    let baseForm = '';
    let features: string[] = [];
    let reading: string | undefined;
    let morphemeInfo: string | undefined;

    if (isTokenMap(token as unknown)) {
        const mapToken = token as unknown as Map<string, unknown>;
        const text = mapToken.get('text');
        const details = mapToken.get('details');

        surface = typeof text === 'string' ? text : '';
        if (Array.isArray(details)) {
            partOfSpeech = typeof details[0] === 'string' && details[0] !== '*' ? details[0] : 'UNKNOWN';
            reading = typeof details[6] === 'string' && details[6] !== '*' ? details[6] : undefined;
            morphemeInfo = typeof details[7] === 'string' && details[7] !== '*' ? details[7] : undefined;
            features = details.filter((item): item is string => typeof item === 'string');
        }
    } else {
        const tokenObj = token as Record<string, unknown>;
        surface = typeof tokenObj.surface === 'string' && tokenObj.surface.length > 0
            ? tokenObj.surface
            : typeof tokenObj.text === 'string'
                ? tokenObj.text
                : '';
        partOfSpeech = typeof tokenObj.part_of_speech === 'string' && tokenObj.part_of_speech.length > 0
            ? tokenObj.part_of_speech
            : typeof tokenObj.partOfSpeech === 'string' && tokenObj.partOfSpeech.length > 0
                ? tokenObj.partOfSpeech
                : typeof tokenObj.pos === 'string'
                    ? tokenObj.pos
                    : 'UNKNOWN';
        baseForm = typeof tokenObj.dictionary_form === 'string' && tokenObj.dictionary_form.length > 0
            ? tokenObj.dictionary_form
            : typeof tokenObj.base_form === 'string' && tokenObj.base_form.length > 0
                ? tokenObj.base_form
                : typeof tokenObj.lemma === 'string'
                    ? tokenObj.lemma
                    : '';
        reading = typeof tokenObj.reading === 'string' && tokenObj.reading !== '*' ? tokenObj.reading : undefined;
        morphemeInfo = typeof tokenObj.morpheme_info === 'string' && tokenObj.morpheme_info !== '*'
            ? tokenObj.morpheme_info
            : typeof tokenObj.morphemeInfo === 'string' && tokenObj.morphemeInfo !== '*'
                ? tokenObj.morphemeInfo
                : undefined;
        features = Array.isArray(tokenObj.feature)
            ? (tokenObj.feature as unknown[]).filter((item): item is string => typeof item === 'string')
            : [];
    }

    if (!surface) {
        return null;
    }

    if (!baseForm) {
        baseForm = extractBaseFormFromMorphology(
            surface,
            reading || '',
            morphemeInfo || '',
            partOfSpeech
        );
    }

    const normalized: NormalizedToken = {
        surface,
        baseForm,
        partOfSpeech,
        features,
        reading,
        morphemeInfo,
        rawToken: token
    };

    debugLog?.(
        '[normalizeToken]',
        {
            surface: normalized.surface,
            baseForm: normalized.baseForm,
            partOfSpeech: normalized.partOfSpeech,
            reading: normalized.reading,
            morphemeInfo: normalized.morphemeInfo
        }
    );

    return normalized;
}

function extractBaseFormFromMorphology(
    surface: string,
    reading: string,
    morphemeInfo: string,
    partOfSpeech: string
): string {
    const isPosTag = /^[A-Z]{2,}$/.test(reading);
    if (reading && reading !== '*' && reading !== surface && !isPosTag) {
        if (isVerbOrAdjective(partOfSpeech)) {
            return reading.endsWith('다') ? reading : `${reading}다`;
        }
        return reading;
    }

    if (morphemeInfo && typeof morphemeInfo === 'string' && morphemeInfo !== '*') {
        const baseFormFromMorpheme = parseBaseFormFromMorpheme(surface, morphemeInfo, partOfSpeech);
        if (baseFormFromMorpheme) {
            return baseFormFromMorpheme;
        }
    }

    if (partOfSpeech && partOfSpeech.includes('VX+ETM')) {
        const auxiliaryBaseForm = extractAuxiliaryVerbFromMorpheme(morphemeInfo);
        if (auxiliaryBaseForm) {
            return auxiliaryBaseForm;
        }
    }

    return inferBaseFormFromSurface(surface, partOfSpeech);
}

function parseBaseFormFromMorpheme(
    surface: string,
    morphemeInfo: string,
    partOfSpeech: string
): string | null {
    const morphemes = morphemeInfo.split('+');
    const lexicalMorphemes: { surface: string; pos: string }[] = [];

    for (const morpheme of morphemes) {
        const parts = morpheme.split('/');
        if (parts.length < 2) {
            continue;
        }

        const morphSurface = parts[0];
        const morphPos = parts[1];

        if (
            morphPos === 'EC' ||
            morphPos === 'ETM' ||
            morphPos === 'EP' ||
            morphPos === 'EF' ||
            morphPos === 'ETN'
        ) {
            continue;
        }

        lexicalMorphemes.push({ surface: morphSurface, pos: morphPos });
    }

    if (lexicalMorphemes.length > 0) {
        const nounParts = lexicalMorphemes.filter(morpheme => morpheme.pos.startsWith('NN'));
        const isOverallNoun =
            partOfSpeech.includes('NNG') ||
            partOfSpeech.includes('NNP') ||
            partOfSpeech.startsWith('NN');

        if (
            isOverallNoun &&
            nounParts.length >= 2 &&
            nounParts.length === lexicalMorphemes.length
        ) {
            const combinedSurface = nounParts.map(m => m.surface).join('');
            return combinedSurface === surface ? surface : combinedSurface;
        }

        const primaryMorpheme = lexicalMorphemes[0];
        if (primaryMorpheme) {
            if (isVerbOrAdjective(primaryMorpheme.pos)) {
                return primaryMorpheme.surface.endsWith('다')
                    ? primaryMorpheme.surface
                    : `${primaryMorpheme.surface}다`;
            }
            return primaryMorpheme.surface;
        }
    }

    if (morphemes.length >= 2) {
        const passiveResult = handlePassiveMorphemes(morphemes);
        if (passiveResult) {
            return passiveResult;
        }
    }

    return null;
}

function handlePassiveMorphemes(morphemes: string[]): string | null {
    for (let i = 0; i < morphemes.length - 1; i++) {
        const currentParts = morphemes[i].split('/');
        const nextParts = morphemes[i + 1].split('/');

        if (currentParts.length >= 2 && nextParts.length >= 2) {
            const currentSurface = currentParts[0];
            const currentPos = currentParts[1];
            const nextSurface = nextParts[0];
            const nextPos = nextParts[1];

            if (
                (currentPos === 'NNG' || currentPos === 'NNP' || currentPos === 'VV') &&
                nextPos === 'XSV' &&
                nextSurface === '되'
            ) {
                return `${currentSurface}되다`;
            }
        }
    }

    return null;
}

function extractAuxiliaryVerbFromMorpheme(morphemeInfo: string): string | null {
    if (!morphemeInfo || morphemeInfo === '*') {
        return null;
    }

    const morphemes = morphemeInfo.split('+');

    for (const morpheme of morphemes) {
        const parts = morpheme.split('/');
        if (parts.length >= 2) {
            const surface = parts[0];
            const pos = parts[1];

            if (pos === 'VX') {
                return surface.endsWith('다') ? surface : `${surface}다`;
            }
        }
    }

    return null;
}

function inferBaseFormFromSurface(surface: string, partOfSpeech: string): string {
    if (isVerbOrAdjective(partOfSpeech)) {
        return surface.endsWith('다') ? surface : `${surface}다`;
    }
    return surface;
}

function isTokenMap(value: unknown): value is Map<string, unknown> {
    if (!value || typeof value !== 'object') {
        return false;
    }
    if (value instanceof Map) {
        return true;
    }
    const candidate = value as { get?: unknown };
    return typeof candidate.get === 'function';
}

