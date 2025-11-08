import { App, Plugin, TFile, Notice, WorkspaceLeaf, Editor, MarkdownView } from 'obsidian';
import { Extension } from '@codemirror/state';
// 使用新的模块化导入
import { HiWordsSettings, extractSentenceFromEditorMultiline } from './src/utils';
import { registerReadingModeHighlighter } from './src/ui/reading-mode-highlighter';
import { registerPDFHighlighter, cleanupPDFHighlighter } from './src/ui/pdf-highlighter';
import { VocabularyManager, MasteredService, createWordHighlighterExtension, highlighterManager } from './src/core';
import { DefinitionPopover, HiWordsSettingTab, HiWordsSidebarView, SIDEBAR_VIEW_TYPE, AddWordModal } from './src/ui';
import { i18n, t } from './src/i18n';

// 默认设置
const DEFAULT_SETTINGS: HiWordsSettings = {
    vocabularyBooks: [],
    showDefinitionOnHover: true,
    enableAutoHighlight: true,
    highlightStyle: 'underline', // 默认使用下划线样式
    enableMasteredFeature: true, // 默认启用已掌握功能
    showMasteredInSidebar: true,  // 跟随 enableMasteredFeature 的值
    blurDefinitions: false, // 默认不启用模糊效果
    showWordSource: true, // Default: display vocabulary book source
    // 发音地址模板（用户可在设置里修改）
    ttsTemplate: 'https://dict.youdao.com/dictvoice?audio={{word}}&type=2',
    // 调试模式（默认关闭）
    debugMode: false,
    // 自动布局默认值
    autoLayoutEnabled: true,
    cardWidth: 260,
    cardHeight: 120,
    horizontalGap: 24,
    verticalGap: 16,
    leftPadding: 24,
    columnsAuto: true,
    columns: 3,
    minLeftX: 0,
    maxColumns: 6,
    groupInnerPadding: 24,
    groupInnerColumns: 2,
    groupInnerGap: 12,
    aiDictionary: {
        apiUrl: 'https://api.openai.com/v1/chat/completions',
        apiKey: '',
        model: 'gpt-4o-mini',
        prompt: 'Please provide a concise definition for the word "{{word}}" based on this context:\\n\\nSentence: {{sentence}}\\n\\nFormat:\\n1) Part of speech\\n2) English definition\\n3) Chinese translation\\n4) Example sentence (use the original sentence if appropriate)'
    },
    highlightMode: 'all',
    highlightPaths: '',
    fileNodeParseMode: 'filename-with-content'
};

export default class HiWordsPlugin extends Plugin {
    settings: HiWordsSettings;
    vocabularyManager: VocabularyManager;
    definitionPopover: DefinitionPopover;
    masteredService: MasteredService;
    editorExtensions: Extension[] = [];
    private isSidebarInitialized = false;
    private isLoadingVocabulary = false;
    private vocabularyLoadPromise: Promise<void> | null = null;
    private timeoutIds: number[] = [];

    async onload() {
        // 加载设置
        await this.loadSettings();

        // 初始化国际化模块
        i18n.setApp(this.app);

        // 初始化管理器
        this.vocabularyManager = new VocabularyManager(this.app, this.settings);

        // 初始化已掌握服务
        this.masteredService = new MasteredService(this, this.vocabularyManager);

        // 初始化定义弹出框（作为 Component 需要加载）
        this.definitionPopover = new DefinitionPopover(this);
        this.addChild(this.definitionPopover);
        this.definitionPopover.setVocabularyManager(this.vocabularyManager);
        this.definitionPopover.setMasteredService(this.masteredService);
        
        // 加载生词本 - 使用安全加载方法防止重复加载
        await this.loadVocabularySafely();
        
        // 注册侧边栏视图
        this.registerView(
            SIDEBAR_VIEW_TYPE,
            (leaf) => new HiWordsSidebarView(leaf, this)
        );
        
        // 注册编辑器扩展
        this.setupEditorExtensions();
        
        // 注册命令
        this.registerCommands();
        
        // 注册事件
        this.registerEvents();

        // 注册阅读模式（Markdown）后处理器，实现阅读模式高亮
        registerReadingModeHighlighter(this);
        
        // 注册 PDF 高亮功能
        registerPDFHighlighter(this);
        
        // 添加设置页面
        this.addSettingTab(new HiWordsSettingTab(this.app, this));
        
        // 初始化侧边栏
        this.initializeSidebar();
        
        // 在布局准备好后自动刷新生词本
        this.app.workspace.onLayoutReady(async () => {
            // 使用安全加载方法，防止重复加载
            await this.loadVocabularySafely();

            // 索引当前打开的文档
            await this.indexCurrentDocument();

            this.refreshHighlighter();
        });
    }

    /**
     * 索引当前文档
     */
    private async indexCurrentDocument(): Promise<void> {
        try {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile && activeFile.extension === 'md') {
                let content: string;
                try {
                    content = await this.app.vault.read(activeFile);
                } catch (error) {
                    console.warn(`[HiWords] 无法读取文件 ${activeFile.path}:`, error);
                    return; // 优雅退出，不阻止插件初始化
                }
                
                const morphologyIndexManager = this.vocabularyManager.getMorphologyIndexManager();
                await morphologyIndexManager.indexNote(activeFile, content);
                // console.log(`[HiWords] 索引当前文档: ${activeFile.name}`);
            }
        } catch (error) {
            console.error('[HiWords] 索引当前文档失败:', error);
        }
    }

    /**
     * 设置编辑器扩展
     */
    private setupEditorExtensions() {
        if (this.settings.enableAutoHighlight) {
            const extension = createWordHighlighterExtension(
                this.vocabularyManager,
                (filePath) => this.shouldHighlightFile(filePath)
            );
            this.editorExtensions = [extension];
            this.registerEditorExtension(this.editorExtensions);
        }
    }

    /**
     * 注册命令
     */
    private registerCommands() {
        // 刷新生词本命令
        this.addCommand({
            id: 'refresh-vocabulary',
            name: t('commands.refresh_vocabulary'),
            callback: async () => {
                await this.vocabularyManager.loadAllVocabularyBooks();
                this.refreshHighlighter();
                new Notice(t('notices.vocabulary_refreshed'));
            }
        });

        // 打开生词列表侧边栏命令
        this.addCommand({
            id: 'open-vocabulary-sidebar',
            name: t('commands.show_sidebar'),
            callback: () => {
                this.activateSidebarView();
            }
        });

        // 添加选中单词的快捷键命令
        this.addCommand({
            id: 'add-selected-word',
            name: t('commands.add_selected_word'),
            editorCallback: async (editor: Editor, view: MarkdownView) => {
                const selectedText = editor.getSelection().trim();

                if (!selectedText) {
                    new Notice(t('notices.no_selection'));
                    return;
                }

                const sentence = extractSentenceFromEditorMultiline(editor);
                // 使用 addOrEditWord 方法，自动判断是添加还是编辑
                this.addOrEditWord(selectedText, sentence);
            }
        });
    }

    /**
     * 注册事件
     */
    private registerEvents() {
        // 记录当前正在编辑的Canvas文件
        const modifiedCanvasFiles = new Set<string>();
        // 记录当前活动的 Canvas 文件
        let activeCanvasFile: string | null = null;
        
        // 监听文件变化
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file instanceof TFile && file.extension === 'canvas') {
                    // 检查是否是生词本文件
                    const isVocabBook = this.settings.vocabularyBooks.some(book => book.path === file.path);
                    if (isVocabBook) {
                        // 只记录文件路径，不立即解析
                        modifiedCanvasFiles.add(file.path);
                    }
                }
            })
        );

        // 监听活动文件变化
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', async (leaf) => {
                // 获取当前活动文件
                const activeFile = this.app.workspace.getActiveFile();
                
                // 如果之前有活动的Canvas文件，且已经变化，并且现在切换到了其他文件
                // 说明用户已经编辑完成并切换了焦点，此时解析该文件
                if (activeCanvasFile && 
                    modifiedCanvasFiles.has(activeCanvasFile) && 
                    (!activeFile || activeFile.path !== activeCanvasFile)) {
                    
                    await this.vocabularyManager.reloadVocabularyBook(activeCanvasFile);
                    this.refreshHighlighter();
                    
                    // 从待解析列表中移除
                    modifiedCanvasFiles.delete(activeCanvasFile);
                }
                
                // 更新当前活动的Canvas文件
                if (activeFile && activeFile.extension === 'canvas') {
                    activeCanvasFile = activeFile.path;
                } else {
                    activeCanvasFile = null;
                    
                    // 如果切换到非Canvas文件，处理所有待解析的文件
                    if (modifiedCanvasFiles.size > 0) {
                        // 创建一个副本并清空原集合
                        const filesToProcess = Array.from(modifiedCanvasFiles);
                        modifiedCanvasFiles.clear();
                        
                        // 处理所有待解析的文件
                        for (const filePath of filesToProcess) {
                            await this.vocabularyManager.reloadVocabularyBook(filePath);
                        }
                        
                        // 刷新高亮
                        this.refreshHighlighter();
                    } else {
                        // 当切换文件时，可能需要更新高亮
                        this.registerTimeout(() => this.refreshHighlighter(), 100);

                        // 索引新的当前文档
                        this.registerTimeout(async () => {
                            await this.indexCurrentDocument();
                            this.refreshHighlighter();
                        }, 200);
                    }
                }
            })
        );
        
        // 注册编辑器右键菜单
        this.registerEvent(
            this.app.workspace.on('editor-menu', (menu, editor) => {
                const selection = editor.getSelection();
                if (selection && selection.trim()) {
                    const word = selection.trim();
                    // 检查单词是否已存在
                    const exists = this.vocabularyManager.hasWord(word);
                    
                    menu.addItem((item) => {
                        // 根据单词是否存在显示不同的菜单项文本
                        const titleKey = exists ? 'commands.edit_word' : 'commands.add_word';
                        
                        item
                            .setTitle(t(titleKey))
                            .onClick(() => {
                                const sentence = extractSentenceFromEditorMultiline(editor);
                                this.addOrEditWord(word, sentence);
                            });
                    });
                }
            })
        );
    }


    /**
     * 根据设置判断文件是否需要高亮
     */
    private shouldHighlightFile(filePath: string): boolean {
        const mode = this.settings.highlightMode || 'all';
        if (mode === 'all') {
            return true;
        }

        const pathsStr = this.settings.highlightPaths || '';
        const paths = pathsStr
            .split(',')
            .map((p) => p.trim())
            .filter((p) => p.length > 0);

        if (paths.length === 0) {
            return mode === 'exclude';
        }

        const normalizedFile = filePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        const isMatched = paths.some((path) => {
            const normalizedPath = path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
            return normalizedFile === normalizedPath || normalizedFile.startsWith(`${normalizedPath}/`);
        });

        if (mode === 'exclude') {
            return !isMatched;
        }
        if (mode === 'include') {
            return isMatched;
        }

        return true;
    }

    /**
     * 刷新高亮器
     */
    refreshHighlighter() {
        if (this.settings.enableAutoHighlight) {
            // 使用全局高亮器管理器刷新所有高亮器实例
            highlighterManager.refreshAll();
        }

        // 刷新侧边栏视图（通过 API 获取）
        const leaves = this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE);
        leaves.forEach(leaf => {
            const view = leaf.view as HiWordsSidebarView;
            if (view && view.refresh) {
                view.refresh();
            }
        });
    }

    /**
     * 初始化侧边栏
     */
    private async initializeSidebar() {
        if (this.isSidebarInitialized) return;
        
        // 只注册视图，不自动打开
        this.app.workspace.onLayoutReady(() => {
            this.isSidebarInitialized = true;
        });
    }

    /**
     * 激活侧边栏视图
     */
    async activateSidebarView() {
        const { workspace } = this.app;
        
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE);
        
        if (leaves.length > 0) {
            // 如果已经存在，就激活它
            leaf = leaves[0];
        } else {
            // 否则创建新的侧边栏视图
            leaf = workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({ type: SIDEBAR_VIEW_TYPE, active: true });
            }
        }
        
        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }

    /**
     * 加载设置
     */
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    /**
     * 保存设置
     */
    async saveSettings() {
        await this.saveData(this.settings);
        this.vocabularyManager.updateSettings(this.settings);
        // MasteredService 有明确的 updateSettings 方法
        if (this.masteredService) {
            this.masteredService.updateSettings();
        }
    }

    /**
     * 添加或编辑单词
     * 检查单词是否已存在，如果存在则打开编辑模式，否则打开添加模式
     * @param word 要添加或编辑的单词
     */
    addOrEditWord(word: string, sentence: string = '') {
        // 检查单词是否已存在
        const normalizedWord = word.trim();
        const exists = this.vocabularyManager.hasWord(normalizedWord);
        
        if (exists) {
            // 如果单词已存在，打开编辑模式
            new AddWordModal(this.app, this, normalizedWord, sentence, true).open();
        } else {
            // 如果单词不存在，打开添加模式
            new AddWordModal(this.app, this, normalizedWord, sentence).open();
        }
    }

    /**
     * 卸载插件
     */
    onunload() {
        try {
            // 清理所有定时器
            this.timeoutIds.forEach(id => clearTimeout(id));
            this.timeoutIds = [];

            // 清理编辑器扩展
            this.editorExtensions = [];

            // 清理侧边栏视图
            const leaves = this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE);
            leaves.forEach(leaf => leaf.detach());

            // 清理词汇管理器（带超时保护）
            if (this.vocabularyManager) {
                // 等待异步操作完成，最多等待2秒
                const destroyPromise = this.vocabularyManager.destroy ? 
                    this.vocabularyManager.destroy() : 
                    Promise.resolve();
                    
                Promise.race([
                    destroyPromise,
                    new Promise(resolve => setTimeout(resolve, 2000))
                ]).then(() => {
                    this.vocabularyManager.clear();
                });
            }

            // 清理全局高亮器管理器
            highlighterManager.clear();

            // 清理 PDF 高亮器资源
            cleanupPDFHighlighter(this);

            console.log('[HiWords] 插件卸载成功');
        } catch (error) {
            console.error('[HiWords] 插件卸载时出错:', error);
        }
    }

    /**
     * 安全加载生词本（防止重复加载）
     */
    private async loadVocabularySafely(): Promise<void> {
        // 如果正在加载，返回现有的加载 Promise
        if (this.isLoadingVocabulary && this.vocabularyLoadPromise) {
            return this.vocabularyLoadPromise;
        }

        // 标记正在加载并创建加载 Promise
        this.isLoadingVocabulary = true;
        this.vocabularyLoadPromise = this.performVocabularyLoad();

        try {
            await this.vocabularyLoadPromise;
        } finally {
            this.isLoadingVocabulary = false;
            this.vocabularyLoadPromise = null;
        }
    }

    /**
     * 执行实际的生词本加载
     */
    private async performVocabularyLoad(): Promise<void> {
        try {
            await this.vocabularyManager.loadAllVocabularyBooks();
            this.refreshHighlighter();
        } catch (error) {
            new Notice('加载生词本失败，请检查文件权限');
            console.error('[HiWords] 生词本加载失败:', error);
        }
    }

    /**
     * 注册定时器（确保插件卸载时清理）
     */
    private registerTimeout(callback: () => void, delay: number): number {
        const id = window.setTimeout(callback, delay);
        this.timeoutIds.push(id);
        return id;
    }
}
