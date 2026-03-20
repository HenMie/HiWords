import type { DuplicateWordAuditEntry, WordDefinition } from '../utils'
import type { VocabularyCacheManager } from './vocabulary-cache-manager'
import type { JsonlVocabularyService } from './jsonl-vocabulary-service'
import {
    applyPatternMetadata,
    getColorString,
    normalizeWordValue,
    parsePatternMetadata
} from './vocabulary-definition-utils'

interface VocabularyBookStoreDeps {
    jsonlService: JsonlVocabularyService
    cacheManager: VocabularyCacheManager
    definitions: Map<string, WordDefinition[]>
    getMasteredDetectionMode: () => 'group' | 'color'
    clearMorphologyDecisionCache: () => void
    invalidateMatcherSnapshot: (reason: string) => void
}

export class VocabularyBookStore {
    private jsonlService: JsonlVocabularyService
    private cacheManager: VocabularyCacheManager
    private definitions: Map<string, WordDefinition[]>
    private getMasteredDetectionMode: () => 'group' | 'color'
    private clearMorphologyDecisionCache: () => void
    private invalidateMatcherSnapshot: (reason: string) => void

    constructor(deps: VocabularyBookStoreDeps) {
        this.jsonlService = deps.jsonlService
        this.cacheManager = deps.cacheManager
        this.definitions = deps.definitions
        this.getMasteredDetectionMode = deps.getMasteredDetectionMode
        this.clearMorphologyDecisionCache = deps.clearMorphologyDecisionCache
        this.invalidateMatcherSnapshot = deps.invalidateMatcherSnapshot
    }

    public applyMasteredDetection(definitions: WordDefinition[]): WordDefinition[] {
        const detectionMode = this.getMasteredDetectionMode()
        if (detectionMode === 'color') {
            return definitions.map((definition) => ({
                ...definition,
                mastered: definition.color === '4'
            }))
        }

        return definitions.map((definition) => ({
            ...definition,
            mastered: definition.mastered === true
        }))
    }

    public async addWordToCanvas(
        bookPath: string,
        word: string,
        definition: string,
        color?: number,
        etymology?: string,
        pronunciation?: string
    ): Promise<boolean> {
        try {
            const patternMeta = parsePatternMetadata(word.trim())
            const persistedWordDef = await this.jsonlService.addWord(bookPath, {
                word: patternMeta.word,
                definition,
                pronunciation,
                etymology,
                color: color ? getColorString(color) : undefined,
                mastered: false,
                isPattern: patternMeta.isPattern,
                patternParts: patternMeta.patternParts
            })

            this.addWordToMemoryCache(bookPath, persistedWordDef)
            this.cacheManager.rebuild(this.definitions)
            this.clearMorphologyDecisionCache()
            this.invalidateMatcherSnapshot(`add-word:${patternMeta.word}`)
            return true
        } catch (error) {
            console.error('Failed to add word to JSONL:', error)
            return false
        }
    }

    public async setNodeColor(bookPath: string, nodeId: string, color?: number): Promise<boolean> {
        try {
            const colorString = color !== undefined ? getColorString(color) : undefined
            const updated = await this.jsonlService.setNodeColor(bookPath, nodeId, colorString)
            if (!updated) {
                return false
            }

            const defs = this.definitions.get(bookPath)
            if (!defs) {
                return true
            }

            const idx = defs.findIndex((definition) => definition.nodeId === nodeId)
            if (idx < 0) {
                return true
            }

            const definition = defs[idx]
            definition.color = colorString
            this.cacheManager.setDefinition(definition.word, definition)
            this.cacheManager.invalidate()
            this.invalidateMatcherSnapshot(`set-color:${nodeId}`)
            return true
        } catch (error) {
            console.error('设置节点颜色失败:', error)
            return false
        }
    }

    public async updateWordInCanvas(
        bookPath: string,
        nodeId: string,
        word: string,
        definition: string,
        color?: number,
        etymology?: string,
        pronunciation?: string
    ): Promise<boolean> {
        try {
            const oldWordDef = await this.getWordDefinitionByNodeId(bookPath, nodeId)
            const patternMeta = parsePatternMetadata(word.trim())
            const updated = await this.jsonlService.updateWord(bookPath, nodeId, {
                word: patternMeta.word,
                definition,
                pronunciation,
                etymology,
                color: color ? getColorString(color) : undefined,
                mastered: oldWordDef?.mastered,
                isPattern: patternMeta.isPattern,
                patternParts: patternMeta.patternParts
            })
            if (!updated) {
                return false
            }

            this.updateWordInMemoryCache(bookPath, nodeId, updated)
            this.cacheManager.rebuild(this.definitions)
            this.clearMorphologyDecisionCache()
            this.invalidateMatcherSnapshot(`update-word:${nodeId}`)
            return true
        } catch (error) {
            console.error('Failed to update word in JSONL:', error)
            return false
        }
    }

    public async moveWordToBook(
        sourceBookPath: string,
        targetBookPath: string,
        nodeId: string,
        word: string,
        definition: string,
        color?: number,
        etymology?: string,
        pronunciation?: string
    ): Promise<boolean> {
        if (sourceBookPath === targetBookPath) {
            return await this.updateWordInCanvas(
                sourceBookPath,
                nodeId,
                word,
                definition,
                color,
                etymology,
                pronunciation
            )
        }

        let addedNodeId: string | null = null
        let sourceDeleted = false
        try {
            const oldWordDef = await this.getWordDefinitionByNodeId(sourceBookPath, nodeId)
            if (!oldWordDef) {
                console.warn(`未找到要移动的词汇: ${sourceBookPath}#${nodeId}`)
                return false
            }

            const patternMeta = parsePatternMetadata(word.trim())
            const addedWordDef = await this.jsonlService.addWord(targetBookPath, {
                word: patternMeta.word,
                definition,
                pronunciation,
                etymology,
                color: color ? getColorString(color) : undefined,
                mastered: oldWordDef.mastered ?? false,
                isPattern: patternMeta.isPattern,
                patternParts: patternMeta.patternParts
            })
            addedNodeId = addedWordDef.nodeId

            const deleted = await this.jsonlService.deleteWord(sourceBookPath, nodeId)
            if (!deleted) {
                await this.rollbackMovedWord(targetBookPath, addedWordDef.nodeId)
                return false
            }
            sourceDeleted = true

            this.deleteWordFromMemoryCache(sourceBookPath, nodeId)
            this.addWordToMemoryCache(targetBookPath, addedWordDef)
            this.cacheManager.rebuild(this.definitions)
            this.clearMorphologyDecisionCache()
            this.invalidateMatcherSnapshot(`move-word:${nodeId}`)
            return true
        } catch (error) {
            if (addedNodeId && !sourceDeleted) {
                await this.rollbackMovedWord(targetBookPath, addedNodeId)
            }
            console.error('Failed to move word between JSONL books:', error)
            return false
        }
    }

    public async deleteWordFromCanvas(bookPath: string, nodeId: string): Promise<boolean> {
        try {
            const success = await this.jsonlService.deleteWord(bookPath, nodeId)
            if (!success) {
                return false
            }

            this.deleteWordFromMemoryCache(bookPath, nodeId)
            this.cacheManager.rebuild(this.definitions)
            this.clearMorphologyDecisionCache()
            this.invalidateMatcherSnapshot(`delete-word:${nodeId}`)
            return true
        } catch (error) {
            console.error('Failed to delete word from JSONL:', error)
            return false
        }
    }

    public async getWordDefinitionByNodeId(
        bookPath: string,
        nodeId: string
    ): Promise<WordDefinition | null> {
        const bookWords = this.definitions.get(bookPath)
        if (!bookWords) {
            return null
        }

        return bookWords.find((wordDef) => wordDef.nodeId === nodeId) || null
    }

    public async updateWordDefinition(
        bookPath: string,
        nodeId: string,
        updatedDef: WordDefinition
    ): Promise<boolean> {
        const bookWords = this.definitions.get(bookPath)
        if (!bookWords) {
            return false
        }

        const index = bookWords.findIndex((wordDef) => wordDef.nodeId === nodeId)
        if (index === -1) {
            return false
        }

        const oldDef = bookWords[index]
        const normalizedDefinition = applyPatternMetadata(updatedDef)
        bookWords[index] = normalizedDefinition
        this.cacheManager.deleteDefinition(oldDef.word)
        this.cacheManager.setDefinition(normalizedDefinition.word, normalizedDefinition)
        this.cacheManager.invalidate()
        this.clearMorphologyDecisionCache()
        this.invalidateMatcherSnapshot(`update-word-definition:${nodeId}`)

        try {
            await this.jsonlService.saveWordDefinition(bookPath, nodeId, normalizedDefinition)
        } catch (error) {
            console.error('保存单词定义到 JSONL 失败:', error)
        }

        return true
    }

    public async getAllWordDefinitions(): Promise<WordDefinition[]> {
        const allDefs: WordDefinition[] = []
        for (const bookWords of this.definitions.values()) {
            allDefs.push(...bookWords)
        }
        return allDefs
    }

    public async getWordDefinitionsByBook(bookPath: string): Promise<WordDefinition[]> {
        return [...(this.definitions.get(bookPath) || [])]
    }

    public getLegacyDuplicateEntries(): DuplicateWordAuditEntry[] {
        const grouped = new Map<string, DuplicateWordAuditEntry[]>()

        for (const [bookPath, bookWords] of this.definitions.entries()) {
            for (const wordDef of bookWords) {
                const normalizedWord = normalizeWordValue(wordDef.word)
                if (!normalizedWord) {
                    continue
                }

                const entry: DuplicateWordAuditEntry = {
                    normalizedWord,
                    rawWord: wordDef.word,
                    bookPath,
                    nodeId: wordDef.nodeId
                }
                const entries = grouped.get(normalizedWord) ?? []
                entries.push(entry)
                grouped.set(normalizedWord, entries)
            }
        }

        return Array.from(grouped.values())
            .filter((entries) => entries.length > 1)
            .flat()
    }

    public async getUnmasteredWords(): Promise<string[]> {
        if (!this.cacheManager.isValid()) {
            this.cacheManager.rebuild(this.definitions)
        }
        return this.cacheManager.getUnmasteredWords()
    }

    public async getMasteredWords(): Promise<string[]> {
        if (!this.cacheManager.isValid()) {
            this.cacheManager.rebuild(this.definitions)
        }
        return this.cacheManager.getMasteredWords()
    }

    private async rollbackMovedWord(bookPath: string, nodeId: string): Promise<void> {
        try {
            await this.jsonlService.deleteWord(bookPath, nodeId)
        } catch (rollbackError) {
            console.error('回滚移动词汇失败:', rollbackError)
        }
    }

    private addWordToMemoryCache(bookPath: string, wordDef: WordDefinition): void {
        let bookWords = this.definitions.get(bookPath)
        if (!bookWords) {
            bookWords = []
            this.definitions.set(bookPath, bookWords)
        }

        const existingIndex = bookWords.findIndex(
            (word) => normalizeWordValue(word.word) === normalizeWordValue(wordDef.word)
        )
        if (existingIndex >= 0) {
            bookWords[existingIndex] = wordDef
        } else {
            bookWords.push(wordDef)
        }

        this.cacheManager.setDefinition(wordDef.word, wordDef)
        this.cacheManager.invalidate()
    }

    private updateWordInMemoryCache(
        bookPath: string,
        nodeId: string,
        updatedWordDef: WordDefinition
    ): void {
        const bookWords = this.definitions.get(bookPath)
        if (!bookWords) {
            console.warn(`未找到书本: ${bookPath}`)
            return
        }

        const existingIndex = bookWords.findIndex((word) => word.nodeId === nodeId)
        if (existingIndex < 0) {
            console.warn(`未找到节点ID: ${nodeId}`)
            return
        }

        const oldWordDef = bookWords[existingIndex]
        this.cacheManager.deleteDefinition(oldWordDef.word)
        bookWords[existingIndex] = updatedWordDef
        this.cacheManager.setDefinition(updatedWordDef.word, updatedWordDef)
        this.cacheManager.invalidate()
    }

    private deleteWordFromMemoryCache(bookPath: string, nodeId: string): void {
        const bookWords = this.definitions.get(bookPath)
        if (!bookWords) {
            console.warn(`未找到书本: ${bookPath}`)
            return
        }

        const existingIndex = bookWords.findIndex((word) => word.nodeId === nodeId)
        if (existingIndex < 0) {
            console.warn(`未找到节点ID: ${nodeId}`)
            return
        }

        const wordDefToDelete = bookWords[existingIndex]
        this.cacheManager.deleteDefinition(wordDefToDelete.word)
        bookWords.splice(existingIndex, 1)
        this.cacheManager.invalidate()
    }
}
