/**
 * 日语形态学分析类型定义
 * 参考韩语形态学类型，适配日语特有的词性和活用系统
 */

/**
 * IPADIC 词性标签
 * 日语形态素分析器使用的标准词性分类
 */
export type JapanesePartOfSpeech =
    | '名詞'         // 名词
    | '動詞'         // 动词
    | '形容詞'       // い形容词
    | '形容動詞'     // な形容动词
    | '副詞'         // 副词
    | '連体詞'       // 连体词
    | '接続詞'       // 接续词
    | '感動詞'       // 感叹词
    | '助詞'         // 助词
    | '助動詞'       // 助动词
    | '接頭詞'       // 接头词
    | '接尾詞'       // 接尾词
    | '記号'         // 符号
    | 'フィラー'     // 填充词
    | 'その他'       // 其他
    | 'UNKNOWN';     // 未知

/**
 * 日语动词活用类型
 */
export type VerbConjugationType =
    | '五段'         // 五段动词
    | '一段'         // 一段动词（上一段/下一段）
    | 'サ変'         // サ变动词（する）
    | 'カ変'         // カ变动词（来る）
    | '不変化'       // 不变化动词
    | 'UNKNOWN';

/**
 * 日语动词活用形式
 */
export type VerbConjugationForm =
    | '未然形'       // 未然形（否定、意志等）
    | '連用形'       // 连用形（て形、ます形等）
    | '終止形'       // 终止形（基本形）
    | '連体形'       // 连体形（修饰名词）
    | '仮定形'       // 假定形（ば形）
    | '命令形'       // 命令形
    | '基本形'       // 基本形/辞书形
    | 'UNKNOWN';

/**
 * 原始 Token 结构（来自 lindera-wasm-ipadic）
 */
export interface Token {
    surface: string;         // 表层形式
    feature: string[];       // 特征数组
    partOfSpeech?: string;   // 词性
    baseForm?: string;       // 基本形
    [key: string]: unknown;
}

/**
 * Tokenizer 接口
 */
export interface Tokenizer {
    tokenize(text: string): Token[];
    free(): void;
}

/**
 * 归一化后的 Token
 */
export interface NormalizedToken {
    surface: string;              // 表层形式
    baseForm: string;             // 基本形/原型
    partOfSpeech: string;         // 词性（主分类）
    posDetail1?: string;          // 词性细分类1
    posDetail2?: string;          // 词性细分类2
    posDetail3?: string;          // 词性细分类3
    conjugationType?: string;     // 活用类型
    conjugationForm?: string;     // 活用形式
    reading?: string;             // 读音（片假名）
    pronunciation?: string;       // 发音
    rawToken: Token;              // 原始 token
}

/**
 * 规则作用域
 */
export type TokenRuleScope = 'word' | 'document';

/**
 * 规则上下文
 */
export interface TokenRuleContext {
    tokens: NormalizedToken[];
    index: number;
    scope: TokenRuleScope;
    originalText: string;
    processedTokens: Set<number>;
    debugLog?: (...args: unknown[]) => void;
    calculateConfidence?: (token: Token) => number;
}

/**
 * 形态学分析结果
 */
export interface MorphologyAnalysisResult {
    surface: string;          // 表层形式
    baseForm: string;         // 基本形/原型
    partOfSpeech: string;     // 词性
    confidence: number;       // 置信度
    analysisSource?: 'tokenizer' | 'reverse-rule' | 'fallback';
}

/**
 * 文档分析结果
 */
export interface DocumentAnalysisResult {
    morphologyIndex: Map<string, Set<string>>; // 原型 -> 活用形集合
    analysisResults: MorphologyAnalysisResult[];
}

/**
 * 规则匹配结果
 */
export interface RuleResult {
    result: MorphologyAnalysisResult;
    consumedTokenIndices: number[];
}

/**
 * Token 分析规则
 */
export interface TokenAnalysisRule {
    name: string;
    apply(context: TokenRuleContext): RuleResult | null;
}

/**
 * IPADIC 特征数组索引
 * feature[0]: 词性（品詞）
 * feature[1]: 词性细分类1（品詞細分類1）
 * feature[2]: 词性细分类2（品詞細分類2）
 * feature[3]: 词性细分类3（品詞細分類3）
 * feature[4]: 活用类型（活用型）
 * feature[5]: 活用形式（活用形）
 * feature[6]: 基本形（原形）
 * feature[7]: 读音（読み）
 * feature[8]: 发音（発音）
 */
export const IPADIC_FEATURE_INDEX = {
    POS: 0,              // 词性
    POS_DETAIL_1: 1,     // 词性细分类1
    POS_DETAIL_2: 2,     // 词性细分类2
    POS_DETAIL_3: 3,     // 词性细分类3
    CONJUGATION_TYPE: 4, // 活用类型
    CONJUGATION_FORM: 5, // 活用形式
    BASE_FORM: 6,        // 基本形
    READING: 7,          // 读音
    PRONUNCIATION: 8     // 发音
} as const;
