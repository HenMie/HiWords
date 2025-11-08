import { App, Modal, Notice, setIcon } from 'obsidian';
import type { VocabularyBook, WordDefinition } from '../utils';
import { isKoreanText } from '../utils/korean-text-utils';
import HiWordsPlugin from '../../main';
import { t } from '../i18n';
import { DictionaryService } from '../services/dictionary-service';

/**
 * 添加或编辑词汇的模态框
 */
export class AddWordModal extends Modal {
    private plugin: HiWordsPlugin;
    private word: string;
    private originalWord: string;
    private sentence: string;
    private isEditMode: boolean;
    private definition: WordDefinition | null;
    private dictionaryService: DictionaryService | null;
    private isAnalyzing = false;

    // 静态变量，记住用户上次选择的生词本（重启后丢失）
    private static lastSelectedBookPath: string | null = null;

    constructor(app: App, plugin: HiWordsPlugin, word: string, sentence: string = '', isEditMode: boolean = false) {
        super(app);
        this.plugin = plugin;
        this.originalWord = word;
        this.word = word;
        this.sentence = sentence;
        this.isEditMode = isEditMode;
        this.definition = isEditMode ? this.plugin.vocabularyManager.getDefinition(word) : null;
        this.dictionaryService = plugin.settings.aiDictionary
            ? new DictionaryService(plugin.settings.aiDictionary)
            : null;

        if (!isEditMode) {
            void this.analyzeWordAsync();
        }
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        const titleKey = this.isEditMode ? 'modals.edit_word_title' : 'modals.add_word_title';
        const titleEl = contentEl.createEl('h2', { text: `${t(titleKey)} "${this.word}"` });

        if (this.isAnalyzing) {
            const loadingEl = contentEl.createEl('div', { cls: 'loading-indicator' });
            loadingEl.createEl('span', { text: t('notices.analyzing_word') || '正在分析单词...' });
        } else if (!this.isEditMode && this.originalWord !== this.word) {
            const noteEl = contentEl.createEl('div', { cls: 'morphology-note' });
            const noteContent = noteEl.createEl('div', { cls: 'morphology-note-content' });
            noteContent.createEl('span', {
                text: `${t('notices.morphology_detected') || '原始单词'}："${this.originalWord}" → ${t('notices.normalized_to') || '识别为原型'}："${this.word}"`,
                cls: 'note-text'
            });
            const restoreButton = noteContent.createEl('button', {
                text: t('actions.restore') || '还原',
                cls: 'morphology-restore-button'
            });
            restoreButton.onclick = () => {
                this.word = this.originalWord;
                this.refreshModal();
            };
        }

        let wordInput: HTMLInputElement | null = null;
        if (!this.isEditMode) {
            const wordContainer = contentEl.createDiv({ cls: 'hiwords-form-item' });
            wordContainer.createEl('label', { text: t('modals.word_label'), cls: 'hiwords-form-item-label' });
            wordInput = wordContainer.createEl('input', {
                type: 'text',
                value: this.word,
                cls: 'setting-item-input word-input',
                placeholder: t('modals.word_placeholder')
            });
            wordInput.addEventListener('input', (event) => {
                const target = event.target as HTMLInputElement;
                this.word = target.value.trim();
                titleEl.textContent = `${t(titleKey)} "${this.word}"`;
            });
            if (!this.word) {
                setTimeout(() => wordInput?.focus(), 50);
            }
        }

        const bookSelectContainer = contentEl.createDiv({ cls: 'hiwords-form-item' });
        bookSelectContainer.createEl('label', { text: t('modals.book_label'), cls: 'hiwords-form-item-label' });
        const bookSelect = bookSelectContainer.createEl('select', { cls: 'dropdown' });
        bookSelect.createEl('option', { text: t('modals.select_book'), value: '' });

        const enabledBooks = this.plugin.settings.vocabularyBooks.filter((book) => book.enabled);
        let defaultBookSelected = false;
        enabledBooks.forEach((book, index) => {
            const option = bookSelect.createEl('option', { text: book.name, value: book.path });
            if (this.isEditMode && this.definition && this.definition.source === book.path) {
                option.selected = true;
                defaultBookSelected = true;
            } else if (!this.isEditMode && !defaultBookSelected) {
                if (AddWordModal.lastSelectedBookPath && AddWordModal.lastSelectedBookPath === book.path) {
                    option.selected = true;
                    defaultBookSelected = true;
                } else if (!AddWordModal.lastSelectedBookPath && index === 0) {
                    option.selected = true;
                    defaultBookSelected = true;
                }
            }
        });

        if (this.isEditMode && this.definition) {
            bookSelect.disabled = true;
        }

        const colorSelectContainer = contentEl.createDiv({ cls: 'hiwords-form-item' });
        colorSelectContainer.createEl('label', { text: t('modals.color_label'), cls: 'hiwords-form-item-label' });
        const colorSelect = colorSelectContainer.createEl('select', { cls: 'dropdown setting-item-select' });
        colorSelect.createEl('option', { text: t('modals.color_gray'), value: '' });
        [
            { name: t('modals.color_red'), value: '1' },
            { name: t('modals.color_orange'), value: '2' },
            { name: t('modals.color_yellow'), value: '3' },
            { name: t('modals.color_green'), value: '4' },
            { name: t('modals.color_blue'), value: '5' },
            { name: t('modals.color_purple'), value: '6' }
        ].forEach((color) => {
            const option = colorSelect.createEl('option', { text: color.name, value: color.value });
            if (this.isEditMode && this.definition?.color === color.value) {
                option.selected = true;
            }
        });

        const etymologyContainer = contentEl.createDiv({ cls: 'hiwords-form-item' });
        etymologyContainer.createEl('label', { text: t('modals.etymology_label') || '词源（可选）', cls: 'hiwords-form-item-label' });
        const etymologyInput = etymologyContainer.createEl('input', {
            type: 'text',
            placeholder: t('modals.etymology_placeholder') || '例如：[所屬社] 或 [宣言-]',
            cls: 'setting-item-input etymology-input'
        });
        if (this.isEditMode && this.definition?.etymology) {
            etymologyInput.value = this.definition.etymology;
        }

        const definitionContainer = contentEl.createDiv({ cls: 'hiwords-form-item' });
        const definitionLabelContainer = definitionContainer.createDiv({ cls: 'hiwords-definition-label-container' });
        definitionLabelContainer.createEl('label', { text: t('modals.definition_label'), cls: 'hiwords-form-item-label' });

        const autoFillBtn = definitionLabelContainer.createDiv({ cls: 'hiwords-auto-fill-btn' });
        autoFillBtn.setAttribute('aria-label', t('modals.auto_fill_definition'));
        const iconContainer = autoFillBtn.createDiv({ cls: 'hiwords-auto-fill-icon' });
        setIcon(iconContainer, 'sparkles');

        autoFillBtn.addEventListener('click', async () => {
            const queryWord = this.isEditMode ? this.word : wordInput?.value.trim() || '';
            if (!queryWord) {
                new Notice(t('notices.enter_word_first') || '请先输入单词');
                return;
            }
            if (!this.dictionaryService) {
                new Notice(t('notices.ai_config_required') || '请先在设置中配置 AI 词典');
                return;
            }
            autoFillBtn.addClass('hiwords-loading');
            iconContainer.empty();
            setIcon(iconContainer, 'loader');
            try {
                const result = await this.dictionaryService.fetchDefinition(queryWord, this.sentence);
                definitionInput.value = result;
                new Notice(t('notices.definition_fetched') || '已获取释义');
            } catch (error) {
                console.error('Failed to fetch definition from AI:', error);
                new Notice(t('notices.definition_fetch_failed') || '获取释义失败');
            } finally {
                autoFillBtn.removeClass('hiwords-loading');
                iconContainer.empty();
                setIcon(iconContainer, 'sparkles');
            }
        });

        const definitionInput = definitionContainer.createEl('textarea', {
            placeholder: t('modals.definition_placeholder'),
            cls: 'setting-item-input hiwords-word-definition-input'
        });
        definitionInput.rows = 5;
        if (this.isEditMode && this.definition?.definition) {
            definitionInput.value = this.definition.definition;
        }

        setTimeout(() => {
            if (this.isEditMode) {
                definitionInput.focus();
            } else if (this.word) {
                definitionInput.focus();
            }
        }, 50);

        const buttonContainer = contentEl.createDiv({ cls: 'hiwords-modal-button-container' });
        const leftButtonGroup = buttonContainer.createDiv({ cls: 'hiwords-button-group-left' });

        if (this.isEditMode && this.definition) {
            const deleteButton = leftButtonGroup.createEl('button', { cls: 'delete-word-button' });
            setIcon(deleteButton, 'trash');
            deleteButton.onclick = async () => {
                const confirmed = await this.showDeleteConfirmation();
                if (!confirmed) return;
                const loadingNotice = new Notice(t('notices.deleting_word'), 0);
                try {
                    const success = await this.plugin.vocabularyManager.deleteWordFromCanvas(
                        this.definition!.source,
                        this.definition!.nodeId
                    );
                    loadingNotice.hide();
                    if (success) {
                        new Notice(t('notices.word_deleted'));
                        this.plugin.refreshHighlighter();
                        this.close();
                    } else {
                        new Notice(t('notices.delete_word_failed'));
                    }
                } catch (error) {
                    loadingNotice.hide();
                    console.error('删除词汇失败:', error);
                    new Notice(t('notices.error_deleting_word'));
                }
            };
        }

        const rightButtonGroup = buttonContainer.createDiv({ cls: 'hiwords-button-group-right' });
        const cancelButton = rightButtonGroup.createEl('button', { text: t('modals.cancel_button') });
        cancelButton.onclick = () => this.close();

        const actionKey = this.isEditMode ? 'modals.save_button' : 'modals.add_button';
        const actionButton = rightButtonGroup.createEl('button', { text: t(actionKey), cls: 'mod-cta' });
        actionButton.onclick = async () => {
            const selectedBook = bookSelect.value;
            const colorValue = colorSelect.value ? parseInt(colorSelect.value, 10) : undefined;
            const etymology = etymologyInput.value.trim() || undefined;

            let finalWord = this.word.trim();
            if (!this.isEditMode && wordInput) {
                finalWord = wordInput.value.trim();
            }

            if (!finalWord) {
                new Notice(t('notices.word_required') || '单词不能为空');
                if (!this.isEditMode) {
                    wordInput?.focus();
                }
                return;
            }

            if (!selectedBook) {
                new Notice(t('notices.select_book_required'));
                return;
            }

            const loadingNotice = this.isEditMode
                ? new Notice(t('notices.updating_word'), 0)
                : new Notice(t('notices.adding_word'), 0);

            try {
                let success = false;
                const definition = definitionInput.value;

                if (this.isEditMode && this.definition) {
                    success = await this.plugin.vocabularyManager.updateWordInCanvas(
                        this.definition.source,
                        this.definition.nodeId,
                        finalWord,
                        definition,
                        colorValue,
                        etymology
                    );
                } else {
                    success = await this.plugin.vocabularyManager.addWordToCanvas(
                        selectedBook,
                        finalWord,
                        definition,
                        colorValue,
                        etymology
                    );
                }

                loadingNotice.hide();

                if (success) {
                    if (!this.isEditMode) {
                        AddWordModal.lastSelectedBookPath = selectedBook;
                        const successMessage = t('notices.word_added_success').replace('{0}', finalWord);
                        new Notice(successMessage);
                    } else {
                        const successMessage = t('notices.word_updated_success').replace('{0}', finalWord);
                        new Notice(successMessage);
                    }
                    this.plugin.refreshHighlighter();
                    this.close();
                } else {
                    new Notice(this.isEditMode ? t('notices.update_word_failed') : t('notices.add_word_failed'));
                }
            } catch (error) {
                loadingNotice.hide();
                console.error('Processing word failed:', error);
                new Notice(t('notices.error_processing_word'));
            }
        };
    }

    private async showDeleteConfirmation(): Promise<boolean> {
        return window.confirm(t('modals.delete_confirmation').replace('{0}', this.word));
    }

    private async analyzeWordAsync(): Promise<void> {
        if (this.isEditMode) return;
        this.isAnalyzing = true;
        try {
            const baseForm = await this.plugin.vocabularyManager.analyzeWordToBaseForm(this.originalWord);
            if (isKoreanText(this.originalWord) && (!baseForm || !isKoreanText(baseForm))) {
                this.word = this.originalWord;
            } else if (baseForm && baseForm.length > 0) {
                this.word = baseForm;
            } else {
                this.word = this.originalWord;
            }
        } catch (error) {
            console.error('Analyze word failed:', error);
            this.word = this.originalWord;
        } finally {
            this.isAnalyzing = false;
            this.refreshModal();
        }
    }

    private refreshModal(): void {
        if (this.contentEl) {
            this.contentEl.empty();
            this.onOpen();
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
