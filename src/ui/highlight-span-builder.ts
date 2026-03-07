/**
 * 高亮 Span 元素构建器
 * 提供统一的高亮元素创建逻辑
 */

import { WordDefinition, mapCanvasColorToCSSVar, HighlightStyle } from '../utils';

/**
 * 高亮 Span 构建器
 * 用于创建统一格式的高亮 span 元素
 */
export class HighlightSpanBuilder {
    /**
     * 构建高亮 span 元素
     * @param text 要显示的文本
     * @param word 单词（用于 data-word 属性，可以是原型）
     * @param definition 词汇定义对象
     * @param highlightStyle 高亮样式
     * @param additionalClasses 额外的 CSS 类
     * @returns 高亮 span 元素
     */
    static buildHighlightSpan(
        text: string,
        word: string,
        definition: WordDefinition | undefined,
        highlightStyle: HighlightStyle,
        additionalClasses: string[] = []
    ): HTMLSpanElement {
        const span = document.createElement('span');
        
        // 设置基础类名
        const classes = ['hi-words-highlight', ...additionalClasses];
        span.className = classes.join(' ');
        
        // 设置文本内容
        span.textContent = text;
        
        // 设置 data 属性
        span.setAttribute('data-word', word);
        
        if (definition) {
            if (definition.definition) {
                span.setAttribute('data-definition', definition.definition);
            }
            if (definition.etymology) {
                span.setAttribute('data-etymology', definition.etymology);
            }
        }
        
        // 设置样式和颜色
        const highlightColor = mapCanvasColorToCSSVar(definition?.color, 'var(--color-base-60)');
        span.setAttribute('data-color', highlightColor);
        span.setAttribute('data-style', highlightStyle);
        span.setAttribute('style', `--word-highlight-color: ${highlightColor};`);
        
        // 为触控设备添加 tabindex
        span.setAttribute('tabindex', '0');
        
        return span;
    }

    /**
     * 从匹配结果构建高亮 span（简化接口）
     * @param matchedText 匹配到的文本
     * @param match 匹配结果对象
     * @param highlightStyle 高亮样式
     * @param additionalClasses 额外的 CSS 类
     * @returns 高亮 span 元素
     */
    static buildFromMatch(
        matchedText: string,
        match: {
            word: string;
            payload: unknown;
        },
        highlightStyle: HighlightStyle,
        additionalClasses: string[] = []
    ): HTMLSpanElement {
        const definition = match.payload as WordDefinition | undefined;
        const word = definition?.word || match.word; // 优先使用原型词汇
        
        return this.buildHighlightSpan(
            matchedText,
            word,
            definition,
            highlightStyle,
            additionalClasses
        );
    }
}
