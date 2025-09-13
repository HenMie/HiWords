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

                // 取第一个 token 的结果
                const token = tokens[0];
                console.log('第一个 token:', token);
                console.log('Token 属性:', Object.keys(token || {}));
                
                // 安全地获取 token 属性（处理 Map 格式）
                let surface, baseForm, partOfSpeech;
                
                if (token instanceof Map) {
                    // 处理 Map 格式的 token
                    surface = token.get('text') || word;
                    const details = token.get('details') || [];
                    
                    // 从 details 数组中提取词性和原型信息
                    if (Array.isArray(details) && details.length > 0) {
                        partOfSpeech = details[0] || 'UNKNOWN';
                        
                        // 从 details[7] 解析真正的原型
                        // 格式如: "찾아가/VV/*+아/EC/*" 或 "*"
                        const morphemeInfo = details[7] || '';
                        console.log('形态素信息:', morphemeInfo);
                        
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
                    surface = token?.surface || token?.text || word;
                    baseForm = token?.dictionary_form || token?.base_form || token?.lemma || surface;
                    partOfSpeech = token?.part_of_speech || token?.pos || token?.tag || 'UNKNOWN';
                }
                
                console.log('提取的属性:', { surface, baseForm, partOfSpeech });
                
                // 确保原型以 '다' 结尾（动词/形容词）
                let normalizedBaseForm = baseForm;
                if (this.isVerbOrAdjective(partOfSpeech) && !baseForm.endsWith('다')) {
                    normalizedBaseForm = baseForm + '다';
                }

                const result = {
                    surface,
                    baseForm: normalizedBaseForm,
                    partOfSpeech,
                    confidence: this.calculateConfidence(token)
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

            for (const token of tokens) {
                
                // 安全地获取 token 属性（处理 Map 格式）
                let surface, baseForm, partOfSpeech;
                
                if (token instanceof Map) {
                    // 处理 Map 格式的 token
                    surface = token.get('text') || '';
                    const details = token.get('details') || [];
                    
                    // 从 details 数组中提取词性和原型信息
                    if (Array.isArray(details) && details.length > 0) {
                        partOfSpeech = details[0] || 'UNKNOWN';
                        
                        // 从 details[7] 解析真正的原型
                        const morphemeInfo = details[7] || '';
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

                // 只处理韩语词汇
                if (!this.isKoreanText(surface)) {
                    continue;
                }

                // 只处理动词和形容词
                if (!this.isVerbOrAdjective(partOfSpeech)) {
                    continue;
                }


                // 建立索引：从原型到活用形的映射
                if (!morphologyIndex.has(baseForm)) {
                    morphologyIndex.set(baseForm, new Set());
                }
                morphologyIndex.get(baseForm)!.add(surface);

                // 记录分析结果
                const analysisResult: MorphologyAnalysisResult = {
                    surface,
                    baseForm,
                    partOfSpeech,
                    confidence: this.calculateConfidence(token)
                };
                analysisResults.push(analysisResult);
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
        return partOfSpeech.startsWith('VV') || 
               partOfSpeech.startsWith('VA') || 
               partOfSpeech.startsWith('VX');
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
