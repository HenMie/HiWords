/**
 * 日语文本工具函数
 * 提供统一的日语文本检测和处理
 */

/**
 * 平假名正则表达式 (U+3040-U+309F)
 */
export const HIRAGANA_REGEX = /[\u3040-\u309F]/;

/**
 * 片假名正则表达式 (U+30A0-U+30FF)
 */
export const KATAKANA_REGEX = /[\u30A0-\u30FF]/;

/**
 * 日语假名正则表达式（平假名 + 片假名）
 */
export const KANA_REGEX = /[\u3040-\u309F\u30A0-\u30FF]/;

/**
 * CJK 统一汉字正则表达式 (常用范围)
 * 包含日语常用的汉字范围
 */
export const CJK_REGEX = /[\u4E00-\u9FFF]/;

/**
 * 日语文本正则表达式（假名 + 汉字 + 日语专用符号）
 * 包含：
 * - 平假名 (U+3040-U+309F)
 * - 片假名 (U+30A0-U+30FF)
 * - CJK 统一汉字 (U+4E00-U+9FFF)
 * - 片假名扩展 (U+31F0-U+31FF)
 * - 半角片假名 (U+FF65-U+FF9F)
 */
export const JAPANESE_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u31F0-\u31FF\uFF65-\uFF9F]/;

export interface ScriptStatistics {
    total: number;
    korean: number;
    kana: number;
    cjk: number;
}

/**
 * 统计文本脚本分布（韩文 / 日文假名 / CJK）
 */
export function getScriptStatistics(text: string): ScriptStatistics {
    if (!text) {
        return { total: 0, korean: 0, kana: 0, cjk: 0 };
    }

    let korean = 0;
    let kana = 0;
    let cjk = 0;

    for (const char of text) {
        if (/[\uAC00-\uD7AF\u1100-\u11FF\uA960-\uA97F\uD7B0-\uD7FF]/.test(char)) {
            korean++;
            continue;
        }
        if (KANA_REGEX.test(char)) {
            kana++;
            continue;
        }
        if (CJK_REGEX.test(char)) {
            cjk++;
        }
    }

    return {
        total: text.length,
        korean,
        kana,
        cjk
    };
}

/**
 * 检查文本是否包含日语字符（假名）
 * 通过检测假名来确定是否为日语文本
 * @param text 要检查的文本
 * @returns 是否包含日语假名
 */
export function isJapaneseText(text: string): boolean {
    if (!text) return false;
    // 通过假名来判断是否为日语
    return KANA_REGEX.test(text);
}

/**
 * 检查文本是否包含平假名
 * @param text 要检查的文本
 * @returns 是否包含平假名
 */
export function containsHiragana(text: string): boolean {
    if (!text) return false;
    return HIRAGANA_REGEX.test(text);
}

/**
 * 检查文本是否包含片假名
 * @param text 要检查的文本
 * @returns 是否包含片假名
 */
export function containsKatakana(text: string): boolean {
    if (!text) return false;
    return KATAKANA_REGEX.test(text);
}

/**
 * 检查文本是否包含假名（平假名或片假名）
 * @param text 要检查的文本
 * @returns 是否包含假名
 */
export function containsKana(text: string): boolean {
    if (!text) return false;
    return KANA_REGEX.test(text);
}

/**
 * 检查文本是否包含汉字
 * @param text 要检查的文本
 * @returns 是否包含汉字
 */
export function containsKanji(text: string): boolean {
    if (!text) return false;
    return CJK_REGEX.test(text);
}

/**
 * 检查文本是否为纯日语（只包含日语字符）
 * @param text 要检查的文本
 * @returns 是否为纯日语
 */
export function isPureJapanese(text: string): boolean {
    if (!text) return false;
    // 移除空格和常见标点后检查
    const trimmed = text.replace(/[\s\u3000。、！？「」『』（）・ー〜]/g, '');
    if (!trimmed) return false;

    // 检查每个字符是否都是日语字符
    for (const char of trimmed) {
        if (!JAPANESE_REGEX.test(char)) {
            return false;
        }
    }
    return true;
}

/**
 * 检查单词是否为日语单词
 * 必须包含假名才被认为是日语
 * @param word 要检查的单词
 * @returns 是否为日语单词
 */
export function isJapaneseWord(word: string): boolean {
    return isJapaneseText(word);
}

/**
 * 提取文本中的所有假名字符
 * @param text 输入文本
 * @returns 假名字符数组
 */
export function extractKana(text: string): string[] {
    if (!text) return [];
    return text.match(new RegExp(KANA_REGEX, 'g')) || [];
}

/**
 * 提取文本中的所有汉字字符
 * @param text 输入文本
 * @returns 汉字字符数组
 */
export function extractKanji(text: string): string[] {
    if (!text) return [];
    return text.match(new RegExp(CJK_REGEX, 'g')) || [];
}

/**
 * 统计文本中的假名数量
 * @param text 输入文本
 * @returns 假名数量
 */
export function countKana(text: string): number {
    return extractKana(text).length;
}

/**
 * 统计文本中的汉字数量
 * @param text 输入文本
 * @returns 汉字数量
 */
export function countKanji(text: string): number {
    return extractKanji(text).length;
}

/**
 * 将全角片假名转换为平假名
 * @param text 包含片假名的文本
 * @returns 转换后的文本
 */
export function katakanaToHiragana(text: string): string {
    if (!text) return '';
    return text.replace(/[\u30A1-\u30F6]/g, (match) => {
        return String.fromCharCode(match.charCodeAt(0) - 0x60);
    });
}

/**
 * 将平假名转换为片假名
 * @param text 包含平假名的文本
 * @returns 转换后的文本
 */
export function hiraganaToKatakana(text: string): string {
    if (!text) return '';
    return text.replace(/[\u3041-\u3096]/g, (match) => {
        return String.fromCharCode(match.charCodeAt(0) + 0x60);
    });
}

/**
 * 检查文本是否可能是日语（包含假名或特定模式的汉字）
 * 比 isJapaneseText 更宽松，用于自动检测场景
 * @param text 要检查的文本
 * @returns 是否可能是日语
 */
export function mightBeJapanese(text: string): boolean {
    if (!text) return false;
    
    // 如果包含假名，肯定是日语
    if (containsKana(text)) {
        return true;
    }
    
    // 如果只包含汉字，可能是日语也可能是中文
    // 这种情况下返回 false，让调用者使用其他方式判断
    return false;
}
