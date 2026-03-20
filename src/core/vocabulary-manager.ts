import { App, TFile } from 'obsidian'
import {
    DuplicateWordAuditEntry,
    HiWordsSettings,
    MorphologyLanguage,
    RenameConflictCheckParams,
    RenameConflictCheckResult,
    VocabularyBook,
    WordEntryIntent,
    WordDefinition,
    logAndFormatError
} from '../utils'
import type { KoreanMorphologyService } from './korean-morphology-service'
import type { MorphologyAssetProvider } from './morphology-asset-manager'
import { MorphologyIndexManager } from './morphology-index-manager'
import { UnifiedMorphologyService } from './unified-morphology-service'
import { JsonlVocabularyService } from './jsonl-vocabulary-service'
import { VocabularyBookStore } from './vocabulary-book-store'
import { VocabularyCacheManager } from './vocabulary-cache-manager'
import { VocabularyMorphologyController } from './vocabulary-morphology-controller'
import { normalizeWordValue } from './vocabulary-definition-utils'

export class VocabularyManager {
    private app: App
    private jsonlService: JsonlVocabularyService
    private cacheManager: VocabularyCacheManager
    private definitions: Map<string, WordDefinition[]> = new Map()
    private settings: HiWordsSettings
    private unifiedMorphologyService: UnifiedMorphologyService
    private morphologyIndexManager: MorphologyIndexManager
    private matcherSnapshotVersion = 1
    private bookStore: VocabularyBookStore
    private morphologyController: VocabularyMorphologyController

    constructor(app: App, settings: HiWordsSettings, morphologyAssetProvider?: MorphologyAssetProvider) {
        this.app = app
        this.settings = this.ensureMorphologyDefaults(settings)
        this.jsonlService = new JsonlVocabularyService(app)
        this.cacheManager = new VocabularyCacheManager()
        this.unifiedMorphologyService = new UnifiedMorphologyService(this.app, morphologyAssetProvider)
        this.unifiedMorphologyService.setDebugMode(this.settings.debugMode ?? false)
        this.morphologyIndexManager = new MorphologyIndexManager(this.unifiedMorphologyService)
        this.bookStore = new VocabularyBookStore({
            jsonlService: this.jsonlService,
            cacheManager: this.cacheManager,
            definitions: this.definitions,
            getMasteredDetectionMode: () => this.settings.masteredDetection ?? 'group',
            clearMorphologyDecisionCache: () => this.clearMorphologyDecisionCache(),
            invalidateMatcherSnapshot: (reason) => this.invalidateMatcherSnapshot(reason)
        })
        this.morphologyController = new VocabularyMorphologyController({
            app: this.app,
            cacheManager: this.cacheManager,
            unifiedMorphologyService: this.unifiedMorphologyService,
            morphologyIndexManager: this.morphologyIndexManager,
            invalidateMatcherSnapshot: (reason) => this.invalidateMatcherSnapshot(reason),
            getDefinition: (word, visited) => this.getDefinition(word, visited)
        })
    }

    async loadAllVocabularyBooks(): Promise<void> {
        this.showLoadingIndicator('正在加载生词本...')

        try {
            const startTime = Date.now()
            this.definitions.clear()
            this.cacheManager.invalidate()
            await this.unifiedMorphologyService.preloadServices(this.settings.vocabularyBooks)

            const loadPromises = this.settings.vocabularyBooks
                .filter((book) => book.enabled)
                .map((book) => this.loadVocabularyBook(book, false))
            await Promise.all(loadPromises)

            this.cacheManager.rebuild(this.definitions)
            this.clearMorphologyDecisionCache()
            this.invalidateMatcherSnapshot('load-all-vocabulary-books')

            const enabledCount = this.settings.vocabularyBooks.filter((book) => book.enabled).length
            console.log(`[HiWords] 生词本加载完成，耗时 ${Date.now() - startTime}ms`)
            this.showSuccessMessage(`生词本加载完成 (${enabledCount}个)`)
        } catch (error) {
            this.showErrorMessage(error, '生词本加载失败')
        } finally {
            this.hideLoadingIndicator()
        }
    }

    async loadVocabularyBook(book: VocabularyBook, invalidateSnapshot = true): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(book.path)
        if (!(file instanceof TFile)) {
            console.warn(`[HiWords] 生词本文件未找到: ${book.path}`)
            return
        }
        if (!JsonlVocabularyService.isJsonlFile(file)) {
            console.warn(`[HiWords] 文件不是 JSONL 格式: ${book.path}`)
            return
        }

        try {
            const rawDefinitions = await this.jsonlService.parseJsonlFile(file)
            const definitions = this.bookStore.applyMasteredDetection(rawDefinitions)
            this.definitions.set(book.path, definitions)
            this.cacheManager.invalidate()
            if (invalidateSnapshot) {
                this.clearMorphologyDecisionCache()
                this.invalidateMatcherSnapshot(`load-book:${book.path}`)
            }
        } catch (error) {
            const errorMessage = this.formatErrorMessage(error, `加载生词本 ${book.name} 失败`)
            console.error(`[HiWords] ${errorMessage}`, error)
        }
    }

    getDefinition(word: string, visited: Set<string> = new Set()): WordDefinition | null {
        const normalizedWord = normalizeWordValue(word)
        if (!normalizedWord || visited.has(normalizedWord)) {
            return null
        }
        visited.add(normalizedWord)

        const cachedDefinition = this.getCachedDefinition(normalizedWord)
        if (cachedDefinition) {
            return cachedDefinition
        }

        for (const definitions of this.definitions.values()) {
            for (const definition of definitions) {
                if (normalizeWordValue(definition.word) === normalizedWord) {
                    this.cacheManager.setDefinition(normalizedWord, definition)
                    return definition
                }
            }
        }

        const detectedLang = this.unifiedMorphologyService.detectLanguage(normalizedWord)
        if (detectedLang !== 'unknown') {
            this.morphologyController.queueMorphologyAnalysis(normalizedWord, visited, detectedLang).catch((error) => {
                console.warn(`[HiWords] 形态学分析失败 ${normalizedWord}:`, error)
            })
        }

        return null
    }

    getAllWords(): string[] {
        this.ensureCache()
        return this.cacheManager.getAllWords()
    }

    getAllWordsForHighlight(): string[] {
        if (!this.settings.enableMasteredFeature) {
            return this.getAllWords()
        }

        this.ensureCache()
        return this.cacheManager.getUnmasteredWords()
    }

    getWordsFromBook(bookPath: string): string[] {
        if (this.cacheManager.isValid()) {
            const cachedWords = this.cacheManager.getWordsFromBook(bookPath)
            if (cachedWords.length > 0) {
                return cachedWords
            }
        }

        const definitions = this.definitions.get(bookPath) || []
        return [...new Set(definitions.map((definition) => definition.word))]
    }

    async reloadVocabularyBook(bookPath: string): Promise<void> {
        const book = this.settings.vocabularyBooks.find((item) => item.path === bookPath)
        if (!book?.enabled) {
            return
        }

        await this.loadVocabularyBook(book, false)
        this.cacheManager.invalidate()
        this.clearMorphologyDecisionCache()
        this.invalidateMatcherSnapshot(`reload-book:${bookPath}`)
    }

    removeBookData(bookPath: string): void {
        this.definitions.delete(bookPath)
        this.cacheManager.invalidate()
        this.clearMorphologyDecisionCache()
        this.invalidateMatcherSnapshot(`remove-book-data:${bookPath}`)
    }

    updateSettings(settings: HiWordsSettings): void {
        this.settings = this.ensureMorphologyDefaults(settings)
        this.cacheManager.invalidate()
        this.clearMorphologyDecisionCache()
        this.invalidateMatcherSnapshot('settings-updated')
        this.unifiedMorphologyService.setDebugMode(this.settings.debugMode ?? false)
        this.unifiedMorphologyService.updateServices(this.settings.vocabularyBooks).catch((error) => {
            console.warn('[HiWords] 更新形态学服务失败:', error)
        })
    }

    getSettings(): HiWordsSettings {
        return this.settings
    }

    getMatcherSnapshotVersion(): number {
        return this.matcherSnapshotVersion
    }

    invalidateMatcherSnapshot(reason = 'unknown'): void {
        this.matcherSnapshotVersion += 1
        if (this.settings.debugMode) {
            console.debug('[HiWords] matcher snapshot invalidated', {
                reason,
                version: this.matcherSnapshotVersion
            })
        }
    }

    getStats(): { totalBooks: number; enabledBooks: number; totalWords: number } {
        let totalWords = 0
        for (const definitions of this.definitions.values()) {
            totalWords += definitions.length
        }

        return {
            totalBooks: this.settings.vocabularyBooks.length,
            enabledBooks: this.settings.vocabularyBooks.filter((book) => book.enabled).length,
            totalWords
        }
    }

    hasWord(word: string): boolean {
        const normalizedWord = normalizeWordValue(word)
        if (this.cacheManager.isValid()) {
            return this.cacheManager.hasWord(normalizedWord)
        }
        return this.getDefinition(word) !== null
    }

    getLegacyDuplicateEntries(): DuplicateWordAuditEntry[] {
        return this.bookStore.getLegacyDuplicateEntries()
    }

    getWordEntryIntent(word: string): WordEntryIntent {
        const normalizedWord = normalizeWordValue(word)
        const duplicateEntries = this.getLegacyDuplicateEntries().filter(
            (entry) => entry.normalizedWord === normalizedWord
        )

        const definition = this.getDefinition(word)
        if (definition) {
            return {
                kind: 'edit',
                normalizedWord,
                definition,
                duplicateEntries: duplicateEntries.length > 0 ? duplicateEntries : undefined
            }
        }

        if (duplicateEntries.length > 0) {
            return {
                kind: 'legacy-duplicate',
                normalizedWord,
                entries: duplicateEntries
            }
        }

        return {
            kind: 'add',
            normalizedWord
        }
    }

    checkRenameConflict(params: RenameConflictCheckParams): RenameConflictCheckResult {
        const candidateNormalizedWord = normalizeWordValue(params.candidateWord)
        const allDefinitions = Array.from(this.definitions.entries()).flatMap(([bookPath, defs]) =>
            defs.map((definition) => ({ bookPath, definition }))
        )

        const sameNode = allDefinitions.find(
            ({ bookPath, definition }) =>
                bookPath === params.sourceBookPath && definition.nodeId === params.nodeId
        )

        if (!sameNode) {
            return { kind: 'global-conflict', conflictingEntries: [] }
        }

        const currentNormalizedWord = normalizeWordValue(sameNode.definition.word)
        const isMetadataOnlyUpdate =
            candidateNormalizedWord === currentNormalizedWord &&
            params.sourceBookPath === params.targetBookPath

        if (isMetadataOnlyUpdate) {
            return { kind: 'same-node-noop' }
        }

        const relatedLegacyDuplicates = this.getLegacyDuplicateEntries().filter((entry) =>
            entry.normalizedWord === currentNormalizedWord || entry.normalizedWord === candidateNormalizedWord
        )
        if (relatedLegacyDuplicates.length > 0) {
            return {
                kind: 'legacy-duplicate-state',
                conflictingEntries: relatedLegacyDuplicates
            }
        }

        const conflicts = allDefinitions
            .filter(({ bookPath, definition }) =>
                !(bookPath === params.sourceBookPath && definition.nodeId === params.nodeId) &&
                normalizeWordValue(definition.word) === candidateNormalizedWord
            )
            .map(({ bookPath, definition }) => ({
                normalizedWord: candidateNormalizedWord,
                rawWord: definition.word,
                bookPath,
                nodeId: definition.nodeId
            }))

        if (conflicts.length > 0) {
            return {
                kind: 'global-conflict',
                conflictingEntries: conflicts
            }
        }

        return { kind: 'none' }
    }

    clear(): void {
        this.definitions.clear()
        this.cacheManager.clear()
        this.clearMorphologyDecisionCache()
        this.invalidateMatcherSnapshot('clear-all')
    }

    async addWordToCanvas(
        bookPath: string,
        word: string,
        definition: string,
        color?: number,
        etymology?: string,
        pronunciation?: string
    ): Promise<boolean> {
        return await this.bookStore.addWordToCanvas(bookPath, word, definition, color, etymology, pronunciation)
    }

    async setNodeColor(bookPath: string, nodeId: string, color?: number): Promise<boolean> {
        return await this.bookStore.setNodeColor(bookPath, nodeId, color)
    }

    async updateWordInCanvas(
        bookPath: string,
        nodeId: string,
        word: string,
        definition: string,
        color?: number,
        etymology?: string,
        pronunciation?: string
    ): Promise<boolean> {
        return await this.bookStore.updateWordInCanvas(
            bookPath,
            nodeId,
            word,
            definition,
            color,
            etymology,
            pronunciation
        )
    }

    async moveWordToBook(
        sourceBookPath: string,
        targetBookPath: string,
        nodeId: string,
        word: string,
        definition: string,
        color?: number,
        etymology?: string,
        pronunciation?: string
    ): Promise<boolean> {
        return await this.bookStore.moveWordToBook(
            sourceBookPath,
            targetBookPath,
            nodeId,
            word,
            definition,
            color,
            etymology,
            pronunciation
        )
    }

    async deleteWordFromCanvas(bookPath: string, nodeId: string): Promise<boolean> {
        return await this.bookStore.deleteWordFromCanvas(bookPath, nodeId)
    }

    destroy(): void {
        this.clearMorphologyDecisionCache()
        this.definitions.clear()
        this.cacheManager.clear()
        this.morphologyController.destroy()
    }

    async getWordDefinitionByNodeId(bookPath: string, nodeId: string): Promise<WordDefinition | null> {
        return await this.bookStore.getWordDefinitionByNodeId(bookPath, nodeId)
    }

    async updateWordDefinition(bookPath: string, nodeId: string, updatedDef: WordDefinition): Promise<boolean> {
        return await this.bookStore.updateWordDefinition(bookPath, nodeId, updatedDef)
    }

    async getAllWordDefinitions(): Promise<WordDefinition[]> {
        return await this.bookStore.getAllWordDefinitions()
    }

    async getWordDefinitionsByBook(bookPath: string): Promise<WordDefinition[]> {
        return await this.bookStore.getWordDefinitionsByBook(bookPath)
    }

    async getUnmasteredWords(): Promise<string[]> {
        return await this.bookStore.getUnmasteredWords()
    }

    async getMasteredWords(): Promise<string[]> {
        return await this.bookStore.getMasteredWords()
    }

    getMorphologyService(): KoreanMorphologyService | null {
        return this.morphologyController.getMorphologyService()
    }

    getUnifiedMorphologyService(): UnifiedMorphologyService {
        return this.morphologyController.getUnifiedMorphologyService()
    }

    getMorphologyIndexManager(): MorphologyIndexManager {
        return this.morphologyController.getMorphologyIndexManager()
    }

    getInflectionFormsInCurrentNote(baseForm: string): Set<string> {
        return this.morphologyController.getInflectionFormsInCurrentNote(baseForm)
    }

    getAllInflectionForms(baseForm: string): Set<string> {
        return this.morphologyController.getAllInflectionForms(baseForm)
    }

    getAllInflectionFormsWithCount(baseForm: string): Map<string, number> {
        return this.morphologyController.getAllInflectionFormsWithCount(baseForm)
    }

    async analyzeWordToBaseForm(
        word: string,
        language: MorphologyLanguage = 'auto',
        contextText?: string
    ): Promise<string | null> {
        return await this.morphologyController.analyzeWordToBaseForm(word, language, contextText)
    }

    async reindexAllFiles(): Promise<void> {
        await this.morphologyController.reindexAllFiles()
    }

    isWordMastered(word: string): boolean {
        return this.morphologyController.isWordMastered(word)
    }

    private showLoadingIndicator(message: string): void {
        this.app.workspace?.trigger('hi-words:loading-show', message)
    }

    private hideLoadingIndicator(): void {
        this.app.workspace?.trigger('hi-words:loading-hide')
    }

    private showSuccessMessage(message: string): void {
        this.app.workspace?.trigger('hi-words:success-message', message)
    }

    private showErrorMessage(error: unknown, context: string): void {
        const userFriendlyMessage = this.formatErrorMessage(error, context)
        this.app.workspace?.trigger('hi-words:error-message', userFriendlyMessage)
        console.error(`[HiWords] ${context}:`, error)
    }

    private formatErrorMessage(error: unknown, context: string): string {
        return logAndFormatError(error, context)
    }

    private ensureMorphologyDefaults(settings: HiWordsSettings): HiWordsSettings {
        if (!settings.morphologyEngineMode) {
            settings.morphologyEngineMode = 'hybrid'
        }
        if (!settings.morphologyFallbackMode) {
            settings.morphologyFallbackMode = 'conservative'
        }
        return settings
    }

    private ensureCache(): void {
        if (!this.cacheManager.isValid()) {
            this.cacheManager.rebuild(this.definitions)
        }
    }

    private getCachedDefinition(normalizedWord: string): WordDefinition | null {
        if (!this.cacheManager.isValid()) {
            this.ensureCache()
        }
        return this.cacheManager.getDefinition(normalizedWord) || null
    }

    private clearMorphologyDecisionCache(): void {
        this.morphologyController.clearDecisionCache()
    }
}
