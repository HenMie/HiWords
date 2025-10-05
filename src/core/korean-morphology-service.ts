import init, { TokenizerBuilder } from 'lindera-wasm-ko-dic';
// @ts-ignore
import wasmBytes from '../../lindera_wasm_bg.wasm';

/**
 * 形态学分析结果
 */
export interface MorphologyAnalysisResult {
    surface: string;        // 表面形式（如 먹었어요）
    baseForm: string;       // 词典原型（如 먹다）
    partOfSpeech: string;   // 词性
    confidence: number;     // 置信度 (0-1)
}

/**
 * 文档分析结果
 */
export interface DocumentAnalysisResult {
    // 从原型到活用形的映射
    morphologyIndex: Map<string, Set<string>>;
    // 所有分析结果的详细信息
    analysisResults: MorphologyAnalysisResult[];
}

/**
 * 韩语形态学分析服务
 * 使用 lindera-wasm-ko-dic 进行韩语单词的原型还原和活用形匹配
 */
export class KoreanMorphologyService {
    private tokenizer: any | null = null;
    private isInitialized = false;
    private initPromise: Promise<void> | null = null;
    private app: any;
    private debugMode: boolean = false;

    constructor(app?: any) {
        this.app = app;
        // 延迟初始化，避免阻塞插件启动
        this.initPromise = this.initialize();
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

    /**
     * 合并后续的语尾token
     * @param tokens 所有token
     * @param startIndex 开始索引（从哪个索引开始检查）
     * @param maxLookAhead 最多向前看几个token
     * @param processedTokens 已处理的token集合（用于标记）
     * @returns 合并后的表面形式和处理的token数量
     */
    private mergeSubsequentEndings(
        tokens: any[],
        startIndex: number,
        maxLookAhead: number = 5,
        processedTokens?: Set<number>
    ): { mergedSurface: string; processedCount: number } {
        let mergedSurface = '';
        let processedCount = 0;

        for (let j = startIndex; j < tokens.length && j < startIndex + maxLookAhead; j++) {
            const subsequentTokenInfo = this.extractTokenInfo(tokens[j]);
            if (subsequentTokenInfo &&
                (subsequentTokenInfo.partOfSpeech.includes('EP') ||   // 先语末语尾
                 subsequentTokenInfo.partOfSpeech.includes('ETM') ||  // 连体语尾
                 subsequentTokenInfo.partOfSpeech.includes('EC') ||   // 连结语尾
                 subsequentTokenInfo.partOfSpeech.includes('EF'))) { // 终语尾

                this.debugLog(`[mergeSubsequentEndings] 添加语尾: ${subsequentTokenInfo.surface}`);
                mergedSurface += subsequentTokenInfo.surface;
                processedCount++;
                if (processedTokens) {
                    processedTokens.add(j);
                }
            } else {
                break; // 遇到非语尾成分，停止合并
            }
        }

        return { mergedSurface, processedCount };
    }

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
    private buildCompoundWordResult(
        tokenInfos: { surface: string; baseForm: string; partOfSpeech: string }[],
        allTokens: any[],
        startIndexInAllTokens: number,
        baseForm: string,
        partOfSpeech: string,
        confidence: number,
        processedTokens: Set<number>,
        shouldMergeEndings: boolean = true
    ): { surface: string; baseForm: string; partOfSpeech: string; confidence: number } {
        // 计算初始表面形式（合并tokenInfos中的所有token）
        let combinedSurface = tokenInfos.map(t => t.surface).join('');

        // 如果需要，合并后续语尾（从tokenInfos之后的位置开始）
        if (shouldMergeEndings) {
            const nextIndex = startIndexInAllTokens + tokenInfos.length;
            const { mergedSurface } = this.mergeSubsequentEndings(
                allTokens,
                nextIndex,
                5,
                processedTokens
            );
            combinedSurface += mergedSurface;
        }

        this.debugLog(`[buildCompoundWordResult] 最终结果: ${combinedSurface} → ${baseForm}`);

        return {
            surface: combinedSurface,
            baseForm: baseForm,
            partOfSpeech: partOfSpeech,
            confidence: confidence
        };
    }

    /**
     * 初始化 Lindera WASM
     */
    private async initialize(): Promise<void> {
        try {
            // 方法1: 使用导入的WASM字节数组
            let wasmInitialized = false;
            try {
                await init({ module_or_path: wasmBytes });
                wasmInitialized = true;
            } catch (error) {
                // Silently try next method
            }

            // 方法2: 使用正确的插件相对路径
            if (!wasmInitialized) {
                try {
                    // 在Obsidian中，使用app://local协议访问插件文件
                    const pluginWasmUrl = 'app://local/.obsidian/plugins/HiWords/lindera_wasm_bg.wasm';
                    const response = await fetch(pluginWasmUrl);
                    if (response.ok) {
                        const wasmBytes = await response.arrayBuffer();
                        await init({ module_or_path: wasmBytes });
                        wasmInitialized = true;
                    }
                } catch (error) {
                    // Silently try next method
                }
            }

            // 方法3: 尝试无参数初始化（让库自己处理）
            if (!wasmInitialized) {
                try {
                    await init({});
                    wasmInitialized = true;
                } catch (error) {
                    // Silently try next method
                }
            }

            // 方法4: 尝试通过Obsidian的资源加载器
            if (!wasmInitialized) {
                try {
                    // 使用Obsidian的资源协议
                    const resourceUrl = `app://local/.obsidian/plugins/HiWords/lindera_wasm_bg.wasm`;

                    // 直接传递URL给init函数
                    await init({ module_or_path: resourceUrl });
                    wasmInitialized = true;
                } catch (error) {
                    // Last method failed
                }
            }

            if (!wasmInitialized) {
                console.warn('所有WASM初始化方法都失败，将使用后备分析方案');
                this.isInitialized = false;
                return;
            }

            // 构建Tokenizer
            try {
                const builder = new TokenizerBuilder();

                // 设置内嵌韩语字典
                builder.setDictionary('embedded://ko-dic');

                this.tokenizer = builder.build();

                this.isInitialized = true;
            } catch (error) {
                console.error('Tokenizer构建失败:', error);
                this.isInitialized = false;
                return;
            }
            
        } catch (error) {
            console.error('韩语形态学分析服务初始化失败:', error);
            this.isInitialized = false;
        }
    }
    

    /**
     * 确保服务已初始化
     */
    private async ensureInitialized(): Promise<boolean> {
        if (this.isInitialized) {
            return true;
        }
        
        if (this.initPromise) {
            await this.initPromise;
        }
        
        return this.isInitialized;
    }

    /**
     * 检查是否为韩语文本
     */
    public isKoreanText(text: string): boolean {
        // 韩语字符范围：한글 음절 (AC00–D7AF), 한글 자모 (1100–11FF, A960–A97F, D7B0–D7FF)
        const koreanRegex = /[\uAC00-\uD7AF\u1100-\u11FF\uA960-\uA97F\uD7B0-\uD7FF]/;
        return koreanRegex.test(text);
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

                this.debugLog('Lindera 原始分析结果:', JSON.stringify(tokens, null, 2));

                if (!tokens || tokens.length === 0) {
                    this.debugLog('Lindera 分析结果为空，使用后备方案');
                    return this.fallbackAnalyze(word);
                }

                // 分析所有tokens，寻找最佳的基础形式
                this.debugLog('所有 tokens:', tokens);
                const analysisResult = this.analyzeTokens(tokens, word);
                if (!analysisResult) {
                    this.debugLog('analyzeTokens 返回 null，使用后备方案');
                    return this.fallbackAnalyze(word);
                }

                let { surface, baseForm, partOfSpeech } = analysisResult;

                this.debugLog('提取的属性:', { surface, baseForm, partOfSpeech });

                // 确保原型以 '다' 结尾（动词/形容词）
                let normalizedBaseForm = baseForm;
                if (this.isVerbOrAdjective(partOfSpeech) && !baseForm.endsWith('다')) {
                    normalizedBaseForm = baseForm + '다';
                }

                const result = {
                    surface,
                    baseForm: normalizedBaseForm,
                    partOfSpeech,
                    confidence: analysisResult.confidence || 0.8
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
    private analyzeTokens(tokens: any[], originalWord: string): { surface: string, baseForm: string, partOfSpeech: string, confidence: number } | null {
        if (!tokens || tokens.length === 0) {
            return null;
        }

        // 策略1: 优先处理复合词结构（名词+하다 等）
        if (tokens.length >= 2) {
            const result = this.analyzeCompoundWord(tokens, originalWord);
            if (result) {
                this.debugLog('[analyzeTokens] 复合词分析成功:', result);
                return result;
            }
        }

        // 策略2: 查找动词token（仅对于非复合词结构）
        // 注意：这里要小心，不要将 "해" 误识别为独立动词
        for (const token of tokens) {
            const tokenInfo = this.extractTokenInfo(token);
            if (tokenInfo && this.isVerbOrAdjective(tokenInfo.partOfSpeech)) {
                // 如果baseForm是"하다"或"해다"，可能是复合词的一部分，跳过
                if (tokenInfo.baseForm === '하다' || tokenInfo.baseForm === '해다') {
                    this.debugLog('[analyzeTokens] 跳过独立的 하다/해다，可能是复合词的一部分');
                    continue;
                }

                this.debugLog('[analyzeTokens] 找到独立动词token:', tokenInfo);
                return {
                    surface: originalWord,
                    baseForm: tokenInfo.baseForm,
                    partOfSpeech: tokenInfo.partOfSpeech,
                    confidence: 0.9
                };
            }
        }

        // 策略3: 使用第一个有效的token
        for (const token of tokens) {
            const tokenInfo = this.extractTokenInfo(token);
            if (tokenInfo) {
                this.debugLog('使用第一个有效token:', tokenInfo);
                return {
                    surface: originalWord,
                    baseForm: tokenInfo.baseForm,
                    partOfSpeech: tokenInfo.partOfSpeech,
                    confidence: 0.7
                };
            }
        }

        return null;
    }

    /**
     * 分析复合词结构
     */
    private analyzeCompoundWord(tokens: any[], originalWord: string): { surface: string, baseForm: string, partOfSpeech: string, confidence: number } | null {
        // 提取所有token信息
        const tokenInfos = tokens.map(token => this.extractTokenInfo(token)).filter((info): info is NonNullable<typeof info> => info !== null);

        if (tokenInfos.length < 2) {
            return null;
        }

        // 模式1a: 名词 + 하다动词 的结构
        // Lindera 可能的情况:
        // 1. 하 (XSV)
        // 2. 해 (XSV 或 VV)
        // 3. 해요/해야/해서 等复合形式 (XSV+EF 等)
        for (let i = 0; i < tokenInfos.length - 1; i++) {
            const currentToken = tokenInfos[i];
            const nextToken = tokenInfos[i + 1];

            if (currentToken && nextToken &&
                (currentToken.partOfSpeech.includes('NNG') || currentToken.partOfSpeech.includes('NNP'))) {

                // 使用通用的辅助方法检查
                if (this.isHadaRelatedToken(nextToken)) {
                    this.debugLog('[analyzeCompoundWord] 找到 名词+하다 结构:', currentToken.surface, '+', nextToken.surface);
                    const baseForm = currentToken.surface + '하다';
                    return {
                        surface: originalWord,
                        baseForm: baseForm,
                        partOfSpeech: 'NNG+HADA',
                        confidence: 0.95
                    };
                }
            }
        }

        // 模式1b: 词根 + 形容词/动词后缀结构 (XR + XSA/XSV)
        // 例如: 훈훈 (XR) + 하 (XSA) → 훈훈하다
        for (let i = 0; i < tokenInfos.length - 1; i++) {
            const currentToken = tokenInfos[i];
            const nextToken = tokenInfos[i + 1];

            if (currentToken && nextToken &&
                currentToken.partOfSpeech.includes('XR') &&
                (nextToken.partOfSpeech.includes('XSA') || nextToken.partOfSpeech.includes('XSV'))) {

                this.debugLog('[analyzeCompoundWord] 找到 词根+形容词后缀 结构:', currentToken.surface, '+', nextToken.surface);
                const baseForm = currentToken.surface + '하다';
                return {
                    surface: originalWord,
                    baseForm: baseForm,
                    partOfSpeech: 'XR+XSA',
                    confidence: 0.95
                };
            }
        }

        // 模式2: 动词词根 + 되다 (被动语态)
        // 寻找 되 + 语尾 的组合
        for (let i = 0; i < tokenInfos.length - 1; i++) {
            const currentToken = tokenInfos[i];
            const nextToken = tokenInfos[i + 1];

            // 检查是否为被动语态结构
            if (currentToken && nextToken && this.isPassiveStructure(currentToken, nextToken)) {
                // 构造被动动词原型
                const baseForm = this.constructPassiveBaseForm(tokenInfos, i);
                if (baseForm) {
                    return {
                        surface: originalWord,
                        baseForm: baseForm,
                        partOfSpeech: 'VV+XSV',  // 被动动词
                        confidence: 0.92
                    };
                }
            }
        }

        // 模式3: 复合动词（多个动词词根的组合）
        const verbTokens = tokenInfos.filter(token =>
            token && (this.isVerbOrAdjective(token.partOfSpeech) ||
            token.partOfSpeech.includes('VV') ||
            token.partOfSpeech.includes('VA'))
        );

        if (verbTokens.length >= 1) {
            // 使用最后一个动词token的基础形式
            const lastVerbToken = verbTokens[verbTokens.length - 1];
            if (lastVerbToken) {
                return {
                    surface: originalWord,
                    baseForm: lastVerbToken.baseForm,
                    partOfSpeech: lastVerbToken.partOfSpeech,
                    confidence: 0.85
                };
            }
        }

        return null;
    }

    /**
     * 检查是否为被动语态结构
     */
    private isPassiveStructure(currentToken: any, nextToken: any): boolean {
        // 检查 되 + 语尾 的模式
        return (nextToken.surface === '되' && currentToken.partOfSpeech.includes('EC')) ||
               (currentToken.surface === '되' || currentToken.surface.includes('되')) ||
               (nextToken.partOfSpeech === 'XSV' && nextToken.surface === '되');
    }

    /**
     * 构造被动动词的原型
     */
    private constructPassiveBaseForm(tokenInfos: any[], passiveIndex: number): string | null {
        // 寻找动词词根
        for (let i = 0; i < passiveIndex; i++) {
            const token = tokenInfos[i];
            if (token && (token.partOfSpeech.includes('NNG') || token.partOfSpeech.includes('NNP') ||
                token.partOfSpeech.includes('VV') || token.partOfSpeech.includes('VA'))) {
                // 构造被动形式: 词根 + 되다
                return token.surface + '되다';
            }
        }

        // 如果找不到明确的词根，检查是否有완整的词干
        if (passiveIndex > 0) {
            const stemParts = tokenInfos.slice(0, passiveIndex).map(t => t?.surface || '').join('');
            if (stemParts.length > 0) {
                return stemParts + '되다';
            }
        }

        return null;
    }

    /**
     * 从单个token中提取信息
     */
    private extractTokenInfo(token: any): { surface: string, baseForm: string, partOfSpeech: string } | null {
        let surface, baseForm, partOfSpeech;

        if (token instanceof Map) {
            // 处理 Map 格式的 token
            surface = token.get('text') || '';
            const details = token.get('details') || [];

            // 从 details 数组中提取词性和原型信息
            if (Array.isArray(details) && details.length > 0) {
                partOfSpeech = details[0] || 'UNKNOWN';

                // 优先从 details[6] 获取原型（Reading），再从 details[7] 获取形态素信息
                const reading = details[6] || '';
                const morphemeInfo = details[7] || '';

                this.debugLog(`[extractTokenInfo] ${surface}: reading=${reading}, morphemeInfo=${morphemeInfo}, pos=${partOfSpeech}`);

                baseForm = this.extractBaseFormFromMorphology(surface, reading, morphemeInfo, partOfSpeech);
            } else {
                partOfSpeech = 'UNKNOWN';
                baseForm = surface;
            }
        } else {
            // 处理普通对象格式
            surface = token?.surface || token?.text || '';
            baseForm = token?.dictionary_form || token?.base_form || token?.lemma || surface;
            partOfSpeech = token?.part_of_speech || token?.pos || token?.tag || 'UNKNOWN';
        }

        if (!surface) {
            return null;
        }

        return { surface, baseForm, partOfSpeech };
    }

    /**
     * 从形态学信息中提取基础形式
     */
    private extractBaseFormFromMorphology(surface: string, reading: string, morphemeInfo: string, partOfSpeech: string): string {
        // 策略1: 使用reading字段（如果可用且合理）
        // 排除reading是词性标记的情况（如 'ETM', 'EC' 等）
        const isPosTag = /^[A-Z]{2,}$/.test(reading); // 词性标记通常是大写字母
        if (reading && reading !== '*' && reading !== surface && !isPosTag) {
            // 对于动词和形容词，确保以 '다' 结尾
            if (this.isVerbOrAdjective(partOfSpeech)) {
                return reading.endsWith('다') ? reading : reading + '다';
            }
            return reading;
        }

        // 策略2: 解析形态素信息
        if (morphemeInfo && typeof morphemeInfo === 'string' && morphemeInfo !== '*') {
            const baseFormFromMorpheme = this.parseBaseFormFromMorpheme(morphemeInfo, partOfSpeech);
            if (baseFormFromMorpheme) {
                return baseFormFromMorpheme;
            }
        }

        // 策略3: 根据词性和表面形式推断
        return this.inferBaseFormFromSurface(surface, partOfSpeech);
    }

    /**
     * 从形态素信息中解析基础形式
     */
    private parseBaseFormFromMorpheme(morphemeInfo: string, partOfSpeech: string): string | null {
        // 形态素信息格式: "찾아가/VV/*+아/EC/*" 或 "거론/NNG/*+되/XSV/*+고/EC/*"
        const morphemes = morphemeInfo.split('+');

        // 寻找主要的词汇形态素（排除语法形态素如EC, ETM, EP等）
        for (const morpheme of morphemes) {
            const parts = morpheme.split('/');
            if (parts.length >= 2) {
                const morphSurface = parts[0];
                const morphPos = parts[1];

                // 跳过纯语法形态素（连接语尾、连体语尾等）
                if (morphPos === 'EC' || morphPos === 'ETM' || morphPos === 'EP' ||
                    morphPos === 'EF' || morphPos === 'ETN') {
                    continue;
                }

                // 如果是主要的动词、形容词或名词形态素
                if (morphPos === 'VV' || morphPos === 'VA' || morphPos === 'VCN' ||
                    morphPos === 'NNG' || morphPos === 'NNP') {

                    if (this.isVerbOrAdjective(morphPos)) {
                        return morphSurface.endsWith('다') ? morphSurface : morphSurface + '다';
                    }
                    return morphSurface;
                }
            }
        }

        // 特殊处理被动语态结构
        if (morphemes.length >= 2) {
            const result = this.handlePassiveMorphemes(morphemes);
            if (result) {
                return result;
            }
        }

        return null;
    }

    /**
     * 处理被动语态形态素
     */
    private handlePassiveMorphemes(morphemes: string[]): string | null {
        // 寻找 名词/动词 + XSV(되) 的模式
        for (let i = 0; i < morphemes.length - 1; i++) {
            const currentParts = morphemes[i].split('/');
            const nextParts = morphemes[i + 1].split('/');

            if (currentParts.length >= 2 && nextParts.length >= 2) {
                const currentSurface = currentParts[0];
                const currentPos = currentParts[1];
                const nextSurface = nextParts[0];
                const nextPos = nextParts[1];

                // 检查是否为被动语态: 명사/동사 + 되
                if ((currentPos === 'NNG' || currentPos === 'NNP' || currentPos === 'VV') &&
                    nextPos === 'XSV' && nextSurface === '되') {
                    return currentSurface + '되다';
                }
            }
        }

        return null;
    }

    /**
     * 根据表面形式和词性推断基础形式
     */
    private inferBaseFormFromSurface(surface: string, partOfSpeech: string): string {
        if (this.isVerbOrAdjective(partOfSpeech)) {
            // 动词/形容词：如果不以다结尾，添加다
            return surface.endsWith('다') ? surface : surface + '다';
        } else {
            // 名词等其他词性：直接使用表面形式
            return surface;
        }
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
                    confidence: 0.6  // 后备方案置信度较低
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
            confidence: 0.3
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
            // 使用 tokenizer 对整个文档进行分词和形态学分析
            const tokens = this.tokenizer.tokenize(text);

            // 用于跟踪已处理的token位置，避免重复处理复合词
            const processedTokens = new Set<number>();

            for (let i = 0; i < tokens.length; i++) {
                if (processedTokens.has(i)) {
                    continue;
                }

                const token = tokens[i];
                const tokenInfo = this.extractTokenInfo(token);

                // 调试：打印每个token
                if (tokenInfo && this.isKoreanText(tokenInfo.surface)) {
                    this.debugLog(`[analyzeDocument] Token[${i}]: ${tokenInfo.surface} (${tokenInfo.partOfSpeech}) baseForm: ${tokenInfo.baseForm}`);
                }

                // 首先尝试检测复合词结构
                let tokenGroup = [token];
                let analysisResult = null;

                // 检查是否为复合词结构（名词 + XSV）或包含多个语尾的复杂动词
                if (i < tokens.length - 1) {
                    const currentTokenInfo = this.extractTokenInfo(token);
                    const nextTokenInfo = this.extractTokenInfo(tokens[i + 1]);

                    if (currentTokenInfo && nextTokenInfo) {
                        // 情况1: 名词 + 하다动词 的结构
                        // Lindera 可能的情况:
                        // 1. 하 (XSV)
                        // 2. 해 (XSV 或 VV)
                        // 3. 해요/해야/해서 等复合形式 (XSV+EF 等)
                        const isNounToken = currentTokenInfo.partOfSpeech.includes('NNG') || currentTokenInfo.partOfSpeech.includes('NNP');

                        // 检查是否是 하다 相关的 token
                        // 使用通用的辅助方法检查
                        const isHadaToken = this.isHadaRelatedToken(nextTokenInfo);

                        // 检查是否是词根 + 形容词/动词后缀结构 (XR + XSA/XSV)
                        const isRootToken = currentTokenInfo.partOfSpeech.includes('XR');
                        const isAdjectiveSuffix = nextTokenInfo.partOfSpeech.includes('XSA') || nextTokenInfo.partOfSpeech.includes('XSV');

                        if (isNounToken && isHadaToken) {
                            this.debugLog(`[analyzeDocument] 找到 名词+하다 结构: ${currentTokenInfo.surface} + ${nextTokenInfo.surface}`);

                            // 标记下一个token已处理
                            processedTokens.add(i + 1);
                            tokenGroup = [token, tokens[i + 1]];

                            // 如果下一个token不是复合形式（如 해요），才继续合并后续语尾
                            const shouldMergeEndings = !nextTokenInfo.surface.startsWith('해') || nextTokenInfo.surface.length <= 1;

                            // 使用通用方法构建结果
                            const baseForm = currentTokenInfo.surface + '하다';
                            analysisResult = this.buildCompoundWordResult(
                                [currentTokenInfo, nextTokenInfo],
                                tokens,
                                i,  // startIndexInAllTokens
                                baseForm,
                                'NNG+HADA',
                                0.95,
                                processedTokens,
                                shouldMergeEndings
                            );
                        }
                        // 情况1b: 词根 + 形容词/动词后缀结构 (XR + XSA/XSV)
                        // 例如: 훈훈 (XR) + 하 (XSA) → 훈훈하다
                        else if (isRootToken && isAdjectiveSuffix) {
                            this.debugLog(`[analyzeDocument] 找到 词根+形容词后缀 结构: ${currentTokenInfo.surface} + ${nextTokenInfo.surface}`);

                            // 标记下一个token已处理
                            processedTokens.add(i + 1);
                            tokenGroup = [token, tokens[i + 1]];

                            // 使用通用方法构建结果
                            const baseForm = currentTokenInfo.surface + '하다';
                            analysisResult = this.buildCompoundWordResult(
                                [currentTokenInfo, nextTokenInfo],
                                tokens,
                                i,
                                baseForm,
                                'XR+XSA',
                                0.95,
                                processedTokens,
                                true  // 总是合并后续语尾
                            );
                        }
                        // 情况2: 动词词根 + 语尾的复杂结构
                        else if ((currentTokenInfo.partOfSpeech.includes('VV') || currentTokenInfo.partOfSpeech.includes('VA')) &&
                                (nextTokenInfo.partOfSpeech.includes('EP') || nextTokenInfo.partOfSpeech.includes('ETM') ||
                                 nextTokenInfo.partOfSpeech.includes('EC') || nextTokenInfo.partOfSpeech.includes('EF'))) {

                            // 标记下一个token已处理
                            processedTokens.add(i + 1);
                            tokenGroup = [token, tokens[i + 1]];

                            // 使用通用方法构建结果
                            analysisResult = this.buildCompoundWordResult(
                                [currentTokenInfo, nextTokenInfo],
                                tokens,
                                i,
                                currentTokenInfo.baseForm,
                                currentTokenInfo.partOfSpeech + '+' + nextTokenInfo.partOfSpeech,
                                0.9,
                                processedTokens,
                                true  // 总是合并后续语尾
                            );
                        }
                    }
                }

                // 如果不是复合词，处理单个token
                if (!analysisResult) {
                    const tokenInfo = this.extractTokenInfo(token);
                    if (tokenInfo) {
                        // 只处理韩语词汇
                        if (!this.isKoreanText(tokenInfo.surface)) {
                            continue;
                        }

                        // 处理动词和形容词，以及包含动词成分的复合词
                        if (this.isVerbOrAdjective(tokenInfo.partOfSpeech) ||
                            tokenInfo.partOfSpeech.includes('VV') ||
                            tokenInfo.partOfSpeech.includes('VA') ||
                            tokenInfo.partOfSpeech.includes('EP') ||  // 先语末语尾
                            tokenInfo.partOfSpeech.includes('ETM') || // 连体语尾
                            tokenInfo.partOfSpeech.includes('EC') ||  // 连结语尾
                            (tokenInfo.baseForm && tokenInfo.baseForm.endsWith('다'))) {

                            analysisResult = {
                                surface: tokenInfo.surface,
                                baseForm: tokenInfo.baseForm,
                                partOfSpeech: tokenInfo.partOfSpeech,
                                confidence: this.calculateConfidence(token)
                            };
                        }
                    }
                }

                // 如果有有效的分析结果，添加到索引
                if (analysisResult) {
                    this.debugLog(`[文档分析] 找到活用形: ${analysisResult.surface} → ${analysisResult.baseForm}`);

                    // 建立索引：从原型到活用形的映射
                    if (!morphologyIndex.has(analysisResult.baseForm)) {
                        morphologyIndex.set(analysisResult.baseForm, new Set());
                    }
                    morphologyIndex.get(analysisResult.baseForm)!.add(analysisResult.surface);

                    // 记录分析结果
                    analysisResults.push(analysisResult);
                }
            }

            
            return { morphologyIndex, analysisResults };

        } catch (error) {
            console.error('分析文档时出错:', error);
            return { morphologyIndex, analysisResults };
        }
    }

    /**
     * 判断是否为动词或形容词
     */
    private isVerbOrAdjective(partOfSpeech: string | undefined): boolean {
        if (!partOfSpeech || typeof partOfSpeech !== 'string') {
            return false;
        }
        // 根据 lindera-ko-dic 的词性标记判断
        // VV: 동사 (verb), VA: 형용사 (adjective), VX: 보조동사 (auxiliary verb)
        // XSV: 서술용언접미사 (descriptive suffix verb), VCN: 명사파생동사 (noun-derived verb)
        return partOfSpeech.startsWith('VV') ||
               partOfSpeech.startsWith('VA') ||
               partOfSpeech.startsWith('VX') ||
               partOfSpeech.startsWith('XSV') ||
               partOfSpeech.startsWith('VCN');
    }

    /**
     * 检查 token 是否是 하다 相关的形态
     * 这是一个通用方法，通过检查 morphemeInfo 来识别所有 하다 的活用形
     */
    private isHadaRelatedToken(tokenInfo: { surface: string, baseForm: string, partOfSpeech: string } | null): boolean {
        if (!tokenInfo) return false;

        const { surface, baseForm, partOfSpeech } = tokenInfo;

        // 方法1: 检查 surface 的常见形式
        // 1.1 单字符形式
        if (surface === '하' || surface === '해' || surface === '한') {
            return true;
        }

        // 1.2 复合形式（以特定字符开头）
        if (surface.startsWith('해') || surface.startsWith('합') || surface.startsWith('했')) {
            return true;
        }

        // 方法2: 检查词性
        // XSV 或 XSA 开头，且包含 하다 相关词素
        if (partOfSpeech.includes('XSV') || partOfSpeech.includes('XSA')) {
            return true;
        }

        // 方法3: 检查 baseForm
        if (baseForm && baseForm.includes('하다')) {
            return true;
        }

        return false;
    }

    /**
     * 从 morphemeInfo 中提取名词词干（用于识别 名词+하다 结构）
     * morphemeInfo 格式: "하/XSV/*+았/EP/*" 或 "시기/NNG/*+했/XSV+EP/*"
     */
    private extractNounFromMorpheme(morphemeInfo: string): string | null {
        if (!morphemeInfo || morphemeInfo === '*') {
            return null;
        }

        // 分解形态素
        const morphemes = morphemeInfo.split('+');

        // 查找名词形态素
        for (const morpheme of morphemes) {
            const parts = morpheme.split('/');
            if (parts.length >= 2) {
                const surface = parts[0];
                const pos = parts[1];

                // 如果是名词（NNG 或 NNP）
                if (pos === 'NNG' || pos === 'NNP') {
                    return surface;
                }
            }
        }

        return null;
    }

    /**
     * 计算置信度
     */
    private calculateConfidence(token: any): number {
        if (!token) return 0.5;

        // 基于词性和词典形式的存在来计算置信度
        let confidence = 0.8; // 基础置信度

        // 如果有词典形式，提高置信度
        const dictionaryForm = token.dictionary_form || token.base_form || token.lemma;
        const surface = token.surface || token.text;
        if (dictionaryForm && surface && dictionaryForm !== surface) {
            confidence += 0.1;
        }

        // 如果是常见词性，提高置信度
        const partOfSpeech = token.part_of_speech || token.pos || token.tag;
        if (partOfSpeech && typeof partOfSpeech === 'string') {
            if (partOfSpeech.startsWith('VV') || partOfSpeech.startsWith('VA')) {
                confidence += 0.1;
            }
        }

        return Math.min(confidence, 1.0);
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
