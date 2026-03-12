import { TFile } from 'obsidian'
import type { App, Editor, EventRef } from 'obsidian'
import type { VocabularyBook } from './utils'
import { HIGHLIGHTER_REFRESH, extractSentenceFromEditorMultiline } from './utils'
import type { VocabularyManager } from './core'
import { t } from './i18n'

interface PluginEventDeps {
    app: App
    registerEvent: (eventRef: EventRef) => void
    registerTimeout: (callback: () => void, delay: number) => number
    getVocabularyBooks: () => VocabularyBook[]
    isMigrationRequired: () => boolean
    saveSettings: () => Promise<void>
    vocabularyManager: VocabularyManager
    refreshHighlighter: () => void
    addOrEditWord: (word: string, sentence?: string) => void
}

export function registerPluginEvents(deps: PluginEventDeps): void {
    const modifiedBookFiles = new Set<string>()
    let activeBookFile: string | null = null

    const replaceTrackedBookPath = (oldPath: string, newPath: string) => {
        if (activeBookFile === oldPath) {
            activeBookFile = newPath
        }
        if (modifiedBookFiles.delete(oldPath)) {
            modifiedBookFiles.add(newPath)
        }
    }

    deps.registerEvent(
        deps.app.vault.on('modify', (file) => {
            if (!(file instanceof TFile)) {
                return
            }

            const isVocabBook = deps.getVocabularyBooks().some((book) => book.path === file.path)
            if (isVocabBook) {
                modifiedBookFiles.add(file.path)
            }
        })
    )

    deps.registerEvent(
        deps.app.vault.on('rename', async (file, oldPath) => {
            if (!(file instanceof TFile)) {
                return
            }

            const bookIndex = deps.getVocabularyBooks().findIndex((book) => book.path === oldPath)
            if (bookIndex === -1) {
                replaceTrackedBookPath(oldPath, file.path)
                return
            }

            const books = deps.getVocabularyBooks()
            books[bookIndex].path = file.path
            books[bookIndex].name = file.basename
            replaceTrackedBookPath(oldPath, file.path)

            await deps.saveSettings()
            deps.vocabularyManager.removeBookData(oldPath)
            if (deps.isMigrationRequired()) {
                modifiedBookFiles.delete(file.path)
                deps.refreshHighlighter()
                return
            }

            await deps.vocabularyManager.reloadVocabularyBook(file.path)
            modifiedBookFiles.delete(file.path)
            deps.refreshHighlighter()
        })
    )

    deps.registerEvent(
        deps.app.workspace.on('active-leaf-change', async () => {
            await handleActiveLeafChange(
                deps,
                modifiedBookFiles,
                activeBookFile,
                (value) => {
                    activeBookFile = value
                }
            )
        })
    )

    deps.registerEvent(
        deps.app.workspace.on('editor-menu', (menu, editor: Editor) => {
            addEditorMenuItem(editor, deps, menu)
        })
    )
}

async function handleActiveLeafChange(
    deps: PluginEventDeps,
    modifiedBookFiles: Set<string>,
    activeBookFile: string | null,
    setActiveBookFile: (value: string | null) => void
): Promise<void> {
    const activeFile = deps.app.workspace.getActiveFile()

    if (
        activeBookFile &&
        modifiedBookFiles.has(activeBookFile) &&
        (!activeFile || activeFile.path !== activeBookFile)
    ) {
        if (!deps.isMigrationRequired()) {
            await deps.vocabularyManager.reloadVocabularyBook(activeBookFile)
            deps.refreshHighlighter()
        }
        modifiedBookFiles.delete(activeBookFile)
    }

    const isActiveBook = activeFile
        ? deps.getVocabularyBooks().some((book) => book.path === activeFile.path)
        : false

    if (activeFile && isActiveBook) {
        setActiveBookFile(activeFile.path)
        return
    }

    setActiveBookFile(null)
    if (modifiedBookFiles.size > 0) {
        await reloadModifiedBooks(deps, modifiedBookFiles)
        return
    }

    deps.registerTimeout(() => deps.refreshHighlighter(), HIGHLIGHTER_REFRESH.FILE_SWITCH)
    deps.registerTimeout(() => {
        void indexCurrentDocument(deps)
    }, HIGHLIGHTER_REFRESH.INDEX_COMPLETE)
}

async function reloadModifiedBooks(
    deps: PluginEventDeps,
    modifiedBookFiles: Set<string>
): Promise<void> {
    const filesToProcess = Array.from(modifiedBookFiles)
    modifiedBookFiles.clear()

    if (deps.isMigrationRequired()) {
        return
    }

    for (const filePath of filesToProcess) {
        await deps.vocabularyManager.reloadVocabularyBook(filePath)
    }
    deps.refreshHighlighter()
}

async function indexCurrentDocument(deps: PluginEventDeps): Promise<void> {
    const activeFile = deps.app.workspace.getActiveFile()
    if (!activeFile || activeFile.extension !== 'md') {
        deps.refreshHighlighter()
        return
    }

    try {
        const content = await deps.app.vault.read(activeFile)
        const changed = await deps.vocabularyManager.getMorphologyIndexManager().indexNote(activeFile, content)
        if (changed) {
            deps.vocabularyManager.invalidateMatcherSnapshot(`index-current:${activeFile.path}`)
        }
    } catch (error) {
        console.error('[HiWords] 索引当前文档失败:', error)
    } finally {
        deps.refreshHighlighter()
    }
}

function addEditorMenuItem(
    editor: Editor,
    deps: PluginEventDeps,
    menu: {
        addItem: (build: (item: { setTitle: (title: string) => { onClick: (callback: () => void) => void } }) => void) => void
    }
): void {
    const selection = editor.getSelection().trim()
    if (!selection || deps.isMigrationRequired()) {
        return
    }

    const titleKey = deps.vocabularyManager.hasWord(selection)
        ? 'commands.edit_word'
        : 'commands.add_word'

    menu.addItem((item) => {
        item
            .setTitle(t(titleKey))
            .onClick(() => {
                const sentence = extractSentenceFromEditorMultiline(editor)
                deps.addOrEditWord(selection, sentence)
            })
    })
}
