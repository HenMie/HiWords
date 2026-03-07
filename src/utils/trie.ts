/**
 * 前缀树(Trie)数据结构实现
 * 用于高效地匹配多个单词
 */
export class Trie<TPayload = unknown> {
    private root: TrieNode<TPayload>;

    constructor() {
        this.root = new TrieNode<TPayload>();
    }

    /**
     * 向前缀树中添加单词
     * @param word 要添加的单词
     * @param payload 与单词关联的数据
     * @param options 添加选项（可选）
     */
    addWord(word: string, payload: TPayload, options: TrieAddWordOptions = {}): void {
        if (!word) {
            return;
        }

        let node = this.root;
        const lowerWord = word.toLowerCase();
        const priority = options.priority ?? DEFAULT_WORD_PRIORITY;
        
        for (const char of lowerWord) {
            let childNode = node.children.get(char);
            if (!childNode) {
                childNode = new TrieNode<TPayload>();
                node.children.set(char, childNode);
            }
            node = childNode;
        }

        if (node.isEndOfWord && priority < node.priority) {
            return;
        }

        node.isEndOfWord = true;
        node.payload = payload;
        node.word = word; // 保存原始单词形式
        node.priority = priority;
    }

    /**
     * 在文本中查找所有匹配的单词
     * @param text 要搜索的文本
     * @param canSkipSpace 可选的回调函数，用于判断是否允许跨空格匹配
     *                     接收参数：(fullText: string, matchStart: number, spacePosition: number) => boolean
     * @returns 匹配结果数组，每个结果包含单词、位置和关联数据
     */
    findAllMatches(text: string, canSkipSpace?: (fullText: string, matchStart: number, spacePosition: number) => boolean): TrieMatch<TPayload>[] {
        const matches: TrieMatch<TPayload>[] = [];
        const lowerText = text.toLowerCase();
        
        // 对文本中的每个位置尝试匹配
        for (let i = 0; i < lowerText.length; i++) {
            let node = this.root;
            let j = i;
            let longestMatch: TrieMatch<TPayload> | null = null;
            let matchedChars = 0;
            
            // 尝试从当前位置匹配单词，保留最长匹配
            while (j < lowerText.length) {
                const char = lowerText[j];
                const directChild = node.children.get(char);
                
                if (directChild) {
                    node = directChild;
                    j++;
                    matchedChars++;
                } else if (char === ' ' && matchedChars > 0 && !node.children.has(char)) {
                    // 允许复合词中间的空格被忽略，但需要检查是否符合条件
                    const shouldSkip = canSkipSpace
                        ? canSkipSpace(text, i, j)
                        : true; // 如果没有提供回调，保持原有行为
                    
                    if (shouldSkip) {
                        j++;
                        continue;
                    } else {
                        break;
                    }
                } else {
                    break;
                }
                
                // 如果到达单词结尾，检查是否为更长的匹配
                if (node.isEndOfWord) {
                    // 检查单词边界
                    const isWordBoundaryStart = i === 0 || !isAlphaNumeric(lowerText[i - 1]);
                    const isWordBoundaryEnd = j === lowerText.length || !isAlphaNumeric(lowerText[j]);
                    
                    if (isWordBoundaryStart && isWordBoundaryEnd) {
                        // 保存当前匹配，如果更长则替换之前的匹配
                        longestMatch = {
                            word: node.word || lowerText.substring(i, j),
                            from: i,
                            to: j,
                            payload: node.payload
                        };
                    }
                }
            }
            
            // 如果找到匹配，添加到结果中
            if (longestMatch) {
                matches.push(longestMatch);
            }
        }
        
        return matches;
    }

    /**
     * 清空前缀树
     */
    clear(): void {
        this.root = new TrieNode<TPayload>();
    }
}

/**
 * 前缀树节点
 */
class TrieNode<TPayload> {
    children: Map<string, TrieNode<TPayload>>;
    isEndOfWord: boolean;
    payload: TPayload | null;
    word: string | null;
    priority: number;
    
    constructor() {
        this.children = new Map();
        this.isEndOfWord = false;
        this.payload = null;
        this.word = null;
        this.priority = DEFAULT_WORD_PRIORITY;
    }
}

const DEFAULT_WORD_PRIORITY = 0;

export interface TrieAddWordOptions {
    priority?: number;
}

/**
 * 前缀树匹配结果
 */
export interface TrieMatch<TPayload = unknown> {
    word: string;
    from: number;
    to: number;
    payload: TPayload | null;
}

/**
 * 检查字符是否为字母或数字
 */
function isAlphaNumeric(char: string): boolean {
    return /[a-z0-9]/i.test(char);
}

/**
 * 移除重叠的匹配项，优先保留更长的匹配
 * @param matches 原始匹配结果数组
 * @returns 处理后的无重叠匹配数组
 */
export function removeOverlappingMatches<TPayload>(matches: TrieMatch<TPayload>[]): TrieMatch<TPayload>[] {
    if (matches.length <= 1) return matches;
    
    // 按位置排序，位置相同时按长度降序排序（长的在前）
    matches.sort((a, b) => {
        if (a.from !== b.from) {
            return a.from - b.from;
        }
        return (b.to - b.from) - (a.to - a.from);
    });
    
    const result: TrieMatch<TPayload>[] = [];
    let lastEnd = 0;
    
    for (const match of matches) {
        // 如果当前匹配不与之前的匹配重叠，则添加到结果中
        if (match.from >= lastEnd) {
            result.push(match);
            lastEnd = match.to;
        }
        // 如果重叠，由于我们已经按长度排序，前面的更长匹配已经被选中
        // 所以忽略当前较短的匹配
    }
    
    return result;
}
