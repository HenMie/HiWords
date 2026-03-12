import { TFile } from 'obsidian'
import type { App, EventRef } from 'obsidian'
import type { WordDefinition, MorphologyLanguage } from '../utils'
import type { KoreanMorphologyService } from './korean-morphology-service'
import type { MorphologyIndexManager } from './morphology-index-manager'
import type { UnifiedMorphologyService } from './unified-morphology-service'
import type { VocabularyCacheManager } from './vocabulary-cache-manager'
import { normalizeWordValue } from './vocabulary-definition-utils'

interface VocabularyMorphologyControllerDeps {
    app: App
    cacheManager: VocabularyCacheManager
    unifiedMorphologyService: UnifiedMorphologyService
    morphologyIndexManager: MorphologyIndexManager
    invalidateMatcherSnapshot: (reason: string) => void
    getDefinition: (word: string, visited?: Set<string>) => WordDefinition | null
}

export class VocabularyMorphologyController {
    private app: App
    private cacheManager: VocabularyCacheManager
    private unifiedMorphologyService: UnifiedMorphologyService
    private morphologyIndexManager: MorphologyIndexManager
    private invalidateMatcherSnapshot: (reason: string) => void
    private getDefinition: (word: string, visited?: Set<string>) => WordDefinition | null
    private readonly morphologyDecisionCacheLimit = 5000
    private morphologyDecisionCache: Map<string, string | null> = new Map()
    private morphologyDecisionInFlight: Map<string, Promise<string | null>> = new Map()
    private fileWatcherRefs: EventRef[] = []

    constructor(deps: VocabularyMorphologyControllerDeps) {
        this.app = deps.app
        this.cacheManager = deps.cacheManager
        this.unifiedMorphologyService = deps.unifiedMorphologyService
        this.morphologyIndexManager = deps.morphologyIndexManager
        this.invalidateMatcherSnapshot = deps.invalidateMatcherSnapshot
        this.getDefinition = deps.getDefinition
        this.registerFileWatchers()
    }

    public getMorphologyService(): KoreanMorphologyService | null {
        return this.unifiedMorphologyService.getKoreanService()
    }

    public getUnifiedMorphologyService(): UnifiedMorphologyService {
        return this.unifiedMorphologyService
    }

    public getMorphologyIndexManager(): MorphologyIndexManager {
        return this.morphologyIndexManager
    }

    public getInflectionFormsInCurrentNote(baseForm: string): Set<string> {
        const activeFile = this.app.workspace.getActiveFile()
        if (!activeFile) {
            return new Set()
        }

        return this.morphologyIndexManager.getInflectionFormsInNote(baseForm, activeFile.path)
    }

    public getAllInflectionForms(baseForm: string): Set<string> {
        return this.morphologyIndexManager.getAllInflectionForms(baseForm)
    }

    public getAllInflectionFormsWithCount(baseForm: string): Map<string, number> {
        return this.morphologyIndexManager.getAllInflectionFormsWithCount(baseForm)
    }

    public async analyzeWordToBaseForm(
        word: string,
        language: MorphologyLanguage = 'auto',
        contextText?: string
    ): Promise<string | null> {
        const normalizedWord = normalizeWordValue(word)
        if (!normalizedWord) {
            return null
        }

        const cacheKey = `${language}:${normalizedWord}`
        const cached = this.getCachedMorphologyDecision(cacheKey)
        if (cached !== undefined) {
            return cached
        }

        const inflight = this.morphologyDecisionInFlight.get(cacheKey)
        if (inflight) {
            return inflight
        }

        const analyzePromise = (async () => {
            try {
                const decision = await this.unifiedMorphologyService.analyzeWordDetailed(
                    normalizedWord,
                    language,
                    {
                        languagePolicy: language,
                        contextText
                    }
                )

                const baseForm = decision?.accepted ? decision.baseForm : null
                this.cacheMorphologyDecision(cacheKey, baseForm)
                return baseForm
            } catch (error) {
                console.error('形态素分析失败:', error)
                this.cacheMorphologyDecision(cacheKey, null)
                return null
            } finally {
                this.morphologyDecisionInFlight.delete(cacheKey)
            }
        })()

        this.morphologyDecisionInFlight.set(cacheKey, analyzePromise)
        try {
            return await analyzePromise
        } catch {
            return null
        }
    }

    public async reindexAllFiles(): Promise<void> {
        const markdownFiles = this.app.vault.getMarkdownFiles()
        let hasChanges = false

        for (const file of markdownFiles) {
            try {
                const content = await this.app.vault.read(file)
                const changed = await this.morphologyIndexManager.indexNote(file, content)
                if (changed) {
                    hasChanges = true
                }
            } catch (error) {
                console.error(`索引文件失败 ${file.path}:`, error)
            }
        }

        if (hasChanges) {
            this.invalidateMatcherSnapshot('reindex-all-files')
        }
    }

    public isWordMastered(word: string): boolean {
        const wordDef = this.cacheManager.getDefinition(word.toLowerCase())
        return wordDef?.mastered === true
    }

    public clearDecisionCache(): void {
        this.morphologyDecisionCache.clear()
        this.morphologyDecisionInFlight.clear()
    }

    public async queueMorphologyAnalysis(
        word: string,
        visited: Set<string>,
        language: 'korean' | 'japanese' | 'unknown' = 'unknown'
    ): Promise<void> {
        const morphologyLang = language === 'unknown' ? 'auto' : language
        const baseForm = await this.analyzeWordToBaseForm(word, morphologyLang)
        if (!baseForm || baseForm === word) {
            return
        }

        const baseDefinition = this.getDefinition(baseForm, visited)
        if (baseDefinition) {
            this.cacheManager.setDefinition(word, baseDefinition)
        }
    }

    public destroy(): void {
        this.clearDecisionCache()
        for (const ref of this.fileWatcherRefs) {
            this.app.vault.offref(ref)
        }
        this.fileWatcherRefs = []
        this.unifiedMorphologyService.destroy()
        this.morphologyIndexManager.destroy()
    }

    private getCachedMorphologyDecision(cacheKey: string): string | null | undefined {
        if (!this.morphologyDecisionCache.has(cacheKey)) {
            return undefined
        }

        const value = this.morphologyDecisionCache.get(cacheKey) ?? null
        this.morphologyDecisionCache.delete(cacheKey)
        this.morphologyDecisionCache.set(cacheKey, value)
        return value
    }

    private cacheMorphologyDecision(cacheKey: string, baseForm: string | null): void {
        if (this.morphologyDecisionCache.has(cacheKey)) {
            this.morphologyDecisionCache.delete(cacheKey)
        }
        this.morphologyDecisionCache.set(cacheKey, baseForm)

        if (this.morphologyDecisionCache.size <= this.morphologyDecisionCacheLimit) {
            return
        }

        const firstKey = this.morphologyDecisionCache.keys().next().value
        if (firstKey !== undefined) {
            this.morphologyDecisionCache.delete(firstKey)
        }
    }

    private registerFileWatchers(): void {
        const modifyRef = this.app.vault.on('modify', async (file) => {
            if (file instanceof TFile && file.extension === 'md') {
                const content = await this.app.vault.read(file)
                const changed = await this.morphologyIndexManager.indexNote(file, content)
                if (changed) {
                    this.invalidateMatcherSnapshot(`index-modify:${file.path}`)
                }
            }
        })
        this.fileWatcherRefs.push(modifyRef)

        const deleteRef = this.app.vault.on('delete', (file) => {
            if (file instanceof TFile && file.extension === 'md') {
                const changed = this.morphologyIndexManager.removeNoteIndex(file.path)
                if (changed) {
                    this.invalidateMatcherSnapshot(`index-delete:${file.path}`)
                }
            }
        })
        this.fileWatcherRefs.push(deleteRef)

        const renameRef = this.app.vault.on('rename', (file, oldPath) => {
            if (!(file instanceof TFile) || file.extension !== 'md') {
                return
            }

            const removed = this.morphologyIndexManager.removeNoteIndex(oldPath)
            this.app.vault.read(file).then((content) => {
                this.morphologyIndexManager.indexNote(file, content).then((changed) => {
                    if (removed || changed) {
                        this.invalidateMatcherSnapshot(`index-rename:${oldPath}->${file.path}`)
                    }
                })
            }).catch((error) => {
                console.error(`重命名后重新索引失败 ${file.path}:`, error)
            })
        })
        this.fileWatcherRefs.push(renameRef)
    }
}
