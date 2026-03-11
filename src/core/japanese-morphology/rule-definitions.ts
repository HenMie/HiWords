/**
 * 日语形态学分析规则定义
 * 实现日语动词、形容词、サ变动词等的活用形还原
 */

import type { TokenAnalysisRule } from './types';

import {
    isVerb,
    isIAdjective,
    isNaAdjective,
    isAuxiliaryVerb,
    isSuruVerbStem,
    isSuruConjugation,
    buildCompoundWordResult,
    calculateConfidence
} from './token-normalizer';

export interface RulePipelines {
    wordRules: TokenAnalysisRule[];
    documentRules: TokenAnalysisRule[];
}

/**
 * 创建日语形态学规则管道
 */
export function createJapaneseMorphologyRulePipelines(): RulePipelines {
    const documentInflectionChainRule = createDocumentInflectionChainRule();
    const verbConjugationRule = createVerbConjugationRule();
    const adjectiveConjugationRule = createAdjectiveConjugationRule();
    const naAdjectiveRule = createNaAdjectiveRule();
    const suruVerbRule = createSuruVerbRule();
    const compoundVerbRule = createCompoundVerbRule();
    const auxiliaryVerbRule = createAuxiliaryVerbRule();

    return {
        wordRules: [
            suruVerbRule,
            verbConjugationRule,
            adjectiveConjugationRule,
            naAdjectiveRule,
            compoundVerbRule
        ],
        documentRules: [
            suruVerbRule,
            compoundVerbRule,
            documentInflectionChainRule,
            verbConjugationRule,
            adjectiveConjugationRule,
            naAdjectiveRule,
            auxiliaryVerbRule
        ]
    };
}

/**
 * 文档级活用链规则
 * 处理「动词/い形容词 + 后续活用链」的完整表层合并
 */
function createDocumentInflectionChainRule(): TokenAnalysisRule {
    return {
        name: 'document-inflection-chain',
        apply: (context) => {
            if (context.scope !== 'document') {
                return null;
            }

            const current = context.tokens[context.index];
            if (!current) {
                return null;
            }

            const isInflectable = isVerb(current.partOfSpeech) || isIAdjective(current.partOfSpeech);
            if (!isInflectable) {
                return null;
            }

            const baseForm = current.baseForm || current.surface;
            const { result, processedCount } = buildCompoundWordResult(
                [current],
                context.tokens,
                context.index,
                baseForm,
                current.partOfSpeech,
                calculateConfidence(current.rawToken),
                context.processedTokens,
                true,
                context.debugLog
            );
            if (processedCount === 0) {
                return null;
            }

            context.debugLog?.(`[document-inflection-chain] ${result.surface} → ${baseForm}`);
            return {
                result,
                consumedTokenIndices: collectConsumedIndices(context.index, 1, processedCount)
            };
        }
    };
}

/**
 * 动词活用形规则
 * 处理五段动词、一段动词的各种活用形
 */
function createVerbConjugationRule(): TokenAnalysisRule {
    return {
        name: 'verb-conjugation',
        apply: (context) => {
            const current = context.tokens[context.index];
            if (!current || !isVerb(current.partOfSpeech)) {
                return null;
            }

            // 如果有基本形且与表层形不同，使用基本形
            if (current.baseForm && current.baseForm !== current.surface) {
                context.debugLog?.(`[verb-conjugation] ${current.surface} → ${current.baseForm}`);
                
                return {
                    result: {
                        surface: current.surface,
                        baseForm: current.baseForm,
                        partOfSpeech: current.partOfSpeech,
                        confidence: calculateConfidence(current.rawToken)
                    },
                    consumedTokenIndices: [context.index]
                };
            }

            return null;
        }
    };
}

/**
 * い形容词活用形规则
 * 处理い形容词的各种活用形（〜い、〜く、〜かった等）
 */
function createAdjectiveConjugationRule(): TokenAnalysisRule {
    return {
        name: 'adjective-conjugation',
        apply: (context) => {
            const current = context.tokens[context.index];
            if (!current || !isIAdjective(current.partOfSpeech)) {
                return null;
            }

            // い形容词的基本形通常以「い」结尾
            if (current.baseForm && current.baseForm !== current.surface) {
                context.debugLog?.(`[adjective-conjugation] ${current.surface} → ${current.baseForm}`);
                
                return {
                    result: {
                        surface: current.surface,
                        baseForm: current.baseForm,
                        partOfSpeech: current.partOfSpeech,
                        confidence: calculateConfidence(current.rawToken)
                    },
                    consumedTokenIndices: [context.index]
                };
            }

            return null;
        }
    };
}

/**
 * な形容动词规则
 * 处理形容动词（な形容词）的活用
 */
function createNaAdjectiveRule(): TokenAnalysisRule {
    return {
        name: 'na-adjective',
        apply: (context) => {
            const current = context.tokens[context.index];
            if (!current || !isNaAdjective(current)) {
                return null;
            }

            // な形容动词的基本形
            // 在 IPADIC 中，「静か」这样的词会被标记为「名詞-形容動詞語幹」
            const baseForm = current.baseForm || current.surface;
            
            context.debugLog?.(`[na-adjective] ${current.surface} → ${baseForm}`);
            
            return {
                result: {
                    surface: current.surface,
                    baseForm: baseForm,
                    partOfSpeech: '形容動詞',
                    confidence: 0.85
                },
                consumedTokenIndices: [context.index]
            };
        }
    };
}

/**
 * サ变动词规则
 * 处理「名詞 + する」形式的サ变动词
 */
function createSuruVerbRule(): TokenAnalysisRule {
    return {
        name: 'suru-verb',
        apply: (context) => {
            const current = context.tokens[context.index];
            const next = context.tokens[context.index + 1];
            
            if (!current || !next) {
                return null;
            }

            // 检查是否为「サ変接続名詞 + する的活用形」
            if (isSuruVerbStem(current) && isSuruConjugation(next)) {
                const baseForm = `${current.surface}する`;
                
                context.debugLog?.(`[suru-verb] ${current.surface}${next.surface} → ${baseForm}`);

                if (context.scope === 'word') {
                    return {
                        result: {
                            surface: context.originalText,
                            baseForm,
                            partOfSpeech: '動詞-サ変',
                            confidence: 0.95
                        },
                        consumedTokenIndices: [0, 1]
                    };
                }

                const { result, processedCount } = buildCompoundWordResult(
                    [current, next],
                    context.tokens,
                    context.index,
                    baseForm,
                    '動詞-サ変',
                    0.95,
                    context.processedTokens,
                    true,
                    context.debugLog
                );

                const consumed = collectConsumedIndices(context.index, 2, processedCount);

                return {
                    result,
                    consumedTokenIndices: consumed
                };
            }

            return null;
        }
    };
}

/**
 * 复合动词规则
 * 处理「動詞 + 動詞」形式的复合动词
 */
function createCompoundVerbRule(): TokenAnalysisRule {
    return {
        name: 'compound-verb',
        apply: (context) => {
            const current = context.tokens[context.index];
            const next = context.tokens[context.index + 1];
            
            if (!current || !next) {
                return null;
            }

            // 检查是否为动词连用形 + 动词
            if (isVerb(current.partOfSpeech) && isVerb(next.partOfSpeech)) {
                // 检查当前动词是否为连用形
                if (current.conjugationForm === '連用形' || 
                    current.conjugationForm === '連用タ接続') {
                    
                    // 复合动词的基本形 = 第一个动词的词干 + 第二个动词的基本形
                    // 例：「食べ」+「始める」→「食べ始める」
                    const combinedBaseForm = current.surface + (next.baseForm || next.surface);
                    
                    context.debugLog?.(`[compound-verb] ${current.surface}${next.surface} → ${combinedBaseForm}`);

                    if (context.scope === 'word') {
                        return {
                            result: {
                                surface: current.surface + next.surface,
                                baseForm: combinedBaseForm,
                                partOfSpeech: '動詞-複合',
                                confidence: 0.88
                            },
                            consumedTokenIndices: [context.index, context.index + 1]
                        };
                    }

                    const { result, processedCount } = buildCompoundWordResult(
                        [current, next],
                        context.tokens,
                        context.index,
                        combinedBaseForm,
                        '動詞-複合',
                        0.88,
                        context.processedTokens,
                        true,
                        context.debugLog
                    );

                    return {
                        result,
                        consumedTokenIndices: collectConsumedIndices(context.index, 2, processedCount)
                    };
                }
            }

            return null;
        }
    };
}

/**
 * 助动词组合规则
 * 处理动词/形容词 + 助动词的组合
 */
function createAuxiliaryVerbRule(): TokenAnalysisRule {
    return {
        name: 'auxiliary-verb',
        apply: (context) => {
            if (context.scope !== 'document') {
                return null;
            }

            const current = context.tokens[context.index];
            const next = context.tokens[context.index + 1];
            
            if (!current || !next) {
                return null;
            }

            // 检查是否为动词/形容词 + 助动词
            const isInflectable = isVerb(current.partOfSpeech) || isIAdjective(current.partOfSpeech);
            if (!isInflectable || !isAuxiliaryVerb(next.partOfSpeech)) {
                return null;
            }

            // 保留动词/形容词的基本形
            const baseForm = current.baseForm || current.surface;
            
            context.debugLog?.(`[auxiliary-verb] ${current.surface}${next.surface} → ${baseForm}`);

            const { result } = buildCompoundWordResult(
                [current, next],
                context.tokens,
                context.index,
                baseForm,
                `${current.partOfSpeech}+助動詞`,
                0.85,
                context.processedTokens,
                false,
                context.debugLog
            );

            return {
                result,
                consumedTokenIndices: [context.index, context.index + 1]
            };
        }
    };
}

/**
 * 收集已消费的索引
 */
function collectConsumedIndices(startIndex: number, baseLength: number, processedCount: number): number[] {
    const consumed: number[] = [];
    for (let offset = 0; offset < baseLength; offset++) {
        consumed.push(startIndex + offset);
    }
    for (let offset = 0; offset < processedCount; offset++) {
        consumed.push(startIndex + baseLength + offset);
    }
    return consumed;
}
