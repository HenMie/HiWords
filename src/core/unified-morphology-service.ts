/**
 * 统一形态学服务
 * 封装韩语/日语形态学服务的统一接口
 * 支持自动检测文本语言并路由到对应服务
 */

import type { MorphologyLanguage, VocabularyBook } from '../utils/types';
import { getScriptStatistics } from '../utils/japanese-text-utils';
import { MorphologyLoader } from './morphology-loader';
import type { KoreanMorphologyService } from './korean-morphology-service';
import type { JapaneseMorphologyService } from './japanese-morphology-service';
import type { MorphologyAssetProvider } from './morphology-asset-manager';
import {
    detectMorphologyLanguage,
    getBookLanguagePolicy,
    resolveMorphologyTargetLanguage,
    toDetectionPreference
} from './morphology-language-resolver';
import type {
    MorphologyAnalyzeOptions,
    MorphologyCandidate,
    MorphologyCandidateSource,
    MorphologyDecision,
    MorphologyDecisionReason,
    MorphologyDetectionLanguage
} from './morphology-types';

/**
 * 形态学分析结果（通用）
 */
export interface MorphologyResult {
    surface: string;
    baseForm: string;
    partOfSpeech: string;
    confidence: number;
    language: MorphologyDetectionLanguage;
}

/**
 * 文档分析结果（通用）
 */
export interface DocumentMorphologyResult {
    morphologyIndex: Map<string, Set<string>>;
    analysisResults: MorphologyResult[];
}

interface MorphologyServiceResult {
    surface: string;
    baseForm: string;
    partOfSpeech: string;
    confidence: number;
    analysisSource?: MorphologyCandidateSource;
    rejectionHint?: MorphologyDecisionReason;
}

const SCORE_THRESHOLD = 0.65;
const MIN_SCORE_MARGIN = 0.08;
const FALLBACK_ACCEPTANCE_THRESHOLD = 0.72;
const SOURCE_WEIGHTS: Record<MorphologyCandidateSource, number> = {
    tokenizer: 0.3,
    'reverse-rule': 0.22,
    fallback: 0.04
};

interface CandidateEvaluation {
    accepted: boolean;
    acceptanceReason?: MorphologyDecisionReason;
    rejectReason?: MorphologyDecisionReason;
    selectedCandidate: MorphologyCandidate | null;
    selectedCandidateMargin: number | null;
}

/**
 * 统一形态学服务
 */
export class UnifiedMorphologyService {
    private loader: MorphologyLoader;
    private debugMode = false;

    constructor(app?: unknown, assetProvider?: MorphologyAssetProvider) {
        this.loader = new MorphologyLoader(app, assetProvider);
    }

    /**
     * 设置调试模式
     */
    public setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
        this.loader.setDebugMode(enabled);
    }

    /**
     * 调试日志输出
     */
    private debugLog(...args: unknown[]): void {
        if (this.debugMode) {
            console.log('[UnifiedMorphology]', ...args);
        }
    }

    /**
     * 检测文本语言
     */
    public detectLanguage(text: string, options?: MorphologyAnalyzeOptions): MorphologyDetectionLanguage {
        return detectMorphologyLanguage(text, options);
    }

    /**
     * 根据词书配置获取词书的形态学语言
     */
    public getBookMorphologyLanguage(book: VocabularyBook): MorphologyLanguage {
        return getBookLanguagePolicy(book);
    }

    /**
     * 根据词书配置预加载所需的形态学服务
     */
    public async preloadServices(vocabularyBooks: VocabularyBook[]): Promise<void> {
        await this.loader.preloadServices(vocabularyBooks);
    }

    /**
     * 根据词书配置更新服务加载状态
     */
    public async updateServices(vocabularyBooks: VocabularyBook[]): Promise<void> {
        await this.loader.updateServices(vocabularyBooks);
    }

    /**
     * 分析单词（详细结果）
     * @param word 要分析的单词
     * @param language 指定语言，或 'auto' 自动检测
     */
    public async analyzeWordDetailed(
        word: string,
        language: MorphologyLanguage = 'auto',
        options?: MorphologyAnalyzeOptions
    ): Promise<MorphologyDecision | null> {
        const normalizedWord = word?.trim();
        if (!normalizedWord) {
            return null;
        }

        const targetLanguage = this.resolveTargetLanguage(normalizedWord, language, options);
        if (targetLanguage === 'unknown') {
            return {
                surface: normalizedWord,
                language: 'unknown',
                accepted: false,
                baseForm: null,
                partOfSpeech: null,
                confidence: 0,
                finalScore: 0,
                candidates: [],
                trace: {
                    threshold: SCORE_THRESHOLD,
                    minimumMargin: MIN_SCORE_MARGIN,
                    candidates: [],
                    selectedCandidate: null,
                    selectedCandidateMargin: null,
                    rejected: true,
                    reason: 'language-undetermined'
                }
            };
        }

        const preferredLanguage = toDetectionPreference(options?.languagePolicy);
        const contextText = options?.contextText || '';

        let serviceResult: MorphologyServiceResult | null = null;

        try {
            serviceResult = await this.analyzeWordByLanguage(normalizedWord, targetLanguage);
        } catch (error) {
            console.error(`[UnifiedMorphology] 分析单词失败 (${targetLanguage}):`, error);
        }

        const candidates: MorphologyCandidate[] = [];

        if (serviceResult) {
            candidates.push(
                this.buildCandidate(
                    normalizedWord,
                    serviceResult,
                    targetLanguage,
                    preferredLanguage,
                    contextText
                )
            );
        }

        candidates.push(
            this.buildCandidate(
                normalizedWord,
                {
                    surface: normalizedWord,
                    baseForm: normalizedWord,
                    partOfSpeech: serviceResult?.partOfSpeech || 'UNKNOWN',
                    confidence: 0.3,
                    analysisSource: 'fallback',
                    rejectionHint: serviceResult?.rejectionHint
                },
                targetLanguage,
                preferredLanguage,
                contextText
            )
        );

        candidates.sort((a, b) => b.finalScore - a.finalScore);
        const evaluation = this.evaluateCandidates(normalizedWord, candidates);
        const { accepted, acceptanceReason, rejectReason, selectedCandidate, selectedCandidateMargin } = evaluation;

        if (this.debugMode) {
            this.debugLog('analyzeWordDetailed', {
                word: normalizedWord,
                language: targetLanguage,
                threshold: SCORE_THRESHOLD,
                minimumMargin: MIN_SCORE_MARGIN,
                selected: selectedCandidate,
                selectedCandidateMargin,
                accepted,
                acceptanceReason,
                rejectReason,
                candidates
            });
        }

        return {
            surface: normalizedWord,
            language: targetLanguage,
            accepted,
            baseForm: accepted && selectedCandidate ? selectedCandidate.baseForm : null,
            partOfSpeech: accepted && selectedCandidate ? selectedCandidate.partOfSpeech : null,
            confidence: accepted && selectedCandidate ? selectedCandidate.confidence : 0,
            finalScore: selectedCandidate?.finalScore || 0,
            candidates,
            trace: {
                threshold: SCORE_THRESHOLD,
                minimumMargin: MIN_SCORE_MARGIN,
                candidates,
                selectedCandidate,
                selectedCandidateMargin,
                rejected: !accepted,
                acceptanceReason,
                reason: accepted ? undefined : rejectReason
            }
        };
    }

    /**
     * 分析单词
     * @param word 要分析的单词
     * @param language 指定语言，或 'auto' 自动检测
     */
    public async analyzeWord(
        word: string,
        language: MorphologyLanguage = 'auto'
    ): Promise<MorphologyResult | null> {
        const decision = await this.analyzeWordDetailed(word, language);
        if (!decision || !decision.accepted || !decision.baseForm || !decision.partOfSpeech) {
            return null;
        }

        return {
            surface: decision.surface,
            baseForm: decision.baseForm,
            partOfSpeech: decision.partOfSpeech,
            confidence: decision.confidence,
            language: decision.language
        };
    }

    /**
     * 分析文档
     * @param text 要分析的文本
     * @param language 指定语言，或 'auto' 自动检测
     */
    public async analyzeDocument(
        text: string,
        language: MorphologyLanguage = 'auto',
        options?: MorphologyAnalyzeOptions
    ): Promise<DocumentMorphologyResult> {
        const morphologyIndex = new Map<string, Set<string>>();
        const analysisResults: MorphologyResult[] = [];

        if (!text || text.trim().length === 0) {
            return { morphologyIndex, analysisResults };
        }

        const targetLanguage = this.resolveTargetLanguage(text, language, options);
        if (targetLanguage === 'unknown') {
            return { morphologyIndex, analysisResults };
        }

        this.debugLog(`分析文档, 语言: ${targetLanguage}`);

        try {
            if (targetLanguage === 'korean') {
                const service = await this.loader.getKoreanService();
                const result = await service.analyzeDocument(text);

                for (const [baseForm, inflections] of result.morphologyIndex) {
                    morphologyIndex.set(baseForm, inflections);
                }

                for (const item of result.analysisResults) {
                    analysisResults.push({
                        ...item,
                        language: 'korean'
                    });
                }
            } else if (targetLanguage === 'japanese') {
                const service = await this.loader.getJapaneseService();
                if (service) {
                    const result = await service.analyzeDocument(text);

                    for (const [baseForm, inflections] of result.morphologyIndex) {
                        morphologyIndex.set(baseForm, inflections);
                    }

                    for (const item of result.analysisResults) {
                        analysisResults.push({
                            ...item,
                            language: 'japanese'
                        });
                    }
                }
            }
        } catch (error) {
            console.error(`[UnifiedMorphology] 分析文档失败 (${targetLanguage}):`, error);
        }

        return { morphologyIndex, analysisResults };
    }

    /**
     * 检查文本是否需要形态学分析
     */
    public needsMorphologyAnalysis(text: string, language: MorphologyLanguage): boolean {
        return this.resolveTargetLanguage(text, language) !== 'unknown';
    }

    /**
     * 获取韩语形态学服务（如果已加载）
     */
    public getKoreanService(): KoreanMorphologyService | null {
        return this.loader.getLoadedKoreanService();
    }

    /**
     * 获取日语形态学服务（如果已加载）
     */
    public getJapaneseService(): JapaneseMorphologyService | null {
        return this.loader.getLoadedJapaneseService();
    }

    /**
     * 异步获取韩语形态学服务（按需加载）
     */
    public async getKoreanServiceAsync(): Promise<KoreanMorphologyService> {
        return this.loader.getKoreanService();
    }

    /**
     * 异步获取日语形态学服务（按需加载）
     */
    public async getJapaneseServiceAsync(): Promise<JapaneseMorphologyService | null> {
        return this.loader.getJapaneseService();
    }

    /**
     * 检查韩语服务是否已加载
     */
    public isKoreanLoaded(): boolean {
        return this.loader.isKoreanLoaded();
    }

    /**
     * 检查日语服务是否已加载
     */
    public isJapaneseLoaded(): boolean {
        return this.loader.isJapaneseLoaded();
    }

    /**
     * 获取加载器实例
     */
    public getLoader(): MorphologyLoader {
        return this.loader;
    }

    /**
     * 清理资源
     */
    public destroy(): void {
        this.loader.destroy();
    }

    private resolveTargetLanguage(
        text: string,
        language: MorphologyLanguage,
        options?: MorphologyAnalyzeOptions
    ): MorphologyDetectionLanguage {
        return resolveMorphologyTargetLanguage(text, language, options);
    }

    private async analyzeWordByLanguage(
        word: string,
        targetLanguage: MorphologyDetectionLanguage
    ): Promise<MorphologyServiceResult | null> {
        if (targetLanguage === 'korean') {
            const service = await this.loader.getKoreanService();
            return await service.analyzeWord(word);
        }

        if (targetLanguage === 'japanese') {
            const service = await this.loader.getJapaneseService();
            if (!service) {
                return null;
            }
            return await service.analyzeWord(word);
        }

        return null;
    }

    private buildCandidate(
        surface: string,
        serviceResult: MorphologyServiceResult,
        language: MorphologyDetectionLanguage,
        preferredLanguage: MorphologyDetectionLanguage | 'none',
        contextText: string
    ): MorphologyCandidate {
        const source = serviceResult.analysisSource ?? 'tokenizer';
        const sourceWeight = SOURCE_WEIGHTS[source];
        const confidenceWeight = this.calculateConfidenceWeight(serviceResult.confidence);
        const posWeight = this.calculatePosWeight(serviceResult.partOfSpeech);
        const contextWeight = this.calculateContextWeight(surface, language, contextText);
        const bookLanguageWeight = this.calculateBookLanguageWeight(language, preferredLanguage);
        const finalScore = Math.min(
            1,
            sourceWeight + confidenceWeight + posWeight + contextWeight + bookLanguageWeight
        );

        return {
            surface: serviceResult.surface || surface,
            baseForm: serviceResult.baseForm,
            partOfSpeech: serviceResult.partOfSpeech,
            language,
            confidence: serviceResult.confidence,
            source,
            sourceWeight,
            confidenceWeight,
            posWeight,
            contextWeight,
            bookLanguageWeight,
            finalScore,
            rejectionHint: serviceResult.rejectionHint
        };
    }

    private evaluateCandidates(
        surface: string,
        candidates: MorphologyCandidate[]
    ): CandidateEvaluation {
        const selectedCandidate = candidates.length > 0 ? candidates[0] : null;
        const selectedCandidateMargin = this.calculateCandidateMargin(candidates);
        if (!selectedCandidate) {
            return {
                accepted: false,
                rejectReason: 'no-candidates',
                selectedCandidate: null,
                selectedCandidateMargin
            };
        }

        if (
            selectedCandidate.source === 'fallback' &&
            selectedCandidate.baseForm === surface
        ) {
            return {
                accepted: false,
                rejectReason: selectedCandidate.rejectionHint ?? 'fallback-only-candidate',
                selectedCandidate,
                selectedCandidateMargin
            };
        }

        const acceptanceThreshold = selectedCandidate.source === 'fallback'
            ? FALLBACK_ACCEPTANCE_THRESHOLD
            : SCORE_THRESHOLD;
        if (selectedCandidate.finalScore < acceptanceThreshold) {
            return {
                accepted: false,
                rejectReason: 'score-below-threshold',
                selectedCandidate,
                selectedCandidateMargin
            };
        }

        if (this.isAmbiguousTopCandidate(candidates, selectedCandidateMargin)) {
            return {
                accepted: false,
                rejectReason: 'ambiguous-top-candidates',
                selectedCandidate,
                selectedCandidateMargin
            };
        }

        return {
            accepted: true,
            acceptanceReason: candidates.length === 1 || selectedCandidateMargin === null
                ? 'accepted-single-candidate'
                : 'accepted-high-confidence',
            selectedCandidate,
            selectedCandidateMargin
        };
    }

    private calculateCandidateMargin(candidates: MorphologyCandidate[]): number | null {
        if (candidates.length < 2) {
            return null;
        }

        return candidates[0].finalScore - candidates[1].finalScore;
    }

    private isAmbiguousTopCandidate(
        candidates: MorphologyCandidate[],
        selectedCandidateMargin: number | null
    ): boolean {
        if (candidates.length < 2 || selectedCandidateMargin === null) {
            return false;
        }

        const nextCandidate = candidates[1];
        const topCandidate = candidates[0];
        if (!nextCandidate || !topCandidate) {
            return false;
        }

        if (topCandidate.baseForm === nextCandidate.baseForm) {
            return false;
        }

        return selectedCandidateMargin < MIN_SCORE_MARGIN;
    }

    private calculateConfidenceWeight(confidence?: number): number {
        if (typeof confidence !== 'number' || Number.isNaN(confidence)) {
            return 0;
        }

        const normalizedConfidence = Math.max(0, Math.min(confidence, 1));
        return normalizedConfidence * 0.35;
    }

    private calculatePosWeight(partOfSpeech?: string): number {
        if (!partOfSpeech || partOfSpeech === 'UNKNOWN') {
            return 0;
        }

        if (
            partOfSpeech.startsWith('VV') ||
            partOfSpeech.startsWith('VA') ||
            partOfSpeech.startsWith('動詞') ||
            partOfSpeech.startsWith('形容詞') ||
            partOfSpeech.includes('HADA') ||
            partOfSpeech.includes('XSA') ||
            partOfSpeech.includes('XSV')
        ) {
            return 0.14;
        }

        return 0.08;
    }

    private calculateContextWeight(
        surface: string,
        language: MorphologyDetectionLanguage,
        contextText: string
    ): number {
        if (language === 'unknown') {
            return 0;
        }

        const scriptStats = getScriptStatistics(`${contextText}${surface}`);

        if (language === 'korean' && scriptStats.korean > 0) {
            return 0.12;
        }

        if (language === 'japanese' && (scriptStats.kana > 0 || scriptStats.cjk > 0)) {
            return 0.12;
        }

        return 0;
    }

    private calculateBookLanguageWeight(
        language: MorphologyDetectionLanguage,
        preferredLanguage: MorphologyDetectionLanguage | 'none'
    ): number {
        if (language === 'unknown') {
            return 0;
        }

        if (preferredLanguage === language) {
            return 0.09;
        }

        if (preferredLanguage === 'unknown') {
            return 0.09;
        }

        return 0;
    }
}
