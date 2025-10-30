import { App, TFile, Notice } from 'obsidian';
import { WordDefinition, VocabularyBook, HiWordsSettings } from '../utils';
import { KoreanMorphologyService } from './korean-morphology-service';
import { MorphologyIndexManager } from './morphology-index-manager';
import { CanvasService } from './canvas-service';
import { VocabularyCacheManager } from './vocabulary-cache-manager';

export class VocabularyManager {
    private app: App;
    private canvasService: CanvasService;
    private cacheManager: VocabularyCacheManager;
    private definitions: Map<string, WordDefinition[]> = new Map();
    private settings: HiWordsSettings;
    
    // 形态学分析相关
    private morphologyService: KoreanMorphologyService;
    private morphologyIndexManager: MorphologyIndexManager;
    
    // 增量更新优化
    private memoryOnlyWords: Map<string, WordDefinition[]> = new Map(); // 仅内存中的新词汇
    private pendingSyncWords: Map<string, WordDefinition[]> = new Map(); // 待同步的词汇
    private syncTimeouts: Map<string, number> = new Map(); // 同步定时器
    private tempNodeIdCounter: number = 0; // 临时节点ID计数器

    // 异步操作队列管理
    private analysisQueue: Array<{ word: string; definition: WordDefinition }> = [];
    private isProcessingQueue = false;

    constructor(app: App, settings: HiWordsSettings) {
        this.app = app;
        this.settings = settings;
        
        // 初始化服务
        this.canvasService = new CanvasService(app, settings);
        this.cacheManager = new VocabularyCacheManager();
        
        // 初始化形态学分析服务
        this.morphologyService = new KoreanMorphologyService(this.app);
        this.morphologyService.setDebugMode(settings.debugMode ?? false);
        this.morphologyIndexManager = new MorphologyIndexManager(this.morphologyService);

        // 监听文件变化，自动更新形态学索引
        this.registerFileWatchers();
    }

    /**
     * 加载所有启用的生词本
     */
    async loadAllVocabularyBooks(): Promise<void> {
        this.definitions.clear();
        this.cacheManager.invalidate();

        const loadPromises = this.settings.vocabularyBooks
            .filter(book => book.enabled)
            .map(book => this.loadVocabularyBook(book));

        await Promise.all(loadPromises);

        // 重建缓存
        this.cacheManager.rebuild(this.definitions);
    }

    /**
     * 加载单个生词本
     */
    async loadVocabularyBook(book: VocabularyBook): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(book.path);

        if (!file || !(file instanceof TFile)) {
            console.warn(`[HiWords] 生词本文件未找到: ${book.path}`);
            return;
        }

        if (!CanvasService.isCanvasFile(file)) {
            console.warn(`[HiWords] 文件不是Canvas格式: ${book.path}`);
            return;
        }

        try {
            const definitions = await this.canvasService.parseCanvasFile(file);
            this.definitions.set(book.path, definitions);

            // 使缓存失效
            this.cacheManager.invalidate();
        } catch (error) {
            const errorMessage = this.formatErrorMessage(error, `加载生词本 ${book.name} 失败`);
            console.error(`[HiWords] ${errorMessage}`, error);
        }
    }
    
    /**
     * 格式化错误信息为用户友好的提示
     */
    private formatErrorMessage(error: unknown, context: string): string {
        if (error instanceof Error) {
            if (error.message.includes('ENOENT') || error.message.includes('not found')) {
                return `${context}：文件不存在，请检查文件路径`;
            }
            if (error.message.includes('EACCES') || error.message.includes('permission')) {
                return `${context}：权限不足，请检查文件权限`;
            }
            if (error.message.includes('parse') || error.message.includes('JSON')) {
                return `${context}：文件格式错误，请检查文件内容`;
            }
            if (error.message.includes('corrupt')) {
                return `${context}：文件已损坏，请尝试重新创建`;
            }
        }
        return `${context}：未知错误，请查看控制台获取详细信息`;
    }

    /**
     * 获取单词定义，支持形态学匹配
     * @param word 要查找的单词
     * @param visited 已访问的单词集合，用于防止循环引用
     * @returns 单词定义或 null
     */
    getDefinition(word: string, visited: Set<string> = new Set()): WordDefinition | null {
        const normalizedWord = word.toLowerCase().trim();
        
        // 防止循环引用
        if (visited.has(normalizedWord)) {
            return null;
        }
        visited.add(normalizedWord);
        
        // 检查缓存
        if (this.cacheManager.isValid()) {
            const cached = this.cacheManager.getDefinition(normalizedWord);
            if (cached) {
                return cached;
            }
        }
        
        // 如果缓存无效，则重建缓存
        if (!this.cacheManager.isValid()) {
            this.cacheManager.rebuild(this.definitions);
            const cached = this.cacheManager.getDefinition(normalizedWord);
            if (cached) {
                return cached;
            }
        }

        // 缓存中没有找到，执行完整搜索
        for (const definitions of this.definitions.values()) {
            // 先检查主单词（原型）
            const foundByMainWord = definitions.find(def => def.word === normalizedWord);
            if (foundByMainWord) {
                // 更新缓存
                this.cacheManager.setDefinition(normalizedWord, foundByMainWord);
                return foundByMainWord;
            }
        }

        // 如果是韩语单词，尝试形态学分析
        if (this.morphologyService.isKoreanText(normalizedWord)) {
            // 异步分析单词，获取原型（使用安全的异步处理）
            this.queueMorphologyAnalysis(normalizedWord, visited).catch(error => {
                console.warn(`[HiWords] 形态学分析失败 ${normalizedWord}:`, error);
            });
        }

        return null;
    }

    /**
     * 获取所有词汇（仅原型）
     */
    getAllWords(): string[] {
        // 如果缓存有效，直接返回缓存的单词列表
        if (this.cacheManager.isValid()) {
            return this.cacheManager.getAllWords();
        }
        
        // 重建缓存并返回
        this.cacheManager.rebuild(this.definitions);
        return this.cacheManager.getAllWords();
    }

    /**
     * 获取未掌握的词汇（用于高亮显示）
     * 如果已掌握功能未启用，返回所有单词
     */
    getAllWordsForHighlight(): string[] {
        // 如果已掌握功能未启用，返回所有单词
        if (!this.settings.enableMasteredFeature) {
            return this.getAllWords();
        }
        
        // 确保缓存有效
        if (!this.cacheManager.isValid()) {
            this.cacheManager.rebuild(this.definitions);
        }
        
        // 从缓存管理器获取未掌握的单词
        return this.cacheManager.getUnmasteredWords();
    }

    /**
     * 获取指定生词本的词汇（仅原型）
     */
    getWordsFromBook(bookPath: string): string[] {
        // 如果缓存有效且包含该书本的单词列表，直接返回
        if (this.cacheManager.isValid()) {
            const words = this.cacheManager.getWordsFromBook(bookPath);
            if (words.length > 0) {
                return words;
            }
        }
        
        const definitions = this.definitions.get(bookPath);
        if (!definitions) return [];
        
        const words: string[] = [];
        
        // 只添加主单词（原型）
        words.push(...definitions.map(def => def.word));
        
        const uniqueWords = [...new Set(words)]; // 去重
        
        return uniqueWords;
    }

    /**
     * 重新加载指定的生词本
     */
    async reloadVocabularyBook(bookPath: string): Promise<void> {
        const book = this.settings.vocabularyBooks.find(b => b.path === bookPath);
        if (book && book.enabled) {
            await this.loadVocabularyBook(book);
            // 使缓存失效
            this.cacheManager.invalidate();
        }
    }

    /**
     * 更新设置
     */
    updateSettings(settings: HiWordsSettings): void {
        this.settings = settings;
        // 设置变更可能影响词汇，使缓存失效
        this.cacheManager.invalidate();
        // 同步给 CanvasService
        this.canvasService.updateSettings(settings);
        // 同步调试模式到韩语形态学服务
        if (this.morphologyService) {
            this.morphologyService.setDebugMode(settings.debugMode ?? false);
        }
    }

    /**
     * 获取当前设置
     */
    getSettings(): HiWordsSettings {
        return this.settings;
    }

    /**
     * 获取统计信息
     */
    getStats(): { totalBooks: number; enabledBooks: number; totalWords: number } {
        const totalBooks = this.settings.vocabularyBooks.length;
        const enabledBooks = this.settings.vocabularyBooks.filter(b => b.enabled).length;
        
        // 只统计主单词，不包含别名
        let totalWords = 0;
        for (const definitions of this.definitions.values()) {
            totalWords += definitions.length;
        }
        
        return { totalBooks, enabledBooks, totalWords };
    }

    /**
     * 检查词汇是否存在
     */
    hasWord(word: string): boolean {
        const normalizedWord = word.toLowerCase().trim();
        
        // 如果缓存有效，直接检查缓存
        if (this.cacheManager.isValid()) {
            return this.cacheManager.hasWord(normalizedWord);
        }
        
        return this.getDefinition(word) !== null;
    }

    /**
     * 清除所有数据
     */
    clear(): void {
        this.definitions.clear();
        this.cacheManager.clear();
    }
    
    /**
     * 添加词汇到 Canvas 文件
     */
    async addWordToCanvas(bookPath: string, word: string, definition: string, color?: number, etymology?: string): Promise<boolean> {
        try {
            // 1. 创建词汇定义（使用临时节点ID）
            const wordDef: WordDefinition = {
                word,
                definition,
                etymology,
                source: bookPath,
                nodeId: this.generateTempNodeId(),
                color: color ? this.getColorString(color) : undefined
            };
            
            // 2. 立即更新内存缓存（用户立即看到效果）
            this.addWordToMemoryCache(bookPath, wordDef);
            
            // 3. 重建缓存以立即生效
            this.cacheManager.rebuild(this.definitions);
            
            // 4. 异步写入文件并更新真实nodeId
            this.scheduleCanvasSync(bookPath, wordDef);
            
            return true;
        } catch (error) {
            console.error('Failed to add word to canvas:', error);
            return false;
        }
    }
    
    /**
     * 仅设置节点颜色，并同步内存缓存的颜色字符串
     */
    async setNodeColor(bookPath: string, nodeId: string, color?: number): Promise<boolean> {
        try {
            const ok = await this.canvasService.setNodeColor(bookPath, nodeId, color);
            if (!ok) return false;

            // 更新内存缓存中的该节点颜色
            const defs = this.definitions.get(bookPath);
            if (defs) {
                const idx = defs.findIndex(d => d.nodeId === nodeId);
                if (idx >= 0) {
                    const def = defs[idx];
                    def.color = color !== undefined ? this.getColorString(color) : undefined;
                    // 更新缓存映射
                    this.cacheManager.setDefinition(def.word, def);
                    // 标记缓存需要重建（颜色变化可能影响过滤）
                    this.cacheManager.invalidate();
                }
            }
            return true;
        } catch (e) {
            console.error('设置节点颜色失败:', e);
            return false;
        }
    }
    
    
    /**
     * 更新 Canvas 文件中的词汇 - 增量更新优化版本
     */
    async updateWordInCanvas(bookPath: string, nodeId: string, word: string, definition: string, color?: number, etymology?: string): Promise<boolean> {
        try {
            // 0. 获取原有的词汇定义，保留其他属性（如 mastered）
            const oldWordDef = await this.getWordDefinitionByNodeId(bookPath, nodeId);

            // 1. 先更新Canvas文件
            const success = await this.canvasService.updateWordInCanvas(bookPath, nodeId, word, definition, color, etymology);

            if (success) {
                // 2. 创建更新后的词汇定义，保留原有的 mastered 等属性
                const updatedWordDef: WordDefinition = {
                    word,
                    definition,
                    etymology,
                    source: bookPath,
                    nodeId, // 使用原有的nodeId
                    color: color ? this.getColorString(color) : undefined,
                    mastered: oldWordDef?.mastered // 保留原有的 mastered 状态
                };

                // 3. 立即更新内存缓存
                this.updateWordInMemoryCache(bookPath, nodeId, updatedWordDef);

                // 4. 重建缓存以立即生效
                this.cacheManager.rebuild(this.definitions);

                return true;
            }

            return false;
        } catch (error) {
            console.error('Failed to update word in canvas:', error);
            return false;
        }
    }
    
    // ==================== 增量更新优化方法 ====================
    
    /**
     * 生成临时节点ID
     */
    private generateTempNodeId(): string {
        return `temp_${Date.now()}_${++this.tempNodeIdCounter}`;
    }
    
    /**
     * 获取颜色字符串
     * Canvas 使用数字字符串作为颜色标识，不是具体的色值
     */
    private getColorString(color: number): string | undefined {
        // Canvas 中的颜色就是数字字符串 "1", "2", "3" 等
        // 具体的颜色映射由 color-utils.ts 中的 mapCanvasColorToCSSVar 处理
        return (color >= 1 && color <= 6) ? color.toString() : undefined;
    }
    
    /**
     * 将词汇添加到内存缓存
     */
    private addWordToMemoryCache(bookPath: string, wordDef: WordDefinition): void {
        // 获取该书本的现有词汇
        let bookWords = this.definitions.get(bookPath);
        if (!bookWords) {
            bookWords = [];
            this.definitions.set(bookPath, bookWords);
        }
        
        // 检查是否已存在（避免重复）
        const existingIndex = bookWords.findIndex(w => w.word === wordDef.word);
        if (existingIndex >= 0) {
            bookWords[existingIndex] = wordDef; // 更新
        } else {
            bookWords.push(wordDef); // 新增
        }
        
        // 更新缓存管理器
        this.cacheManager.setDefinition(wordDef.word, wordDef);
        
        // 标记缓存需要重建
        this.cacheManager.invalidate();
    }
    
    /**
     * 更新内存缓存中的词汇（用于编辑功能）
     */
    private updateWordInMemoryCache(bookPath: string, nodeId: string, updatedWordDef: WordDefinition): void {
        // 获取该书本的现有词汇
        const bookWords = this.definitions.get(bookPath);
        if (!bookWords) {
            console.warn(`未找到书本: ${bookPath}`);
            return;
        }
        
        // 根据nodeId查找要更新的词汇
        const existingIndex = bookWords.findIndex(w => w.nodeId === nodeId);
        if (existingIndex >= 0) {
            const oldWordDef = bookWords[existingIndex];
            
            // 清除旧的缓存映射
            this.cacheManager.deleteDefinition(oldWordDef.word);
            
            // 更新词汇
            bookWords[existingIndex] = updatedWordDef;
            
            // 更新新的缓存映射
            this.cacheManager.setDefinition(updatedWordDef.word, updatedWordDef);
            
            // 标记缓存需要重建
            this.cacheManager.invalidate();
        } else {
            console.warn(`未找到节点ID: ${nodeId}`);
        }
    }
    
    /**
     * 调度Canvas文件同步
     */
    private scheduleCanvasSync(bookPath: string, wordDef: WordDefinition): void {
        // 清除之前的定时器
        const existingTimeout = this.syncTimeouts.get(bookPath);
        if (existingTimeout) {
            window.clearTimeout(existingTimeout);
        }

        // 添加到待同步队列
        if (!this.pendingSyncWords.has(bookPath)) {
            this.pendingSyncWords.set(bookPath, []);
        }
        this.pendingSyncWords.get(bookPath)!.push(wordDef);

        // 设置新的定时器（延迟1秒批量同步）
        const timeout = window.setTimeout(() => {
            this.syncPendingWords(bookPath);
        }, 1000);

        this.syncTimeouts.set(bookPath, timeout);
    }
    
    /**
     * 同步待处理的词汇到Canvas文件
     */
    private async syncPendingWords(bookPath: string): Promise<void> {
        const pendingWords = this.pendingSyncWords.get(bookPath);
        if (!pendingWords || pendingWords.length === 0) return;
        
        try {
            // 批量写入Canvas
            for (const wordDef of pendingWords) {
                const success = await this.canvasService.addWordToCanvas(
                    bookPath,
                    wordDef.word,
                    wordDef.definition,
                    wordDef.color ? this.getColorNumber(wordDef.color) : undefined,
                    wordDef.etymology
                );
                
                if (success) {
                    // 成功写入文件，生成真实的nodeId
                    wordDef.nodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                }
            }
            
            // 清空待同步队列和定时器
            this.pendingSyncWords.delete(bookPath);
            this.syncTimeouts.delete(bookPath);
            
        } catch (error) {
            console.error('Failed to sync words to canvas:', error);
            // 可以考虑重试机制或用户通知
        }
    }
    
    /**
     * 将颜色字符串转换为数字
     * Canvas 使用数字字符串作为颜色标识，不是具体的色值
     */
    private getColorNumber(colorString: string): number {
        // 直接将字符串转换为数字
        const colorNum = parseInt(colorString, 10);
        // 验证是否为有效的 Canvas 颜色数字 (1-6)
        return (colorNum >= 1 && colorNum <= 6) ? colorNum : 0;
    }
    
    /**
     * 从Canvas文件中删除词汇
     * @param bookPath 生词本路径
     * @param nodeId 要删除的节点ID
     * @returns 操作是否成功
     */
    async deleteWordFromCanvas(bookPath: string, nodeId: string): Promise<boolean> {
        try {
            // 1. 先从Canvas文件中删除
            const success = await this.canvasService.deleteWordFromCanvas(bookPath, nodeId);
            
            if (success) {
                // 2. 从内存缓存中删除
                this.deleteWordFromMemoryCache(bookPath, nodeId);
                
                // 3. 重建缓存以立即生效
                this.cacheManager.rebuild(this.definitions);
                
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Failed to delete word from canvas:', error);
            return false;
        }
    }

    /**
     * 从内存缓存中删除词汇（用于删除功能）
     */
    private deleteWordFromMemoryCache(bookPath: string, nodeId: string): void {
        // 获取该书本的现有词汇
        const bookWords = this.definitions.get(bookPath);
        if (!bookWords) {
            console.warn(`未找到书本: ${bookPath}`);
            return;
        }
        
        // 根据nodeId查找要删除的词汇
        const existingIndex = bookWords.findIndex(w => w.nodeId === nodeId);
        if (existingIndex >= 0) {
            const wordDefToDelete = bookWords[existingIndex];
            
            // 清除缓存映射
            this.cacheManager.deleteDefinition(wordDefToDelete.word);
            
            // 从数组中删除词汇
            bookWords.splice(existingIndex, 1);
            
            // 从仅内存词汇中删除（如果存在）
            const memoryWords = this.memoryOnlyWords.get(bookPath);
            if (memoryWords) {
                const memoryIndex = memoryWords.findIndex(w => w.nodeId === nodeId);
                if (memoryIndex >= 0) {
                    memoryWords.splice(memoryIndex, 1);
                    if (memoryWords.length === 0) {
                        this.memoryOnlyWords.delete(bookPath);
                    }
                }
            }
            
            // 标记缓存需要重建
            this.cacheManager.invalidate();
        } else {
            console.warn(`未找到节点ID: ${nodeId}`);
        }
    }
    
    /**
     * 清理资源
     */
    destroy(): void {
        // 清理所有定时器
        this.syncTimeouts.forEach(timeout => window.clearTimeout(timeout));
        this.syncTimeouts.clear();
        
        // 清理异步队列
        this.analysisQueue = [];
        this.isProcessingQueue = false;
        
        // 清理缓存
        this.definitions.clear();
        this.cacheManager.clear();
        this.memoryOnlyWords.clear();
        this.pendingSyncWords.clear();
        
        // 清理形态学分析服务
        if (this.morphologyService) {
            this.morphologyService.destroy();
        }
        if (this.morphologyIndexManager) {
            this.morphologyIndexManager.destroy();
        }
    }

    // ==================== 已掌握功能支持方法 ====================

    /**
     * 根据节点ID获取单词定义
     * @param bookPath 生词本路径
     * @param nodeId 节点ID
     * @returns 单词定义或null
     */
    async getWordDefinitionByNodeId(bookPath: string, nodeId: string): Promise<WordDefinition | null> {
        const bookWords = this.definitions.get(bookPath);
        if (!bookWords) return null;

        const wordDef = bookWords.find(w => w.nodeId === nodeId);
        return wordDef || null;
    }

    /**
     * 更新单词定义
     * @param bookPath 生词本路径
     * @param nodeId 节点ID
     * @param updatedDef 更新后的定义
     * @returns 操作是否成功
     */
    async updateWordDefinition(bookPath: string, nodeId: string, updatedDef: WordDefinition): Promise<boolean> {
        const bookWords = this.definitions.get(bookPath);
        if (!bookWords) return false;

        const index = bookWords.findIndex(w => w.nodeId === nodeId);
        if (index === -1) return false;

        const oldDef = bookWords[index];
        
        // 更新定义
        bookWords[index] = updatedDef;

        // 更新缓存
        this.cacheManager.deleteDefinition(oldDef.word);
        this.cacheManager.setDefinition(updatedDef.word, updatedDef);

        // 标记缓存需要重建
        this.cacheManager.invalidate();

        // 保存到 Canvas 文件
        try {
            await this.canvasService.saveWordDefinitionToCanvas(bookPath, nodeId, updatedDef);
        } catch (error) {
            console.error('保存单词定义到 Canvas 失败:', error);
            // 不返回 false，因为内存更新已经成功
        }

        return true;
    }

    /**
     * 获取所有单词定义
     * @returns 所有单词定义数组
     */
    async getAllWordDefinitions(): Promise<WordDefinition[]> {
        const allDefs: WordDefinition[] = [];

        for (const [bookPath, bookWords] of this.definitions.entries()) {
            allDefs.push(...bookWords);
        }

        // 也包括仅内存中的词汇
        for (const [bookPath, memoryWords] of this.memoryOnlyWords.entries()) {
            allDefs.push(...memoryWords);
        }

        return allDefs;
    }

    /**
     * 获取指定生词本的所有单词定义
     * @param bookPath 生词本路径
     * @returns 该生词本的所有单词定义
     */
    async getWordDefinitionsByBook(bookPath: string): Promise<WordDefinition[]> {
        const bookWords = this.definitions.get(bookPath) || [];
        const memoryWords = this.memoryOnlyWords.get(bookPath) || [];
        
        return [...bookWords, ...memoryWords];
    }

    /**
     * 获取未掌握的单词列表（用于高亮过滤）
     * @returns 未掌握的单词数组
     */
    async getUnmasteredWords(): Promise<string[]> {
        if (!this.cacheManager.isValid()) {
            this.cacheManager.rebuild(this.definitions);
        }
        
        return this.cacheManager.getUnmasteredWords();
    }

    /**
     * 获取已掌握的单词列表
     * @returns 已掌握的单词数组
     */
    async getMasteredWords(): Promise<string[]> {
        if (!this.cacheManager.isValid()) {
            this.cacheManager.rebuild(this.definitions);
        }
        
        return this.cacheManager.getMasteredWords();
    }

    // ==================== 形态学分析相关方法 ====================

    /**
     * 获取形态学分析服务
     */
    getMorphologyService(): KoreanMorphologyService {
        return this.morphologyService;
    }

    /**
     * 获取形态学索引管理器
     */
    getMorphologyIndexManager(): MorphologyIndexManager {
        return this.morphologyIndexManager;
    }


    /**
     * 获取指定原型在当前笔记中的所有活用形
     */
    getInflectionFormsInCurrentNote(baseForm: string): Set<string> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            return new Set();
        }

        return this.morphologyIndexManager.getInflectionFormsInNote(baseForm, activeFile.path);
    }

    /**
     * 获取指定原型的所有活用形（全局）
     */
    getAllInflectionForms(baseForm: string): Set<string> {
        return this.morphologyIndexManager.getAllInflectionForms(baseForm);
    }

    /**
     * 通过形态素分析获取词汇的原型（用于悬浮卡片等场景）
     */
    async analyzeWordToBaseForm(word: string): Promise<string | null> {
        try {
            const result = await this.morphologyService.analyzeWord(word);
            return result ? result.baseForm : null;
        } catch (error) {
            console.error('形态素分析失败:', error);
            return null;
        }
    }

    /**
     * 监听文件变化，自动更新形态学索引
     */
    private registerFileWatchers(): void {
        // 监听文件修改
        this.app.vault.on('modify', async (file) => {
            if (file instanceof TFile && file.extension === 'md') {
                const content = await this.app.vault.read(file);
                await this.morphologyIndexManager.indexNote(file, content);
            }
        });

        // 监听文件删除
        this.app.vault.on('delete', (file) => {
            if (file instanceof TFile && file.extension === 'md') {
                this.morphologyIndexManager.removeNoteIndex(file.path);
            }
        });

        // 监听文件重命名
        this.app.vault.on('rename', (file, oldPath) => {
            if (file instanceof TFile && file.extension === 'md') {
                // 先删除旧索引
                this.morphologyIndexManager.removeNoteIndex(oldPath);
                // 再重新索引新文件
                this.app.vault.read(file).then(content => {
                    this.morphologyIndexManager.indexNote(file, content);
                });
            }
        });
    }


    /**
     * 重新索引所有文件的形态学信息
     */
    async reindexAllFiles(): Promise<void> {
        const markdownFiles = this.app.vault.getMarkdownFiles();

        for (const file of markdownFiles) {
            try {
                const content = await this.app.vault.read(file);
                await this.morphologyIndexManager.indexNote(file, content);
            } catch (error) {
                console.error(`索引文件失败 ${file.path}:`, error);
            }
        }
    }

    /**
     * 检查单词是否已掌握
     * @param word 单词
     * @returns 是否已掌握
     */
    isWordMastered(word: string): boolean {
        const wordDef = this.cacheManager.getDefinition(word.toLowerCase());
        return wordDef?.mastered === true;
    }

    /**
     * 队列处理形态学分析（避免未处理的 Promise）
     * @param word 要分析的单词
     * @param visited 已访问的单词集合
     */
    private async queueMorphologyAnalysis(word: string, visited: Set<string>): Promise<void> {
        try {
            const result = await this.morphologyService.analyzeWord(word);
            if (result && result.baseForm !== word) {
                // 用原型再次查找
                const baseDefinition = this.getDefinition(result.baseForm, visited);
                if (baseDefinition) {
                    // 缓存活用形到原型的映射
                    this.cacheManager.setDefinition(word, baseDefinition);
                }
            }
        } catch (error) {
            // 错误已在调用处处理，这里静默失败
            throw error;
        }
    }
}
