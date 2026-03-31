import type {
    ArticleVocabularyExportConfig,
    ArticleVocabularyExportField,
    ArticleVocabularyExportOrder,
    ArticleVocabularySnapshot,
    HiWordsSettings,
    WordDefinition
} from './types'

export interface ArticleVocabularyExportRow {
    orderInDocument: string
    word: string
    definition: string
    pronunciation: string
    etymology: string
    sourceBookName: string
    sourcePath: string
    nodeId: string
    color: string
    mastered: string
    documentName: string
}

export const ARTICLE_VOCABULARY_EXPORT_FIELDS: ArticleVocabularyExportField[] = [
    'orderInDocument',
    'word',
    'definition',
    'pronunciation',
    'etymology',
    'sourceBookName',
    'sourcePath',
    'nodeId',
    'color',
    'mastered',
    'documentName'
]

export const ARTICLE_VOCABULARY_EXPORT_FIELD_LABEL_KEYS: Record<ArticleVocabularyExportField, string> = {
    orderInDocument: 'settings.export_field_order_in_document',
    word: 'settings.export_field_word',
    definition: 'settings.export_field_definition',
    pronunciation: 'settings.export_field_pronunciation',
    etymology: 'settings.export_field_etymology',
    sourceBookName: 'settings.export_field_source_book_name',
    sourcePath: 'settings.export_field_source_path',
    nodeId: 'settings.export_field_node_id',
    color: 'settings.export_field_color',
    mastered: 'settings.export_field_mastered',
    documentName: 'settings.export_field_document_name'
}

export const ARTICLE_VOCABULARY_EXPORT_ORDER_LABEL_KEYS: Record<ArticleVocabularyExportOrder, string> = {
    document: 'settings.export_order_document',
    alphabetical: 'settings.export_order_alphabetical'
}

export const DEFAULT_ARTICLE_VOCABULARY_EXPORT_FIELDS: ArticleVocabularyExportField[] = [
    'word',
    'definition',
    'pronunciation',
    'etymology',
    'sourceBookName',
    'mastered'
]

export function sanitizeExportFields(
    fields: ArticleVocabularyExportField[] | undefined,
    fallback: ArticleVocabularyExportField[] = DEFAULT_ARTICLE_VOCABULARY_EXPORT_FIELDS
): ArticleVocabularyExportField[] {
    const source = fields && fields.length > 0 ? fields : fallback
    const unique = Array.from(
        new Set(source.filter((field) => ARTICLE_VOCABULARY_EXPORT_FIELDS.includes(field)))
    )

    return unique.length > 0 ? unique : [...fallback]
}

export function getDefaultArticleVocabularyExportConfig(
    settings: HiWordsSettings
): Pick<ArticleVocabularyExportConfig, 'fields' | 'order'> {
    return {
        fields: sanitizeExportFields(settings.exportFields, DEFAULT_ARTICLE_VOCABULARY_EXPORT_FIELDS),
        order: sanitizeExportOrder(settings.exportOrder)
    }
}

export function sanitizeExportOrder(order: ArticleVocabularyExportOrder | undefined): ArticleVocabularyExportOrder {
    return order === 'alphabetical' ? 'alphabetical' : 'document'
}

export function buildBookNameResolver(settings: HiWordsSettings): (sourcePath: string) => string {
    const bookNameMap = new Map(settings.vocabularyBooks.map((book) => [book.path, book.name]))
    return (sourcePath: string) => bookNameMap.get(sourcePath)
        ?? sourcePath.split('/').pop()?.replace(/\.(canvas|jsonl)$/i, '')
        ?? sourcePath
}

export function buildArticleVocabularyExportRows(
    snapshot: ArticleVocabularySnapshot,
    settings: HiWordsSettings,
    order: ArticleVocabularyExportOrder
): ArticleVocabularyExportRow[] {
    const resolveBookName = buildBookNameResolver(settings)
    const rows = snapshot.words.map((wordDef, index) =>
        buildArticleVocabularyExportRow(snapshot.fileName, wordDef, index, resolveBookName)
    )

    if (order === 'alphabetical') {
        return [...rows].sort((left, right) => {
            const wordDiff = left.word.localeCompare(right.word, undefined, { sensitivity: 'base' })
            if (wordDiff !== 0) {
                return wordDiff
            }
            return Number(left.orderInDocument) - Number(right.orderInDocument)
        })
    }

    return rows
}

function buildArticleVocabularyExportRow(
    documentName: string,
    wordDef: WordDefinition,
    index: number,
    resolveBookName: (sourcePath: string) => string
): ArticleVocabularyExportRow {
    return {
        orderInDocument: String(index + 1),
        word: wordDef.word,
        definition: wordDef.definition,
        pronunciation: wordDef.pronunciation ?? '',
        etymology: wordDef.etymology ?? '',
        sourceBookName: resolveBookName(wordDef.source),
        sourcePath: wordDef.source,
        nodeId: wordDef.nodeId,
        color: wordDef.color ?? '',
        mastered: wordDef.mastered ? 'true' : 'false',
        documentName
    }
}

export function serializeArticleVocabularyRowsToCsv(
    fields: ArticleVocabularyExportField[],
    rows: ArticleVocabularyExportRow[]
): string {
    const header = fields.join(',')
    const body = rows.map((row) => fields.map((field) => escapeCsvCell(row[field] ?? '')).join(','))
    return [header, ...body].join('\n')
}

function escapeCsvCell(value: string): string {
    const normalizedValue = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    if (!/[",\n]/.test(normalizedValue)) {
        return normalizedValue
    }

    return `"${normalizedValue.replace(/"/g, '""')}"`
}

export function buildArticleVocabularyExportFilePath(
    folderPath: string,
    documentName: string,
    now = new Date()
): string {
    const timestamp = formatExportTimestamp(now)
    const safeDocumentName = sanitizeFileName(documentName)
    const fileName = `${safeDocumentName}-hiwords-export-${timestamp}.csv`
    const normalizedFolderPath = normalizeVaultPath(folderPath)
    return normalizedFolderPath ? `${normalizedFolderPath}/${fileName}` : fileName
}

function sanitizeFileName(value: string): string {
    const sanitized = value.replace(/[\\/:*?"<>|]/g, '-').trim()
    return sanitized.length > 0 ? sanitized : 'document'
}

function formatExportTimestamp(now: Date): string {
    const year = now.getFullYear()
    const month = padNumber(now.getMonth() + 1)
    const day = padNumber(now.getDate())
    const hours = padNumber(now.getHours())
    const minutes = padNumber(now.getMinutes())
    return `${year}${month}${day}-${hours}${minutes}`
}

function padNumber(value: number): string {
    return value.toString().padStart(2, '0')
}

export async function ensureFolderExists(
    createFolder: (path: string) => Promise<unknown>,
    folderExists: (path: string) => boolean,
    folderPath: string
): Promise<void> {
    const normalizedFolderPath = normalizeVaultPath(folderPath)
    if (!normalizedFolderPath) {
        return
    }

    const segments = normalizedFolderPath.split('/').filter(Boolean)
    let currentPath = ''
    for (const segment of segments) {
        currentPath = currentPath ? `${currentPath}/${segment}` : segment
        if (folderExists(currentPath)) {
            continue
        }
        await createFolder(currentPath)
    }
}

function normalizeVaultPath(path: string): string {
    return path
        .replace(/\\/g, '/')
        .split('/')
        .filter(Boolean)
        .join('/')
}
