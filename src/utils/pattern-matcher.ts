/**
 * 短语模式匹配工具
 * 支持使用 "..." 占位符匹配跨词片段
 */

export interface ParsedPhrase {
    isPattern: boolean;
    parts: string[];
    original: string;
}

export interface PatternSegment {
    from: number;
    to: number;
}

export interface PatternMatchResult {
    from: number;
    to: number;
    matchedText: string;
    segments: PatternSegment[];
}

const SENTENCE_BOUNDARY_CHARS = new Set(['.', ',', '!', '?', ';', ':', '\n', '\r']);
const WORD_CHAR_REGEX = /[a-z0-9\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/iu;
const CJK_REGEX = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/**
 * 解析短语文本，识别是否为模式短语（包含 ... 占位符）
 */
export function parsePhrase(phrase: string): ParsedPhrase {
    const original = phrase.trim();
    if (!original) {
        return { isPattern: false, parts: [], original };
    }

    if (!original.includes('...')) {
        return { isPattern: false, parts: [original], original };
    }

    const parts = original
        .split('...')
        .map(part => part.trim())
        .filter(part => part.length > 0);
    const isPattern = parts.length > 1;

    return {
        isPattern,
        parts: isPattern ? parts : [original],
        original
    };
}

/**
 * 在文本中查找模式短语匹配（大小写不敏感，不跨句界）
 */
export function findPatternMatches(
    text: string,
    parts: string[],
    offset = 0
): PatternMatchResult[] {
    if (!text || parts.length === 0) {
        return [];
    }

    if (parts.length === 1) {
        return findSinglePartMatches(text, parts[0], offset);
    }

    const lowerText = text.toLowerCase();
    const lowerParts = parts.map(part => part.toLowerCase());
    const matches: PatternMatchResult[] = [];
    let searchStart = 0;

    while (searchStart < text.length) {
        const firstIndex = lowerText.indexOf(lowerParts[0], searchStart);
        if (firstIndex === -1) {
            break;
        }

        const firstEnd = firstIndex + parts[0].length;
        if (!hasWordBoundary(text, firstIndex, firstEnd)) {
            searchStart = firstIndex + 1;
            continue;
        }

        const segments: PatternSegment[] = [{
            from: offset + firstIndex,
            to: offset + firstEnd
        }];
        let cursor = firstEnd;
        let matched = true;

        for (let i = 1; i < parts.length; i++) {
            const boundary = findSentenceBoundary(text, cursor);
            const partIndex = findWindowPartIndex(lowerText, text, lowerParts[i], parts[i].length, cursor, boundary);

            if (partIndex === -1) {
                matched = false;
                break;
            }

            const partEnd = partIndex + parts[i].length;
            segments.push({
                from: offset + partIndex,
                to: offset + partEnd
            });
            cursor = partEnd;
        }

        if (matched) {
            matches.push({
                from: offset + firstIndex,
                to: offset + cursor,
                matchedText: text.slice(firstIndex, cursor),
                segments
            });
        }

        searchStart = firstIndex + 1;
    }

    return matches;
}

function findSinglePartMatches(text: string, part: string, offset: number): PatternMatchResult[] {
    const lowerText = text.toLowerCase();
    const lowerPart = part.toLowerCase();
    const matches: PatternMatchResult[] = [];
    let searchStart = 0;

    while (searchStart < text.length) {
        const index = lowerText.indexOf(lowerPart, searchStart);
        if (index === -1) {
            break;
        }

        const end = index + part.length;
        if (hasWordBoundary(text, index, end)) {
            matches.push({
                from: offset + index,
                to: offset + end,
                matchedText: text.slice(index, end),
                segments: [{ from: offset + index, to: offset + end }]
            });
        }

        searchStart = index + 1;
    }

    return matches;
}

function findWindowPartIndex(
    lowerText: string,
    originalText: string,
    lowerPart: string,
    partLength: number,
    start: number,
    end: number
): number {
    let index = lowerText.indexOf(lowerPart, start);
    while (index !== -1 && index < end) {
        const partEnd = index + partLength;
        if (partEnd <= end && hasWordBoundary(originalText, index, partEnd)) {
            return index;
        }
        index = lowerText.indexOf(lowerPart, index + 1);
    }
    return -1;
}

function findSentenceBoundary(text: string, start: number): number {
    for (let i = start; i < text.length; i++) {
        if (SENTENCE_BOUNDARY_CHARS.has(text[i])) {
            return i;
        }
    }
    return text.length;
}

function hasWordBoundary(text: string, start: number, end: number): boolean {
    if (start < 0 || end > text.length || start >= end) {
        return false;
    }

    const before = start > 0 ? text[start - 1] : ' ';
    const after = end < text.length ? text[end] : ' ';
    const startChar = text[start];
    const endChar = text[end - 1];
    const startBoundary = isCJKChar(startChar) || !isWordChar(before);
    const endBoundary = isCJKChar(endChar) || !isWordChar(after);

    return startBoundary && endBoundary;
}

function isWordChar(char: string): boolean {
    return WORD_CHAR_REGEX.test(char);
}

function isCJKChar(char: string): boolean {
    return CJK_REGEX.test(char);
}
