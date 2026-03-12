import { Modal, Notice, Setting, TFile } from 'obsidian'
import type HiWordsPlugin from '../../main'
import type { VocabularyBook, MorphologyLanguage } from '../utils'
import { JsonlVocabularyService } from '../core'
import { DEFAULT_LANGUAGE_POLICY } from '../core/morphology-language-resolver'
import { t } from '../i18n'

interface VocabularyBooksSectionContext {
    app: App
    plugin: HiWordsPlugin
    containerEl: HTMLElement
    display: () => void
}

import type { App } from 'obsidian'

export function renderVocabularyBooksSection(context: VocabularyBooksSectionContext): void {
    const { containerEl, plugin, display } = context

    new Setting(containerEl)
        .setName(t('settings.vocabulary_books'))
        .setHeading()

    new Setting(containerEl)
        .setName(t('settings.add_vocabulary_book'))
        .setDesc('')
        .addButton((button) => button
            .setIcon('plus-circle')
            .setTooltip('添加 JSONL 词书')
            .onClick(() => void showJsonlFilePicker(context)))

    new Setting(containerEl)
        .setName('导入旧 Canvas 词书')
        .setDesc('将已配置的 .canvas 词书转换为同目录 .jsonl 并自动替换配置')
        .addButton((button) => button
            .setIcon('import')
            .setTooltip('导入 Canvas 词书')
            .onClick(async () => {
                await plugin.importLegacyCanvasBooks()
                display()
            }))

    if (plugin.isMigrationRequired()) {
        containerEl.createEl('p', {
            text: '检测到旧版 Canvas 词书，词书功能已暂停，请先执行导入。',
            cls: 'setting-item-description'
        })
    }

    renderVocabularyBooksList(context)
    renderVocabularyStats(context)
}

async function showJsonlFilePicker(context: VocabularyBooksSectionContext): Promise<void> {
    const jsonlFiles = context.app.vault.getFiles()
        .filter((file) => file.extension.toLowerCase() === 'jsonl')

    if (jsonlFiles.length === 0) {
        new Notice('未找到 JSONL 文件')
        return
    }

    const modal = new BookFilePickerModal(context.app, jsonlFiles, async (file) => {
        await addVocabularyBook(context, file)
    }, '选择 JSONL 词书')
    modal.open()
}

async function addVocabularyBook(context: VocabularyBooksSectionContext, file: TFile): Promise<void> {
    const { plugin, display } = context
    if (file.extension.toLowerCase() !== 'jsonl') {
        new Notice('仅支持添加 .jsonl 词书')
        return
    }

    if (plugin.settings.vocabularyBooks.some((book) => book.path === file.path)) {
        new Notice(t('notices.book_already_exists'))
        return
    }

    const jsonlService = new JsonlVocabularyService(context.app)
    const isValid = await jsonlService.validateJsonlFile(file)
    if (!isValid) {
        new Notice('JSONL 文件格式无效')
        return
    }

    const newBook: VocabularyBook = {
        path: file.path,
        name: file.basename,
        enabled: true,
        languagePolicy: DEFAULT_LANGUAGE_POLICY
    }

    plugin.settings.vocabularyBooks.push(newBook)
    await plugin.saveSettings()
    if (!plugin.isMigrationRequired()) {
        await plugin.vocabularyManager.loadVocabularyBook(newBook)
        plugin.refreshHighlighter()
    }

    new Notice(t('notices.book_added').replace('{0}', newBook.name))
    display()
}

function renderVocabularyBooksList(context: VocabularyBooksSectionContext): void {
    const { containerEl, plugin, display } = context
    if (plugin.settings.vocabularyBooks.length === 0) {
        containerEl.createEl('p', {
            text: '暂无词书，请添加 JSONL 文件作为词书',
            cls: 'setting-item-description'
        })
        return
    }

    plugin.settings.vocabularyBooks.forEach((book, index) => {
        const setting = new Setting(containerEl)
            .setName(`${book.name} · ${t('settings.book_language_policy') || '词书语言策略'}`)
            .setDesc(`${t('settings.path')}: ${book.path}`)

        setting.addDropdown((dropdown) => dropdown
            .addOption('none', t('settings.morphology_none') || '禁用形态学')
            .addOption('korean', t('settings.morphology_korean') || '韩语（强绑定）')
            .addOption('japanese', t('settings.morphology_japanese') || '日语（强绑定）')
            .addOption('auto', t('settings.morphology_auto') || '自动检测（单语言）')
            .setValue(book.languagePolicy || DEFAULT_LANGUAGE_POLICY)
            .onChange(async (value) => {
                book.languagePolicy = value as MorphologyLanguage
                await plugin.saveSettings()
                if (plugin.isMigrationRequired()) {
                    return
                }
                await plugin.vocabularyManager.loadAllVocabularyBooks()
                plugin.refreshHighlighter()
            }))

        setting.addButton((button) => button
            .setIcon('refresh-cw')
            .setTooltip(t('settings.reload_book'))
            .onClick(async () => {
                if (plugin.isMigrationRequired()) {
                    new Notice('检测到 Canvas 词书，请先导入 JSONL。')
                    return
                }
                await plugin.vocabularyManager.reloadVocabularyBook(book.path)
                plugin.refreshHighlighter()
                new Notice(t('notices.book_reloaded').replace('{0}', book.name))
            }))

        setting.addButton((button) => button
            .setIcon('trash')
            .setTooltip(t('settings.remove_vocabulary_book'))
            .setWarning()
            .onClick(async () => {
                plugin.settings.vocabularyBooks.splice(index, 1)
                await plugin.saveSettings()
                if (!plugin.isMigrationRequired()) {
                    await plugin.vocabularyManager.loadAllVocabularyBooks()
                    plugin.refreshHighlighter()
                }
                new Notice(t('notices.book_removed').replace('{0}', book.name))
                display()
            }))

        setting.addToggle((toggle) => toggle
            .setValue(book.enabled)
            .onChange(async (value) => {
                book.enabled = value
                await plugin.saveSettings()
                if (plugin.isMigrationRequired()) {
                    return
                }
                if (value) {
                    await plugin.vocabularyManager.loadVocabularyBook(book)
                } else {
                    await plugin.vocabularyManager.loadAllVocabularyBooks()
                }
                plugin.refreshHighlighter()
            }))
    })
}

function renderVocabularyStats(context: VocabularyBooksSectionContext): void {
    const { containerEl, plugin } = context
    const stats = plugin.vocabularyManager.getStats()

    new Setting(containerEl)
        .setName(t('settings.statistics'))
        .setHeading()

    const statsEl = containerEl.createEl('div', { cls: 'hi-words-stats' })
    renderStatItem(statsEl, stats.totalBooks.toString(), t('settings.total_books').split(':')[0])
    renderStatItem(statsEl, stats.enabledBooks.toString(), t('settings.enabled_books').split(':')[0])
    renderStatItem(statsEl, stats.totalWords.toString(), t('settings.total_words').split(':')[0])
}

function renderStatItem(containerEl: HTMLElement, value: string, label: string): void {
    const item = containerEl.createEl('div', { cls: 'stat-item' })
    item.createEl('div', { cls: 'stat-value', text: value })
    item.createEl('div', { cls: 'stat-label', text: label })
}

class BookFilePickerModal extends Modal {
    private files: TFile[]
    private onSelect: (file: TFile) => void
    private title: string

    constructor(app: App, files: TFile[], onSelect: (file: TFile) => void, title: string) {
        super(app)
        this.files = files
        this.onSelect = onSelect
        this.title = title
    }

    onOpen(): void {
        const { contentEl } = this
        contentEl.empty()
        contentEl.createEl('h2', { text: this.title })
        this.files.forEach((file) => {
            const itemEl = contentEl.createEl('div', { cls: 'canvas-picker-item' })
            itemEl.createEl('div', { text: file.basename, cls: 'canvas-picker-name' })
            itemEl.createEl('div', { text: file.path, cls: 'canvas-picker-path' })
            itemEl.addEventListener('click', () => {
                this.onSelect(file)
                this.close()
            })
        })
    }

    onClose(): void {
        this.contentEl.empty()
    }
}
