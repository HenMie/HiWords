import { Notice, setIcon } from 'obsidian'
import type { VocabularyBook } from '../utils'
import { isJapaneseText } from '../utils'
import { t } from '../i18n'
import type { DictionaryService } from '../services/dictionary-service'
import { getBookLanguagePolicy } from '../core/morphology-language-resolver'
import { getPronunciationPlaceholderKey } from './add-word-language-policy'

interface AddWordFormOptions {
    containerEl: HTMLElement
    titleLabel: string
    helperText: string
    errorMessage?: string | null
    initialWord: string
    originalWord: string
    sentence: string
    isEditMode: boolean
    definitionValue: string
    etymologyValue: string
    pronunciationValue: string
    colorValue?: number
    showColorField: boolean
    enabledBooks: VocabularyBook[]
    selectedBookPath: string | null
    sourceBookPath?: string | null
    dictionaryService: DictionaryService | null
    isAnalyzing: boolean
    onWordChange: (word: string) => void
    onDefinitionChange: (value: string) => void
    onEtymologyChange: (value: string) => void
    onPronunciationChange: (value: string) => void
    onColorChange: (value?: number) => void
    onBookChange: (bookPath: string | null) => void
    onRestoreOriginal: () => void
    onDelete?: () => Promise<void>
    onSubmit: (payload: {
        selectedBook: string
        finalWord: string
        definition: string
        colorValue?: number
        etymology?: string
        pronunciation?: string
    }) => Promise<void>
    onCancel: () => void
}

interface AddWordFormRefs {
    wordInput: HTMLInputElement | null
    definitionInput: HTMLTextAreaElement
}

export function renderAddWordForm(options: AddWordFormOptions): AddWordFormRefs {
    const {
        containerEl,
        titleLabel,
        helperText,
        errorMessage,
        initialWord,
        originalWord,
        sentence,
        isEditMode,
        definitionValue,
        etymologyValue,
        pronunciationValue,
        colorValue,
        showColorField,
        enabledBooks,
        selectedBookPath,
        sourceBookPath,
        dictionaryService,
        isAnalyzing,
        onWordChange,
        onDefinitionChange,
        onEtymologyChange,
        onPronunciationChange,
        onColorChange,
        onBookChange,
        onRestoreOriginal,
        onDelete,
        onSubmit,
        onCancel
    } = options

    containerEl.addClass('hiwords-modal-shell')

    const resolveBookDisplayName = (bookPath: string | null): string => {
        if (!bookPath) {
            return t('modals.select_book')
        }

        return enabledBooks.find((book) => book.path === bookPath)?.name ?? bookPath
    }

    const createOwnershipItem = (
        parentEl: HTMLElement,
        label: string,
        value: string,
        muted = false
    ): HTMLSpanElement => {
        const itemEl = parentEl.createDiv({ cls: 'hiwords-ownership-item' })
        itemEl.createEl('span', {
            text: label,
            cls: 'hiwords-ownership-label'
        })
        return itemEl.createEl('span', {
            text: value,
            cls: `hiwords-ownership-value${muted ? ' is-muted' : ''}`
        })
    }

    const headerEl = containerEl.createDiv({ cls: 'hiwords-modal-header' })
    headerEl.createEl('h2', {
        text: titleLabel,
        cls: 'hiwords-modal-title'
    })
    headerEl.createEl('p', {
        text: helperText,
        cls: 'hiwords-modal-helper'
    })

    const ownershipEl = containerEl.createDiv({ cls: 'hiwords-ownership-panel' })
    const ownershipGridEl = ownershipEl.createDiv({ cls: 'hiwords-ownership-grid' })
    const wordValueEl = createOwnershipItem(
        ownershipGridEl,
        t('modals.word_label'),
        initialWord || t('modals.word_placeholder'),
        !initialWord
    )

    if (!isEditMode && originalWord !== initialWord) {
        createOwnershipItem(
            ownershipGridEl,
            t('notices.morphology_detected') || 'Original word',
            originalWord
        )
    }

    if (isEditMode && sourceBookPath) {
        createOwnershipItem(
            ownershipGridEl,
            t('modals.current_book_label', 'Current book'),
            resolveBookDisplayName(sourceBookPath)
        )
    }

    const targetBookValueEl = createOwnershipItem(
        ownershipGridEl,
        isEditMode
            ? t('modals.target_book_label', 'Target book')
            : t('modals.book_label'),
        resolveBookDisplayName(selectedBookPath),
        !selectedBookPath
    )

    if (isAnalyzing) {
        const loadingEl = containerEl.createEl('div', { cls: 'loading-indicator' })
        loadingEl.createEl('span', {
            text: t('notices.analyzing_word') || '正在分析单词...'
        })
    } else if (!isEditMode && originalWord !== initialWord) {
        const noteEl = containerEl.createEl('div', { cls: 'morphology-note' })
        const noteContent = noteEl.createEl('div', { cls: 'morphology-note-content' })
        noteContent.createEl('span', {
            text: `${t('notices.morphology_detected') || '原始单词'}: “${originalWord}” → ${t('notices.normalized_to') || '识别为原型'}: “${initialWord}”`,
            cls: 'note-text'
        })
        const restoreButton = noteContent.createEl('button', {
            text: t('actions.restore') || '还原',
            cls: 'morphology-restore-button'
        })
        restoreButton.onclick = onRestoreOriginal
    }

    if (errorMessage) {
        containerEl.createEl('div', {
            text: errorMessage,
            cls: 'hiwords-form-error'
        })
    }

    let currentWord = initialWord
    let wordInput: HTMLInputElement | null = null

    const definitionSection = containerEl.createDiv({
        cls: 'hiwords-form-section hiwords-form-section-primary'
    })
    const definitionContainer = definitionSection.createDiv({ cls: 'hiwords-form-item' })
    const definitionLabelContainer = definitionContainer.createDiv({
        cls: 'hiwords-definition-label-container'
    })
    definitionLabelContainer.createEl('label', {
        text: t('modals.definition_label'),
        cls: 'hiwords-form-item-label'
    })

    if (!isEditMode) {
        const autoFillBtn = definitionLabelContainer.createDiv({ cls: 'hiwords-auto-fill-btn' })
        autoFillBtn.setAttribute('aria-label', t('modals.auto_fill_definition'))
        const iconContainer = autoFillBtn.createDiv({ cls: 'hiwords-auto-fill-icon' })
        setIcon(iconContainer, 'sparkles')

        autoFillBtn.addEventListener('click', async () => {
            const queryWord = wordInput?.value.trim() || currentWord
            if (!queryWord) {
                new Notice(t('notices.enter_word_first') || '请先输入单词')
                return
            }
            if (!dictionaryService) {
                new Notice(t('notices.ai_config_required') || '请先在设置中配置 AI 词典')
                return
            }
            autoFillBtn.addClass('hiwords-loading')
            iconContainer.empty()
            setIcon(iconContainer, 'loader')
            try {
                const result = await dictionaryService.fetchDefinition(queryWord, sentence)
                definitionInput.value = result
                onDefinitionChange(result)
                new Notice(t('notices.definition_fetched') || '已获取释义')
            } catch (error) {
                console.error('Failed to fetch definition from AI:', error)
                new Notice(t('notices.definition_fetch_failed') || '获取释义失败')
            } finally {
                autoFillBtn.removeClass('hiwords-loading')
                iconContainer.empty()
                setIcon(iconContainer, 'sparkles')
            }
        })
    }

    const definitionInput = definitionContainer.createEl('textarea', {
        cls: 'setting-item-input definition-input',
        attr: { rows: '5', placeholder: t('modals.definition_placeholder') }
    })
    definitionInput.value = definitionValue
    definitionInput.addEventListener('input', () => {
        onDefinitionChange(definitionInput.value)
    })

    const metadataSection = containerEl.createDiv({
        cls: 'hiwords-form-section hiwords-form-section-secondary'
    })

    const wordContainer = metadataSection.createDiv({ cls: 'hiwords-form-item' })
    wordContainer.createEl('label', {
        text: t('modals.word_label'),
        cls: 'hiwords-form-item-label'
    })
    wordInput = wordContainer.createEl('input', {
        type: 'text',
        value: initialWord,
        cls: 'setting-item-input word-input',
        placeholder: t('modals.word_placeholder')
    })
    wordInput.addEventListener('input', (event) => {
        const target = event.target as HTMLInputElement
        currentWord = target.value.trim()
        onWordChange(currentWord)
        wordValueEl.textContent = currentWord || t('modals.word_placeholder')
        wordValueEl.classList.toggle('is-muted', !currentWord)
        updatePronunciationPlaceholder()
    })

    const bookSelectContainer = metadataSection.createDiv({ cls: 'hiwords-form-item' })
    bookSelectContainer.createEl('label', {
        text: isEditMode
            ? t('modals.target_book_label', 'Target book')
            : t('modals.book_label'),
        cls: 'hiwords-form-item-label'
    })
    const bookSelect = bookSelectContainer.createEl('select', { cls: 'dropdown' })
    bookSelect.createEl('option', { text: t('modals.select_book'), value: '' })
    enabledBooks.forEach((book) => {
        const option = bookSelect.createEl('option', { text: book.name, value: book.path })
        if (selectedBookPath === book.path) {
            option.selected = true
        }
    })
    if (selectedBookPath) {
        bookSelect.value = selectedBookPath
    }

    const resolveSelectedBook = (): VocabularyBook | undefined => {
        const bookPath = bookSelect.value
        return enabledBooks.find((book) => book.path === bookPath)
    }

    let colorSelect: HTMLSelectElement | null = null
    if (showColorField) {
        const colorSelectContainer = metadataSection.createDiv({ cls: 'hiwords-form-item' })
        colorSelectContainer.createEl('label', {
            text: t('modals.color_label'),
            cls: 'hiwords-form-item-label'
        })
        colorSelect = colorSelectContainer.createEl('select', {
            cls: 'dropdown setting-item-select'
        })
        colorSelect.createEl('option', { text: t('modals.color_gray'), value: '' })
        const colorOptions = [
            { name: t('modals.color_red'), value: '1' },
            { name: t('modals.color_orange'), value: '2' },
            { name: t('modals.color_yellow'), value: '3' },
            { name: t('modals.color_green'), value: '4' },
            { name: t('modals.color_blue'), value: '5' },
            { name: t('modals.color_purple'), value: '6' }
        ]
        colorOptions.forEach((color: { name: string; value: string }) => {
            colorSelect?.createEl('option', { text: color.name, value: color.value })
        })
        if (colorValue !== undefined) {
            colorSelect.value = colorValue.toString()
        }
        colorSelect.addEventListener('change', () => {
            onColorChange(colorSelect?.value ? parseInt(colorSelect.value, 10) : undefined)
        })
    }

    const etymologyContainer = metadataSection.createDiv({ cls: 'hiwords-form-item' })
    etymologyContainer.createEl('label', {
        text: t('modals.etymology_label') || '词源（可选）',
        cls: 'hiwords-form-item-label'
    })
    const etymologyInput = etymologyContainer.createEl('input', {
        type: 'text',
        placeholder: t('modals.etymology_placeholder') || '例如：[所屬社] 或 [宣言-]',
        cls: 'setting-item-input etymology-input'
    })
    etymologyInput.value = etymologyValue
    etymologyInput.addEventListener('input', () => {
        onEtymologyChange(etymologyInput.value)
    })

    const pronunciationContainer = metadataSection.createDiv({ cls: 'hiwords-form-item' })
    pronunciationContainer.createEl('label', {
        text: t('modals.pronunciation_label') || '发音（可选）',
        cls: 'hiwords-form-item-label'
    })
    const pronunciationInput = pronunciationContainer.createEl('input', {
        type: 'text',
        placeholder: '',
        cls: 'setting-item-input pronunciation-input'
    })
    pronunciationInput.value = pronunciationValue
    pronunciationInput.addEventListener('input', () => {
        onPronunciationChange(pronunciationInput.value)
    })

    const updatePronunciationPlaceholder = () => {
        const sourceWord = wordInput?.value ?? currentWord
        const key = getPronunciationPlaceholderKey(
            getBookLanguagePolicy(resolveSelectedBook()),
            sourceWord,
            isJapaneseText
        )
        const placeholders: Record<typeof key, string> = {
            'modals.pronunciation_placeholder_japanese': '例如：かな / カナ',
            'modals.pronunciation_placeholder': '例如：/həˈloʊ/ 或 かな',
            'modals.pronunciation_placeholder_english': 'e.g.: /həˈloʊ/'
        }
        pronunciationInput.placeholder = t(key) || placeholders[key]
    }

    updatePronunciationPlaceholder()
    bookSelect.addEventListener('change', () => {
        onBookChange(bookSelect.value || null)
        targetBookValueEl.textContent = resolveBookDisplayName(bookSelect.value || null)
        targetBookValueEl.classList.toggle('is-muted', !bookSelect.value)
        updatePronunciationPlaceholder()
    })

    const buttonContainer = containerEl.createDiv({ cls: 'hiwords-modal-button-container' })
    const leftButtonGroup = buttonContainer.createDiv({ cls: 'hiwords-button-group-left' })
    if (isEditMode && onDelete) {
        const deleteButton = leftButtonGroup.createEl('button', { cls: 'delete-word-button' })
        deleteButton.setAttribute('aria-label', t('modals.delete_button', 'Delete'))
        const deleteIcon = deleteButton.createSpan({ cls: 'delete-word-button-icon' })
        setIcon(deleteIcon, 'trash')
        deleteButton.createSpan({
            text: t('modals.delete_button', 'Delete'),
            cls: 'delete-word-button-label'
        })
        deleteButton.onclick = () => void onDelete()
    }

    const rightButtonGroup = buttonContainer.createDiv({ cls: 'hiwords-button-group-right' })
    const cancelButton = rightButtonGroup.createEl('button', {
        text: t('modals.cancel_button')
    })
    cancelButton.onclick = onCancel

    const actionKey = isEditMode ? 'modals.save_button' : 'modals.add_button'
    const actionButton = rightButtonGroup.createEl('button', {
        text: t(actionKey),
        cls: 'mod-cta'
    })
    actionButton.onclick = async () => {
        const selectedBook = bookSelect.value
        const colorValue = showColorField && colorSelect?.value ? parseInt(colorSelect.value, 10) : undefined
        const etymology = etymologyInput.value.trim() || undefined
        const pronunciation = pronunciationInput.value.trim() || undefined
        const finalWord = (wordInput?.value.trim() || currentWord).trim()

        if (!finalWord) {
            new Notice(t('notices.word_required') || '单词不能为空')
            wordInput?.focus()
            return
        }

        if (!selectedBook) {
            new Notice(t('notices.select_book_required'))
            return
        }

        await onSubmit({
            selectedBook,
            finalWord,
            definition: definitionInput.value,
            colorValue,
            etymology,
            pronunciation
        })
    }

    return {
        wordInput,
        definitionInput
    }
}
