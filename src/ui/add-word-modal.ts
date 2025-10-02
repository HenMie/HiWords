import { App, Modal, Notice, setIcon } from 'obsidian';
import type { VocabularyBook, WordDefinition } from '../utils';
import HiWordsPlugin from '../../main';
import { t } from '../i18n';

/**
 * 添加或编辑词汇的模态框
 */
export class AddWordModal extends Modal {
    private plugin: HiWordsPlugin;
    private word: string;
    private originalWord: string; // 用户原始选中的单词
    private isEditMode: boolean;
    private definition: WordDefinition | null;
    private isAnalyzing: boolean = false;
    
    // 静态变量，记住用户上次选择的生词本（重启后丢失）
    private static lastSelectedBookPath: string | null = null;

    /**
     * 构造函数
     * @param app Obsidian 应用实例
     * @param plugin 插件实例
     * @param word 要添加或编辑的单词
     * @param isEditMode 是否为编辑模式
     */
    constructor(app: App, plugin: HiWordsPlugin, word: string, isEditMode: boolean = false) {
        super(app);
        this.plugin = plugin;
        this.originalWord = word;
        this.word = word;
        this.isEditMode = isEditMode;
        
        // 如果是编辑模式，获取单词的定义
        if (isEditMode) {
            this.definition = this.plugin.vocabularyManager.getDefinition(word);
        } else {
            this.definition = null;
            // 如果不是编辑模式，尝试分析原型
            this.analyzeWordAsync();
        }
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        // 标题中包含词汇，根据模式显示不同标题
        const titleKey = this.isEditMode ? 'modals.edit_word_title' : 'modals.add_word_title';
        const titleEl = contentEl.createEl('h2', { text: `${t(titleKey)} "${this.word}"` });
        
        // 如果正在分析，显示加载指示器
        if (this.isAnalyzing) {
            const loadingEl = contentEl.createEl('div', { cls: 'loading-indicator' });
            loadingEl.createEl('span', { text: '正在分析单词...' });
        }
        // 如果分析完成且原始单词和当前单词不同，显示提示
        else if (!this.isEditMode && this.originalWord !== this.word) {
            const noteEl = contentEl.createEl('div', { cls: 'morphology-note' });
            const noteContent = noteEl.createEl('div', { cls: 'morphology-note-content' });
            
            noteContent.createEl('span', { 
                text: `原始单词："${this.originalWord}" → 识别为原型："${this.word}"`,
                cls: 'note-text'
            });
            
            // 添加还原按钮
            const restoreButton = noteContent.createEl('button', { 
                text: '还原',
                cls: 'morphology-restore-button'
            });
            
            restoreButton.onclick = () => {
                this.word = this.originalWord;
                this.refreshModal();
            };
        }
        
        // 单词输入框（允许用户修改）
        const wordInputContainer = contentEl.createDiv({ cls: 'form-item' });
        wordInputContainer.createEl('label', { text: '单词', cls: 'form-item-label' });
        const wordInput = wordInputContainer.createEl('input', { 
            type: 'text',
            value: this.word,
            cls: 'setting-item-input word-input'
        });
        
        // 监听单词输入变化
        wordInput.addEventListener('input', (e) => {
            const target = e.target as HTMLInputElement;
            this.word = target.value.trim();
            // 更新标题
            titleEl.textContent = `${t(titleKey)} "${this.word}"`;
        });
        
        // 生词本选择
        const bookSelectContainer = contentEl.createDiv({ cls: 'form-item' });
        bookSelectContainer.createEl('label', { text: t('modals.book_label'), cls: 'form-item-label' });
        
        const bookSelect = bookSelectContainer.createEl('select', { cls: 'dropdown' });
        bookSelect.createEl('option', { text: t('modals.select_book'), value: '' });
        
        const enabledBooks = this.plugin.settings.vocabularyBooks.filter(book => book.enabled);
        let defaultBookSelected = false;
        enabledBooks.forEach((book, index) => {
            const option = bookSelect.createEl('option', { text: book.name, value: book.path });
            
            // 如果是编辑模式且当前词汇来自此生词本，则选中该选项
            if (this.isEditMode && this.definition && this.definition.source === book.path) {
                option.selected = true;
                defaultBookSelected = true;
            }
            // 如果是添加模式，优先选择上次使用的生词本
            else if (!this.isEditMode && !defaultBookSelected) {
                // 优先选择上次使用的生词本
                if (AddWordModal.lastSelectedBookPath && book.path === AddWordModal.lastSelectedBookPath) {
                    option.selected = true;
                    defaultBookSelected = true;
                }
                // 如果没有缓存或缓存的生词本不可用，选择第一个
                else if (!AddWordModal.lastSelectedBookPath && index === 0) {
                    option.selected = true;
                    defaultBookSelected = true;
                }
            }
        });
        
        // 如果是编辑模式，禁用生词本选择（不允许更改词汇所在的生词本）
        if (this.isEditMode && this.definition) {
            bookSelect.disabled = true;
        }

        // 颜色选择
        const colorSelectContainer = contentEl.createDiv({ cls: 'form-item' });
        colorSelectContainer.createEl('label', { text: t('modals.color_label'), cls: 'form-item-label' });
        
        const colorSelect = colorSelectContainer.createEl('select', { cls: 'dropdown setting-item-select' });
        colorSelect.createEl('option', { text: t('modals.color_gray'), value: '' });
        
        // Canvas 支持的颜色
        const colors = [
            { name: t('modals.color_red'), value: '1' },
            { name: t('modals.color_orange'), value: '2' },
            { name: t('modals.color_yellow'), value: '3' },
            { name: t('modals.color_green'), value: '4' },
            { name: t('modals.color_blue'), value: '5' },
            { name: t('modals.color_purple'), value: '6' }
        ];
        
        colors.forEach(color => {
            const option = colorSelect.createEl('option', { text: color.name, value: color.value });
            
            // 如果是编辑模式且当前词汇使用此颜色，则选中该选项
            if (this.isEditMode && this.definition && this.definition.color === color.value) {
                option.selected = true;
            }
        });
        
        // 词源输入（可选）
        const etymologyContainer = contentEl.createDiv({ cls: 'form-item' });
        etymologyContainer.createEl('label', { text: '词源（可选）', cls: 'form-item-label' });
        
        const etymologyInput = etymologyContainer.createEl('input', { 
            type: 'text',
            placeholder: '例如：[所屬社] 或 [宣言-]',
            cls: 'setting-item-input etymology-input'
        });
        
        // 如果是编辑模式且当前词汇有词源，则预填充词源
        if (this.isEditMode && this.definition && this.definition.etymology) {
            etymologyInput.value = this.definition.etymology;
        }
        
        // 定义输入
        const definitionContainer = contentEl.createDiv({ cls: 'form-item' });
        definitionContainer.createEl('label', { text: t('modals.definition_label'), cls: 'form-item-label' });
        
        const definitionInput = definitionContainer.createEl('textarea', { 
            placeholder: t('modals.definition_placeholder'),
            cls: 'setting-item-input word-definition-input'
        });
        definitionInput.rows = 5;
        
        // 如果是编辑模式且当前词汇有定义，则预填充定义
        if (this.isEditMode && this.definition && this.definition.definition) {
            definitionInput.value = this.definition.definition;
        }
        
        // 按钮
        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
        
        // 创建左侧容器（用于删除按钮或占位）
        const leftButtonGroup = buttonContainer.createDiv({ cls: 'button-group-left' });
        
        // 在编辑模式下添加删除按钮（左侧）
        if (this.isEditMode && this.definition) {
            const deleteButton = leftButtonGroup.createEl('button', { 
                cls: 'delete-word-button',
            });
            // 使用 Obsidian 的 setIcon 方法
            setIcon(deleteButton, 'trash');
            deleteButton.onclick = async () => {
                // 确认删除
                const confirmed = await this.showDeleteConfirmation();
                if (!confirmed) return;
                
                // 显示删除中提示
                const loadingNotice = new Notice(t('notices.deleting_word'), 0);
                
                try {
                    const success = await this.plugin.vocabularyManager.deleteWordFromCanvas(
                        this.definition!.source, 
                        this.definition!.nodeId
                    );
                    
                    loadingNotice.hide();
                    
                    if (success) {
                        new Notice(t('notices.word_deleted'));
                        // 刷新高亮
                        this.plugin.refreshHighlighter();
                        this.close();
                    } else {
                        new Notice(t('notices.delete_word_failed'));
                    }
                } catch (error) {
                    loadingNotice.hide();
                    console.error('删除词汇时发生错误:', error);
                    new Notice(t('notices.error_deleting_word'));
                }
            };
        }
        
        // 创建右侧按钮组
        const rightButtonGroup = buttonContainer.createDiv({ cls: 'button-group-right' });
        
        const cancelButton = rightButtonGroup.createEl('button', { text: t('modals.cancel_button') });
        cancelButton.onclick = () => this.close();
        
        // 根据模式显示不同的按钮文本
        const buttonTextKey = this.isEditMode ? 'modals.save_button' : 'modals.add_button';
        const actionButton = rightButtonGroup.createEl('button', { text: t(buttonTextKey), cls: 'mod-cta' });
        actionButton.onclick = async () => {
            const selectedBook = bookSelect.value;
            const definition = definitionInput.value;
            const etymology = etymologyInput.value.trim() || undefined;
            const colorValue = colorSelect.value ? parseInt(colorSelect.value) : undefined;
            
            // 验证单词不为空
            if (!this.word.trim()) {
                new Notice('单词不能为空');
                return;
            }
            
            if (!selectedBook) {
                new Notice(t('notices.select_book_required'));
                return;
            }
            
            // 显示加载中提示
            const loadingNotice = this.isEditMode ? 
                new Notice(t('notices.updating_word'), 0) : 
                new Notice(t('notices.adding_word'), 0);
            
            try {
                let success = false;
                
                if (this.isEditMode && this.definition) {
                    // 编辑模式：调用更新词汇的方法
                    
                    success = await this.plugin.vocabularyManager.updateWordInCanvas(
                        this.definition.source,
                        this.definition.nodeId,
                        this.word,
                        definition,
                        colorValue,
                        etymology
                    );
                    
                    // 关闭加载提示
                    loadingNotice.hide();
                    
                    if (success) {
                        // 使用格式化字符串替换
                        const successMessage = t('notices.word_updated_success').replace('{0}', this.word);
                        new Notice(successMessage);
                        // 刷新高亮器
                        this.plugin.refreshHighlighter();
                        this.close();
                    } else {
                        new Notice(t('notices.update_word_failed'));
                    }
                } else {
                    // 添加模式：调用添加词汇到 Canvas 的方法
                    success = await this.plugin.vocabularyManager.addWordToCanvas(
                        selectedBook,
                        this.word,
                        definition,
                        colorValue,
                        etymology
                    );
                    
                    // 关闭加载提示
                    loadingNotice.hide();
                    
                    if (success) {
                        // 保存用户选择的生词本到缓存
                        AddWordModal.lastSelectedBookPath = selectedBook;
                        // 使用格式化字符串替换
                        const successMessage = t('notices.word_added_success').replace('{0}', this.word);
                        new Notice(successMessage);
                        // 刷新高亮器
                        this.plugin.refreshHighlighter();
                        this.close();
                    } else {
                        new Notice(t('notices.add_word_failed'));
                    }
                }
            } catch (error) {
                loadingNotice.hide();
                console.error('Failed to add/update word:', error);
                new Notice(t('notices.error_processing_word'));
            }
        };
    }

    /**
     * 显示删除确认对话框
     * @returns Promise<boolean> 用户是否确认删除
     */
    private async showDeleteConfirmation(): Promise<boolean> {
        // 使用原生的 confirm 对话框，更简洁且符合 Obsidian 的设计原则
        return window.confirm(t('modals.delete_confirmation').replace('{0}', this.word));
    }
    
    /**
     * 检查字符串是否包含韩语字符
     */
    private isKoreanText(text: string): boolean {
        // 韩语字符范围：한글 음절 (AC00–D7AF), 한글 자모 (1100–11FF, A960–A97F, D7B0–D7FF)
        const koreanRegex = /[\uAC00-\uD7AF\u1100-\u11FF\uA960-\uA97F\uD7B0-\uD7FF]/;
        return koreanRegex.test(text);
    }

    /**
     * 异步分析单词，获取原型
     */
    private async analyzeWordAsync(): Promise<void> {
        if (this.isEditMode) {
            return; // 编辑模式不需要分析
        }
        
        this.isAnalyzing = true;

        try {
            const baseForm = await this.plugin.vocabularyManager.analyzeWordToBaseForm(this.originalWord);

            // 检查分析结果是否合理
            // 如果原始单词是韩语，但分析结果不是韩语（如 "*"），则使用原始单词
            if (this.isKoreanText(this.originalWord) && (!baseForm || !this.isKoreanText(baseForm))) {
                this.word = this.originalWord;
            } else if (baseForm && baseForm !== this.originalWord) {
                this.word = baseForm;
            } else {
                // 即使分析结果相同，也要确保使用分析结果（可能去除了语尾）
                if (baseForm) {
                    this.word = baseForm;
                }
            }
        } catch (error) {
            console.error('分析单词失败:', error);
            // 分析失败时使用原始单词
            this.word = this.originalWord;
        } finally {
            // 先设置分析完成状态，再刷新UI
            this.isAnalyzing = false;

            // 无论分析结果如何，都要刷新模态框以移除"正在分析"状态
            this.refreshModal();
        }
    }
    
    /**
     * 刷新模态框显示
     */
    private refreshModal(): void {
        if (this.contentEl) {
            this.contentEl.empty();
            this.onOpen();
        }
    }
    
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
