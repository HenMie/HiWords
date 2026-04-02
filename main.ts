import { Plugin, Notice, WorkspaceLeaf, TFile } from 'obsidian';
import { Extension } from '@codemirror/state';
// 使用新的模块化导入
import {
    HiWordsSettings,
    VocabularyBook,
    PLUGIN_UNLOAD_TIMEOUT,
    type DuplicateWordAuditEntry,
    type ArticleVocabularyExportConfig,
    type ArticleVocabularySnapshot
} from './src/utils';
import { registerReadingModeHighlighter } from './src/ui/reading-mode-highlighter';
import { registerPDFHighlighter, cleanupPDFHighlighter } from './src/ui/pdf-highlighter';
import {
    VocabularyManager,
    MasteredService,
    MorphologyAssetManager,
    CanvasJsonlImporter,
    createWordHighlighterExtension,
    highlighterManager,
    buildArticleVocabularySnapshot
} from './src/core';
import type { MorphologyAssetLanguage, MorphologyAssetState } from './src/core';
import { DefinitionPopover, HiWordsSettingTab, HiWordsSidebarView, SIDEBAR_VIEW_TYPE, AddWordModal, ExportVocabularyModal } from './src/ui';
import { i18n, t } from './src/i18n';
import { buildNormalizedSettings } from './src/plugin-settings';
import { registerPluginCommands } from './src/plugin-commands';
import { registerPluginEvents } from './src/plugin-events';
import {
    buildArticleVocabularyExportFilePath,
    buildArticleVocabularyExportRows,
    ensureFolderExists,
    serializeArticleVocabularyRowsToCsv
} from './src/utils';

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
            exportCurrentArticleVocabulary: () => this.exportCurrentArticleVocabulary(),
            addOrEditWord: (word, sentence) => this.addOrEditWord(word, sentence),
            importLegacyCanvasBooks: () => this.importLegacyCanvasBooks(),
            auditLegacyDuplicateWords: () => this.auditLegacyDuplicateWords()
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

    public async getCurrentArticleVocabularySnapshot(
        file?: TFile,
        preferredLeaf?: WorkspaceLeaf | null
    ): Promise<ArticleVocabularySnapshot> {
        const activeFile = file ?? this.app.workspace.getActiveFile()
        if (!activeFile || (activeFile.extension !== 'md' && activeFile.extension !== 'pdf')) {
            return {
                filePath: activeFile?.path ?? '',
                fileName: activeFile?.basename ?? '',
                words: [],
                status: 'failed',
                diagnostics: t('notices.export_missing_supported_file', 'Open a Markdown document or PDF before exporting vocabulary.')
            }
        }

        return buildArticleVocabularySnapshot({
            app: this.app,
            file: activeFile,
            leaf: this.resolveArticleLeaf(activeFile, preferredLeaf),
            vocabularyManager: this.vocabularyManager
        })
    }

    public async exportCurrentArticleVocabulary(): Promise<void> {
        if (this.migrationRequired) {
            this.showMigrationRequiredNotice()
            return
        }

        const activeFile = this.app.workspace.getActiveFile()
        if (!activeFile || (activeFile.extension !== 'md' && activeFile.extension !== 'pdf')) {
            new Notice(t('notices.export_missing_supported_file', 'Open a Markdown document or PDF before exporting vocabulary.'))
            return
        }

        const snapshot = await this.getCurrentArticleVocabularySnapshot(activeFile, this.app.workspace.activeLeaf)
        if (snapshot.status !== 'ready') {
            this.showArticleVocabularyExportSnapshotNotice(snapshot)
            return
        }

        new ExportVocabularyModal({
            app: this.app,
            plugin: this,
            snapshot,
            onSubmit: async (config) => {
                await this.writeArticleVocabularyExport(snapshot, config)
            }
        }).open()
    }

    private async writeArticleVocabularyExport(
        snapshot: ArticleVocabularySnapshot,
        config: ArticleVocabularyExportConfig
    ): Promise<void> {
        try {
            await ensureFolderExists(
                (path) => this.app.vault.createFolder(path),
                (path) => this.app.vault.getFolderByPath(path) !== null,
                config.folderPath
            )

            const rows = buildArticleVocabularyExportRows(snapshot, this.settings, config.order)
            const csv = serializeArticleVocabularyRowsToCsv(config.fields, rows)
            const exportPath = buildArticleVocabularyExportFilePath(config.folderPath, snapshot.fileName)
            await this.app.vault.create(exportPath, csv)
            new Notice((t('notices.export_success', 'Vocabulary exported to {0}')).replace('{0}', exportPath))
        } catch (error) {
            console.error('[HiWords] 导出当前文章词汇失败:', error)
            new Notice(t('notices.export_failed', 'Failed to export vocabulary. Please check the console for details.'))
            throw error
        }
    }

    private showArticleVocabularyExportSnapshotNotice(snapshot: ArticleVocabularySnapshot): void {
        if (snapshot.status === 'empty') {
            if (snapshot.diagnostics) {
                console.info('[HiWords] 当前文章词汇导出为空:', snapshot.diagnostics)
            }
            new Notice(snapshot.diagnostics || t('notices.export_snapshot_empty', 'No vocabulary words were found in the current article.'))
            return
        }

        if (snapshot.status === 'not-ready') {
            if (snapshot.diagnostics) {
                console.warn('[HiWords] 当前文章词汇导出尚未就绪:', snapshot.diagnostics)
            }
            new Notice(snapshot.diagnostics || t('notices.export_snapshot_not_ready', 'The current PDF is still loading text. Please wait a moment and retry.'))
            return
        }

        if (snapshot.diagnostics) {
            console.error('[HiWords] 当前文章词汇导出快照失败:', snapshot.diagnostics)
        }
        new Notice(snapshot.diagnostics || t('notices.export_snapshot_failed', 'Failed to prepare the current article vocabulary for export.'))
    }

    private resolveArticleLeaf(file: TFile, preferredLeaf?: WorkspaceLeaf | null): WorkspaceLeaf | null {
        const candidates = [
            preferredLeaf ?? null,
            this.app.workspace.activeLeaf,
            this.app.workspace.getMostRecentLeaf(),
            ...this.app.workspace.getLeavesOfType(file.extension === 'pdf' ? 'pdf' : 'markdown')
        ]

        for (const candidate of candidates) {
            if (this.leafMatchesFile(candidate, file)) {
                return candidate
            }
        }

        return null
    }

    private leafMatchesFile(leaf: WorkspaceLeaf | null | undefined, file: TFile): boolean {
        if (!leaf) {
            return false
        }

        const view = leaf.view as { file?: TFile | null }
        return view.file?.path === file.path
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
        const state = await this.morphologyAssetManager.downloadAsset(language);
        await this.vocabularyManager.handleMorphologyAssetChange(language);
        this.refreshHighlighter();
        return state;
    }

    public async deleteMorphologyAsset(language: MorphologyAssetLanguage): Promise<void> {
        await this.morphologyAssetManager.deleteAsset(language);
        await this.vocabularyManager.handleMorphologyAssetChange(language);
        this.refreshHighlighter();
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

        const normalizedWord = word.trim();
        const intent = this.vocabularyManager.getWordEntryIntent(normalizedWord)

        if (intent.kind === 'legacy-duplicate') {
            this.showLegacyDuplicateNotice(intent.entries)
            return
        }

        if (intent.kind === 'edit') {
            new AddWordModal(
                this.app,
                this,
                intent.definition.word,
                sentence,
                true,
                intent.definition,
                intent.duplicateEntries
            ).open();
            return
        }

        new AddWordModal(this.app, this, normalizedWord, sentence).open();
    }

    async auditLegacyDuplicateWords(): Promise<void> {
        const entries = this.vocabularyManager.getLegacyDuplicateEntries()
        if (entries.length === 0) {
            new Notice(t('notices.duplicate_audit_clean', 'No legacy duplicate words found.'))
            return
        }

        const grouped = new Map<string, DuplicateWordAuditEntry[]>()
        entries.forEach((entry) => {
            const group = grouped.get(entry.normalizedWord) ?? []
            group.push(entry)
            grouped.set(entry.normalizedWord, group)
        })

        const summary = Array.from(grouped.entries())
            .map(([normalizedWord, group]) =>
                `${normalizedWord}: ${group.map((entry) => `${entry.rawWord} @ ${entry.bookPath}#${entry.nodeId}`).join(' | ')}`
            )
            .join('\n')

        console.warn('[HiWords] Legacy duplicate audit', summary)
        new Notice(
            t('notices.duplicate_audit_found', 'Legacy duplicate words detected. See console for details.')
        )
    }

    private showLegacyDuplicateNotice(entries: DuplicateWordAuditEntry[]): void {
        const preview = entries
            .slice(0, 2)
            .map((entry) => `${entry.rawWord} (${entry.bookPath})`)
            .join(' / ')
        new Notice(
            t('notices.legacy_duplicate_blocked', 'Legacy duplicate words make direct edit entry ambiguous. Open the specific entry from the sidebar or run duplicate audit first.')
                .replace('{0}', preview || '')
        )
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
