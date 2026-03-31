import { ButtonComponent, Modal, Setting } from 'obsidian'
import type { App } from 'obsidian'
import type HiWordsPlugin from '../../main'
import { t } from '../i18n'
import {
    ARTICLE_VOCABULARY_EXPORT_FIELDS,
    ARTICLE_VOCABULARY_EXPORT_FIELD_LABEL_KEYS,
    ARTICLE_VOCABULARY_EXPORT_ORDER_LABEL_KEYS,
    getDefaultArticleVocabularyExportConfig,
    type ArticleVocabularyExportConfig,
    type ArticleVocabularyExportField,
    type ArticleVocabularySnapshot
} from '../utils'
import { FolderPickerModal } from './folder-picker-modal'

interface ExportVocabularyModalOptions {
    app: App
    plugin: HiWordsPlugin
    snapshot: ArticleVocabularySnapshot
    onSubmit: (config: ArticleVocabularyExportConfig) => Promise<void>
}

export class ExportVocabularyModal extends Modal {
    private snapshot: ArticleVocabularySnapshot
    private onSubmitAction: (config: ArticleVocabularyExportConfig) => Promise<void>
    private selectedFields: Set<ArticleVocabularyExportField>
    private selectedOrder: ArticleVocabularyExportConfig['order']
    private selectedFolderPath: string | null = null
    private folderValueEl: HTMLElement | null = null
    private validationEl: HTMLElement | null = null
    private submitButton: ButtonComponent | null = null

    constructor(options: ExportVocabularyModalOptions) {
        super(options.app)
        this.snapshot = options.snapshot
        this.onSubmitAction = options.onSubmit
        const defaults = getDefaultArticleVocabularyExportConfig(options.plugin.settings)
        this.selectedFields = new Set(defaults.fields)
        this.selectedOrder = defaults.order
    }

    onOpen(): void {
        this.render()
    }

    onClose(): void {
        this.contentEl.empty()
    }

    private render(): void {
        const { contentEl } = this
        contentEl.empty()
        contentEl.addClass('hiwords-modal-shell', 'hiwords-export-modal')

        contentEl.createEl('h2', {
            cls: 'hiwords-modal-title',
            text: t('modals.export_vocabulary_title') || 'Export current article vocabulary'
        })
        contentEl.createEl('p', {
            cls: 'hiwords-modal-helper',
            text: t('modals.export_vocabulary_helper') || 'Choose the columns, order, and vault folder for this CSV export.'
        })

        const summary = contentEl.createDiv({ cls: 'hiwords-export-summary' })
        summary.createEl('div', {
            cls: 'hiwords-export-summary-item',
            text: `${t('modals.export_document_label') || 'Document'}: ${this.snapshot.fileName}`
        })
        summary.createEl('div', {
            cls: 'hiwords-export-summary-item',
            text: `${t('modals.export_word_count_label') || 'Words'}: ${this.snapshot.words.length}`
        })

        new Setting(contentEl)
            .setName(t('modals.export_order_label') || 'Order')
            .setDesc(t('settings.export_order_default_desc') || 'Pre-fill the export modal with the selected order')
            .addDropdown((dropdown) => dropdown
                .addOption('document', t(ARTICLE_VOCABULARY_EXPORT_ORDER_LABEL_KEYS.document) || 'Document order')
                .addOption('alphabetical', t(ARTICLE_VOCABULARY_EXPORT_ORDER_LABEL_KEYS.alphabetical) || 'Alphabetical')
                .setValue(this.selectedOrder)
                .onChange((value) => {
                    this.selectedOrder = value as ArticleVocabularyExportConfig['order']
                }))

        const fieldsSection = contentEl.createDiv({ cls: 'hiwords-export-fields-section' })
        fieldsSection.createEl('div', {
            cls: 'hiwords-form-item-label',
            text: t('modals.export_fields_label') || 'Fields'
        })
        const fieldsGrid = fieldsSection.createDiv({ cls: 'hiwords-export-fields-grid' })
        ARTICLE_VOCABULARY_EXPORT_FIELDS.forEach((field) => {
            const label = fieldsGrid.createEl('label', { cls: 'hiwords-export-field-option' })
            const checkbox = label.createEl('input', { attr: { type: 'checkbox' } })
            checkbox.checked = this.selectedFields.has(field)
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    this.selectedFields.add(field)
                } else {
                    this.selectedFields.delete(field)
                }
            })
            label.createEl('span', {
                text: t(ARTICLE_VOCABULARY_EXPORT_FIELD_LABEL_KEYS[field]) || field
            })
        })

        const folderSetting = new Setting(contentEl)
            .setName(t('modals.export_folder_label') || 'Target folder')
            .setDesc(t('modals.export_folder_placeholder') || 'Select a vault folder')

        this.folderValueEl = folderSetting.controlEl.createDiv({ cls: 'hiwords-export-folder-value is-empty' })
        this.folderValueEl.textContent = t('modals.export_folder_placeholder') || 'Select a vault folder'

        folderSetting.addButton((button) => button
            .setButtonText(t('modals.export_select_folder') || 'Choose folder')
            .onClick(() => {
                new FolderPickerModal(this.app, (folderPath) => {
                    this.selectedFolderPath = folderPath
                    this.updateFolderValue()
                }).open()
            }))

        this.validationEl = contentEl.createDiv({ cls: 'hiwords-form-error hiwords-export-validation' })
        this.validationEl.hide()

        const buttonBar = contentEl.createDiv({ cls: 'hiwords-modal-button-container' })
        const leftGroup = buttonBar.createDiv({ cls: 'hiwords-button-group-left' })
        const rightGroup = buttonBar.createDiv({ cls: 'hiwords-button-group-right' })

        const cancelButton = new ButtonComponent(leftGroup)
        cancelButton.setButtonText(t('modals.cancel_button') || 'Cancel')
        cancelButton.onClick(() => this.close())

        this.submitButton = new ButtonComponent(rightGroup)
        this.submitButton.setButtonText(t('modals.export_submit_button') || 'Export CSV')
        this.submitButton.setCta()
        this.submitButton.onClick(() => {
            void this.handleSubmit()
        })
    }

    private updateFolderValue(): void {
        if (!this.folderValueEl) {
            return
        }

        const hasSelection = this.selectedFolderPath !== null
        this.folderValueEl.textContent = hasSelection
            ? this.getFolderDisplayValue(this.selectedFolderPath)
            : t('modals.export_folder_placeholder') || 'Select a vault folder'
        this.folderValueEl.toggleClass('is-empty', !hasSelection)
    }

    private getFolderDisplayValue(folderPath: string | null): string {
        if (folderPath === null) {
            return t('modals.export_folder_placeholder') || 'Select a vault folder'
        }

        return folderPath.trim().length > 0 ? folderPath : '/'
    }

    private async handleSubmit(): Promise<void> {
        if (this.selectedFields.size === 0) {
            this.showValidation(t('notices.export_fields_required') || 'Select at least one export field.')
            return
        }

        if (this.selectedFolderPath === null) {
            this.showValidation(t('notices.export_folder_required') || 'Select a vault folder before exporting.')
            return
        }

        this.showValidation('')
        this.setSubmitting(true)
        try {
            await this.onSubmitAction({
                fields: ARTICLE_VOCABULARY_EXPORT_FIELDS.filter((field) => this.selectedFields.has(field)),
                order: this.selectedOrder,
                folderPath: this.selectedFolderPath
            })
            this.close()
        } catch (error) {
            console.error('[HiWords] Export submit failed:', error)
        } finally {
            this.setSubmitting(false)
        }
    }

    private setSubmitting(isSubmitting: boolean): void {
        this.submitButton?.setDisabled(isSubmitting)
    }

    private showValidation(message: string): void {
        if (!this.validationEl) {
            return
        }

        if (!message) {
            this.validationEl.empty()
            this.validationEl.hide()
            return
        }

        this.validationEl.textContent = message
        this.validationEl.show()
    }
}
