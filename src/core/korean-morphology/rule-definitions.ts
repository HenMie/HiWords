import type { TokenAnalysisRule } from './types';

import {
    buildCompoundWordResult,
    calculateConfidence,
    constructPassiveBaseForm,
    isEndingPartOfSpeech,
    isHadaRelatedToken,
    isNounToken,
    isVerbOrAdjective,
    shouldMergeHadaEndings
} from './token-normalizer';

export interface RulePipelines {
    wordRules: TokenAnalysisRule[];
    documentRules: TokenAnalysisRule[];
}

export function createKoreanMorphologyRulePipelines(): RulePipelines {
    const compoundNounRule = createCompoundNounRule();
    const nounHadaRule = createNounHadaRule();
    const rootWithSuffixRule = createRootWithSuffixRule();
    const passiveRule = createPassiveRule();
    const verbWithEndingRule = createVerbWithEndingRule();
    const auxiliaryCombinationRule = createAuxiliaryCombinationRule();

    return {
        wordRules: [
            compoundNounRule,
            nounHadaRule,
            rootWithSuffixRule,
            passiveRule,
            verbWithEndingRule
        ],
        documentRules: [
            nounHadaRule,
            rootWithSuffixRule,
            passiveRule,
            verbWithEndingRule,
            auxiliaryCombinationRule
        ]
    };
}

function createCompoundNounRule(): TokenAnalysisRule {
    return {
        name: 'compound-noun',
        apply: (context) => {
            if (context.scope !== 'word') {
                return null;
            }
            if (context.tokens.length < 2) {
                return null;
            }

            const allNouns = context.tokens.every(token => isNounToken(token));
            if (!allNouns) {
                return null;
            }

            return {
                result: {
                    surface: context.originalText,
                    baseForm: context.originalText,
                    partOfSpeech: 'NNG+NNG',
                    confidence: 0.95
                },
                consumedTokenIndices: context.tokens.map((_, idx) => idx)
            };
        }
    };
}

function createNounHadaRule(): TokenAnalysisRule {
    return {
        name: 'noun-hada',
        apply: (context) => {
            const current = context.tokens[context.index];
            const next = context.tokens[context.index + 1];
            if (!current || !next) {
                return null;
            }

            if (!isNounToken(current) || !isHadaRelatedToken(next)) {
                return null;
            }

            const baseForm = `${current.surface}하다`;

            if (context.scope === 'word') {
                return {
                    result: {
                        surface: context.originalText,
                        baseForm,
                        partOfSpeech: 'NNG+HADA',
                        confidence: 0.95
                    },
                    consumedTokenIndices: [0, 1]
                };
            }

            const shouldMerge = shouldMergeHadaEndings(next);
            const {
                result,
                processedCount,
                blockedByLemmaChangingAuxiliary
            } = buildCompoundWordResult(
                [current, next],
                context.tokens,
                context.index,
                baseForm,
                'NNG+HADA',
                0.95,
                context.processedTokens,
                shouldMerge,
                context.debugLog
            );
            if (blockedByLemmaChangingAuxiliary) {
                return null;
            }

            const consumed = collectConsumedIndices(context.index, 2, processedCount);

            return {
                result,
                consumedTokenIndices: consumed
            };
        }
    };
}

function createRootWithSuffixRule(): TokenAnalysisRule {
    return {
        name: 'root-with-suffix',
        apply: (context) => {
            const current = context.tokens[context.index];
            const next = context.tokens[context.index + 1];
            if (!current || !next) {
                return null;
            }

            const isRootToken = current.partOfSpeech.includes('XR');
            const isSuffixToken = next.partOfSpeech.includes('XSA') || next.partOfSpeech.includes('XSV');
            if (!isRootToken || !isSuffixToken) {
                return null;
            }

            const baseForm = `${current.surface}하다`;

            if (context.scope === 'word') {
                return {
                    result: {
                        surface: context.originalText,
                        baseForm,
                        partOfSpeech: 'XR+XSA',
                        confidence: 0.95
                    },
                    consumedTokenIndices: [0, 1]
                };
            }

            const {
                result,
                processedCount,
                blockedByLemmaChangingAuxiliary
            } = buildCompoundWordResult(
                [current, next],
                context.tokens,
                context.index,
                baseForm,
                'XR+XSA',
                0.95,
                context.processedTokens,
                true,
                context.debugLog
            );
            if (blockedByLemmaChangingAuxiliary) {
                return null;
            }

            const consumed = collectConsumedIndices(context.index, 2, processedCount);

            return {
                result,
                consumedTokenIndices: consumed
            };
        }
    };
}

function createPassiveRule(): TokenAnalysisRule {
    return {
        name: 'passive',
        apply: (context) => {
            if (context.scope === 'word') {
                for (let i = 0; i < context.tokens.length - 1; i++) {
                    const current = context.tokens[i];
                    const next = context.tokens[i + 1];
                    if (!isPassiveStructure(current, next)) {
                        continue;
                    }

                    const baseForm = constructPassiveBaseForm(context.tokens, i);
                    if (!baseForm) {
                        continue;
                    }

                    return {
                        result: {
                            surface: context.originalText,
                            baseForm,
                            partOfSpeech: 'VV+XSV',
                            confidence: 0.92
                        },
                        consumedTokenIndices: [i, i + 1]
                    };
                }
                return null;
            }

            return null;
        }
    };
}

function createVerbWithEndingRule(): TokenAnalysisRule {
    return {
        name: 'verb-with-ending',
        apply: (context) => {
            if (context.scope === 'word') {
                if (context.index !== 0) {
                    return null;
                }

                for (const token of context.tokens) {
                    if (!isVerbOrAdjective(token.partOfSpeech)) {
                        continue;
                    }
                    if (token.baseForm === '하다' || token.baseForm === '해다') {
                        continue;
                    }
                    return {
                        result: {
                            surface: context.originalText,
                            baseForm: token.baseForm,
                            partOfSpeech: token.partOfSpeech,
                            confidence: 0.9
                        },
                        consumedTokenIndices: [context.tokens.indexOf(token)]
                    };
                }

                return null;
            }

            const current = context.tokens[context.index];
            if (!current || !isVerbOrAdjective(current.partOfSpeech)) {
                return null;
            }

            const next = context.tokens[context.index + 1];
            if (next && isEndingPartOfSpeech(next.partOfSpeech)) {
                const {
                    result,
                    processedCount,
                    blockedByLemmaChangingAuxiliary
                } = buildCompoundWordResult(
                    [current, next],
                    context.tokens,
                    context.index,
                    current.baseForm,
                    `${current.partOfSpeech}+${next.partOfSpeech}`,
                    0.9,
                    context.processedTokens,
                    true,
                    context.debugLog
                );
                if (blockedByLemmaChangingAuxiliary) {
                    return null;
                }

                const consumed = collectConsumedIndices(context.index, 2, processedCount);

                return {
                    result,
                    consumedTokenIndices: consumed
                };
            }

            const confidenceCalculator = context.calculateConfidence ?? calculateConfidence;
            const confidence = confidenceCalculator(current.rawToken);

            return {
                result: {
                    surface: current.surface,
                    baseForm: current.baseForm,
                    partOfSpeech: current.partOfSpeech,
                    confidence
                },
                consumedTokenIndices: [context.index]
            };
        }
    };
}

function createAuxiliaryCombinationRule(): TokenAnalysisRule {
    return {
        name: 'auxiliary-combination',
        apply: (context) => {
            if (context.scope !== 'document') {
                return null;
            }

            const current = context.tokens[context.index];
            const next = context.tokens[context.index + 1];
            if (!current || !next) {
                return null;
            }

            const isEnding = isEndingPartOfSpeech(current.partOfSpeech);
            const isAuxiliary = next.partOfSpeech.includes('VX') || next.partOfSpeech.includes('VV');
            const hasEtm = next.partOfSpeech.includes('ETM');

            if (!isEnding || !isAuxiliary || !hasEtm) {
                return null;
            }

            let reconstructedBaseForm = next.baseForm;
            if (next.baseForm === '지다' && current.surface === '어') {
                reconstructedBaseForm = '어지다';
            }
            if (current.surface === '어' && next.surface === '진') {
                reconstructedBaseForm = '어질다';
            }

            const { result } = buildCompoundWordResult(
                [current, next],
                context.tokens,
                context.index,
                reconstructedBaseForm,
                `${current.partOfSpeech}+${next.partOfSpeech}`,
                0.88,
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

function isPassiveStructure(currentToken?: { surface: string; partOfSpeech: string }, nextToken?: { surface: string; partOfSpeech: string }): boolean {
    if (!currentToken || !nextToken) {
        return false;
    }

    return (
        (nextToken.surface === '되' && currentToken.partOfSpeech.includes('EC')) ||
        currentToken.surface.includes('되') ||
        (nextToken.partOfSpeech === 'XSV' && nextToken.surface === '되')
    );
}

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
