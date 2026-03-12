import { Plugin, TFile, Notice, WorkspaceLeaf, Editor, MarkdownView } from 'obsidian';
import { Extension } from '@codemirror/state';
// 使用新的模块化导入
import { HiWordsSettings, VocabularyBook, extractSentenceFromEditorMultiline, HIGHLIGHTER_REFRESH, PLUGIN_UNLOAD_TIMEOUT } from './src/utils';
import { registerReadingModeHighlighter } from './src/ui/reading-mode-highlighter';
import { registerPDFHighlighter, cleanupPDFHighlighter } from './src/ui/pdf-highlighter';
import {
    VocabularyManager,
    MasteredService,
    MorphologyAssetManager,
    CanvasJsonlImporter,
    createWordHighlighterExtension,
    highlighterManager
} from './src/core';
import type { MorphologyAssetLanguage, MorphologyAssetState } from './src/core';
import { DefinitionPopover, HiWordsSettingTab, HiWordsSidebarView, SIDEBAR_VIEW_TYPE, AddWordModal } from './src/ui';
import { i18n, t } from './src/i18n';
import { buildNormalizedSettings } from './src/plugin-settings';
import { registerPluginCommands } from './src/plugin-commands';
import { registerPluginEvents } from './src/plugin-events';

export default class HiWordsPlugin extends Plugin {
    settings: HiWordsSettings;
    vocabularyManager: VocabularyManager;
    morphologyAssetManager: MorphologyAssetManager;
    definitionPopover: DefinitionPopover;
    masteredService: MasteredService;
    editorExtensions: Extension[] = [];
    private isSidebarInitialized = false;
    private isLoadingVocabulary = false;
    private vocabularyLoadPromise: Promise<void> | null = null;
    private timeoutIds: number[] = [];
    private migrationRequired = false;
    private migrationNoticeShown = false;

    async onload() {
        // 加载设置
        await this.loadSettings();
        this.updateMigrationRequirement();

        // 初始化国际化模块
        i18n.setApp(this.app);

        // 初始化管理器
        this.morphologyAssetManager = new MorphologyAssetManager(this.app, this.manifest.id);
        this.vocabularyManager = new VocabularyManager(this.app, this.settings, this.morphologyAssetManager);

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
                const changed = await morphologyIndexManager.indexNote(activeFile, content);
                if (changed) {
                    this.vocabularyManager.invalidateMatcherSnapshot(`index-current:${activeFile.path}`);
                }
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

    private registerCommands() {
        registerPluginCommands({
            addCommand: (command) => this.addCommand(command),
            isMigrationRequired: () => this.migrationRequired,
            showMigrationRequiredNotice: () => this.showMigrationRequiredNotice(),
            loadAllVocabularyBooks: () => this.vocabularyManager.loadAllVocabularyBooks(),
            refreshHighlighter: () => this.refreshHighlighter(),
            activateSidebarView: () => this.activateSidebarView(),
            addOrEditWord: (word, sentence) => this.addOrEditWord(word, sentence),
            importLegacyCanvasBooks: () => this.importLegacyCanvasBooks()
        });
    }

    private registerEvents() {
        registerPluginEvents({
            app: this.app,
            registerEvent: (eventRef) => this.registerEvent(eventRef),
            registerTimeout: (callback, delay) => this.registerTimeout(callback, delay),
            getVocabularyBooks: () => this.settings.vocabularyBooks,
            isMigrationRequired: () => this.migrationRequired,
            saveSettings: () => this.saveSettings(),
            vocabularyManager: this.vocabularyManager,
            refreshHighlighter: () => this.refreshHighlighter(),
            addOrEditWord: (word, sentence) => this.addOrEditWord(word, sentence)
        });
    }


    /**
     * 根据设置判断文件是否需要高亮
     * 使用箭头函数确保在作为回调传递时绑定当前实例
     */
    private shouldHighlightFile = (filePath: string): boolean => {
        if (this.migrationRequired) {
            return false;
        }

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
    };

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
        const rawSettings = await this.loadData();
        const { settings, changed } = buildNormalizedSettings(rawSettings);
        this.settings = settings;
        if (changed) {
            await this.saveData(this.settings);
        }
        this.updateMigrationRequirement();
    }

    /**
     * 保存设置
     */
    async saveSettings() {
        await this.saveData(this.settings);
        this.updateMigrationRequirement();
        this.vocabularyManager.updateSettings(this.settings);
        // MasteredService 有明确的 updateSettings 方法
        if (this.masteredService) {
            this.masteredService.updateSettings();
        }
    }

    public async getMorphologyAssetState(language: MorphologyAssetLanguage): Promise<MorphologyAssetState> {
        return this.morphologyAssetManager.getAssetState(language);
    }

    public async downloadMorphologyAsset(language: MorphologyAssetLanguage): Promise<MorphologyAssetState> {
        return this.morphologyAssetManager.downloadAsset(language);
    }

    public async deleteMorphologyAsset(language: MorphologyAssetLanguage): Promise<void> {
        await this.morphologyAssetManager.deleteAsset(language);
    }

    /**
     * 添加或编辑单词
     * 检查单词是否已存在，如果存在则打开编辑模式，否则打开添加模式
     * @param word 要添加或编辑的单词
     */
    addOrEditWord(word: string, sentence = '') {
        if (this.migrationRequired) {
            this.showMigrationRequiredNotice();
            return;
        }

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
                // 等待异步操作完成，超时时间由常量配置
                const destroyPromise = this.vocabularyManager.destroy ? 
                    this.vocabularyManager.destroy() : 
                    Promise.resolve();
                    
                Promise.race([
                    destroyPromise,
                    new Promise(resolve => setTimeout(resolve, PLUGIN_UNLOAD_TIMEOUT))
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
        if (this.migrationRequired) {
            this.vocabularyManager.clear();
            this.refreshHighlighter();
            this.showMigrationRequiredNotice();
            return;
        }

        try {
            await this.vocabularyManager.loadAllVocabularyBooks();
            this.refreshHighlighter();
        } catch (error) {
            new Notice('加载生词本失败，请检查文件权限');
            console.error('[HiWords] 生词本加载失败:', error);
        }
    }

    public isMigrationRequired(): boolean {
        return this.migrationRequired;
    }

    public getLegacyCanvasBooks(): VocabularyBook[] {
        return this.settings.vocabularyBooks.filter((book) => this.isCanvasBook(book.path));
    }

    public async importLegacyCanvasBooks(): Promise<void> {
        const legacyBooks = this.getLegacyCanvasBooks();
        if (legacyBooks.length === 0) {
            new Notice('没有可导入的 Canvas 词书。');
            return;
        }

        const importer = new CanvasJsonlImporter(this.app, this.settings);
        let successCount = 0;
        let importedWords = 0;
        const errors: string[] = [];

        for (const book of legacyBooks) {
            try {
                const result = await importer.importCanvasBook(book.path);
                const index = this.settings.vocabularyBooks.findIndex((item) => item.path === book.path);
                if (index >= 0) {
                    this.settings.vocabularyBooks[index] = {
                        ...this.settings.vocabularyBooks[index],
                        path: result.outputPath,
                        name: result.outputPath.split('/').pop()?.replace(/\.jsonl$/i, '') || book.name
                    };
                }
                successCount++;
                importedWords += result.importedCount;
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                errors.push(`${book.name}: ${reason}`);
            }
        }

        await this.saveSettings();

        if (this.migrationRequired) {
            const detail = errors.length ? ` 失败 ${errors.length} 个。` : '';
            new Notice(`导入完成：成功 ${successCount}/${legacyBooks.length} 个词书。${detail}`);
            if (errors.length) {
                console.error('[HiWords] 部分词书导入失败:', errors);
            }
            return;
        }

        this.migrationNoticeShown = false;
        await this.loadVocabularySafely();
        this.refreshHighlighter();
        new Notice(`导入完成：${successCount} 个词书，${importedWords} 个词条。`);

        if (errors.length) {
            console.error('[HiWords] 部分词书导入失败:', errors);
        }
    }

    private updateMigrationRequirement(): void {
        const nextRequired = this.settings.vocabularyBooks.some((book) => this.isCanvasBook(book.path));
        if (this.migrationRequired !== nextRequired) {
            this.migrationNoticeShown = false;
        }
        this.migrationRequired = nextRequired;
    }

    private showMigrationRequiredNotice(): void {
        if (this.migrationNoticeShown) {
            return;
        }
        this.migrationNoticeShown = true;
        new Notice('检测到旧版 Canvas 词书，请先执行“导入 Canvas 词书到 JSONL”。', 6000);
    }

    private isCanvasBook(path: string): boolean {
        return path.toLowerCase().endsWith('.canvas');
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
