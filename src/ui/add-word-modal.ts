import { App, Modal, Notice } from 'obsidian'
import type {
    DuplicateWordAuditEntry,
    VocabularyBook,
    WordDefinition
} from '../utils'
import { isKoreanText, INPUT_FOCUS_DELAY } from '../utils'
import HiWordsPlugin from '../../main'
import { t } from '../i18n'
import { DictionaryService } from '../services/dictionary-service'
import { getBookLanguagePolicy } from '../core/morphology-language-resolver'
import { selectInitialBookPath } from './add-word-language-policy'
import { renderAddWordForm } from './add-word-form'

interface AddWordDraftState {
    definition: string
    etymology: string
    pronunciation: string
    colorValue?: number
}

export class AddWordModal extends Modal {
    private plugin: HiWordsPlugin
    private word: string
    private originalWord: string
    private sentence: string
    private isEditMode: boolean
    private definition: WordDefinition | null
    private dictionaryService: DictionaryService | null
    private isAnalyzing = false
    private selectedBookPath: string | null
    private hasQueuedInitialAnalysis = false
    private analysisRunId = 0
    private draft: AddWordDraftState
    private conflictMessage: string | null = null

    private static lastSelectedBookPath: string | null = null

    constructor(
        app: App,
        plugin: HiWordsPlugin,
        word: string,
        sentence = '',
        isEditMode = false,
        definitionOverride?: WordDefinition | null,
        duplicateEntries?: DuplicateWordAuditEntry[]
    ) {
        super(app)
        this.plugin = plugin
        this.sentence = sentence
        this.isEditMode = isEditMode
        this.definition = isEditMode
            ? definitionOverride ?? this.plugin.vocabularyManager.getDefinition(word)
            : null
        this.originalWord = this.definition?.word ?? word
        this.word = this.definition?.word ?? word
        this.dictionaryService = plugin.settings.aiDictionary
            ? new DictionaryService(plugin.settings.aiDictionary)
            : null
        this.draft = {
            definition: this.definition?.definition ?? '',
            etymology: this.definition?.etymology ?? '',
            pronunciation: this.definition?.pronunciation ?? '',
            colorValue: this.parseColorValue(this.definition?.color)
        }
        this.selectedBookPath = selectInitialBookPath(
            this.getEnabledBooks(),
            this.isEditMode,
            this.definition?.source ?? null,
            AddWordModal.lastSelectedBookPath
        )

        if (this.isEditMode && duplicateEntries && duplicateEntries.length > 0) {
            this.conflictMessage = this.formatLegacyDuplicateContext(duplicateEntries)
        }
    }

    onOpen(): void {
        this.render()
        if (!this.isEditMode && !this.hasQueuedInitialAnalysis) {
            this.hasQueuedInitialAnalysis = true
            void this.analyzeWordAsync()
        }
    }

    onClose(): void {
        this.analysisRunId += 1
        this.contentEl.empty()
    }

    private render(): void {
        const { contentEl } = this
        contentEl.empty()

        const refs = renderAddWordForm({
            containerEl: contentEl,
            titleLabel: t(this.isEditMode ? 'modals.edit_word_title' : 'modals.add_word_title'),
            helperText: t(this.isEditMode ? 'modals.edit_word_helper' : 'modals.add_word_helper'),
            errorMessage: this.conflictMessage,
            initialWord: this.word,
            originalWord: this.originalWord,
            sentence: this.sentence,
            isEditMode: this.isEditMode,
            definitionValue: this.draft.definition,
            etymologyValue: this.draft.etymology,
            pronunciationValue: this.draft.pronunciation,
            colorValue: this.draft.colorValue,
            enabledBooks: this.getEnabledBooks(),
            selectedBookPath: this.selectedBookPath,
            sourceBookPath: this.definition?.source ?? null,
            dictionaryService: this.dictionaryService,
            isAnalyzing: this.isAnalyzing,
            onWordChange: (word) => {
                this.word = word
                this.conflictMessage = null
            },
            onDefinitionChange: (value) => {
                this.draft.definition = value
            },
            onEtymologyChange: (value) => {
                this.draft.etymology = value
            },
            onPronunciationChange: (value) => {
                this.draft.pronunciation = value
            },
            onColorChange: (value) => {
                this.draft.colorValue = value
            },
            onBookChange: (bookPath) => {
                this.selectedBookPath = bookPath
                this.conflictMessage = null
                if (!this.isEditMode) {
                    void this.analyzeWordAsync()
                }
            },
            onRestoreOriginal: () => {
                this.word = this.originalWord
                this.conflictMessage = null
                this.render()
            },
            onDelete: this.isEditMode && this.definition
                ? async () => await this.handleDelete()
                : undefined,
            onSubmit: async (payload) => await this.handleSubmit(payload),
            onCancel: () => this.close()
        })

        setTimeout(() => {
            if (this.isEditMode) {
                refs.wordInput?.focus()
                return
            }

            if (!this.word && refs.wordInput) {
                refs.wordInput.focus()
                return
            }

            refs.definitionInput.focus()
        }, INPUT_FOCUS_DELAY)
    }

    private getEnabledBooks(): VocabularyBook[] {
        return this.plugin.settings.vocabularyBooks.filter((book) => book.enabled)
    }

    private getSelectedBook(): VocabularyBook | undefined {
        return this.plugin.settings.vocabularyBooks.find(
            (book) => book.path === this.selectedBookPath
        )
    }

    private async analyzeWordAsync(): Promise<void> {
        if (this.isEditMode) {
            return
        }

        const analysisRunId = ++this.analysisRunId
        this.isAnalyzing = true
        this.render()

        try {
            const languagePolicy = getBookLanguagePolicy(this.getSelectedBook())
            const baseForm = await this.plugin.vocabularyManager.analyzeWordToBaseForm(
                this.originalWord,
                languagePolicy,
                this.sentence
            )

            if (analysisRunId !== this.analysisRunId) {
                return
            }

            if (isKoreanText(this.originalWord) && (!baseForm || !isKoreanText(baseForm))) {
                this.word = this.originalWord
            } else if (baseForm && baseForm.length > 0) {
                this.word = baseForm
            } else {
                this.word = this.originalWord
            }
        } catch (error) {
            if (analysisRunId !== this.analysisRunId) {
                return
            }
            console.error('Analyze word failed:', error)
            this.word = this.originalWord
        } finally {
            if (analysisRunId === this.analysisRunId) {
                this.isAnalyzing = false
                this.render()
            }
        }
    }

    private async handleDelete(): Promise<void> {
        if (!this.definition) {
            return
        }

        const confirmed = window.confirm(
            t('modals.delete_confirmation').replace('{0}', this.word)
        )
        if (!confirmed) {
            return
        }

        const loadingNotice = new Notice(t('notices.deleting_word'), 0)
        try {
            const success = await this.plugin.vocabularyManager.deleteWordFromCanvas(
                this.definition.source,
                this.definition.nodeId
            )
            loadingNotice.hide()
            if (success) {
                new Notice(t('notices.word_deleted'))
                this.plugin.refreshHighlighter()
                this.close()
                return
            }

            new Notice(t('notices.delete_word_failed'))
        } catch (error) {
            loadingNotice.hide()
            console.error('删除词汇失败:', error)
            new Notice(t('notices.error_deleting_word'))
        }
    }

    private async handleSubmit(payload: {
        selectedBook: string
        finalWord: string
        definition: string
        colorValue?: number
        etymology?: string
        pronunciation?: string
    }): Promise<void> {
        this.conflictMessage = null

        if (this.isEditMode && this.definition) {
            const conflict = this.plugin.vocabularyManager.checkRenameConflict({
                sourceBookPath: this.definition.source,
                targetBookPath: payload.selectedBook,
                nodeId: this.definition.nodeId,
                candidateWord: payload.finalWord
            })

            if (conflict.kind === 'legacy-duplicate-state') {
                this.conflictMessage = this.formatConflictMessage(
                    t('notices.rename_conflict_legacy_state', 'Legacy duplicate state blocks rename or move. Resolve duplicates first. {0}'),
                    conflict.conflictingEntries
                )
                this.render()
                return
            }

            if (conflict.kind === 'global-conflict') {
                this.conflictMessage = this.formatConflictMessage(
                    t('notices.rename_conflict_detected', 'A conflicting word already exists. {0}'),
                    conflict.conflictingEntries
                )
                this.render()
                return
            }
        }

        const loadingNotice = this.isEditMode
            ? new Notice(t('notices.updating_word'), 0)
            : new Notice(t('notices.adding_word'), 0)

        try {
            const success = this.isEditMode && this.definition
                ? await this.updateExistingWord(payload)
                : await this.plugin.vocabularyManager.addWordToCanvas(
                    payload.selectedBook,
                    payload.finalWord,
                    payload.definition,
                    payload.colorValue,
                    payload.etymology,
                    payload.pronunciation
                )

            loadingNotice.hide()

            if (!success) {
                new Notice(this.isEditMode ? t('notices.update_word_failed') : t('notices.add_word_failed'))
                return
            }

            if (!this.isEditMode) {
                AddWordModal.lastSelectedBookPath = payload.selectedBook
                new Notice(t('notices.word_added_success').replace('{0}', payload.finalWord))
            } else {
                new Notice(t('notices.word_updated_success').replace('{0}', payload.finalWord))
            }

            this.plugin.refreshHighlighter()
            this.close()
        } catch (error) {
            loadingNotice.hide()
            console.error('Processing word failed:', error)
            new Notice(t('notices.error_processing_word'))
        }
    }

    private async updateExistingWord(payload: {
        selectedBook: string
        finalWord: string
        definition: string
        colorValue?: number
        etymology?: string
        pronunciation?: string
    }): Promise<boolean> {
        if (!this.definition) {
            return false
        }

        if (payload.selectedBook !== this.definition.source) {
            return await this.plugin.vocabularyManager.moveWordToBook(
                this.definition.source,
                payload.selectedBook,
                this.definition.nodeId,
                payload.finalWord,
                payload.definition,
                payload.colorValue,
                payload.etymology,
                payload.pronunciation
            )
        }

        return await this.plugin.vocabularyManager.updateWordInCanvas(
            this.definition.source,
            this.definition.nodeId,
            payload.finalWord,
            payload.definition,
            payload.colorValue,
            payload.etymology,
            payload.pronunciation
        )
    }

    private formatConflictMessage(template: string, entries: DuplicateWordAuditEntry[]): string {
        const detail = entries
            .slice(0, 2)
            .map((entry) => `${entry.rawWord} @ ${entry.bookPath}`)
            .join(' | ')
        return template.replace('{0}', detail)
    }

    private formatLegacyDuplicateContext(entries: DuplicateWordAuditEntry[]): string {
        return this.formatConflictMessage(
            t(
                'notices.legacy_duplicate_edit_context',
                'Legacy duplicates already exist for this word. You can review or delete this entry, but rename or move is blocked until duplicates are cleaned up. {0}'
            ),
            entries
        )
    }

    private parseColorValue(color?: string): number | undefined {
        if (!color) {
            return undefined
        }

        const parsed = parseInt(color, 10)
        return Number.isFinite(parsed) ? parsed : undefined
    }
}
