/**
 * 词汇缓存管理器
 * 负责管理词汇定义的缓存，提高查询性能
 */

import { WordDefinition } from '../utils';

/**
 * 词汇缓存管理器
 * 集中管理所有缓存相关逻辑
 */
export class VocabularyCacheManager {
    // 主缓存：单词 -> 定义映射
    private wordDefinitionCache: Map<string, WordDefinition> = new Map();
    
    // 所有单词列表缓存
    private allWordsCache: string[] = [];
    
    // 书本单词列表缓存：书本路径 -> 单词列表
    private bookWordsCache: Map<string, string[]> = new Map();
    
    // 缓存有效性标志
    private cacheValid: boolean = false;

    constructor() {
        // 初始化空缓存
    }

    /**
     * 使缓存失效
     * 当词汇数据发生变化时调用
     */
    invalidate(): void {
        this.cacheValid = false;
        this.wordDefinitionCache.clear();
        this.allWordsCache = [];
        this.bookWordsCache.clear();
    }

    /**
     * 检查缓存是否有效
     */
    isValid(): boolean {
        return this.cacheValid;
    }

    /**
     * 重建缓存
     * @param definitions 所有词汇定义的映射（书本路径 -> 定义数组）
     */
    rebuild(definitions: Map<string, WordDefinition[]>): void {
        const startTime = performance.now();
        
        // 清空现有缓存
        this.wordDefinitionCache.clear();
        this.allWordsCache = [];
        this.bookWordsCache.clear();
        
        const allWords = new Set<string>();
        
        // 遍历所有词汇本和定义
        for (const [bookPath, wordDefs] of definitions.entries()) {
            const bookWords = new Set<string>();
            
            for (const def of wordDefs) {
                // 只添加主单词（原型）到缓存
                const normalizedWord = def.word.toLowerCase().trim();
                this.wordDefinitionCache.set(normalizedWord, def);
                allWords.add(normalizedWord);
                bookWords.add(normalizedWord);

            }
            
            // 保存该书本的单词列表
            this.bookWordsCache.set(bookPath, [...bookWords]);
        }
        
        // 保存所有单词列表
        this.allWordsCache = [...allWords];
        
        // 标记缓存为有效
        this.cacheValid = true;
        
        const elapsed = performance.now() - startTime;
        if (elapsed > 100) {
            console.debug(`[VocabularyCacheManager] 缓存重建耗时: ${elapsed.toFixed(2)}ms`);
        }
    }

    /**
     * 获取单词定义（从缓存）
     * @param word 单词（会自动规范化）
     * @returns 单词定义或 undefined
     */
    getDefinition(word: string): WordDefinition | undefined {
        const normalizedWord = word.toLowerCase().trim();
        return this.wordDefinitionCache.get(normalizedWord);
    }

    /**
     * 设置单词定义到缓存
     * @param word 单词
     * @param definition 单词定义
     */
    setDefinition(word: string, definition: WordDefinition): void {
        const normalizedWord = word.toLowerCase().trim();
        this.wordDefinitionCache.set(normalizedWord, definition);
        // 注意：这不会自动标记缓存失效，因为可能是增量更新
    }

    /**
     * 删除单词定义缓存
     * @param word 单词
     */
    deleteDefinition(word: string): void {
        const normalizedWord = word.toLowerCase().trim();
        this.wordDefinitionCache.delete(normalizedWord);
    }

    /**
     * 检查单词是否在缓存中
     * @param word 单词
     * @returns 是否存在
     */
    hasWord(word: string): boolean {
        const normalizedWord = word.toLowerCase().trim();
        return this.wordDefinitionCache.has(normalizedWord);
    }

    /**
     * 获取所有单词列表（从缓存）
     * @returns 单词列表副本
     */
    getAllWords(): string[] {
        return [...this.allWordsCache];
    }

    /**
     * 获取指定书本的单词列表（从缓存）
     * @param bookPath 书本路径
     * @returns 单词列表副本或空数组
     */
    getWordsFromBook(bookPath: string): string[] {
        const words = this.bookWordsCache.get(bookPath);
        return words ? [...words] : [];
    }

    /**
     * 获取未掌握的单词列表
     * @returns 未掌握的单词数组
     */
    getUnmasteredWords(): string[] {
        const unmasteredWords: string[] = [];
        for (const word of this.allWordsCache) {
            const wordDef = this.wordDefinitionCache.get(word);
            if (wordDef && !wordDef.mastered) {
                unmasteredWords.push(word);
            }
        }
        return unmasteredWords;
    }

    /**
     * 获取已掌握的单词列表
     * @returns 已掌握的单词数组
     */
    getMasteredWords(): string[] {
        const masteredWords: string[] = [];
        for (const word of this.allWordsCache) {
            const wordDef = this.wordDefinitionCache.get(word);
            if (wordDef && wordDef.mastered) {
                masteredWords.push(word);
            }
        }
        return masteredWords;
    }

    /**
     * 获取缓存统计信息
     */
    getStats(): {
        totalWords: number;
        totalBooks: number;
        cacheValid: boolean;
    } {
        return {
            totalWords: this.allWordsCache.length,
            totalBooks: this.bookWordsCache.size,
            cacheValid: this.cacheValid
        };
    }

    /**
     * 清空所有缓存
     */
    clear(): void {
        this.wordDefinitionCache.clear();
        this.allWordsCache = [];
        this.bookWordsCache.clear();
        this.cacheValid = false;
    }
}

