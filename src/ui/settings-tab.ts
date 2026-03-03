import { App, PluginSettingTab, Setting, TFile, Notice, Modal, ButtonComponent } from 'obsidian';
import HiWordsPlugin from '../../main';
import { VocabularyBook, HighlightStyle, MasteredDetectionMode, FileNodeParseMode, MorphologyLanguage } from '../utils';
import type { MorphologyEngineMode, MorphologyFallbackMode } from '../utils';
import { CanvasParser } from '../canvas';
import { t } from '../i18n';
import type { MorphologyAssetLanguage } from '../core';

export class HiWordsSettingTab extends PluginSettingTab {
    plugin: HiWordsPlugin;

    constructor(app: App, plugin: HiWordsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /**
     * 添加自动布局设置
     */
    private addAutoLayoutSettings() {
        const { containerEl } = this;

        new Setting(containerEl)
            .setName(t('settings.auto_layout'))
            .setHeading();

        // 启用自动布局
        new Setting(containerEl)
            .setName(t('settings.enable_auto_layout'))
            .setDesc(t('settings.enable_auto_layout_desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoLayoutEnabled ?? true)
                .onChange(async (value) => {
                    this.plugin.settings.autoLayoutEnabled = value;
                    await this.plugin.saveSettings();
                }));

        // 左侧区域卡片尺寸
        const sizeSetting = new Setting(containerEl)
            .setName(t('settings.card_size'))
            .setDesc(t('settings.card_size_desc'));
        sizeSetting.addText(text => text
            .setPlaceholder('width')
            .setValue(String(this.plugin.settings.cardWidth ?? 260))
            .onChange(async (val) => {
                const num = parseInt(val, 10);
                if (!isNaN(num) && num > 60) {
                    this.plugin.settings.cardWidth = num;
                    await this.plugin.saveSettings();
                }
            }));
        sizeSetting.addText(text => text
            .setPlaceholder('height')
            .setValue(String(this.plugin.settings.cardHeight ?? 120))
            .onChange(async (val) => {
                const num = parseInt(val, 10);
                if (!isNaN(num) && num > 40) {
                    this.plugin.settings.cardHeight = num;
                    await this.plugin.saveSettings();
                }
            }));

        // 网格间距
        const gapSetting = new Setting(containerEl)
            .setName(t('settings.grid_gaps'))
            .setDesc(t('settings.grid_gaps_desc'));
        gapSetting.addText(text => text
            .setPlaceholder('horizontal')
            .setValue(String(this.plugin.settings.horizontalGap ?? 24))
            .onChange(async (val) => {
                const num = parseInt(val, 10);
                if (!isNaN(num) && num >= 0) {
                    this.plugin.settings.horizontalGap = num;
                    await this.plugin.saveSettings();
                }
            }));
        gapSetting.addText(text => text
            .setPlaceholder('vertical')
            .setValue(String(this.plugin.settings.verticalGap ?? 16))
            .onChange(async (val) => {
                const num = parseInt(val, 10);
                if (!isNaN(num) && num >= 0) {
                    this.plugin.settings.verticalGap = num;
                    await this.plugin.saveSettings();
                }
            }));

        // 左侧留白与最小X
        const padSetting = new Setting(containerEl)
            .setName(t('settings.left_padding'))
            .setDesc(t('settings.left_padding_desc'));
        padSetting.addText(text => text
            .setPlaceholder('leftPadding')
            .setValue(String(this.plugin.settings.leftPadding ?? 24))
            .onChange(async (val) => {
                const num = parseInt(val, 10);
                if (!isNaN(num) && num >= 0) {
                    this.plugin.settings.leftPadding = num;
                    await this.plugin.saveSettings();
                }
            }));
        padSetting.addText(text => text
            .setPlaceholder('minLeftX')
            .setValue(String(this.plugin.settings.minLeftX ?? 0))
            .onChange(async (val) => {
                const num = parseInt(val, 10);
                if (!isNaN(num)) {
                    this.plugin.settings.minLeftX = num;
                    await this.plugin.saveSettings();
                }
            }));

        // 列数设置
        new Setting(containerEl)
            .setName(t('settings.columns_auto'))
            .setDesc(t('settings.columns_auto_desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.columnsAuto ?? true)
                .onChange(async (value) => {
                    this.plugin.settings.columnsAuto = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));

        if (!(this.plugin.settings.columnsAuto ?? true)) {
            const colSetting = new Setting(containerEl)
                .setName(t('settings.columns'))
                .setDesc(t('settings.columns_desc'));
            colSetting.addText(text => text
                .setPlaceholder('columns')
                .setValue(String(this.plugin.settings.columns ?? 3))
                .onChange(async (val) => {
                    const num = parseInt(val, 10);
                    if (!isNaN(num) && num > 0) {
                        this.plugin.settings.columns = num;
                        await this.plugin.saveSettings();
                    }
                }));
            colSetting.addText(text => text
                .setPlaceholder('maxColumns')
                .setValue(String(this.plugin.settings.maxColumns ?? 6))
                .onChange(async (val) => {
                    const num = parseInt(val, 10);
                    if (!isNaN(num) && num > 0) {
                        this.plugin.settings.maxColumns = num;
                        await this.plugin.saveSettings();
                    }
                }));
        }

        // 分组内布局
        const innerSetting = new Setting(containerEl)
            .setName(t('settings.group_inner_layout'))
            .setDesc(t('settings.group_inner_layout_desc'));
        innerSetting.addText(text => text
            .setPlaceholder('innerPadding')
            .setValue(String(this.plugin.settings.groupInnerPadding ?? 24))
            .onChange(async (val) => {
                const num = parseInt(val, 10);
                if (!isNaN(num) && num >= 0) {
                    this.plugin.settings.groupInnerPadding = num;
                    await this.plugin.saveSettings();
                }
            }));
        innerSetting.addText(text => text
            .setPlaceholder('innerGap')
            .setValue(String(this.plugin.settings.groupInnerGap ?? 12))
            .onChange(async (val) => {
                const num = parseInt(val, 10);
                if (!isNaN(num) && num >= 0) {
                    this.plugin.settings.groupInnerGap = num;
                    await this.plugin.saveSettings();
                }
            }));
        innerSetting.addText(text => text
            .setPlaceholder('innerColumns')
            .setValue(String(this.plugin.settings.groupInnerColumns ?? 2))
            .onChange(async (val) => {
                const num = parseInt(val, 10);
                if (!isNaN(num) && num > 0) {
                    this.plugin.settings.groupInnerColumns = num;
                    await this.plugin.saveSettings();
                }
            }));

    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        this.addVocabularyBooksSection();
        this.addFileNodeParseModeSettings();
        this.addHighlightingSection();
        this.addMorphologyAssetSection();
        this.addLearningFeaturesSection();
        this.addAutoLayoutSettings();
    }

    private addMorphologyAssetSection(): void {
        const { containerEl } = this;

        new Setting(containerEl)
            .setName(t('settings.morphology_assets') || 'Morphology assets')
            .setDesc(t('settings.morphology_assets_desc') || 'Download or delete morphology resources on demand')
            .setHeading();

        this.addMorphologyAssetItem('korean');
        this.addMorphologyAssetItem('japanese');
    }

    private addMorphologyAssetItem(language: MorphologyAssetLanguage): void {
        const { containerEl } = this;
        const languageLabel = this.getMorphologyLanguageLabel(language);
        const setting = new Setting(containerEl)
            .setName(languageLabel)
            .setDesc(t('settings.morphology_asset_status_loading') || 'Checking resource status...');

        let downloadButton: ButtonComponent | null = null;
        let deleteButton: ButtonComponent | null = null;
        let actionInProgress = false;

        const refreshState = async (): Promise<void> => {
            const state = await this.plugin.getMorphologyAssetState(language);
            setting.setDesc(this.formatMorphologyAssetStatus(state.downloaded, state.byteLength, state.isDownloading || actionInProgress));
            downloadButton?.setDisabled(state.downloaded || state.isDownloading || actionInProgress);
            deleteButton?.setDisabled(!state.downloaded || state.isDownloading || actionInProgress);
        };

        setting.addButton(button => {
            downloadButton = button;
            button.setButtonText(t('settings.morphology_asset_download') || 'Download');
            button.onClick(async () => {
                await this.runMorphologyAssetAction(language, languageLabel, 'download', refreshState, (inProgress) => {
                    actionInProgress = inProgress;
                });
            });
            return button;
        });

        setting.addButton(button => {
            deleteButton = button;
            button.setButtonText(t('settings.morphology_asset_delete') || 'Delete');
            button.setWarning();
            button.onClick(async () => {
                await this.runMorphologyAssetAction(language, languageLabel, 'delete', refreshState, (inProgress) => {
                    actionInProgress = inProgress;
                });
            });
            return button;
        });

        void refreshState().catch(error => {
            console.error(`[HiWords] 获取 ${language} 形态学资源状态失败:`, error);
            setting.setDesc(t('settings.morphology_asset_status_missing') || 'Not downloaded');
        });
    }

    private async runMorphologyAssetAction(
        language: MorphologyAssetLanguage,
        languageLabel: string,
        action: 'download' | 'delete',
        refreshState: () => Promise<void>,
        setActionState: (inProgress: boolean) => void
    ): Promise<void> {
        setActionState(true);
        await refreshState();

        try {
            if (action === 'download') {
                await this.plugin.downloadMorphologyAsset(language);
                new Notice((t('notices.morphology_asset_downloaded') || '{0} morphology resource downloaded').replace('{0}', languageLabel));
            } else {
                await this.plugin.deleteMorphologyAsset(language);
                new Notice((t('notices.morphology_asset_deleted') || '{0} morphology resource deleted').replace('{0}', languageLabel));
            }
        } catch (error) {
            console.error(`[HiWords] ${action} ${language} 形态学资源失败:`, error);
            new Notice((t('notices.morphology_asset_operation_failed') || 'Failed to manage {0} morphology resource').replace('{0}', languageLabel));
        } finally {
            setActionState(false);
            await refreshState();
        }
    }

    private getMorphologyLanguageLabel(language: MorphologyAssetLanguage): string {
        if (language === 'korean') {
            return t('settings.morphology_korean') || 'Korean';
        }
        return t('settings.morphology_japanese') || 'Japanese';
    }

    private formatMorphologyAssetStatus(downloaded: boolean, byteLength: number, isDownloading: boolean): string {
        if (isDownloading) {
            return t('settings.morphology_asset_status_downloading') || 'Downloading...';
        }

        if (!downloaded) {
            return t('settings.morphology_asset_status_missing') || 'Not downloaded';
        }

        const size = this.formatByteSize(byteLength);
        return (t('settings.morphology_asset_status_downloaded') || 'Downloaded ({0})').replace('{0}', size);
    }

    private formatByteSize(bytes: number): string {
        if (bytes < 1024) {
            return `${bytes} B`;
        }
        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    /**
     * 添加基础设置
     */
    private addHighlightingSection() {
        const { containerEl } = this;

        // 启用自动高亮
        new Setting(containerEl)
            .setName(t('settings.enable_auto_highlight'))
            .setDesc(t('settings.enable_auto_highlight_desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableAutoHighlight)
                .onChange(async (value) => {
                    this.plugin.settings.enableAutoHighlight = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshHighlighter();
                }));

        // 浮动显示定义
        new Setting(containerEl)
            .setName(t('settings.show_definition_on_hover'))
            .setDesc(t('settings.show_definition_on_hover_desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showDefinitionOnHover)
                .onChange(async (value) => {
                    this.plugin.settings.showDefinitionOnHover = value;
                    await this.plugin.saveSettings();
                }));

        // 高亮样式选择
        new Setting(containerEl)
            .setName(t('settings.highlight_style'))
            .setDesc(t('settings.highlight_style_desc'))
            .addDropdown(dropdown => dropdown
                .addOption('underline', t('settings.style_underline'))
                .addOption('background', t('settings.style_background'))
                .addOption('bold', t('settings.style_bold'))
                .addOption('dotted', t('settings.style_dotted'))
                .addOption('wavy', t('settings.style_wavy'))
                .setValue(this.plugin.settings.highlightStyle)
                .onChange(async (value) => {
                    this.plugin.settings.highlightStyle = value as HighlightStyle;
                    await this.plugin.saveSettings();
                    this.plugin.refreshHighlighter();
                }));

        this.addHighlightScopeSettings();

        new Setting(containerEl)
            .setName('Morphology Engine')
            .setDesc('Hybrid uses inverse analysis as primary path; Legacy keeps aggressive generated inflections.')
            .addDropdown(dropdown => dropdown
                .addOption('hybrid', 'Hybrid (Recommended)')
                .addOption('legacy', 'Legacy')
                .setValue(this.plugin.settings.morphologyEngineMode || 'hybrid')
                .onChange(async (value) => {
                    this.plugin.settings.morphologyEngineMode = value as MorphologyEngineMode;
                    await this.plugin.saveSettings();
                    this.plugin.refreshHighlighter();
                }));

        new Setting(containerEl)
            .setName('Morphology Fallback')
            .setDesc('Conservative only generates inflections when analyzer is unavailable; Aggressive always generates.')
            .addDropdown(dropdown => dropdown
                .addOption('conservative', 'Conservative (Recommended)')
                .addOption('aggressive', 'Aggressive')
                .setValue(this.plugin.settings.morphologyFallbackMode || 'conservative')
                .onChange(async (value) => {
                    this.plugin.settings.morphologyFallbackMode = value as MorphologyFallbackMode;
                    await this.plugin.saveSettings();
                    this.plugin.refreshHighlighter();
                }));

        // 是否显示词书来源
        new Setting(containerEl)
            .setName(t('settings.show_word_source') || 'Show word source')
            .setDesc(t('settings.show_word_source_desc') || 'Display the vocabulary book name in tooltips and the sidebar')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showWordSource ?? true)
                .onChange(async (value) => {
                    this.plugin.settings.showWordSource = value;
                    await this.plugin.saveSettings();
                    this.plugin.app.workspace.trigger('hi-words:settings-changed');
                }));

    }

    private addHighlightScopeSettings() {
        const { containerEl } = this;

        new Setting(containerEl)
            .setName(t('settings.highlight_mode') || 'Highlight scope')
            .setDesc(t('settings.highlight_mode_desc') || 'Define how folders are included in highlighting')
            .addDropdown(dropdown => dropdown
                .addOption('all', t('settings.mode_all') || 'All notes')
                .addOption('exclude', t('settings.mode_exclude') || 'Exclude folders')
                .addOption('include', t('settings.mode_include') || 'Only specified folders')
                .setValue(this.plugin.settings.highlightMode || 'all')
                .onChange(async (value: 'all' | 'exclude' | 'include') => {
                    this.plugin.settings.highlightMode = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshHighlighter();
                }));

        new Setting(containerEl)
            .setName(t('settings.highlight_paths') || 'Folder list')
            .setDesc(t('settings.highlight_paths_desc') || 'Comma-separated folder list. Example: Archive, Templates, Private/Diary');

        const textAreaContainer = containerEl.createDiv({ cls: 'hi-words-textarea-container' });
        const textArea = textAreaContainer.createEl('textarea');
        textArea.placeholder = t('settings.highlight_paths_placeholder') || 'e.g.: Archive, Templates, Private/Diary';
        textArea.value = this.plugin.settings.highlightPaths || '';
        textArea.rows = 3;
        textArea.addEventListener('blur', async () => {
            this.plugin.settings.highlightPaths = textArea.value;
            await this.plugin.saveSettings();
            this.plugin.refreshHighlighter();
        });
    }

    private addFileNodeParseModeSettings() {
        const { containerEl } = this;

        new Setting(containerEl)
            .setName(t('settings.file_node_parse_mode') || 'File node parse mode')
            .setDesc(t('settings.file_node_parse_mode_desc') || 'Choose how file nodes are parsed into vocabulary entries')
            .addDropdown(dropdown => dropdown
                .addOption('filename-with-content', t('settings.mode_filename_with_content') || 'Filename with content fallback')
                .addOption('filename', t('settings.mode_filename') || 'Filename only')
                .addOption('content', t('settings.mode_content') || 'Parse file content')
                .setValue(this.plugin.settings.fileNodeParseMode || 'filename-with-content')
                .onChange(async (value) => {
                    this.plugin.settings.fileNodeParseMode = value as FileNodeParseMode;
                    await this.plugin.saveSettings();
                    new Notice(t('notices.file_parse_mode_updated') || '文件节点解析模式已更新，重新加载单词本后生效');
                }));
    }

    private addLearningFeaturesSection() {
        const { containerEl } = this;

        new Setting(containerEl)
            .setName(t('settings.enable_mastered_feature'))
            .setDesc(t('settings.enable_mastered_feature_desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableMasteredFeature)
                .onChange(async (value) => {
                    this.plugin.settings.enableMasteredFeature = value;
                    this.plugin.settings.showMasteredInSidebar = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshHighlighter();
                    this.plugin.app.workspace.trigger('hi-words:mastered-changed');
                    this.display();
                }));

        const masteredMode = new Setting(containerEl)
            .setName(t('settings.mastered_detection') || 'Mastered detection mode')
            .setDesc(t('settings.mastered_detection_desc') || 'Choose how to detect "mastered": by group or by color (green = 4)');
        masteredMode.addDropdown(dropdown => dropdown
            .addOption('group', t('settings.mode_group') || 'Group mode')
            .addOption('color', t('settings.mode_color') || 'Color mode (green = 4)')
            .setValue(this.plugin.settings.masteredDetection ?? 'group')
            .onChange(async (value) => {
                this.plugin.settings.masteredDetection = value as MasteredDetectionMode;
                await this.plugin.saveSettings();
                if (this.plugin.vocabularyManager?.updateSettings) {
                    this.plugin.vocabularyManager.updateSettings(this.plugin.settings);
                }
                await this.plugin.vocabularyManager.loadAllVocabularyBooks();
                this.plugin.refreshHighlighter();
                this.plugin.app.workspace.trigger('hi-words:settings-changed');
            }));
        if (!this.plugin.settings.enableMasteredFeature) {
            masteredMode.setDisabled(true);
        }

        new Setting(containerEl)
            .setName(t('settings.blur_definitions'))
            .setDesc(t('settings.blur_definitions_desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.blurDefinitions)
                .onChange(async (value) => {
                    this.plugin.settings.blurDefinitions = value;
                    await this.plugin.saveSettings();
                    this.plugin.app.workspace.trigger('hi-words:settings-changed');
                }));

        new Setting(containerEl)
            .setName(t('settings.tts_template') || 'TTS template')
            .setDesc(t('settings.tts_template_desc') || 'Use {{word}} as placeholder, e.g. https://dict.youdao.com/dictvoice?audio={{word}}&type=2')
            .addText(text => text
                .setPlaceholder('https://...{{word}}...')
                .setValue(this.plugin.settings.ttsTemplate || 'https://dict.youdao.com/dictvoice?audio={{word}}&type=2')
                .onChange(async (val) => {
                    this.plugin.settings.ttsTemplate = val.trim();
                    await this.plugin.saveSettings();
                }));

        const aiSettings = this.plugin.settings.aiDictionary ?? {
            apiUrl: 'https://api.openai.com/v1/chat/completions',
            apiKey: '',
            model: 'gpt-4o-mini',
            prompt: ''
        };
        this.plugin.settings.aiDictionary = aiSettings;
        const defaultPrompt = 'Please provide a concise definition for the word "{{word}}" based on this context:\\n\\nSentence: {{sentence}}\\n\\nFormat:\\n1) Part of speech\\n2) English definition\\n3) Chinese translation\\n4) Example sentence (use the original sentence if appropriate)';

        new Setting(containerEl)
            .setName(t('settings.ai_dictionary') || 'AI Dictionary')
            .setHeading();

        new Setting(containerEl)
            .setName(t('settings.ai_api_url') || 'API URL')
            .setDesc(t('settings.ai_api_url_desc') || 'API endpoint (auto-detects: OpenAI, Claude, Gemini)')
            .addText(text => text
                .setPlaceholder('https://api.openai.com/v1/chat/completions')
                .setValue(aiSettings.apiUrl || '')
                .onChange(async (val) => {
                    this.plugin.settings.aiDictionary!.apiUrl = val.trim();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('settings.ai_api_key') || 'API Key')
            .setDesc(t('settings.ai_api_key_desc') || 'Your AI API key')
            .addText(text => {
                text.inputEl.type = 'password';
                text.setPlaceholder('sk-...')
                    .setValue(aiSettings.apiKey || '')
                    .onChange(async (val) => {
                        this.plugin.settings.aiDictionary!.apiKey = val.trim();
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName(t('settings.ai_model') || 'Model')
            .setDesc(t('settings.ai_model_desc') || 'AI model name (e.g., gpt-4o-mini, deepseek-chat)')
            .addText(text => text
                .setPlaceholder('gpt-4o-mini')
                .setValue(aiSettings.model || '')
                .onChange(async (val) => {
                    this.plugin.settings.aiDictionary!.model = val.trim();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('settings.ai_prompt') || 'Custom Prompt')
            .setDesc(t('settings.ai_prompt_desc') || 'Use {{word}} and {{sentence}} as placeholders. The AI will use this prompt to generate definitions.');

        const promptContainer = containerEl.createDiv({ cls: 'hi-words-textarea-container' });
        const promptTextArea = promptContainer.createEl('textarea');
        promptTextArea.placeholder = defaultPrompt;
        promptTextArea.value = aiSettings.prompt || defaultPrompt;
        promptTextArea.rows = 6;
        promptTextArea.addEventListener('blur', async () => {
            this.plugin.settings.aiDictionary!.prompt = promptTextArea.value;
            await this.plugin.saveSettings();
        });

        new Setting(containerEl)
            .setName(t('settings.debug_mode') || 'Debug mode')
            .setDesc(t('settings.debug_mode_desc') || 'Enable detailed logging in the console for troubleshooting')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.debugMode ?? false)
                .onChange(async (value) => {
                    this.plugin.settings.debugMode = value;
                    await this.plugin.saveSettings();
                    this.plugin.app.workspace.trigger('hi-words:settings-changed');
                }));
    }

    /**
     * 添加生词本管理部分
     */
    private addVocabularyBooksSection() {
        const { containerEl } = this;
        
        // 添加标题 - 使用 Obsidian 推荐的设置标题样式
        new Setting(containerEl)
            .setName(t('settings.vocabulary_books'))
            .setHeading();
            
        // 添加生词本按钮 - 使用默认的 setting-item 样式
        new Setting(containerEl)
            .setName(t('settings.add_vocabulary_book'))
            .setDesc('')
            .addButton(button => button
                .setIcon('plus-circle')
                .setTooltip(t('settings.add_vocabulary_book'))
                .onClick(() => this.showCanvasFilePicker())
            );

        // 显示现有生词本
        this.displayVocabularyBooks();

        // 统计信息
        this.displayStats();
    }

    /**
     * 显示 Canvas 文件选择器
     */
    private async showCanvasFilePicker() {
        const canvasFiles = this.app.vault.getFiles()
            .filter(file => file.extension === 'canvas');

        if (canvasFiles.length === 0) {
            new Notice(t('notices.no_canvas_files'));
            return;
        }

        // 创建选择模态框
        const modal = new CanvasPickerModal(this.app, canvasFiles, async (file) => {
            await this.addVocabularyBook(file);
        });
        modal.open();
    }

    /**
     * 添加生词本
     */
    private async addVocabularyBook(file: TFile) {
        // 检查是否已存在
        const exists = this.plugin.settings.vocabularyBooks.some(book => book.path === file.path);
        if (exists) {
            new Notice(t('notices.book_already_exists'));
            return;
        }

        // 验证 Canvas 文件
        const parser = new CanvasParser(this.app, this.plugin.settings);
        const isValid = await parser.validateCanvasFile(file);
        if (!isValid) {
            new Notice(t('notices.invalid_canvas_file'));
            return;
        }

        // 添加到设置
        const newBook: VocabularyBook = {
            path: file.path,
            name: file.basename,
            enabled: true
        };

        this.plugin.settings.vocabularyBooks.push(newBook);
        await this.plugin.saveSettings();
        await this.plugin.vocabularyManager.loadVocabularyBook(newBook);
        this.plugin.refreshHighlighter();

        new Notice(t('notices.book_added').replace('{0}', newBook.name));
        this.display(); // 刷新设置页面
    }

    /**
     * 显示现有生词本
     */
    private displayVocabularyBooks() {
        const { containerEl } = this;

        if (this.plugin.settings.vocabularyBooks.length === 0) {
            containerEl.createEl('p', { 
                text: t('settings.no_vocabulary_books'),
                cls: 'setting-item-description'
            });
            return;
        }

        this.plugin.settings.vocabularyBooks.forEach((book, index) => {
            const setting = new Setting(containerEl)
                .setName(book.name)
                .setDesc(`${t('settings.path')}: ${book.path}`);

            // 形态学语言选择
            setting.addDropdown(dropdown => dropdown
                .addOption('none', t('settings.morphology_none') || '禁用')
                .addOption('korean', t('settings.morphology_korean') || '韩语')
                .addOption('japanese', t('settings.morphology_japanese') || '日语')
                .addOption('auto', t('settings.morphology_auto') || '自动检测')
                .setValue(book.morphology || 'none')
                .onChange(async (value) => {
                    book.morphology = value as MorphologyLanguage;
                    await this.plugin.saveSettings();
                    // 重新加载词书以应用形态学设置
                    await this.plugin.vocabularyManager.loadAllVocabularyBooks();
                    this.plugin.refreshHighlighter();
                }));

            // 重新加载按钮
            setting.addButton(button => button
                .setIcon('refresh-cw')
                .setTooltip(t('settings.reload_book'))
                .onClick(async () => {
                    await this.plugin.vocabularyManager.reloadVocabularyBook(book.path);
                    this.plugin.refreshHighlighter();
                    new Notice(t('notices.book_reloaded').replace('{0}', book.name));
                }));

            // 删除按钮
            setting.addButton(button => button
                .setIcon('trash')
                .setTooltip(t('settings.remove_vocabulary_book'))
                .setWarning()
                .onClick(async () => {
                    this.plugin.settings.vocabularyBooks.splice(index, 1);
                    await this.plugin.saveSettings();
                    await this.plugin.vocabularyManager.loadAllVocabularyBooks();
                    this.plugin.refreshHighlighter();
                    new Notice(t('notices.book_removed').replace('{0}', book.name));
                    this.display(); // 刷新设置页面
                }));
                
            // 启用/禁用开关
            setting.addToggle(toggle => toggle
                .setValue(book.enabled)
                .onChange(async (value) => {
                    book.enabled = value;
                    await this.plugin.saveSettings();
                    if (value) {
                        await this.plugin.vocabularyManager.loadVocabularyBook(book);
                    } else {
                        await this.plugin.vocabularyManager.loadAllVocabularyBooks();
                    }
                    this.plugin.refreshHighlighter();
                }));
        });
    }

    /**
     * 显示统计信息
     */
    private displayStats() {
        const { containerEl } = this;
        const stats = this.plugin.vocabularyManager.getStats();
        
        new Setting(containerEl)
            .setName(t('settings.statistics'))
            .setHeading();
        
        const statsEl = containerEl.createEl('div', { cls: 'hi-words-stats' });

        // 总单词本数量
        const totalBooksItem = statsEl.createEl('div', { cls: 'stat-item' });
        totalBooksItem.createEl('div', { cls: 'stat-value', text: stats.totalBooks.toString() });
        totalBooksItem.createEl('div', { cls: 'stat-label', text: t('settings.total_books').split(':')[0] });

        // 已启用单词本
        const enabledBooksItem = statsEl.createEl('div', { cls: 'stat-item' });
        enabledBooksItem.createEl('div', { cls: 'stat-value', text: stats.enabledBooks.toString() });
        enabledBooksItem.createEl('div', { cls: 'stat-label', text: t('settings.enabled_books').split(':')[0] });

        // 总单词数
        const totalWordsItem = statsEl.createEl('div', { cls: 'stat-item' });
        totalWordsItem.createEl('div', { cls: 'stat-value', text: stats.totalWords.toString() });
        totalWordsItem.createEl('div', { cls: 'stat-label', text: t('settings.total_words').split(':')[0] });
    }
}

// Canvas 文件选择模态框
class CanvasPickerModal extends Modal {
    private files: TFile[];
    private onSelect: (file: TFile) => void;

    constructor(app: App, files: TFile[], onSelect: (file: TFile) => void) {
        super(app);
        this.files = files;
        this.onSelect = onSelect;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: t('modals.select_canvas_file') });

        this.files.forEach(file => {
            const itemEl = contentEl.createEl('div', { cls: 'canvas-picker-item' });
            
            const nameEl = itemEl.createEl('div', { 
                text: file.basename,
                cls: 'canvas-picker-name'
            });
            
            const pathEl = itemEl.createEl('div', { 
                text: file.path,
                cls: 'canvas-picker-path'
            });

            itemEl.addEventListener('click', () => {
                this.onSelect(file);
                this.close();
            });
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
