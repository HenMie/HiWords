/**
 * 日语 Token 归一化处理器
 * 将 lindera-wasm-ipadic 的原始 Token 转换为统一格式
 */

import type {
    Token,
    NormalizedToken,
    MorphologyAnalysisResult
} from './types';
import { IPADIC_FEATURE_INDEX } from './types';

type DebugLog = ((...args: unknown[]) => void) | undefined;

export interface NormalizeTokensOptions {
    debugLog?: DebugLog;
}

/**
 * 归一化 Token 数组
 */
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

/**
 * 归一化单个 Token
 */
function normalizeToken(token: Token, debugLog?: DebugLog): NormalizedToken | null {
    if (!token) {
        return null;
    }

    let surface = '';
    let partOfSpeech = 'UNKNOWN';
    let baseForm = '';
    let posDetail1: string | undefined;
    let posDetail2: string | undefined;
    let posDetail3: string | undefined;
    let conjugationType: string | undefined;
    let conjugationForm: string | undefined;
    let reading: string | undefined;
    let pronunciation: string | undefined;

    // 处理 Map 类型的 token（某些版本的 lindera 可能返回 Map）
    if (isTokenMap(token as unknown)) {
        const mapToken = token as unknown as Map<string, unknown>;
        const text = mapToken.get('text');
        const details = mapToken.get('details');

        surface = typeof text === 'string' ? text : '';
        if (Array.isArray(details)) {
            partOfSpeech = getFeatureValue(details, IPADIC_FEATURE_INDEX.POS);
            posDetail1 = getFeatureValue(details, IPADIC_FEATURE_INDEX.POS_DETAIL_1) || undefined;
            posDetail2 = getFeatureValue(details, IPADIC_FEATURE_INDEX.POS_DETAIL_2) || undefined;
            posDetail3 = getFeatureValue(details, IPADIC_FEATURE_INDEX.POS_DETAIL_3) || undefined;
            conjugationType = getFeatureValue(details, IPADIC_FEATURE_INDEX.CONJUGATION_TYPE) || undefined;
            conjugationForm = getFeatureValue(details, IPADIC_FEATURE_INDEX.CONJUGATION_FORM) || undefined;
            baseForm = getFeatureValue(details, IPADIC_FEATURE_INDEX.BASE_FORM) || surface;
            reading = getFeatureValue(details, IPADIC_FEATURE_INDEX.READING) || undefined;
            pronunciation = getFeatureValue(details, IPADIC_FEATURE_INDEX.PRONUNCIATION) || undefined;
        }
    } else {
        // 处理对象类型的 token
        const tokenObj = token as Record<string, unknown>;
        
        // 获取表层形式
        surface = typeof tokenObj.surface === 'string' && tokenObj.surface.length > 0
            ? tokenObj.surface
            : typeof tokenObj.text === 'string'
                ? tokenObj.text
                : '';

        // 从 feature 数组提取信息
        if (Array.isArray(tokenObj.feature)) {
            const features = tokenObj.feature as string[];
            partOfSpeech = getFeatureValue(features, IPADIC_FEATURE_INDEX.POS);
            posDetail1 = getFeatureValue(features, IPADIC_FEATURE_INDEX.POS_DETAIL_1) || undefined;
            posDetail2 = getFeatureValue(features, IPADIC_FEATURE_INDEX.POS_DETAIL_2) || undefined;
            posDetail3 = getFeatureValue(features, IPADIC_FEATURE_INDEX.POS_DETAIL_3) || undefined;
            conjugationType = getFeatureValue(features, IPADIC_FEATURE_INDEX.CONJUGATION_TYPE) || undefined;
            conjugationForm = getFeatureValue(features, IPADIC_FEATURE_INDEX.CONJUGATION_FORM) || undefined;
            baseForm = getFeatureValue(features, IPADIC_FEATURE_INDEX.BASE_FORM) || surface;
            reading = getFeatureValue(features, IPADIC_FEATURE_INDEX.READING) || undefined;
            pronunciation = getFeatureValue(features, IPADIC_FEATURE_INDEX.PRONUNCIATION) || undefined;
        } else {
            // 直接从属性获取
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
                    : typeof tokenObj.baseForm === 'string'
                        ? tokenObj.baseForm
                        : typeof tokenObj.lemma === 'string'
                            ? tokenObj.lemma
                            : surface;

            reading = typeof tokenObj.reading === 'string' && tokenObj.reading !== '*'
                ? tokenObj.reading
                : undefined;
        }
    }

    if (!surface) {
        return null;
    }

    // 确保 baseForm 不为空
    if (!baseForm || baseForm === '*') {
        baseForm = surface;
    }

    const normalized: NormalizedToken = {
        surface,
        baseForm,
        partOfSpeech,
        posDetail1,
        posDetail2,
        posDetail3,
        conjugationType,
        conjugationForm,
        reading,
        pronunciation,
        rawToken: token
    };

    debugLog?.(
        '[normalizeToken]',
        {
            surface: normalized.surface,
            baseForm: normalized.baseForm,
            partOfSpeech: normalized.partOfSpeech,
            conjugationType: normalized.conjugationType,
            conjugationForm: normalized.conjugationForm
        }
    );

    return normalized;
}

/**
 * 从特征数组获取值
 */
function getFeatureValue(features: unknown[], index: number): string {
    const value = features[index];
    if (typeof value === 'string' && value !== '*') {
        return value;
    }
    return '';
}

/**
 * 检查是否为 Map 类型的 token
 */
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

/**
 * 检查是否为动词
 */
export function isVerb(partOfSpeech: string | undefined): boolean {
    if (!partOfSpeech || typeof partOfSpeech !== 'string') {
        return false;
    }
    return partOfSpeech === '動詞' || partOfSpeech.startsWith('動詞');
}

/**
 * 检查是否为い形容词
 */
export function isIAdjective(partOfSpeech: string | undefined): boolean {
    if (!partOfSpeech || typeof partOfSpeech !== 'string') {
        return false;
    }
    return partOfSpeech === '形容詞' || partOfSpeech.startsWith('形容詞');
}

/**
 * 检查是否为な形容动词（形容動詞）
 */
export function isNaAdjective(token: NormalizedToken | null | undefined): boolean {
    if (!token) {
        return false;
    }
    // 形容动词在 IPADIC 中通常被分类为「名詞」+「形容動詞語幹」
    return token.partOfSpeech === '名詞' && token.posDetail1 === '形容動詞語幹';
}

/**
 * 检查是否为名词
 */
export function isNoun(partOfSpeech: string | undefined): boolean {
    if (!partOfSpeech || typeof partOfSpeech !== 'string') {
        return false;
    }
    return partOfSpeech === '名詞' || partOfSpeech.startsWith('名詞');
}

/**
 * 检查是否为助动词
 */
export function isAuxiliaryVerb(partOfSpeech: string | undefined): boolean {
    if (!partOfSpeech || typeof partOfSpeech !== 'string') {
        return false;
    }
    return partOfSpeech === '助動詞' || partOfSpeech.startsWith('助動詞');
}

/**
 * 检查是否为助词
 */
export function isParticle(partOfSpeech: string | undefined): boolean {
    if (!partOfSpeech || typeof partOfSpeech !== 'string') {
        return false;
    }
    return partOfSpeech === '助詞' || partOfSpeech.startsWith('助詞');
}

/**
 * 检查是否为接尾词
 */
export function isSuffix(token: NormalizedToken | null | undefined): boolean {
    if (!token) {
        return false;
    }
    return token.partOfSpeech === '接尾詞' || token.partOfSpeech === '名詞' && token.posDetail1 === '接尾';
}

/**
 * 检查是否为サ变动词词干（名詞+サ変接続）
 */
export function isSuruVerbStem(token: NormalizedToken | null | undefined): boolean {
    if (!token) {
        return false;
    }
    return token.partOfSpeech === '名詞' && token.posDetail1 === 'サ変接続';
}

/**
 * 检查是否为する的活用形
 */
export function isSuruConjugation(token: NormalizedToken | null | undefined): boolean {
    if (!token) {
        return false;
    }
    const suruForms = ['する', 'し', 'さ', 'せ', 'しろ', 'しよ', 'すれ', 'しな'];
    return (token.baseForm === 'する' || suruForms.includes(token.surface)) &&
           (isVerb(token.partOfSpeech) || isAuxiliaryVerb(token.partOfSpeech));
}

/**
 * 计算置信度
 */
export function calculateConfidence(token: Token): number {
    if (!token) {
        return 0.5;
    }

    let confidence = 0.8;

    const tokenObj = token as Record<string, unknown>;
    const features = tokenObj.feature as unknown[];

    // 如果有基本形且与表层形不同，增加置信度
    if (Array.isArray(features)) {
        const baseForm = getFeatureValue(features, IPADIC_FEATURE_INDEX.BASE_FORM);
        const surface = typeof tokenObj.surface === 'string' ? tokenObj.surface : '';
        
        if (baseForm && baseForm !== surface && baseForm !== '*') {
            confidence += 0.1;
        }

        // 如果有活用类型信息，增加置信度
        const conjugationType = getFeatureValue(features, IPADIC_FEATURE_INDEX.CONJUGATION_TYPE);
        if (conjugationType) {
            confidence += 0.05;
        }
    }

    return Math.min(confidence, 1.0);
}

/**
 * 合并后续的助动词/助词
 */
export function mergeSubsequentAuxiliaries(
    tokens: NormalizedToken[],
    startIndex: number,
    maxLookAhead = 5,
    processedTokens?: Set<number>,
    debugLog?: DebugLog
): { mergedSurface: string; processedCount: number } {
    let mergedSurface = '';
    let processedCount = 0;

    for (let j = startIndex; j < tokens.length && j < startIndex + maxLookAhead; j++) {
        const token = tokens[j];
        if (token && (isAuxiliaryVerb(token.partOfSpeech) || isParticle(token.partOfSpeech))) {
            debugLog?.(`[mergeSubsequentAuxiliaries] 添加: ${token.surface}`);
            mergedSurface += token.surface;
            processedCount++;
            processedTokens?.add(j);
        } else {
            break;
        }
    }

    return { mergedSurface, processedCount };
}

/**
 * 构建复合词分析结果
 */
export function buildCompoundWordResult(
    tokenInfos: NormalizedToken[],
    allTokens: NormalizedToken[],
    startIndexInAllTokens: number,
    baseForm: string,
    partOfSpeech: string,
    confidence: number,
    processedTokens: Set<number>,
    shouldMergeAuxiliaries = true,
    debugLog?: DebugLog
): { result: MorphologyAnalysisResult; processedCount: number } {
    let combinedSurface = tokenInfos.map(t => t.surface).join('');
    let processedCount = 0;

    if (shouldMergeAuxiliaries) {
        const nextIndex = startIndexInAllTokens + tokenInfos.length;
        const mergeResult = mergeSubsequentAuxiliaries(
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

