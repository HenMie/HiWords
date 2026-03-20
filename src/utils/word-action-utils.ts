import { App, Notice, TFile, MarkdownView } from 'obsidian';
import { WordDefinition } from './types';
import { AddWordModal } from '../ui/add-word-modal';
import HiWordsPlugin from '../../main';

/**
 * 单词操作工具类，提供统一的单词相关操作接口
 */
export class WordActionUtils {
    private app: App;
    private plugin: HiWordsPlugin;

    constructor(app: App, plugin: HiWordsPlugin) {
        this.app = app;
        this.plugin = plugin;
    }

    /**
     * 打开单词编辑模态框
     * @param wordDef 单词定义
     * @param onCloseCallback 关闭模态框后的回调函数（可选）
     */
    openWordEditor(wordDef: WordDefinition, onCloseCallback?: () => void): void {
        try {
            const editModal = new AddWordModal(this.app, this.plugin, wordDef.word, '', true, wordDef);

            // 如果提供了关闭回调，则在模态框关闭时调用
            if (onCloseCallback) {
                editModal.onClose = onCloseCallback;
            }

            editModal.open();
        } catch (error) {
            console.error('打开单词编辑器失败:', error);
            new Notice('打开单词编辑器失败');
        }
    }

    /**
     * 导航到单词源文件
     * @param wordDef 单词定义
     */
    async navigateToSource(wordDef: WordDefinition): Promise<void> {
        try {
            const file = this.app.vault.getAbstractFileByPath(wordDef.source);
            if (file instanceof TFile) {
                const leaf = this.app.workspace.getMostRecentLeaf();
                if (leaf) {
                    await leaf.openFile(file);
                } else {
                    await this.app.workspace.openLinkText(file.path, '');
                }

                // 非 Markdown 词书（如 jsonl/canvas）直接打开文件
                if (file.extension !== 'md') {
                    return;
                } else {
                    // 等待一个短暂时间让文件加载
                    setTimeout(() => {
                        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                        if (activeView && activeView.file?.path === file.path) {
                            // 尝试在文件中查找单词
                            const editor = activeView.editor;
                            const content = editor.getValue();
                            const wordIndex = content.toLowerCase().indexOf(wordDef.word.toLowerCase());
                            if (wordIndex !== -1) {
                                const pos = editor.offsetToPos(wordIndex);
                                editor.setCursor(pos);
                                editor.scrollIntoView({ from: pos, to: pos }, true);
                            }
                        }
                    }, 100);
                }
            }
        } catch (error) {
            console.error('导航到源文件失败:', error);
        }
    }

    /**
     * 为释义内容添加点击事件监听器
     * @param container 释义内容容器
     * @param wordDef 单词定义
     * @param onCloseCallback 关闭模态框前的回调函数（可选）
     */
    addDefinitionClickListener(
        container: HTMLElement,
        wordDef: WordDefinition,
        onCloseCallback?: () => void
    ): void {
        // 添加点击事件到释义内容区域，打开编辑模态框
        container.style.cursor = 'pointer';
        container.title = '点击编辑单词';

        const clickHandler = (e: MouseEvent) => {
            e.stopPropagation();
            // 检查点击是否在链接上，如果是则不打开编辑器
            if ((e.target as HTMLElement).closest('a')) {
                return;
            }

            // 先执行关闭回调（如果有）
            if (onCloseCallback) {
                onCloseCallback();
            }

            // 打开编辑器
            this.openWordEditor(wordDef);
        };

        container.addEventListener('click', clickHandler);
    }

    /**
     * 为源信息添加点击事件监听器
     * @param sourceElement 源信息元素
     * @param wordDef 单词定义
     */
    addSourceClickListener(sourceElement: HTMLElement, wordDef: WordDefinition): void {
        // 添加点击事件到来源信息：导航到源文件
        sourceElement.style.cursor = 'pointer';

        const clickHandler = (e: MouseEvent) => {
            e.stopPropagation(); // 阻止事件冒泡
            this.navigateToSource(wordDef);
        };

        sourceElement.addEventListener('click', clickHandler);
    }
}
