/**
 * 韩语文本工具函数
 * 提供统一的韩语文本检测和处理
 */

/**
 * 韩语字符正则表达式
 * 包含：韩文音节 (AC00–D7AF)、韩文字母 (1100–11FF, A960–A97F, D7B0–D7FF)
 */
export const KOREAN_REGEX = /[\uAC00-\uD7AF\u1100-\u11FF\uA960-\uA97F\uD7B0-\uD7FF]/;

/**
 * 检查文本是否包含韩语字符
 * @param text 要检查的文本
 * @returns 是否包含韩语字符
 */
export function isKoreanText(text: string): boolean {
    if (!text) return false;
    return KOREAN_REGEX.test(text);
}

/**
 * 检查文本是否为纯韩语（不含其他字符）
 * @param text 要检查的文本
 * @returns 是否为纯韩语
 */
export function isPureKorean(text: string): boolean {
    if (!text) return false;
    // 移除空格后检查
    const trimmed = text.replace(/\s/g, '');
    if (!trimmed) return false;
    
    // 检查每个字符是否都是韩语
    for (const char of trimmed) {
        if (!KOREAN_REGEX.test(char)) {
            return false;
        }
    }
    return true;
}

/**
 * 检查单词是否为韩语单词
 * 用于词汇处理，等同于 isKoreanText
 * @param word 要检查的单词
 * @returns 是否为韩语单词
 */
export function isKoreanWord(word: string): boolean {
    return isKoreanText(word);
}

/**
 * 提取文本中的所有韩语字符
 * @param text 输入文本
 * @returns 韩语字符数组
 */
export function extractKoreanChars(text: string): string[] {
    if (!text) return [];
    return text.match(new RegExp(KOREAN_REGEX, 'g')) || [];
}

/**
 * 统计文本中的韩语字符数量
 * @param text 输入文本
 * @returns 韩语字符数量
 */
export function countKoreanChars(text: string): number {
    return extractKoreanChars(text).length;
}

