/**
 * Markdown 链接绑定工具
 * 提供统一的内部链接和标签绑定功能
 */

import { App } from 'obsidian';

/**
 * Markdown 链接绑定器
 * 用于为渲染后的 Markdown 内容绑定交互行为
 */
export class MarkdownLinkBinder {
    constructor(private app: App) {}

    /**
     * 绑定内部链接与标签的交互
     * @param root 根元素
     * @param sourcePath 源文件路径
     * @param hoverParent 悬停父元素
     */
    bindInternalLinksAndTags(root: HTMLElement, sourcePath: string, hoverParent: HTMLElement): void {
        this.bindInternalLinks(root, sourcePath, hoverParent);
        this.bindTags(root, sourcePath);
    }

    /**
     * 绑定内部链接的交互
     * - 悬停触发原生预览
     * - 点击打开链接
     * 
     * @param root 根元素
     * @param sourcePath 源文件路径
     * @param hoverParent 悬停父元素
     */
    bindInternalLinks(root: HTMLElement, sourcePath: string, hoverParent: HTMLElement): void {
        root.querySelectorAll('a.internal-link').forEach((a) => {
            const linkEl = a as HTMLAnchorElement;
            const linktext = (linkEl.getAttribute('href') || (linkEl as any).dataset?.href || '').trim();
            if (!linktext) return;

            // 悬停预览
            linkEl.addEventListener('mouseover', (evt) => {
                // 触发原生悬停预览
                (this.app.workspace as any).trigger('hover-link', {
                    event: evt,
                    source: 'hi-words',
                    hoverParent,
                    target: linkEl,
                    linktext,
                    sourcePath
                });
            });

            // 点击跳转
            linkEl.addEventListener('click', (evt) => {
                evt.preventDefault();
                evt.stopPropagation();
                this.app.workspace.openLinkText(linktext, sourcePath);
            });
        });
    }

    /**
     * 绑定标签的交互
     * - 点击打开/复用搜索视图
     * 
     * @param root 根元素
     * @param sourcePath 源文件路径（可选，用于上下文）
     */
    bindTags(root: HTMLElement, sourcePath?: string): void {
        root.querySelectorAll('a.tag').forEach((a) => {
            const tagEl = a as HTMLAnchorElement;
            const query = (tagEl.getAttribute('href') || tagEl.textContent || '').trim();
            if (!query) return;
            
            tagEl.addEventListener('click', (evt) => {
                evt.preventDefault();
                evt.stopPropagation();
                this.openOrUpdateSearch(query.startsWith('#') ? query : `#${query}`);
            });
        });
    }

    /**
     * 打开或复用全局搜索视图并设置查询
     * @param query 搜索查询
     */
    openOrUpdateSearch(query: string): void {
        try {
            // 查找已存在的搜索视图
            const leaves = this.app.workspace.getLeavesOfType('search');
            if (leaves.length > 0) {
                const view: any = leaves[0].view;
                view.setQuery?.(query);
                this.app.workspace.revealLeaf(leaves[0]);
                return;
            }

            // 创建新的搜索视图
            const leaf = this.app.workspace.getRightLeaf(false);
            if (!leaf) return;
            
            // 确保全局搜索已启用
            (this.app as any).internalPlugins?.getPluginById?.('global-search')?.enable?.();
            (leaf as any).setViewState?.({ type: 'search', active: true });
            
            const view: any = (leaf as any).view;
            view?.setQuery?.(query);
        } catch (e) {
            console.error('打开搜索失败:', e);
        }
    }
}

