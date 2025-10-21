import type { HiWordsSettings } from '../utils';
import { removeOverlappingMatches } from '../utils/trie';
import type { VocabularyManager } from '../core';
import { WordMatcherService } from '../core/word-matcher-service';
import { HighlightSpanBuilder } from './highlight-span-builder';

/**
 * 在阅读模式注册 Markdown 后处理器，高亮匹配的词汇。
 * 通过从 VocabularyManager 构建 Trie，遍历渲染后的 DOM 文本节点并包裹 span.hi-words-highlight。
 */
export function registerReadingModeHighlighter(plugin: {
  settings: HiWordsSettings;
  vocabularyManager: VocabularyManager;
  registerMarkdownPostProcessor: (
    processor: (el: HTMLElement, ctx: unknown) => void
  ) => void;
}): void {
  // 使用统一的词汇匹配服务
  const wordMatcherService = new WordMatcherService(plugin.vocabularyManager);

  const EXCLUDE_SELECTOR = [
    'pre',
    'code',
    'a',
    'button',
    'input',
    'textarea',
    'select',
    '.math',
    '.cm-inline-code',
    '.internal-embed',
    '.file-embed',
  ].join(',');

  const processElement = (root: HTMLElement) => {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node: Node) => {
          // 仅处理可见文本节点，跳过排除元素与已高亮区域
          const maybeParent = (node as any).parentElement as HTMLElement | null | undefined;
          const parent = maybeParent ?? null;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (parent.closest(EXCLUDE_SELECTOR)) return NodeFilter.FILTER_REJECT;
          if (parent.closest('.hi-words-highlight')) return NodeFilter.FILTER_REJECT;
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      } as any
    );

    const highlightStyle = plugin.settings.highlightStyle || 'underline';

    const textNodes: Text[] = [];
    let current: Node | null = walker.nextNode();
    while (current) {
      textNodes.push(current as Text);
      current = walker.nextNode();
    }

    for (const textNode of textNodes) {
      const text = textNode.nodeValue || '';
      if (!text) continue;

      const matches = wordMatcherService.findMatches(text) as Array<{
        from: number;
        to: number;
        word: string;
        payload: any;
      }>;
      if (!matches || matches.length === 0) continue;

      // 使用优化的重叠处理函数，优先保留更长的匹配
      const filtered = removeOverlappingMatches(matches);
      if (filtered.length === 0) continue;

      const frag = document.createDocumentFragment();
      let last = 0;
      for (const m of filtered) {
        if (m.from > last) frag.appendChild(document.createTextNode(text.slice(last, m.from)));
        
        // 使用统一的 HighlightSpanBuilder 创建高亮元素
        const matchedText = text.slice(m.from, m.to);
        const span = HighlightSpanBuilder.buildFromMatch(matchedText, m, highlightStyle);
        
        frag.appendChild(span);
        last = m.to;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));

      if (textNode.parentNode) textNode.parentNode.replaceChild(frag, textNode);
    }
  };

  plugin.registerMarkdownPostProcessor((el) => {
    try {
      if (!plugin.settings.enableAutoHighlight) return;
      
      // 检查是否在主编辑器的阅读模式中
      // 排除侧边栏、悬停预览等其他容器
      const isInMainEditor = !el.closest('.workspace-leaf-content[data-type="hover-editor"]') && // 排除悬停预览
                            !el.closest('.workspace-leaf-content[data-type="file-explorer"]') && // 排除文件浏览器
                            !el.closest('.workspace-leaf-content[data-type="outline"]') && // 排除大纲
                            !el.closest('.workspace-leaf-content[data-type="backlink"]') && // 排除反向链接
                            !el.closest('.workspace-leaf-content[data-type="tag"]') && // 排除标签面板
                            !el.closest('.workspace-leaf-content[data-type="search"]') && // 排除搜索结果
                            !el.closest('.hover-popover') && // 排除悬停弹出框
                            !el.closest('.popover') && // 排除其他弹出框
                            !el.closest('.suggestion-container') && // 排除建议容器
                            !el.closest('.modal') && // 排除模态框
                            !el.closest('.workspace-split.mod-right-split') && // 排除右侧边栏
                            !el.closest('.workspace-split.mod-left-split'); // 排除左侧边栏
      
      if (!isInMainEditor) return;
      
      // 重建Trie以获取最新的词汇列表
      wordMatcherService.buildTrie();
      processElement(el);
    } catch (e) {
      console.error('阅读模式高亮处理失败:', e);
    }
  });
}
