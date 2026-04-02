import { App, ButtonComponent, Notice, PluginSettingTab, Setting } from 'obsidian'
import HiWordsPlugin from '../../main'
import {
    ARTICLE_VOCABULARY_EXPORT_FIELDS,
    ARTICLE_VOCABULARY_EXPORT_FIELD_LABEL_KEYS,
    ARTICLE_VOCABULARY_EXPORT_ORDER_LABEL_KEYS,
    FileNodeParseMode,
    HighlightStyle,
    MasteredDetectionMode,
    sanitizeExportFields
} from '../utils'
import type {
    ArticleVocabularyExportField,
    MorphologyEngineMode,
    MorphologyFallbackMode
} from '../utils'
import type { MorphologyAssetLanguage } from '../core'
import { t } from '../i18n'
import { renderVocabularyBooksSection } from './settings-vocabulary-books'

export class HiWordsSettingTab extends PluginSettingTab {
    plugin: HiWordsPlugin

    constructor(app: App, plugin: HiWordsPlugin) {
        super(app, plugin)
        this.plugin = plugin
    }

    display(): void {
        const { containerEl } = this
        containerEl.empty()

        renderVocabularyBooksSection({
            app: this.app,
            plugin: this.plugin,
            containerEl,
            display: () => this.display()
        })
        this.addFileNodeParseModeSettings()
        this.addHighlightingSection()
        this.addMorphologyAssetSection()
        this.addExportSettingsSection()
        this.addLearningFeaturesSection()
    }

    private addMorphologyAssetSection(): void {
        const { containerEl } = this

        new Setting(containerEl)
            .setName(t('settings.morphology_assets') || 'Morphology assets')
            .setDesc(t('settings.morphology_assets_desc') || 'Download or delete morphology resources on demand')
            .setHeading()

        this.addMorphologyAssetItem('korean')
        this.addMorphologyAssetItem('japanese')
        this.addMorphologyAssetItem('english')
    }

    private addMorphologyAssetItem(language: MorphologyAssetLanguage): void {
        const { containerEl } = this
        const languageLabel = this.getMorphologyLanguageLabel(language)
        const setting = new Setting(containerEl)
            .setName(languageLabel)
            .setDesc(t('settings.morphology_asset_status_loading') || 'Checking resource status...')

        let downloadButton: ButtonComponent | null = null
        let deleteButton: ButtonComponent | null = null
        let actionInProgress = false

        const refreshState = async (): Promise<void> => {
            const state = await this.plugin.getMorphologyAssetState(language)
            setting.setDesc(this.formatMorphologyAssetStatus(state.downloaded, state.byteLength, state.isDownloading || actionInProgress))
            downloadButton?.setDisabled(state.downloaded || state.isDownloading || actionInProgress)
            deleteButton?.setDisabled(!state.downloaded || state.isDownloading || actionInProgress)
        }

        setting.addButton((button) => {
            downloadButton = button
            button.setButtonText(t('settings.morphology_asset_download') || 'Download')
            button.onClick(async () => {
                await this.runMorphologyAssetAction(language, languageLabel, 'download', refreshState, (inProgress) => {
                    actionInProgress = inProgress
                })
            })
            return button
        })

        setting.addButton((button) => {
            deleteButton = button
            button.setButtonText(t('settings.morphology_asset_delete') || 'Delete')
            button.setWarning()
            button.onClick(async () => {
                await this.runMorphologyAssetAction(language, languageLabel, 'delete', refreshState, (inProgress) => {
                    actionInProgress = inProgress
                })
            })
            return button
        })

        void refreshState().catch((error) => {
            console.error(`[HiWords] 获取 ${language} 形态学资源状态失败:`, error)
            setting.setDesc(t('settings.morphology_asset_status_missing') || 'Not downloaded')
        })
    }

    private async runMorphologyAssetAction(
        language: MorphologyAssetLanguage,
        languageLabel: string,
        action: 'download' | 'delete',
        refreshState: () => Promise<void>,
        setActionState: (inProgress: boolean) => void
    ): Promise<void> {
        setActionState(true)
        await refreshState()

        try {
            if (action === 'download') {
                await this.plugin.downloadMorphologyAsset(language)
                new Notice((t('notices.morphology_asset_downloaded') || '{0} morphology resource downloaded').replace('{0}', languageLabel))
            } else {
                await this.plugin.deleteMorphologyAsset(language)
                new Notice((t('notices.morphology_asset_deleted') || '{0} morphology resource deleted').replace('{0}', languageLabel))
            }
        } catch (error) {
            console.error(`[HiWords] ${action} ${language} 形态学资源失败:`, error)
            new Notice((t('notices.morphology_asset_operation_failed') || 'Failed to manage {0} morphology resource').replace('{0}', languageLabel))
        } finally {
            setActionState(false)
            await refreshState()
        }
    }

    private getMorphologyLanguageLabel(language: MorphologyAssetLanguage): string {
        if (language === 'korean') {
            return t('settings.morphology_korean') || 'Korean'
        }
        if (language === 'japanese') {
            return t('settings.morphology_japanese') || 'Japanese'
        }
        return t('settings.morphology_english') || 'English'
    }

    private formatMorphologyAssetStatus(downloaded: boolean, byteLength: number, isDownloading: boolean): string {
        if (isDownloading) {
            return t('settings.morphology_asset_status_downloading') || 'Downloading...'
        }
        if (!downloaded) {
            return t('settings.morphology_asset_status_missing') || 'Not downloaded'
        }
        const size = this.formatByteSize(byteLength)
        return (t('settings.morphology_asset_status_downloaded') || 'Downloaded ({0})').replace('{0}', size)
    }

    private formatByteSize(bytes: number): string {
        if (bytes < 1024) {
            return `${bytes} B`
        }
        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`
        }
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    private addHighlightingSection(): void {
        const { containerEl } = this

        new Setting(containerEl)
            .setName(t('settings.enable_auto_highlight'))
            .setDesc(t('settings.enable_auto_highlight_desc'))
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.enableAutoHighlight)
                .onChange(async (value) => {
                    this.plugin.settings.enableAutoHighlight = value
                    await this.plugin.saveSettings()
                    this.plugin.refreshHighlighter()
                }))

        new Setting(containerEl)
            .setName(t('settings.show_definition_on_hover'))
            .setDesc(t('settings.show_definition_on_hover_desc'))
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.showDefinitionOnHover)
                .onChange(async (value) => {
                    this.plugin.settings.showDefinitionOnHover = value
                    await this.plugin.saveSettings()
                }))

        new Setting(containerEl)
            .setName(t('settings.highlight_style'))
            .setDesc(t('settings.highlight_style_desc'))
            .addDropdown((dropdown) => dropdown
                .addOption('underline', t('settings.style_underline'))
                .addOption('background', t('settings.style_background'))
                .addOption('bold', t('settings.style_bold'))
                .addOption('dotted', t('settings.style_dotted'))
                .addOption('wavy', t('settings.style_wavy'))
                .setValue(this.plugin.settings.highlightStyle)
                .onChange(async (value) => {
                    this.plugin.settings.highlightStyle = value as HighlightStyle
                    await this.plugin.saveSettings()
                    this.plugin.refreshHighlighter()
                }))

        this.addHighlightScopeSettings()

        new Setting(containerEl)
            .setName(t('settings.morphology_engine') || 'Morphology Engine')
            .setDesc(t('settings.morphology_engine_desc') || 'Hybrid uses inverse analysis as primary path; Legacy keeps aggressive generated inflections.')
            .addDropdown((dropdown) => dropdown
                .addOption('hybrid', t('settings.morphology_engine_hybrid') || 'Hybrid (Recommended)')
                .addOption('legacy', t('settings.morphology_engine_legacy') || 'Legacy')
                .setValue(this.plugin.settings.morphologyEngineMode || 'hybrid')
                .onChange(async (value) => {
                    this.plugin.settings.morphologyEngineMode = value as MorphologyEngineMode
                    await this.plugin.saveSettings()
                    this.plugin.refreshHighlighter()
                }))

        new Setting(containerEl)
            .setName(t('settings.morphology_fallback') || 'Morphology Fallback')
            .setDesc(t('settings.morphology_fallback_desc') || 'Conservative only generates inflections when analyzer is unavailable; Aggressive always generates.')
            .addDropdown((dropdown) => dropdown
                .addOption('conservative', t('settings.morphology_fallback_conservative') || 'Conservative (Recommended)')
                .addOption('aggressive', t('settings.morphology_fallback_aggressive') || 'Aggressive')
                .setValue(this.plugin.settings.morphologyFallbackMode || 'conservative')
                .onChange(async (value) => {
                    this.plugin.settings.morphologyFallbackMode = value as MorphologyFallbackMode
                    await this.plugin.saveSettings()
                    this.plugin.refreshHighlighter()
                }))

        new Setting(containerEl)
            .setName(t('settings.show_word_source') || 'Show word source')
            .setDesc(t('settings.show_word_source_desc') || 'Display the vocabulary book name in tooltips and the sidebar')
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.showWordSource ?? true)
                .onChange(async (value) => {
                    this.plugin.settings.showWordSource = value
                    await this.plugin.saveSettings()
                    this.plugin.app.workspace.trigger('hi-words:settings-changed')
                }))
    }

    private addHighlightScopeSettings(): void {
        const { containerEl } = this

        new Setting(containerEl)
            .setName(t('settings.highlight_mode') || 'Highlight scope')
            .setDesc(t('settings.highlight_mode_desc') || 'Define how folders are included in highlighting')
            .addDropdown((dropdown) => dropdown
                .addOption('all', t('settings.mode_all') || 'All notes')
                .addOption('exclude', t('settings.mode_exclude') || 'Exclude folders')
                .addOption('include', t('settings.mode_include') || 'Only specified folders')
                .setValue(this.plugin.settings.highlightMode || 'all')
                .onChange(async (value) => {
                    this.plugin.settings.highlightMode = value as 'all' | 'exclude' | 'include'
                    await this.plugin.saveSettings()
                    this.plugin.refreshHighlighter()
                    this.display()
                }))

        const mode = this.plugin.settings.highlightMode || 'all'
        if (mode === 'all') {
            return
        }

        new Setting(containerEl)
            .setName(t('settings.highlight_paths') || 'Folder list')
            .setDesc(t('settings.highlight_paths_desc') || 'Comma-separated folder list')
            .addTextArea((text) => {
                text.setPlaceholder(t('settings.highlight_paths_placeholder') || 'e.g.: Archive, Templates')
                    .setValue(this.plugin.settings.highlightPaths || '')
                text.inputEl.rows = 3
                text.onChange(async (value) => {
                    this.plugin.settings.highlightPaths = value
                    await this.plugin.saveSettings()
                    this.plugin.refreshHighlighter()
                })
            })
    }

    private addFileNodeParseModeSettings(): void {
        const { containerEl } = this
        new Setting(containerEl)
            .setName(t('settings.file_node_parse_mode') || 'File node parse mode')
            .setDesc(t('settings.file_node_parse_mode_desc') || 'Choose how file nodes are converted into entries')
            .addDropdown((dropdown) => dropdown
                .addOption('filename-with-content', t('settings.mode_filename_with_content') || 'Prefer content, fallback to filename')
                .addOption('filename', t('settings.mode_filename') || 'Filename only')
                .addOption('content', t('settings.mode_content') || 'Parse file content')
                .setValue(this.plugin.settings.fileNodeParseMode || 'filename-with-content')
                .onChange(async (value) => {
                    this.plugin.settings.fileNodeParseMode = value as FileNodeParseMode
                    await this.plugin.saveSettings()
                }))
    }

    private addExportSettingsSection(): void {
        const { containerEl } = this

        new Setting(containerEl)
            .setName(t('settings.export_settings') || 'Article vocabulary export')
            .setDesc(t('settings.export_settings_desc') || 'Configure default fields and order for current-article vocabulary CSV exports')
            .setHeading()

        new Setting(containerEl)
            .setName(t('settings.export_order_default') || 'Default export order')
            .setDesc(t('settings.export_order_default_desc') || 'Pre-fill the export modal with the selected order')
            .addDropdown((dropdown) => dropdown
                .addOption('document', t(ARTICLE_VOCABULARY_EXPORT_ORDER_LABEL_KEYS.document) || 'Document order')
                .addOption('alphabetical', t(ARTICLE_VOCABULARY_EXPORT_ORDER_LABEL_KEYS.alphabetical) || 'Alphabetical')
                .setValue(this.plugin.settings.exportOrder || 'document')
                .onChange(async (value) => {
                    this.plugin.settings.exportOrder = value as 'document' | 'alphabetical'
                    await this.plugin.saveSettings()
                }))

        const fieldsSetting = new Setting(containerEl)
            .setName(t('settings.export_fields_default') || 'Default export fields')
            .setDesc(t('settings.export_fields_default_desc') || 'Pre-fill the export modal with these columns')
        fieldsSetting.setClass('hiwords-export-default-fields-setting')

        const selectedFields = new Set(sanitizeExportFields(this.plugin.settings.exportFields))
        const fieldsGrid = fieldsSetting.controlEl.createDiv({ cls: 'hiwords-export-fields-grid' })
        ARTICLE_VOCABULARY_EXPORT_FIELDS.forEach((field) => {
            const label = fieldsGrid.createEl('label', { cls: 'hiwords-export-field-option' })
            const checkbox = label.createEl('input', { attr: { type: 'checkbox' } })
            checkbox.checked = selectedFields.has(field)
            checkbox.addEventListener('change', () => {
                void this.handleExportFieldToggle(field, checkbox.checked, checkbox, selectedFields)
            })
            label.createEl('span', {
                text: t(ARTICLE_VOCABULARY_EXPORT_FIELD_LABEL_KEYS[field]) || field
            })
        })
    }

    private async handleExportFieldToggle(
        field: ArticleVocabularyExportField,
        checked: boolean,
        checkbox: HTMLInputElement,
        selectedFields: Set<ArticleVocabularyExportField>
    ): Promise<void> {
        if (checked) {
            selectedFields.add(field)
        } else {
            if (selectedFields.size === 1) {
                checkbox.checked = true
                new Notice(t('notices.export_fields_required') || 'Select at least one export field.')
                return
            }
            selectedFields.delete(field)
        }

        this.plugin.settings.exportFields = ARTICLE_VOCABULARY_EXPORT_FIELDS.filter((item) => selectedFields.has(item))
        await this.plugin.saveSettings()
    }

    private addLearningFeaturesSection(): void {
        const { containerEl } = this
        new Setting(containerEl)
            .setName(t('settings.enable_mastered_feature'))
            .setDesc(t('settings.enable_mastered_feature_desc'))
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.enableMasteredFeature)
                .onChange(async (value) => {
                    this.plugin.settings.enableMasteredFeature = value
                    if (!value) {
                        this.plugin.settings.showMasteredInSidebar = false
                    } else {
                        this.plugin.settings.showMasteredInSidebar = true
                    }
                    await this.plugin.saveSettings()
                    this.plugin.refreshHighlighter()
                    this.display()
                }))

        if (this.plugin.settings.enableMasteredFeature) {
            new Setting(containerEl)
                .setName(t('settings.mastered_detection') || 'Mastered detection mode')
                .setDesc(t('settings.mastered_detection_desc') || 'Choose how to detect mastered words')
                .addDropdown((dropdown) => dropdown
                    .addOption('group', t('settings.mode_group') || 'Group mode')
                    .addOption('color', t('settings.mode_color') || 'Color mode (green = 4)')
                    .setValue(this.plugin.settings.masteredDetection || 'group')
                    .onChange(async (value) => {
                        this.plugin.settings.masteredDetection = value as MasteredDetectionMode
                        await this.plugin.saveSettings()
                        await this.plugin.vocabularyManager.loadAllVocabularyBooks()
                        this.plugin.refreshHighlighter()
                    }))
        }

        new Setting(containerEl)
            .setName(t('settings.blur_definitions'))
            .setDesc(t('settings.blur_definitions_desc'))
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.blurDefinitions)
                .onChange(async (value) => {
                    this.plugin.settings.blurDefinitions = value
                    await this.plugin.saveSettings()
                    this.plugin.app.workspace.trigger('hi-words:settings-changed')
                }))

        new Setting(containerEl)
            .setName(t('settings.tts_template') || 'TTS template')
            .setDesc(t('settings.tts_template_desc') || 'Use {{word}} as placeholder, e.g. https://dict.youdao.com/dictvoice?audio={{word}}&type=2')
            .addText((text) => text
                .setPlaceholder('https://...{{word}}...')
                .setValue(this.plugin.settings.ttsTemplate || 'https://dict.youdao.com/dictvoice?audio={{word}}&type=2')
                .onChange(async (value) => {
                    this.plugin.settings.ttsTemplate = value.trim()
                    await this.plugin.saveSettings()
                }))

        const aiSettings = this.ensureAiDictionarySettings()
        const defaultPrompt = 'Please provide a concise definition for the word "{{word}}" based on this context:\\n\\nSentence: {{sentence}}\\n\\nFormat:\\n1) Part of speech\\n2) English definition\\n3) Chinese translation\\n4) Example sentence (use the original sentence if appropriate)'

        new Setting(containerEl)
            .setName(t('settings.ai_dictionary') || 'AI Dictionary')
            .setHeading()

        new Setting(containerEl)
            .setName(t('settings.ai_api_url') || 'API URL')
            .setDesc(t('settings.ai_api_url_desc') || 'API endpoint (auto-detects: OpenAI, Claude, Gemini)')
            .addText((text) => text
                .setPlaceholder('https://api.openai.com/v1/chat/completions')
                .setValue(aiSettings.apiUrl || '')
                .onChange(async (value) => {
                    if (!this.plugin.settings.aiDictionary) {
                        return
                    }
                    this.plugin.settings.aiDictionary.apiUrl = value.trim()
                    await this.plugin.saveSettings()
                }))

        new Setting(containerEl)
            .setName(t('settings.ai_api_key') || 'API Key')
            .setDesc(t('settings.ai_api_key_desc') || 'Your AI API key')
            .addText((text) => {
                text.inputEl.type = 'password'
                text.setPlaceholder('sk-...')
                    .setValue(aiSettings.apiKey || '')
                    .onChange(async (value) => {
                        if (!this.plugin.settings.aiDictionary) {
                            return
                        }
                        this.plugin.settings.aiDictionary.apiKey = value.trim()
                        await this.plugin.saveSettings()
                    })
            })

        new Setting(containerEl)
            .setName(t('settings.ai_model') || 'Model')
            .setDesc(t('settings.ai_model_desc') || 'AI model name (e.g., gpt-4o-mini, deepseek-chat)')
            .addText((text) => text
                .setPlaceholder('gpt-4o-mini')
                .setValue(aiSettings.model || '')
                .onChange(async (value) => {
                    if (!this.plugin.settings.aiDictionary) {
                        return
                    }
                    this.plugin.settings.aiDictionary.model = value.trim()
                    await this.plugin.saveSettings()
                }))

        new Setting(containerEl)
            .setName(t('settings.ai_prompt') || 'Custom Prompt')
            .setDesc(t('settings.ai_prompt_desc') || 'Use {{word}} and {{sentence}} as placeholders. The AI will use this prompt to generate definitions.')

        const promptContainer = containerEl.createDiv({ cls: 'hi-words-textarea-container' })
        const promptTextArea = promptContainer.createEl('textarea')
        promptTextArea.placeholder = defaultPrompt
        promptTextArea.value = aiSettings.prompt || defaultPrompt
        promptTextArea.rows = 6
        promptTextArea.addEventListener('blur', async () => {
            if (!this.plugin.settings.aiDictionary) {
                return
            }
            this.plugin.settings.aiDictionary.prompt = promptTextArea.value
            await this.plugin.saveSettings()
        })

        new Setting(containerEl)
            .setName(t('settings.debug_mode') || 'Debug mode')
            .setDesc(t('settings.debug_mode_desc') || 'Enable detailed logging in the console for troubleshooting')
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.debugMode ?? false)
                .onChange(async (value) => {
                    this.plugin.settings.debugMode = value
                    await this.plugin.saveSettings()
                    this.plugin.app.workspace.trigger('hi-words:settings-changed')
                }))
    }

    private ensureAiDictionarySettings(): NonNullable<HiWordsPlugin['settings']['aiDictionary']> {
        const aiSettings = this.plugin.settings.aiDictionary ?? {
            apiUrl: 'https://api.openai.com/v1/chat/completions',
            apiKey: '',
            model: 'gpt-4o-mini',
            prompt: ''
        }
        this.plugin.settings.aiDictionary = aiSettings
        return aiSettings
    }
}
