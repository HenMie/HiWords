/**
 * 日语形态学分析服务
 * 使用 lindera-wasm-ipadic 进行日语单词的原型还原和活用形匹配
 */

// @ts-ignore - WASM 文件由 copy-wasm 脚本复制到插件根目录
import wasmJaBytes from '../../lindera_wasm_ja_bg.wasm';

import type {
    DocumentAnalysisResult,
    MorphologyAnalysisResult,
    NormalizedToken,
    Token,
    TokenAnalysisRule,
    Tokenizer,
    TokenRuleContext,
    RuleResult
} from './japanese-morphology/types';

import {
    calculateConfidence,
    isVerb,
    isIAdjective,
    normalizeTokens
} from './japanese-morphology/token-normalizer';

import { createJapaneseMorphologyRulePipelines } from './japanese-morphology/rule-definitions';

export type { MorphologyAnalysisResult, DocumentAnalysisResult } from './japanese-morphology/types';

/**
 * 日语形态学分析服务
 */
export class JapaneseMorphologyService {
    private tokenizer: Tokenizer | null = null;
    private isInitialized = false;
    private initPromise: Promise<void> | null = null;
    private app: unknown;
    private debugMode: boolean = false;
    private wordRulePipeline: TokenAnalysisRule[] | null = null;
    private documentRulePipeline: TokenAnalysisRule[] | null = null;

    constructor(app?: unknown) {
        this.app = app;
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
    private debugLog(...args: unknown[]): void {
        if (this.debugMode) {
            console.log('[JapaneseMorphology]', ...args);
        }
    }

    /**
     * 应用规则管道
     */
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

    /**
     * 确保规则管道已初始化
     */
    private ensureRulePipelines(): void {
        if (this.wordRulePipeline && this.documentRulePipeline) {
            return;
        }

        const { wordRules, documentRules } = createJapaneseMorphologyRulePipelines();
        this.wordRulePipeline = wordRules;
        this.documentRulePipeline = documentRules;
    }

    /**
     * 初始化 Lindera WASM (IPADIC)
     */
    private async initialize(): Promise<void> {
        try {
            // 动态导入 lindera-wasm-ipadic
            const lindera = await import('lindera-wasm-ipadic');
            const init = lindera.default;
            const { TokenizerBuilder } = lindera;

            // 尝试多种初始化方式
            const initMethods = [
                {
                    name: 'WASM字节数组',
                    method: async () => {
                        await init({ module_or_path: wasmJaBytes });
                    }
                },
                {
                    name: '插件路径',
                    method: async () => {
                        const pluginWasmUrl = 'app://local/.obsidian/plugins/HiWords/lindera_wasm_ja_bg.wasm';
                        const response = await fetch(pluginWasmUrl);
                        if (!response.ok) throw new Error(`HTTP ${response.status}`);
                        const wasmBytes = await response.arrayBuffer();
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

                    // 构建 Tokenizer
                    const builder = new TokenizerBuilder();
                    builder.setDictionary('embedded://ipadic');
                    this.tokenizer = builder.build() as Tokenizer;

                    return;
                } catch (error) {
                    lastError = error as Error;
                    this.debugLog(`❌ ${name} 初始化失败:`, error);
                }
            }

            // 所有方法都失败
            console.warn('[HiWords] 日语形态学服务初始化失败，日语单词活用形匹配功能将不可用');
            console.warn('[HiWords] 最后错误:', lastError?.message || '未知错误');
            this.isInitialized = false;
        } catch (error) {
            console.error('[HiWords] 日语形态学服务加载失败:', error);
            this.isInitialized = false;
        }
    }

    /**
     * 确保服务已初始化（按需初始化）
     */
    private async ensureInitialized(): Promise<boolean> {
        if (this.isInitialized) {
            return true;
        }

        if (!this.initPromise) {
            this.initPromise = this.initialize();
        }

        await this.initPromise;

        return this.isInitialized;
    }

    /**
     * 检查是否为日语文本
     */
    public isJapaneseText(text: string): boolean {
        if (!text) return false;
        // 检查是否包含平假名、片假名或日语汉字
        // 平假名: U+3040-U+309F
        // 片假名: U+30A0-U+30FF
        // 日语汉字使用 CJK 统一汉字范围，但我们主要通过假名来判断
        const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF]/;
        return japaneseRegex.test(text);
    }

    /**
     * 分析单个单词，返回其原型
     */
    public async analyzeWord(word: string): Promise<MorphologyAnalysisResult | null> {
        // 日语分析不严格要求文本包含假名，因为可能是纯汉字词汇
        // 但为了避免处理非日语文本，我们仍然进行基本检查
        if (!word || word.trim().length === 0) {
            return null;
        }

        this.debugLog(`开始分析单词: ${word}`);

        if (await this.ensureInitialized() && this.tokenizer) {
            try {
                this.debugLog('使用 Lindera 进行分析...');
                const tokens = this.tokenizer.tokenize(word.trim());
                const normalizedTokens = normalizeTokens(tokens, { debugLog: this.debugLog.bind(this) });

                this.debugLog('Lindera 原始分析结果:', JSON.stringify(tokens, null, 2));

                if (!normalizedTokens || normalizedTokens.length === 0) {
                    this.debugLog('Lindera 分析结果为空，使用后备方案');
                    return this.fallbackAnalyze(word);
                }

                // 分析所有 tokens，寻找最佳的基础形式
                this.debugLog('归一化 tokens:', normalizedTokens);
                const analysisResult = this.analyzeTokens(normalizedTokens, word);
                if (!analysisResult) {
                    this.debugLog('analyzeTokens 返回 null，使用后备方案');
                    return this.fallbackAnalyze(word);
                }

                const { surface, baseForm, partOfSpeech } = analysisResult;

                this.debugLog('提取的属性:', { surface, baseForm, partOfSpeech });

                const result = {
                    surface,
                    baseForm,
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
            this.debugLog('Tokenizer 未初始化，使用后备方案');
            return this.fallbackAnalyze(word);
        }
    }

    /**
     * 分析多个 tokens，寻找最佳的基础形式
     */
    private analyzeTokens(
        tokens: NormalizedToken[],
        originalWord: string
    ): MorphologyAnalysisResult | null {
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

        // 回退：使用第一个有意义的 token
        const firstToken = tokens[0];
        if (firstToken) {
            this.debugLog('[analyzeTokens] 回退使用首个 token:', firstToken);
            return {
                surface: originalWord,
                baseForm: firstToken.baseForm || firstToken.surface,
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

        // 日语动词常见活用形词尾
        const verbEndings = [
            // ます形
            { ending: 'ます', base: 'る', pos: '動詞' },
            { ending: 'ました', base: 'る', pos: '動詞' },
            { ending: 'ません', base: 'る', pos: '動詞' },
            // て形
            { ending: 'って', base: 'る', pos: '動詞' },
            { ending: 'いて', base: 'く', pos: '動詞' },
            { ending: 'いで', base: 'ぐ', pos: '動詞' },
            { ending: 'して', base: 'す', pos: '動詞' },
            { ending: 'んで', base: 'む', pos: '動詞' },
            // た形
            { ending: 'った', base: 'る', pos: '動詞' },
            { ending: 'いた', base: 'く', pos: '動詞' },
            { ending: 'いだ', base: 'ぐ', pos: '動詞' },
            { ending: 'した', base: 'す', pos: '動詞' },
            { ending: 'んだ', base: 'む', pos: '動詞' },
            // ない形
            { ending: 'ない', base: 'る', pos: '動詞' },
            { ending: 'なかった', base: 'る', pos: '動詞' },
        ];

        for (const { ending, base, pos } of verbEndings) {
            if (word.endsWith(ending)) {
                const stem = word.slice(0, -ending.length);
                const baseForm = stem + base;
                
                const result = {
                    surface: word,
                    baseForm,
                    partOfSpeech: pos,
                    confidence: 0.5,
                    analysisSource: 'fallback' as const
                };

                this.debugLog('后备分析结果:', result);
                return result;
            }
        }

        // い形容词活用形
        const adjEndings = [
            { ending: 'くて', base: 'い', pos: '形容詞' },
            { ending: 'かった', base: 'い', pos: '形容詞' },
            { ending: 'くない', base: 'い', pos: '形容詞' },
            { ending: 'ければ', base: 'い', pos: '形容詞' },
        ];

        for (const { ending, base, pos } of adjEndings) {
            if (word.endsWith(ending)) {
                const stem = word.slice(0, -ending.length);
                const baseForm = stem + base;
                
                const result = {
                    surface: word,
                    baseForm,
                    partOfSpeech: pos,
                    confidence: 0.5,
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

            // 2. 分析 tokens
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
     * 分析文档 tokens 并返回分析结果
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

            // 只处理动词和形容词
            if (isVerb(token.partOfSpeech) || isIAdjective(token.partOfSpeech)) {
                const result: MorphologyAnalysisResult = {
                    surface: token.surface,
                    baseForm: token.baseForm || token.surface,
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
     * 获取单词的所有可能活用形
     */
    public async getInflections(baseForm: string): Promise<string[]> {
        if (!await this.ensureInitialized() || !this.tokenizer) {
            return [];
        }

        // lindera-wasm-ipadic 主要用于分析，不是生成
        // 返回基础形式，实际的活用形需要通过文档分析来发现
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
