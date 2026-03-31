import type { App, TFile, WorkspaceLeaf } from 'obsidian'
import type { ArticleVocabularySnapshot, WordDefinition } from '../utils'
import {
    removeOverlappingMatches,
    DOCUMENT_POSITION,
    PDF_TEXT_EXTRACT_DELAY
} from '../utils'
import type { VocabularyManager } from './vocabulary-manager'
import { WordMatcherService } from './word-matcher-service'

interface BuildArticleVocabularySnapshotInput {
    app: App
    file: TFile
    leaf?: WorkspaceLeaf | null
    vocabularyManager: VocabularyManager
    wordMatcherService?: WordMatcherService
}

interface PdfTextExtractionResult {
    status: 'ready' | 'not-ready' | 'failed'
    content?: string
    diagnostics?: string
}

export async function buildArticleVocabularySnapshot(
    input: BuildArticleVocabularySnapshotInput
): Promise<ArticleVocabularySnapshot> {
    const { app, file, vocabularyManager } = input
    const snapshotBase = {
        filePath: file.path,
        fileName: file.basename,
        words: [] as WordDefinition[]
    }

    if (file.extension !== 'md' && file.extension !== 'pdf') {
        return {
            ...snapshotBase,
            status: 'failed',
            diagnostics: 'Unsupported file type for article vocabulary export.'
        }
    }

    let wordMatcherService = input.wordMatcherService
    let ownsMatcher = false
    if (!wordMatcherService) {
        wordMatcherService = new WordMatcherService(vocabularyManager)
        ownsMatcher = true
    }

    try {
        let content = ''
        if (file.extension === 'pdf') {
            const pdfExtraction = await extractPdfTextFromDom(app, file, input.leaf ?? null)
            if (pdfExtraction.status !== 'ready') {
                return {
                    ...snapshotBase,
                    status: pdfExtraction.status,
                    diagnostics: pdfExtraction.diagnostics
                }
            }
            content = pdfExtraction.content ?? ''
        } else {
            content = await app.vault.read(file)
        }

        wordMatcherService.buildTrie(true)
        const matches = wordMatcherService.findMatches(content)
        const filteredMatches = removeOverlappingMatches(matches)
        const contentLength = content.length

        const wordAllPositionsMap = new Map<string, { wordDef: WordDefinition; positions: number[] }>()
        for (const match of filteredMatches) {
            const definition = match.payload
            if (!definition?.nodeId) {
                continue
            }

            const positionGroup = wordAllPositionsMap.get(definition.nodeId) ?? {
                wordDef: definition,
                positions: []
            }
            positionGroup.positions.push(match.from)
            wordAllPositionsMap.set(definition.nodeId, positionGroup)
        }

        const wordPositionMap = new Map<string, { wordDef: WordDefinition; position: number }>()
        for (const [nodeId, { wordDef, positions }] of wordAllPositionsMap.entries()) {
            positions.sort((a, b) => a - b)
            wordPositionMap.set(nodeId, {
                wordDef,
                position: selectBestDocumentPosition(positions, contentLength)
            })
        }

        const foundWordsWithPosition = Array.from(wordPositionMap.values())
        foundWordsWithPosition.sort((a, b) => a.position - b.position)
        const words = foundWordsWithPosition.map((item) => item.wordDef)

        if (words.length === 0) {
            return {
                ...snapshotBase,
                status: 'empty',
                diagnostics: 'No vocabulary words found in the current document.'
            }
        }

        return {
            ...snapshotBase,
            status: 'ready',
            words
        }
    } catch (error) {
        console.error('[HiWords] Failed to build article vocabulary snapshot:', error)
        return {
            ...snapshotBase,
            status: 'failed',
            diagnostics: formatSnapshotError(error, 'Failed to build article vocabulary snapshot.')
        }
    } finally {
        if (ownsMatcher) {
            wordMatcherService.destroy()
        }
    }
}

export function selectBestDocumentPosition(positions: number[], contentLength: number): number {
    if (positions.length === 0) {
        return 0
    }

    if (positions.length === 1) {
        return positions[0]
    }

    const firstThirdThreshold = contentLength * DOCUMENT_POSITION.FIRST_THIRD_RATIO
    const secondThirdThreshold = contentLength * DOCUMENT_POSITION.SECOND_THIRD_RATIO

    const earlyPosition = positions.find((pos) => pos <= firstThirdThreshold)
    if (earlyPosition !== undefined) {
        return earlyPosition
    }

    const middlePosition = positions.find(
        (pos) => pos > firstThirdThreshold && pos <= secondThirdThreshold
    )
    if (middlePosition !== undefined) {
        return middlePosition
    }

    const latePosition = positions.find((pos) => pos > secondThirdThreshold)
    if (latePosition !== undefined) {
        const endThreshold = contentLength * DOCUMENT_POSITION.END_RATIO
        if (latePosition > endThreshold && positions.length > 1) {
            const adjustedPosition = positions.find((pos) => pos <= endThreshold)
            if (adjustedPosition !== undefined) {
                return adjustedPosition
            }
        }
        return latePosition
    }

    return positions[0]
}

async function extractPdfTextFromDom(
    app: App,
    file: TFile,
    leaf: WorkspaceLeaf | null
): Promise<PdfTextExtractionResult> {
    try {
        await new Promise((resolve) => setTimeout(resolve, PDF_TEXT_EXTRACT_DELAY))

        const pdfRoots = getPdfViewRoots(app, file, leaf)
        const textLayers = pdfRoots.flatMap((root) => Array.from(root.querySelectorAll('.textLayer')))
        if (textLayers.length === 0) {
            return {
                status: 'not-ready',
                diagnostics: pdfRoots.length > 0
                    ? 'PDF text layer is not ready yet. Please wait a moment and retry.'
                    : 'No active PDF text layer is available yet. Please wait and retry.'
            }
        }

        let extractedText = ''
        textLayers.forEach((textLayer: Element) => {
            const pdfContainer = textLayer.closest('.pdf-container, .mod-pdf')
            if (!pdfContainer) {
                return
            }

            const textSpans = textLayer.querySelectorAll('span[role="presentation"]')
            textSpans.forEach((span: Element) => {
                const text = span.textContent || ''
                if (text.trim()) {
                    extractedText += `${text} `
                }
            })
            extractedText += '\n'
        })

        if (!extractedText.trim()) {
            pdfRoots.forEach((pdfView) => {
                const text = pdfView.textContent || ''
                if (text.trim()) {
                    extractedText += `${text}\n`
                }
            })
        }

        if (!extractedText.trim()) {
            return {
                status: 'failed',
                diagnostics: 'Failed to extract readable text from the current PDF view.'
            }
        }

        return {
            status: 'ready',
            content: extractedText.trim()
        }
    } catch (error) {
        console.error('[HiWords] PDF text extraction failed:', error)
        return {
            status: 'failed',
            diagnostics: formatSnapshotError(error, 'PDF text extraction failed.')
        }
    }
}

function getPdfViewRoots(app: App, file: TFile, leaf: WorkspaceLeaf | null): HTMLElement[] {
    const preferredRoot = getLeafRoot(leaf, file)
    if (preferredRoot) {
        return preferredRoot
    }

    const matchingLeaf = app.workspace.getLeavesOfType('pdf').find((candidate) => {
        const viewFile = (candidate.view as { file?: TFile | null }).file
        return viewFile?.path === file.path
    })

    return matchingLeaf ? getLeafRoot(matchingLeaf, file) ?? [] : []
}

function getLeafRoot(leaf: WorkspaceLeaf | null, file: TFile): HTMLElement[] | null {
    if (!leaf) {
        return null
    }

    const viewFile = (leaf.view as { file?: TFile | null }).file
    if (viewFile?.path !== file.path) {
        return null
    }

    const root = leaf.view.containerEl
    const scopedRoots = Array.from(root.querySelectorAll('.pdf-container, .mod-pdf')) as HTMLElement[]
    return scopedRoots.length > 0 ? scopedRoots : [root]
}

function formatSnapshotError(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim()) {
        return `${fallback} ${error.message}`
    }
    return fallback
}
