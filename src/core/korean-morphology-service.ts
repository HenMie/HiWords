import init, { TokenizerBuilder } from 'lindera-wasm-ko-dic';
import { isKoreanText } from '../utils/korean-text-utils';
import type { MorphologyAssetProvider } from './morphology-asset-manager';
import type {
    DocumentAnalysisResult,
    MorphologyAnalysisResult,
    NormalizedToken,
    Token,
    TokenAnalysisRule,
    Tokenizer,
    TokenRuleContext,
    RuleResult
} from './korean-morphology/types';
import {
    calculateConfidence,
    isVerbOrAdjective,
    normalizeTokens
} from './korean-morphology/token-normalizer';
import { createKoreanMorphologyRulePipelines } from './korean-morphology/rule-definitions';

export type { MorphologyAnalysisResult, DocumentAnalysisResult } from './korean-morphology/types';

/**
 * 韩语形态学分析服务
 * 使用 lindera-wasm-ko-dic 进行韩语单词的原型还原和活用形匹配
 */
export class KoreanMorphologyService {
    private tokenizer: Tokenizer | null = null;
    private isInitialized = false;
    private initPromise: Promise<void> | null = null;
    private app: unknown;
    private debugMode: boolean = false;
    private wordRulePipeline: TokenAnalysisRule[] | null = null;
    private documentRulePipeline: TokenAnalysisRule[] | null = null;
    private assetProvider: MorphologyAssetProvider | null = null;

    constructor(app?: unknown, assetProvider?: MorphologyAssetProvider) {
        this.app = app;
        this.assetProvider = assetProvider ?? null;
        // 按需初始化，不在构造函数中立即初始化
        this.initPromise = null;
    }

    /**
     * 设置调试模式
     */
    public setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
    }

    /**
     * 调试日志输出
     */
    private debugLog(...args: any[]): void {
        if (this.debugMode) {
            console.log('[KoreanMorphology]', ...args);
        }
    }

    private applyRulePipeline(rules: TokenAnalysisRule[], context: TokenRuleContext): RuleResult | null {
        for (const rule of rules) {
            const result = rule.apply(context);
            if (result) {
                this.debugLog(`[Rule:${rule.name}] 匹配成功`, result.result);
                return result;
            }
        }
        return null;
    }

    private ensureRulePipelines(): void {
        if (this.wordRulePipeline && this.documentRulePipeline) {
            return;
        }

        const { wordRules, documentRules } = createKoreanMorphologyRulePipelines();
        this.wordRulePipeline = wordRules;
        this.documentRulePipeline = documentRules;
    }

    /**
     * 合并后续的语尾token
     * @param tokens 所有token
     * @param startIndex 开始索引（从哪个索引开始检查）
     * @param maxLookAhead 最多向前看几个token
     * @param processedTokens 已处理的token集合（用于标记）
     * @returns 合并后的表面形式和处理的token数量
     */
    /**
     * 构建复合词分析结果
     * @param tokenInfos 当前token信息数组（至少包含2个token）
     * @param allTokens 所有token数组
     * @param startIndexInAllTokens 在allTokens中的起始索引
     * @param baseForm 基础形式
     * @param partOfSpeech 词性
     * @param confidence 置信度
     * @param processedTokens 已处理token集合
     * @param shouldMergeEndings 是否需要合并后续语尾
     * @returns 分析结果
     */
    /**
     * 初始化 Lindera WASM
     */
    private async initialize(): Promise<void> {
        const initMethods = [
            { 
                name: '按需下载资源',
                method: async () => {
                    if (!this.assetProvider) {
                        throw new Error('MorphologyAssetProvider is not configured');
                    }
                    const wasmBytes = await this.assetProvider.getWasmBytes('korean');
                    await init({ module_or_path: wasmBytes });
                }
            },
            { 
                name: '默认初始化', 
                method: async () => await init({})
            }
        ];

        let lastError: Error | null = null;

        for (const { name, method } of initMethods) {
            try {
                await method();
                this.isInitialized = true;
                this.debugLog(`✅ ${name} 初始化成功`);
                
                // 构建Tokenizer
                const builder = new TokenizerBuilder();
                builder.setDictionary('embedded://ko-dic');
                this.tokenizer = builder.build() as Tokenizer;
                
                return;
            } catch (error) {
                lastError = error as Error;
                this.debugLog(`❌ ${name} 初始化失败:`, error);
            }
        }

        // 所有方法都失败
        console.warn('[HiWords] 韩语形态学服务初始化失败，韩语单词活用形匹配功能将不可用');
        console.warn('[HiWords] 最后错误:', lastError?.message || '未知错误');
        this.isInitialized = false;
    }
    

    /**
     * 确保服务已初始化（按需初始化）
     */
    private async ensureInitialized(): Promise<boolean> {
        if (this.isInitialized) {
            return true;
        }
        
        // 如果还没有初始化 Promise，创建一个
        if (!this.initPromise) {
            this.initPromise = this.initialize();
        }
        
        // 等待初始化完成
        await this.initPromise;

        if (!this.isInitialized) {
            this.initPromise = null;
        }
        
        return this.isInitialized;
    }

    /**
     * 检查是否为韩语文本（使用统一的工具函数）
     */
    public isKoreanText(text: string): boolean {
        return isKoreanText(text);
    }

    /**
     * 分析单个单词，返回其原型
     */
    public async analyzeWord(word: string): Promise<MorphologyAnalysisResult | null> {
        if (!this.isKoreanText(word)) {
            return null;
        }

        this.debugLog(`开始分析单词: ${word}`);

        // 如果 tokenizer 可用，使用它进行分析
        if (await this.ensureInitialized() && this.tokenizer) {
            try {
                this.debugLog('使用 Lindera 进行分析...');
                // 使用 tokenizer 进行形态学分析
                const tokens = this.tokenizer.tokenize(word.trim());
                const normalizedTokens = normalizeTokens(tokens, { debugLog: this.debugLog.bind(this) });

                this.debugLog('Lindera 原始分析结果:', JSON.stringify(tokens, null, 2));

                if (!normalizedTokens || normalizedTokens.length === 0) {
                    this.debugLog('Lindera 分析结果为空，使用后备方案');
                    return this.fallbackAnalyze(word);
                }

                // 分析所有tokens，寻找最佳的基础形式
                this.debugLog('归一化 tokens:', normalizedTokens);
                const analysisResult = this.analyzeTokens(normalizedTokens, word);
                if (!analysisResult) {
                    this.debugLog('analyzeTokens 返回 null，使用后备方案');
                    return this.fallbackAnalyze(word);
                }

                let { surface, baseForm, partOfSpeech } = analysisResult;

                this.debugLog('提取的属性:', { surface, baseForm, partOfSpeech });

                // 确保原型以 '다' 结尾（动词/形容词）
                let normalizedBaseForm = baseForm;
                if (isVerbOrAdjective(partOfSpeech) && !baseForm.endsWith('다')) {
                    normalizedBaseForm = baseForm + '다';
                }

                const result = {
                    surface,
                    baseForm: normalizedBaseForm,
                    partOfSpeech,
                    confidence: analysisResult.confidence || 0.8,
                    analysisSource: analysisResult.analysisSource ?? 'tokenizer'
                };

                this.debugLog('最终分析结果:', result);
                return result;
            } catch (error) {
                console.error('Lindera 分析失败，使用后备方案:', error);
                return this.fallbackAnalyze(word);
            }
        } else {
            console.log('Tokenizer 未初始化，使用后备方案');
            return this.fallbackAnalyze(word);
        }
    }
    
    /**
     * 分析多个tokens，寻找最佳的基础形式
     */
    private analyzeTokens(tokens: NormalizedToken[], originalWord: string): {
        surface: string;
        baseForm: string;
        partOfSpeech: string;
        confidence: number;
        analysisSource: 'tokenizer' | 'reverse-rule' | 'fallback';
    } | null {
        if (!tokens || tokens.length === 0) {
            return null;
        }

        this.ensureRulePipelines();

        const context: TokenRuleContext = {
            tokens,
            index: 0,
            scope: 'word',
            originalText: originalWord,
            processedTokens: new Set<number>(),
            debugLog: this.debugLog.bind(this),
            calculateConfidence: calculateConfidence
        };

        const ruleResult = this.applyRulePipeline(this.wordRulePipeline!, context);
        if (ruleResult) {
            return {
                ...ruleResult.result,
                analysisSource: ruleResult.result.analysisSource ?? 'reverse-rule'
            };
        }

        const firstToken = tokens[0];
        if (firstToken) {
            this.debugLog('[analyzeTokens] 回退使用首个 token:', firstToken);
            return {
                surface: originalWord,
                baseForm: firstToken.baseForm,
                partOfSpeech: firstToken.partOfSpeech,
                confidence: 0.7,
                analysisSource: 'tokenizer'
            };
        }

        return null;
    }


    /**
     * 后备分析方案（简单的规则匹配）
     */
    private fallbackAnalyze(word: string): MorphologyAnalysisResult | null {
        this.debugLog(`使用后备方案分析: ${word}`);

        // 简单的韩语动词/形容词词尾识别
        const commonEndings = [
            '진다', '친다', '는다', 'ㄴ다', '다',  // 现在时
            '었다', '았다', '였다',  // 过去时
            '겠다',  // 未来时
            '어요', '아요', '여요',  // 敬语现在时
            '었어요', '았어요', '였어요',  // 敬语过去时
            '겠어요',  // 敬语未来时
            '습니다', '십니다',  // 正式敬语现在时
            '었습니다', '았습니다', '였습니다',  // 正式敬语过去时
            '고', '어', '아', '여',  // 连接语尾
        ];

        for (const ending of commonEndings) {
            if (word.endsWith(ending)) {
                // 提取词干
                const stem = word.slice(0, -ending.length);
                let baseForm = stem;

                // 尝试构造原型
                if (ending === '진다') {
                    // 여기진다 -> 여기지다
                    baseForm = stem + '지다';
                } else if (ending === '친다') {
                    // 치다 类动词
                    baseForm = stem + '치다';
                } else if (ending.includes('다')) {
                    // 其他以다结尾的，尝试添加다
                    if (!baseForm.endsWith('다')) {
                        baseForm = stem + '다';
                    }
                } else {
                    // 其他情况，添加다
                    baseForm = stem + '다';
                }

                const result = {
                    surface: word,
                    baseForm: baseForm,
                    partOfSpeech: 'VV', // 假设为动词
                    confidence: 0.6,  // 后备方案置信度较低
                    analysisSource: 'fallback' as const
                };

                this.debugLog('后备分析结果:', result);
                return result;
            }
        }

        // 如果没有匹配到，返回原词
        return {
            surface: word,
            baseForm: word,
            partOfSpeech: 'UNKNOWN',
            confidence: 0.3,
            analysisSource: 'fallback'
        };
    }

    /**
     * 分析整个文档，建立形态学索引
     */
    public async analyzeDocument(text: string): Promise<DocumentAnalysisResult> {
        const morphologyIndex = new Map<string, Set<string>>();
        const analysisResults: MorphologyAnalysisResult[] = [];

        if (!await this.ensureInitialized() || !this.tokenizer) {
            return { morphologyIndex, analysisResults };
        }

        try {
            // 1. 分词
            const tokens = this.tokenizeText(text);
            const normalizedTokens = normalizeTokens(tokens, { debugLog: this.debugLog.bind(this) });
            
            // 2. 分析tokens
            const tokenAnalysisResults = this.analyzeDocumentTokens(normalizedTokens);
            
            // 3. 构建形态学索引
            this.buildMorphologyIndexFromResults(tokenAnalysisResults, morphologyIndex, analysisResults);
            
            return { morphologyIndex, analysisResults };

        } catch (error) {
            console.error('分析文档时出错:', error);
            return { morphologyIndex, analysisResults };
        }
    }

    /**
     * 分词
     */
    private tokenizeText(text: string): Token[] {
        return this.tokenizer!.tokenize(text);
    }

    /**
     * 分析文档tokens并返回分析结果
     */
    private analyzeDocumentTokens(tokens: NormalizedToken[]): MorphologyAnalysisResult[] {
        const results: MorphologyAnalysisResult[] = [];
        const processedTokens = new Set<number>();

        if (!tokens || tokens.length === 0) {
            return results;
        }

        this.ensureRulePipelines();

        for (let i = 0; i < tokens.length; i++) {
            if (processedTokens.has(i)) {
                continue;
            }

            const token = tokens[i];
            if (!token) {
                continue;
            }

            const context: TokenRuleContext = {
                tokens,
                index: i,
                scope: 'document',
                originalText: token.surface,
                processedTokens,
                debugLog: this.debugLog.bind(this),
                calculateConfidence: calculateConfidence
            };

            const ruleResult = this.applyRulePipeline(this.documentRulePipeline!, context);
            if (ruleResult) {
                this.debugLog(`[analyzeDocumentTokens] 规则命中: ${ruleResult.result.surface} → ${ruleResult.result.baseForm}`);
                results.push({
                    ...ruleResult.result,
                    analysisSource: ruleResult.result.analysisSource ?? 'reverse-rule'
                });
                for (const consumedIndex of ruleResult.consumedTokenIndices) {
                    processedTokens.add(consumedIndex);
                }
                continue;
            }

            if (!this.isKoreanText(token.surface)) {
                continue;
            }

            if (isVerbOrAdjective(token.partOfSpeech) || token.baseForm.endsWith('다')) {
                const result: MorphologyAnalysisResult = {
                    surface: token.surface,
                    baseForm: token.baseForm,
                    partOfSpeech: token.partOfSpeech,
                    confidence: calculateConfidence(token.rawToken),
                    analysisSource: 'tokenizer'
                };
                results.push(result);
                processedTokens.add(i);
            }
        }

        return results;
    }

    /**
     * 从分析结果构建形态学索引
     */
    private buildMorphologyIndexFromResults(
        results: MorphologyAnalysisResult[],
        morphologyIndex: Map<string, Set<string>>,
        analysisResults: MorphologyAnalysisResult[]
    ): void {
        for (const result of results) {
            // 建立索引：从原型到活用形的映射
            if (!morphologyIndex.has(result.baseForm)) {
                morphologyIndex.set(result.baseForm, new Set());
            }
            morphologyIndex.get(result.baseForm)!.add(result.surface);

            // 记录分析结果
            analysisResults.push(result);
        }
    }

    /**
     * 获取单词的所有可能活用形（用于生成训练数据或测试）
     */
    public async getInflections(baseForm: string): Promise<string[]> {
        if (!await this.ensureInitialized() || !this.tokenizer) {
            return [];
        }

        // 注意：lindera-wasm-ko-dic 主要用于分析，不是生成
        // 这里我们返回基础形式，实际的活用形需要通过文档分析来发现
        return [baseForm];
    }

    /**
     * 清理资源
     */
    public destroy(): void {
        if (this.tokenizer) {
            this.tokenizer.free();
            this.tokenizer = null;
        }
        this.isInitialized = false;
        this.initPromise = null;
    }
}
