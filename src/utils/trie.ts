/**
 * 前缀树(Trie)数据结构实现
 * 用于高效地匹配多个单词
 */
export class Trie {
    private root: TrieNode;

    constructor() {
        this.root = new TrieNode();
    }

    /**
     * 向前缀树中添加单词
     * @param word 要添加的单词
     * @param payload 与单词关联的数据
     */
    addWord(word: string, payload: any): void {
        let node = this.root;
        const lowerWord = word.toLowerCase();
        
        for (const char of lowerWord) {
            if (!node.children.has(char)) {
                node.children.set(char, new TrieNode());
            }
            node = node.children.get(char)!;
        }
        
        node.isEndOfWord = true;
        node.payload = payload;
        node.word = word; // 保存原始单词形式
    }

    /**
     * 在文本中查找所有匹配的单词
     * @param text 要搜索的文本
     * @returns 匹配结果数组，每个结果包含单词、位置和关联数据
     */
    findAllMatches(text: string): TrieMatch[] {
        const matches: TrieMatch[] = [];
        const lowerText = text.toLowerCase();
        
        // 对文本中的每个位置尝试匹配
        for (let i = 0; i < lowerText.length; i++) {
            let node = this.root;
            let j = i;
            let longestMatch: TrieMatch | null = null;
            
            // 尝试从当前位置匹配单词，保留最长匹配
            while (j < lowerText.length && node.children.has(lowerText[j])) {
                node = node.children.get(lowerText[j])!;
                j++;
                
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
        this.root = new TrieNode();
    }
}

/**
 * 前缀树节点
 */
class TrieNode {
    children: Map<string, TrieNode>;
    isEndOfWord: boolean;
    payload: any;
    word: string | null;
    
    constructor() {
        this.children = new Map();
        this.isEndOfWord = false;
        this.payload = null;
        this.word = null;
    }
}

/**
 * 前缀树匹配结果
 */
export interface TrieMatch {
    word: string;
    from: number;
    to: number;
    payload: any;
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
export function removeOverlappingMatches(matches: TrieMatch[]): TrieMatch[] {
    if (matches.length <= 1) return matches;
    
    // 按位置排序，位置相同时按长度降序排序（长的在前）
    matches.sort((a, b) => {
        if (a.from !== b.from) {
            return a.from - b.from;
        }
        return (b.to - b.from) - (a.to - a.from);
    });
    
    const result: TrieMatch[] = [];
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
