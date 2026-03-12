import { Notice } from 'obsidian'
import type { Command, Editor, MarkdownView } from 'obsidian'
import { extractSentenceFromEditorMultiline } from './utils'
import { t } from './i18n'

interface PluginCommandDeps {
    addCommand: (command: Command) => void
    isMigrationRequired: () => boolean
    showMigrationRequiredNotice: () => void
    loadAllVocabularyBooks: () => Promise<void>
    refreshHighlighter: () => void
    activateSidebarView: () => Promise<void>
    addOrEditWord: (word: string, sentence?: string) => void
    importLegacyCanvasBooks: () => Promise<void>
}

export function registerPluginCommands(deps: PluginCommandDeps): void {
    deps.addCommand({
        id: 'refresh-vocabulary',
        name: t('commands.refresh_vocabulary'),
        callback: async () => {
            if (deps.isMigrationRequired()) {
                deps.showMigrationRequiredNotice()
                return
            }

            await deps.loadAllVocabularyBooks()
            deps.refreshHighlighter()
            new Notice(t('notices.vocabulary_refreshed'))
        }
    })

    deps.addCommand({
        id: 'open-vocabulary-sidebar',
        name: t('commands.show_sidebar'),
        callback: () => void deps.activateSidebarView()
    })

    deps.addCommand({
        id: 'add-selected-word',
        name: t('commands.add_selected_word'),
        editorCallback: (editor: Editor, _view: MarkdownView) => {
            handleAddSelectedWord(editor, deps)
        }
    })

    deps.addCommand({
        id: 'import-canvas-books-to-jsonl',
        name: '导入 Canvas 词书到 JSONL',
        callback: async () => {
            await deps.importLegacyCanvasBooks()
        }
    })
}

function handleAddSelectedWord(editor: Editor, deps: PluginCommandDeps): void {
    const selectedText = editor.getSelection().trim()
    if (!selectedText) {
        new Notice(t('notices.no_selection'))
        return
    }

    if (deps.isMigrationRequired()) {
        deps.showMigrationRequiredNotice()
        return
    }

    const sentence = extractSentenceFromEditorMultiline(editor)
    deps.addOrEditWord(selectedText, sentence)
}
