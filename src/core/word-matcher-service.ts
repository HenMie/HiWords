import { Trie, generateCommonInflections } from '../utils';
import { KoreanMorphologyService } from './korean-morphology-service';
import type { VocabularyManager } from './vocabulary-manager';

/**
 * 词汇匹配服务
 * 提供统一的高亮匹配逻辑，供编辑模式、阅读模式、PDF模式共享使用
 */
export class WordMatcherService {
    private trie: Trie;
    private morphologyService: KoreanMorphologyService;
    private vocabularyManager: VocabularyManager;

    constructor(vocabularyManager: VocabularyManager) {
        this.vocabularyManager = vocabularyManager;
        this.trie = new Trie();
        // 复用 VocabularyManager 中的形态学服务，避免重复创建实例
        this.morphologyService = vocabularyManager.getMorphologyService();
        this.buildTrie();
    }

    /**
     * 构建单词前缀树（包含形态学索引）
     * @param includeAllWords 是否包含所有单词（包括已掌握的），默认 false（只包含未掌握的）
     */
    public buildTrie(includeAllWords: boolean = false): void {
        this.trie.clear();
        
        // 根据参数决定获取所有单词还是只获取未掌握的单词
        const baseWords = includeAllWords 
            ? this.vocabularyManager.getAllWords()
            : this.vocabularyManager.getAllWordsForHighlight();

        for (const baseWord of baseWords) {
            const definition = this.vocabularyManager.getDefinition(baseWord);
            if (definition) {
                // 添加原型本身
                this.trie.addWord(baseWord, definition);

                // 获取已索引的活用形
                const indexedInflectionForms = this.vocabularyManager.getAllInflectionForms(baseWord);

                // 为韩语单词生成常见活用形
                const commonInflectionForms = generateCommonInflections(baseWord);

                // 合并已索引的和生成的活用形
                const allInflectionForms = new Set([...indexedInflectionForms, ...commonInflectionForms]);

                for (const inflectionForm of allInflectionForms) {
                    if (inflectionForm !== baseWord) {
                        // 活用形指向同一个定义
                        this.trie.addWord(inflectionForm, definition);
                    }
                }
            }
        }
    }

    /**
     * 获取Trie实例
     */
    public getTrie(): Trie {
        return this.trie;
    }

    /**
     * 简单的名词判断（基于常见规则）
     * 这是一个快速的启发式方法，避免每次都调用完整的形态学分析
     */
    private isLikelyNoun(text: string): boolean {
        // 韩语名词的常见特征：
        // 1. 不以 다 结尾（动词/形容词通常以 다 结尾）
        if (text.endsWith('다')) {
            return false;
        }
        
        // 2. 不包含常见动词语尾
        const verbEndings = ['해요', '했어요', '할게요', '합니다', '했습니다', 
                            '해', '했어', '하고', '해서', '하니', '하면', '하자',
                            '기도', '도록', '려고', '면서'];
        for (const ending of verbEndings) {
            if (text.endsWith(ending)) {
                return false;
            }
        }
        
        // 3. 不包含常见助词（但这不影响名词性）
        // 如果去掉助词后仍然是名词，那就是名词
        const particles = ['은', '는', '이', '가', '을', '를', '의', '에', '에서', '으로', '로'];
        for (const particle of particles) {
            if (text.endsWith(particle)) {
                // 去掉助词后再次检查
                const withoutParticle = text.slice(0, -particle.length);
                if (withoutParticle.length > 0) {
                    return this.isLikelyNoun(withoutParticle);
                }
            }
        }
        
        // 默认情况下，如果没有明显的动词特征，认为是名词
        return true;
    }

    /**
     * 检查是否允许跨空格匹配（只允许名词+名词的情况）
     * 这个方法可以直接传给 Trie.findAllMatches
     */
    public canSkipSpace = (fullText: string, matchStart: number, spacePosition: number): boolean => {
        if (matchStart < 0 || spacePosition <= matchStart) {
            return false;
        }

        const charBeforeMatch = matchStart > 0 ? fullText[matchStart - 1] : '';
        const startsFromWhitespace = matchStart === 0 || /\s/.test(charBeforeMatch);
        if (!startsFromWhitespace) {
            return false;
        }

        const rawBefore = fullText.substring(matchStart, spacePosition);
        const textAfterSpace = fullText.substring(spacePosition + 1);
        const textBeforeSpace = rawBefore.replace(/\s+$/u, '');

        if (!textBeforeSpace) {
            return false;
        }

        // 只对韩语文本进行检查
        if (!this.morphologyService.isKoreanText(textBeforeSpace) || 
            !this.morphologyService.isKoreanText(textAfterSpace)) {
            return true; // 非韩语文本保持原有行为
        }

        // 提取空格后的第一个词（可能包含多个字符）
        const afterSpaceMatch = textAfterSpace.match(/^[\uAC00-\uD7AF\u1100-\u11FF\uA960-\uA97F\uD7B0-\uD7FF]+/);
        if (!afterSpaceMatch) {
            return false;
        }
        
        const wordAfterSpace = afterSpaceMatch[0];
        
        // 使用启发式规则判断是否都是名词
        const beforeIsNoun = this.isLikelyNoun(textBeforeSpace);
        const afterIsNoun = this.isLikelyNoun(wordAfterSpace);
        
        // 只有当两边都是名词时才允许跨空格
        return beforeIsNoun && afterIsNoun;
    }

    /**
     * 在文本中查找所有匹配的词汇
     * @param text 要搜索的文本
     * @returns 匹配结果数组
     */
    public findMatches(text: string) {
        return this.trie.findAllMatches(text, this.canSkipSpace);
    }

    /**
     * 清理资源
     * 注意：morphologyService 是从 VocabularyManager 共享的，不在此处销毁
     */
    public destroy(): void {
        this.trie.clear();
        // morphologyService 由 VocabularyManager 管理，不在此处销毁
    }
}


