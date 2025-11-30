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
    processor: (el: HTMLElement, ctx: any) => void
  ) => void;
}): void {
  // 使用统一的词汇匹配服务
  const wordMatcherService = new WordMatcherService(plugin.vocabularyManager);
  const debugEnabled = plugin.settings?.debugMode ?? false;
  const debugLog = (...args: any[]) => {
    if (debugEnabled) {
      console.debug('[HiWords][ReadingMode]', ...args);
    }
  };

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
    debugLog('text nodes collected', { count: textNodes.length });

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
      debugLog('matches found in text node', { textSnippet: text.slice(0, 60), matchCount: matches.length });

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

  plugin.registerMarkdownPostProcessor((el, ctx) => {
    try {
      if (!plugin.settings.enableAutoHighlight) return;

      const filePath: string | undefined = ctx?.sourcePath;
      const rawShouldHighlightFn = (plugin as any).shouldHighlightFile as ((this: typeof plugin, path: string) => boolean) | undefined;
      const shouldHighlightFn = rawShouldHighlightFn ? rawShouldHighlightFn.bind(plugin) : undefined;
      debugLog('postProcessor triggered', { filePath, hasShouldHighlightFn: Boolean(shouldHighlightFn) });
      if (filePath && shouldHighlightFn) {
        const allowHighlight = shouldHighlightFn(filePath);
        debugLog('shouldHighlightFile result', { filePath, allowHighlight });
        if (!allowHighlight) {
          debugLog('skip highlighting due to shouldHighlightFile');
          return;
        }
      }
      
      // 忽略插件自有的定义渲染区域，避免在侧边栏词卡等处重复处理
      if (el.closest('.markdown-source-view, .is-live-preview')) {
        debugLog('skip: source/live preview node');
        return;
      }

      // 仅在主编辑区的 Markdown 阅读视图中高亮，排除侧边栏与弹出容器
      const containerEl = (ctx as any)?.containerEl as HTMLElement | undefined;
      const lookupTarget = containerEl ?? el;
      const readingView = lookupTarget.closest('.markdown-reading-view, .markdown-preview-view, .markdown-rendered');
      const lookupRoot = readingView ?? lookupTarget;
      const leafContent =
        lookupRoot.closest('.workspace-leaf-content') ||
        el.closest('.workspace-leaf-content');
      if (!leafContent) {
        debugLog('skip: unable to find workspace leaf content', {
          readingViewFound: Boolean(readingView),
          elementClasses: (el as HTMLElement).className,
        });
        return;
      }
      if (!readingView) {
        debugLog('fallback without explicit reading view match', {
          elementClasses: (el as HTMLElement).className,
          leafClasses: leafContent.className,
        });
      }

      const leafType = leafContent.getAttribute('data-type');
      if (leafType !== 'markdown') {
        debugLog('skip: leaf is not markdown', { leafType });
        return;
      }

      const isInSideDock = Boolean(leafContent.closest('.workspace-sidedock'));
      const isInFloatingContainer = Boolean(
        leafContent.closest('.hover-popover, .popover, .suggestion-container, .modal')
      );

      if (isInSideDock || isInFloatingContainer) {
        debugLog('skip: rendered inside unsupported container', { isInSideDock, isInFloatingContainer });
        return;
      }
      
      // 重建Trie以获取最新的词汇列表
      debugLog('start highlighting');
      wordMatcherService.buildTrie();
      processElement(el);
      debugLog('highlighting finished');
    } catch (e) {
      console.error('阅读模式高亮处理失败:', e);
    }
  });
}
