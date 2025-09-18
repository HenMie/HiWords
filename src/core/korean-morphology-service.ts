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

    constructor(app?: any) {
        this.app = app;
        // 延迟初始化，避免阻塞插件启动
        this.initPromise = this.initialize();
    }

    /**
     * 初始化 Lindera WASM
     */
    private async initialize(): Promise<void> {
        try {
            console.log('开始初始化韩语形态学分析服务...');
            
            // 方法1: 使用导入的WASM字节数组
            let wasmInitialized = false;
            try {
                console.log('尝试使用导入的WASM字节数组...');
                await init({ module_or_path: wasmBytes });
                wasmInitialized = true;
                console.log('WASM模块通过字节数组初始化成功');
            } catch (error) {
                console.log('方法1失败:', error.message);
            }
            
            // 方法2: 使用正确的插件相对路径
            if (!wasmInitialized) {
                try {
                    console.log('尝试通过插件相对路径获取WASM文件...');
                    // 在Obsidian中，使用app://local协议访问插件文件
                    const pluginWasmUrl = 'app://local/.obsidian/plugins/HiWords/lindera_wasm_bg.wasm';
                    const response = await fetch(pluginWasmUrl);
                    if (response.ok) {
                        const wasmBytes = await response.arrayBuffer();
                        await init({ module_or_path: wasmBytes });
                        wasmInitialized = true;
                        console.log('WASM模块通过插件相对路径初始化成功');
                    } else {
                        console.log('插件相对路径fetch失败:', response.status);
                    }
                } catch (error) {
                    console.log('方法2失败:', error.message);
                }
            }
            
            // 方法3: 尝试无参数初始化（让库自己处理）
            if (!wasmInitialized) {
                try {
                    console.log('尝试无参数初始化...');
                    await init({});
                    wasmInitialized = true;
                    console.log('WASM模块无参数初始化成功');
                } catch (error) {
                    console.log('方法3失败:', error.message);
                }
            }
            
            // 方法4: 尝试通过Obsidian的资源加载器
            if (!wasmInitialized) {
                try {
                    console.log('尝试通过Obsidian资源加载器...');
                    // 使用Obsidian的资源协议
                    const resourceUrl = `app://local/.obsidian/plugins/HiWords/lindera_wasm_bg.wasm`;
                    console.log('资源URL:', resourceUrl);
                    
                    // 直接传递URL给init函数
                    await init({ module_or_path: resourceUrl });
                    wasmInitialized = true;
                    console.log('WASM模块通过资源加载器初始化成功');
                } catch (error) {
                    console.log('方法4失败:', error.message);
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
                console.log('TokenizerBuilder创建成功');
                
                // 设置内嵌韩语字典
                builder.setDictionary('embedded://ko-dic');
                console.log('韩语字典设置成功');
                
                this.tokenizer = builder.build();
                console.log('Tokenizer构建成功');
                
                this.isInitialized = true;
                console.log('韩语形态学分析服务初始化完成');
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

        // console.log(`开始分析单词: ${word}`);

        // 如果 tokenizer 可用，使用它进行分析
        if (await this.ensureInitialized() && this.tokenizer) {
            try {
                // console.log('使用 Lindera 进行分析...');
                // 使用 tokenizer 进行形态学分析
                const tokens = this.tokenizer.tokenize(word.trim());
                
                // console.log('Lindera 原始分析结果:', tokens);
                
                if (!tokens || tokens.length === 0) {
                    // console.log('Lindera 分析结果为空，使用后备方案');
                    return this.fallbackAnalyze(word);
                }

                // 分析所有tokens，寻找最佳的基础形式
                // console.log('所有 tokens:', tokens);
                const analysisResult = this.analyzeTokens(tokens, word);
                if (!analysisResult) {
                    return this.fallbackAnalyze(word);
                }

                let { surface, baseForm, partOfSpeech } = analysisResult;

                // console.log('提取的属性:', { surface, baseForm, partOfSpeech });
                
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
                
                // console.log('分析结果:', result);
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

        // 策略1: 处理复合动词结构（名词 + XSV/하다）
        if (tokens.length >= 2) {
            for (let i = 0; i < tokens.length - 1; i++) {
                const currentToken = this.extractTokenInfo(tokens[i]);
                const nextToken = this.extractTokenInfo(tokens[i + 1]);

                if (currentToken && nextToken) {
                    // 检查是否为 名词 + XSV(하) 的结构
                    if ((currentToken.partOfSpeech.includes('NNG') || currentToken.partOfSpeech.includes('NNP')) &&
                        nextToken.partOfSpeech === 'XSV' && nextToken.surface === '하') {

                        // 构造复合动词：名词 + 하다
                        const baseForm = currentToken.surface + '하다';
                        // console.log('找到复合动词结构:', { noun: currentToken.surface, verb: nextToken.surface, baseForm });

                        return {
                            surface: originalWord,
                            baseForm: baseForm,
                            partOfSpeech: 'NNG+XSV',
                            confidence: 0.95
                        };
                    }
                }
            }
        }

        // 策略2: 查找动词token（对于其他动词结构）
        for (const token of tokens) {
            const tokenInfo = this.extractTokenInfo(token);
            if (tokenInfo && this.isVerbOrAdjective(tokenInfo.partOfSpeech)) {
                // 对于复合词，如果找到动词，优先使用动词的基础形式
                // console.log('找到动词token:', tokenInfo);
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
                // console.log('使用第一个有效token:', tokenInfo);
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

                // 从 details[7] 解析真正的原型
                // 格式如: "찾아가/VV/*+아/EC/*" 或 "*"
                const morphemeInfo = details[7] || '';
                // console.log('形态素信息:', morphemeInfo);

                if (morphemeInfo && typeof morphemeInfo === 'string' && morphemeInfo !== '*') {
                    // 有具体的形态素信息，提取第一个形态素的原型部分
                    const firstMorpheme = morphemeInfo.split('+')[0];
                    const baseFormMatch = firstMorpheme.match(/^([^\/]+)/);
                    if (baseFormMatch) {
                        baseForm = baseFormMatch[1];

                        // 对于动词和形容词，确保以 '다' 结尾
                        if (partOfSpeech.includes('VCN') || partOfSpeech.includes('VV') || partOfSpeech.includes('VA')) {
                            if (!baseForm.endsWith('다')) {
                                baseForm = baseForm + '다';
                            }
                        }
                    } else {
                        baseForm = surface;
                    }
                } else {
                    // 形态素信息是 "*" 或为空，根据词性处理
                    if (partOfSpeech.includes('VV') || partOfSpeech.includes('VA') || partOfSpeech.includes('VCN')) {
                        // 动词/形容词：使用 surface + 다
                        baseForm = surface.endsWith('다') ? surface : surface + '다';
                    } else {
                        // 名词等其他词性：直接使用 surface
                        baseForm = surface;
                    }
                }
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
     * 后备分析方案（简单的规则匹配）
     */
    private fallbackAnalyze(word: string): MorphologyAnalysisResult | null {
        // console.log(`使用后备方案分析: ${word}`);
        
        // 简单的韩语动词/形容词词尾识别
        const commonEndings = [
            '진다', '친다', '는다', 'ㄴ다', '다',  // 现在时
            '었다', '았다', '였다',  // 过去时
            '겠다',  // 未来时
            '어요', '아요', '여요',  // 敬语现在时
            '었어요', '았어요', '였어요',  // 敬语过去时
            '겠어요',  // 敬语未来时
            '습니다', '십니다',  // 正式敬语现在时
            '었습니다', '았습니다', '였습니다'  // 正式敬语过去时
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
                
                // console.log('后备分析结果:', result);
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

                // 首先尝试检测复合词结构
                let tokenGroup = [token];
                let analysisResult = null;

                // 检查是否为复合词结构（名词 + XSV）或包含多个语尾的复杂动词
                if (i < tokens.length - 1) {
                    const currentTokenInfo = this.extractTokenInfo(token);
                    const nextTokenInfo = this.extractTokenInfo(tokens[i + 1]);

                    if (currentTokenInfo && nextTokenInfo) {
                        // 情况1: 名词 + XSV(하) 的结构
                        if ((currentTokenInfo.partOfSpeech.includes('NNG') || currentTokenInfo.partOfSpeech.includes('NNP')) &&
                            nextTokenInfo.partOfSpeech === 'XSV' && nextTokenInfo.surface === '하') {

                            // 这是一个复合动词结构，需要查看是否还有更多语尾
                            tokenGroup = [token, tokens[i + 1]];
                            let combinedSurface = currentTokenInfo.surface + nextTokenInfo.surface;
                            processedTokens.add(i + 1); // 标记下一个token已处理

                            // 检查是否还有后续的语尾（如: 하 + 자는）
                            for (let j = i + 2; j < tokens.length && j < i + 5; j++) {
                                const subsequentTokenInfo = this.extractTokenInfo(tokens[j]);
                                if (subsequentTokenInfo &&
                                    (subsequentTokenInfo.partOfSpeech.includes('EP') ||   // 先语末语尾
                                     subsequentTokenInfo.partOfSpeech.includes('ETM') ||  // 连体语尾
                                     subsequentTokenInfo.partOfSpeech.includes('EC') ||   // 连结语尾
                                     subsequentTokenInfo.partOfSpeech.includes('EF'))) { // 终语尾

                                    combinedSurface += subsequentTokenInfo.surface;
                                    tokenGroup.push(tokens[j]);
                                    processedTokens.add(j);
                                } else {
                                    break; // 遇到非语尾成分，停止合并
                                }
                            }

                            // 构造复合动词基础形式
                            const baseForm = currentTokenInfo.surface + '하다';
                            analysisResult = {
                                surface: combinedSurface,
                                baseForm: baseForm,
                                partOfSpeech: 'NNG+XSV',
                                confidence: 0.95
                            };
                        }
                        // 情况2: 动词词根 + 语尾的复杂结构
                        else if ((currentTokenInfo.partOfSpeech.includes('VV') || currentTokenInfo.partOfSpeech.includes('VA')) &&
                                (nextTokenInfo.partOfSpeech.includes('EP') || nextTokenInfo.partOfSpeech.includes('ETM') ||
                                 nextTokenInfo.partOfSpeech.includes('EC') || nextTokenInfo.partOfSpeech.includes('EF'))) {

                            // 这是动词 + 语尾的结构，合并处理
                            tokenGroup = [token, tokens[i + 1]];
                            let combinedSurface = currentTokenInfo.surface + nextTokenInfo.surface;
                            processedTokens.add(i + 1);

                            // 继续检查后续语尾
                            for (let j = i + 2; j < tokens.length && j < i + 5; j++) {
                                const subsequentTokenInfo = this.extractTokenInfo(tokens[j]);
                                if (subsequentTokenInfo &&
                                    (subsequentTokenInfo.partOfSpeech.includes('EP') ||
                                     subsequentTokenInfo.partOfSpeech.includes('ETM') ||
                                     subsequentTokenInfo.partOfSpeech.includes('EC') ||
                                     subsequentTokenInfo.partOfSpeech.includes('EF'))) {

                                    combinedSurface += subsequentTokenInfo.surface;
                                    tokenGroup.push(tokens[j]);
                                    processedTokens.add(j);
                                } else {
                                    break;
                                }
                            }

                            analysisResult = {
                                surface: combinedSurface,
                                baseForm: currentTokenInfo.baseForm,
                                partOfSpeech: currentTokenInfo.partOfSpeech + '+' + nextTokenInfo.partOfSpeech,
                                confidence: 0.9
                            };
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
