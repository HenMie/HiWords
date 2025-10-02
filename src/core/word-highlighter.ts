import { 
    RangeSetBuilder, 
    Extension,
    StateField,
    StateEffect
} from '@codemirror/state';
import { 
    EditorView, 
    Decoration, 
    DecorationSet, 
    ViewUpdate,
    ViewPlugin,
    PluginSpec,
    PluginValue,
    WidgetType
} from '@codemirror/view';
import { VocabularyManager } from './vocabulary-manager';
import { WordMatch, WordDefinition, mapCanvasColorToCSSVar, Trie, TrieMatch } from '../utils';
import { removeOverlappingMatches } from '../utils/trie';

// 防抖延迟时间（毫秒）
const DEBOUNCE_DELAY = 300;

// 性能监控阈值（毫秒）
const PERFORMANCE_THRESHOLD = 100;

// 状态效果：强制更新高亮
const forceUpdateEffect = StateEffect.define<boolean>();

// 全局高亮器管理器
class HighlighterManager {
    private static instance: HighlighterManager;
    private highlighters: Set<WordHighlighter> = new Set();
    
    static getInstance(): HighlighterManager {
        if (!HighlighterManager.instance) {
            HighlighterManager.instance = new HighlighterManager();
        }
        return HighlighterManager.instance;
    }
    
    register(highlighter: WordHighlighter): void {
        this.highlighters.add(highlighter);
    }
    
    unregister(highlighter: WordHighlighter): void {
        this.highlighters.delete(highlighter);
    }
    
    refreshAll(): void {

        this.highlighters.forEach(highlighter => {
            try {
                highlighter.forceUpdate();
            } catch (error) {
                console.error('刷新高亮器失败:', error);
            }
        });
    }
    
    clear(): void {
        this.highlighters.clear();
    }
}

// 导出全局实例
export const highlighterManager = HighlighterManager.getInstance();

// 状态字段：存储当前高亮的词汇
const highlightState = StateField.define<DecorationSet>({
    create() {
        return Decoration.none;
    },
    update(decorations, tr) {
        decorations = decorations.map(tr.changes);
        
        for (let effect of tr.effects) {
            if (effect.is(forceUpdateEffect)) {
                // 强制重新构建装饰器
                return Decoration.none;
            }
        }
        
        return decorations;
    },
    provide: f => EditorView.decorations.from(f)
});

// 词汇高亮插件
export class WordHighlighter implements PluginValue {
    decorations: DecorationSet;
    private vocabularyManager: VocabularyManager;
    private editorView: EditorView;
    private wordTrie: Trie;
    private debounceTimer: number | null = null;
    private lastRanges: {from: number, to: number}[] = [];
    private cachedMatches: Map<string, WordMatch[]> = new Map();

    constructor(view: EditorView, vocabularyManager: VocabularyManager) {
        this.editorView = view;
        this.vocabularyManager = vocabularyManager;
        this.wordTrie = new Trie();
        this.buildWordTrie();
        this.decorations = this.buildDecorations(view);
        
        // 注册到全局管理器
        highlighterManager.register(this);
    }

    /**
     * 构建单词前缀树（包含形态学索引）
     */
    private buildWordTrie() {
        const startTime = performance.now();
        this.wordTrie.clear();
        
        // 获取未掌握的原型单词（已掌握的单词不会被高亮）
        const baseWords = this.vocabularyManager.getAllWordsForHighlight();

        // 为每个原型单词添加其所有活用形
        for (const baseWord of baseWords) {
            const definition = this.vocabularyManager.getDefinition(baseWord);
            if (definition) {
                // 添加原型本身
                this.wordTrie.addWord(baseWord, definition);

                // 获取已索引的活用形
                const indexedInflectionForms = this.vocabularyManager.getAllInflectionForms(baseWord);

                // 为韩语单词生成常见活用形
                const commonInflectionForms = this.generateCommonInflections(baseWord);

                // 合并已索引的和生成的活用形
                const allInflectionForms = new Set([...indexedInflectionForms, ...commonInflectionForms]);

                for (const inflectionForm of allInflectionForms) {
                    if (inflectionForm !== baseWord) {
                        // 活用形指向同一个定义
                        this.wordTrie.addWord(inflectionForm, definition);
                    }
                }
            }
        }
    }

    update(update: ViewUpdate) {
        // 如果词汇管理器中的词汇发生变化，重建前缀树
        if (update.docChanged || update.viewportChanged || update.focusChanged) {
            // 使用防抖处理，避免频繁更新
            this.debouncedUpdate(update.view);
        }
    }

    /**
     * 强制更新高亮
     */
    forceUpdate() {
        // 重建前缀树
        this.buildWordTrie();
        
        // 清除缓存
        this.cachedMatches.clear();
        
        // 重建装饰器
        this.decorations = this.buildDecorations(this.editorView);
        this.editorView.dispatch({
            effects: forceUpdateEffect.of(true)
        });
    }
    
    /**
     * 防抖更新处理
     */
    private debouncedUpdate(view: EditorView) {
        if (this.debounceTimer) {
            window.clearTimeout(this.debounceTimer);
        }
        
        this.debounceTimer = window.setTimeout(() => {
            this.decorations = this.buildDecorations(view);
            this.debounceTimer = null;
        }, DEBOUNCE_DELAY);
    }

    /**
     * 构建装饰器
     */
    private buildDecorations(view: EditorView): DecorationSet {
        const startTime = performance.now();
        const builder = new RangeSetBuilder<Decoration>();
        const matches: WordMatch[] = [];
        
        // 检查可见范围是否发生变化
        const currentRanges = view.visibleRanges;
        const rangesChanged = this.haveRangesChanged(currentRanges);
        
        // 如果可见范围没有变化且有缓存，直接使用缓存的匹配结果
        const cacheKey = currentRanges.map(r => `${r.from}-${r.to}`).join(',');
        if (!rangesChanged && this.cachedMatches.has(cacheKey)) {
            const cachedMatches = this.cachedMatches.get(cacheKey)!;
            this.applyDecorations(builder, cachedMatches);
            return builder.finish();
        }
        
        // 更新最后处理的范围
        this.lastRanges = currentRanges.map(range => ({from: range.from, to: range.to}));
        
        // 扫描可见范围内的文本
        for (let { from, to } of view.visibleRanges) {
            const text = view.state.sliceDoc(from, to);
            matches.push(...this.findWordMatches(text, from));
        }

        // 按位置排序
        matches.sort((a, b) => a.from - b.from);
        
        // 处理重叠匹配
        const filteredMatches = this.removeOverlaps(matches);
        
        // 缓存处理结果
        this.cachedMatches.set(cacheKey, filteredMatches);
        
        // 应用装饰
        this.applyDecorations(builder, filteredMatches);
        
        return builder.finish();
    }
    
    /**
     * 应用装饰到构建器
     */
    private applyDecorations(builder: RangeSetBuilder<Decoration>, matches: WordMatch[]) {
        // 获取当前高亮样式设置
        const highlightStyle = this.vocabularyManager.getSettings().highlightStyle || 'underline';
        
        matches.forEach(match => {
            // 使用与侧边栏视图一致的默认灰色
            const highlightColor = mapCanvasColorToCSSVar(match.definition.color, 'var(--color-base-60)');
            
            builder.add(
                match.from,
                match.to,
                Decoration.mark({
                    class: `hi-words-highlight`,
                    attributes: {
                        'data-word': match.baseForm || match.word, // 优先使用原型，回退到匹配的词汇
                        'data-definition': match.definition.definition,
                        'data-color': highlightColor,
                        'data-style': highlightStyle,
                        'style': `--word-highlight-color: ${highlightColor};`
                    }
                })
            );
        });
    }
    
    /**
     * 检查可见范围是否发生变化
     */
    private haveRangesChanged(currentRanges: readonly {from: number, to: number}[]): boolean {
        if (this.lastRanges.length !== currentRanges.length) {
            return true;
        }
        
        for (let i = 0; i < currentRanges.length; i++) {
            if (currentRanges[i].from !== this.lastRanges[i].from || 
                currentRanges[i].to !== this.lastRanges[i].to) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * 在文本中查找词汇匹配
     * 使用前缀树进行高效匹配（包括形态学匹配）
     */
    private findWordMatches(text: string, offset: number): WordMatch[] {
        const startTime = performance.now();
        const matches: WordMatch[] = [];
        
        try {
            // 使用前缀树查找所有匹配（包括原型和活用形）
            const trieMatches = this.wordTrie.findAllMatches(text);
            
            // 转换为 WordMatch 对象
            for (const match of trieMatches) {
                const definition = match.payload as WordDefinition;
                if (definition) {
                    matches.push({
                        word: match.word, // 这里是实际匹配到的词汇（可能是原型或活用形）
                        definition, // 定义始终指向原型的定义
                        from: offset + match.from,
                        to: offset + match.to,
                        color: mapCanvasColorToCSSVar(definition.color, 'var(--color-accent)'),
                        baseForm: definition.word // 存储原型，用于悬浮卡片查找
                    });
                }
            }
        } catch (e) {
            console.error('在 findWordMatches 中发生错误:', e);
        }
        
        const endTime = performance.now();
        if (endTime - startTime > PERFORMANCE_THRESHOLD) {
            console.warn(`形态学匹配耗时较长: ${(endTime - startTime).toFixed(2)}ms`);
        }
        
        return matches;
    }

    /**
     * 移除重叠的匹配项，优先保留更长的匹配
     */
    private removeOverlaps(matches: WordMatch[]): WordMatch[] {
        if (matches.length === 0) {
            return matches;
        }
        
        // 转换为 TrieMatch 格式以使用通用的重叠处理函数
        const trieMatches: TrieMatch[] = matches.map(match => ({
            word: match.word,
            from: match.from,
            to: match.to,
            payload: match.definition
        }));
        
        // 使用优化的重叠处理函数
        const filteredTrieMatches = removeOverlappingMatches(trieMatches);
        
        // 转换回 WordMatch 格式
        return filteredTrieMatches.map(trieMatch => ({
            word: trieMatch.word,
            definition: trieMatch.payload as WordDefinition,
            from: trieMatch.from,
            to: trieMatch.to,
            color: mapCanvasColorToCSSVar((trieMatch.payload as WordDefinition).color, 'var(--color-accent)'),
            baseForm: (trieMatch.payload as WordDefinition).word // 存储原型，用于悬浮卡片查找
        }));
    }

    /**
     * 为韩语单词生成常见活用形
     */
    private generateCommonInflections(baseWord: string): string[] {
        // 只为韩语动词/形容词生成活用形
        if (!this.isKoreanWord(baseWord) || !baseWord.endsWith('다')) {
            return [];
        }

        const stem = baseWord.slice(0, -1); // 去掉 '다'
        const inflections: string[] = [];

        // 检查词干最后一个字符是否有收音（받침）
        const lastChar = stem[stem.length - 1];
        const hasFinalConsonant = this.hasFinalConsonant(lastChar);

        // 检查是否为ㅂ不规则动词（如 사납다）
        const isBIrregular = this.isBIrregular(lastChar);

        if (isBIrregular) {
            // ㅂ不规则：사납다 -> 사나우 + 어 = 사나워
            const irregularStem = this.applyBIrregular(stem);

            // 基本连接语尾
            inflections.push(irregularStem + '어');     // 사나워
            inflections.push(irregularStem + '니');     // 사나우니
            inflections.push(irregularStem + '면');     // 사나우면
            inflections.push(stem + '고');              // 사납고（保持原形）

            // 连体语尾（需要将ㄴ和ㄹ添加为收音）
            const stemWithN = this.addFinalConsonant(irregularStem, 4); // ㄴ的终声值是4
            const stemWithL = this.addFinalConsonant(irregularStem, 8); // ㄹ的终声值是8
            inflections.push(stemWithN);     // 사나운
            inflections.push(stemWithL);     // 사나울

            // 敬语
            inflections.push(irregularStem + '어요');   // 사나워요
        } else {
            // 规则动词
            // 基本连接语尾
            inflections.push(stem + '고');      // 거론되고
            inflections.push(stem + '어');      // 거론되어
            inflections.push(stem + '면');      // 거론되면
            inflections.push(stem + '니');      // 거론되니
            inflections.push(stem + '며');      // 거론되며

            // 敬语形式
            inflections.push(stem + '어요');    // 거론되어요
            inflections.push(stem + '습니다');  // 거론됩니다

            // 过去时
            inflections.push(stem + '었다');    // 거론되었다
            inflections.push(stem + '었어요');  // 거론되었어요

            // 连体语尾
            inflections.push(stem + '는');      // 거론되는
            inflections.push(stem + '은');      // 거론된
            inflections.push(stem + '던');      // 거론되던

            // 未来/推测语尾 (ㄹ语尾) - 需要根据是否有收音决定
            if (hasFinalConsonant) {
                inflections.push(stem + '을');      // 거론될（有收音：거론되 + 을）
                inflections.push(stem + '을까');
            } else {
                // 无收音：需要将ㄹ添加为收音
                const stemWithL = this.addFinalConsonant(stem, 8); // ㄹ的终声值是8
                inflections.push(stemWithL);      // 찢어질（无收音：찢어지 + ㄹ = 찢어질）
                inflections.push(stemWithL + '까');
            }

            // 其他常见语尾
            inflections.push(stem + '지');      // 거론되지
            inflections.push(stem + '서');      // 거론되서
            inflections.push(stem + '지만');    // 거론되지만
        }

        return inflections;
    }

    /**
     * 检查韩文字符是否有收音（받침）
     */
    private hasFinalConsonant(char: string): boolean {
        if (!char || char.length !== 1) return false;
        const code = char.charCodeAt(0);
        // 韩文音节范围：0xAC00-0xD7A3
        if (code < 0xAC00 || code > 0xD7A3) return false;

        // 韩文音节结构：(初声 * 21 + 中声) * 28 + 终声 + 0xAC00
        // 终声为0表示无收音
        const finalConsonant = (code - 0xAC00) % 28;
        return finalConsonant !== 0;
    }

    /**
     * 检查是否为ㅂ不规则动词
     */
    private isBIrregular(char: string): boolean {
        if (!char || char.length !== 1) return false;
        const code = char.charCodeAt(0);
        if (code < 0xAC00 || code > 0xD7A3) return false;

        // 检查收音是否为ㅂ (17)
        const finalConsonant = (code - 0xAC00) % 28;
        return finalConsonant === 17; // ㅂ的终声值
    }

    /**
     * 应用ㅂ不规则变化：사납 -> 사나우
     */
    private applyBIrregular(stem: string): string {
        if (!stem) return stem;

        const lastChar = stem[stem.length - 1];
        const code = lastChar.charCodeAt(0);

        if (code < 0xAC00 || code > 0xD7A3) return stem;

        // 分解韩文字符
        const base = code - 0xAC00;
        const initialConsonant = Math.floor(base / 588); // 初声
        const medialVowel = Math.floor((base % 588) / 28); // 中声
        const finalConsonant = base % 28; // 终声

        // 如果终声是ㅂ(17)，去掉ㅂ并添加우
        if (finalConsonant === 17) {
            // 去掉收音ㅂ
            const newChar = String.fromCharCode(0xAC00 + initialConsonant * 588 + medialVowel * 28);
            return stem.slice(0, -1) + newChar + '우';
        }

        return stem;
    }

    /**
     * 给韩文字符串的最后一个字符添加收音
     * @param text 韩文字符串
     * @param finalConsonantValue 收音值（0-27，0表示无收音）
     */
    private addFinalConsonant(text: string, finalConsonantValue: number): string {
        if (!text || text.length === 0) return text;

        const lastChar = text[text.length - 1];
        const code = lastChar.charCodeAt(0);

        // 检查是否为韩文音节
        if (code < 0xAC00 || code > 0xD7A3) return text;

        // 分解韩文字符
        const base = code - 0xAC00;
        const initialConsonant = Math.floor(base / 588); // 初声
        const medialVowel = Math.floor((base % 588) / 28); // 中声

        // 构造新字符（添加指定的收音）
        const newChar = String.fromCharCode(
            0xAC00 + initialConsonant * 588 + medialVowel * 28 + finalConsonantValue
        );

        return text.slice(0, -1) + newChar;
    }

    /**
     * 检查是否为韩语单词
     */
    private isKoreanWord(word: string): boolean {
        const koreanRegex = /[\uAC00-\uD7AF\u1100-\u11FF\uA960-\uA97F\uD7B0-\uD7FF]/;
        return koreanRegex.test(word);
    }

    /**
     * 转义正则表达式特殊字符
     */
    private escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    destroy() {
        // 清理资源
        if (this.debounceTimer) {
            window.clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        
        this.cachedMatches.clear();
        this.wordTrie.clear();
        
        // 从全局管理器中注销
        highlighterManager.unregister(this);
    }
}

// 创建编辑器扩展
export function createWordHighlighterExtension(vocabularyManager: VocabularyManager): Extension {
    const pluginSpec: PluginSpec<WordHighlighter> = {
        decorations: (value: WordHighlighter) => value.decorations,
    };

    // 创建一个工厂函数来传递 vocabularyManager
    class WordHighlighterWithManager extends WordHighlighter {
        constructor(view: EditorView) {
            super(view, vocabularyManager);
        }
    }

    return [
        highlightState,
        ViewPlugin.fromClass(WordHighlighterWithManager, pluginSpec)
    ];
}

// 获取光标下的词汇
export function getWordUnderCursor(view: EditorView): string | null {
    const cursor = view.state.selection.main.head;
    const line = view.state.doc.lineAt(cursor);
    const lineText = line.text;
    const relativePos = cursor - line.from;
    
    // 查找词汇边界
    let start = relativePos;
    let end = relativePos;
    
    const wordRegex = /[a-zA-Z]/;
    
    // 向前查找词汇开始
    while (start > 0 && wordRegex.test(lineText[start - 1])) {
        start--;
    }
    
    // 向后查找词汇结束
    while (end < lineText.length && wordRegex.test(lineText[end])) {
        end++;
    }
    
    if (start === end) return null;
    
    return lineText.slice(start, end);
}
