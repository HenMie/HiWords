import { App, TFile } from 'obsidian';
import { HiWordsSettings, WordDefinition } from '../utils';
import { CanvasParser } from '../canvas';
import { JsonlVocabularyService, JsonlWordRecord } from './jsonl-vocabulary-service';

export interface CanvasImportResult {
    sourcePath: string;
    outputPath: string;
    sourceCount: number;
    importedCount: number;
}

export class CanvasJsonlImporter {
    private app: App;
    private settings: HiWordsSettings;
    private jsonlService: JsonlVocabularyService;

    constructor(app: App, settings: HiWordsSettings) {
        this.app = app;
        this.settings = settings;
        this.jsonlService = new JsonlVocabularyService(app);
    }

    async importCanvasBook(bookPath: string): Promise<CanvasImportResult> {
        const sourceFile = this.getCanvasFile(bookPath);
        const outputPath = this.toJsonlPath(sourceFile.path);
        const existing = this.app.vault.getAbstractFileByPath(outputPath);
        if (existing) {
            throw new Error(`目标 JSONL 文件已存在: ${outputPath}`);
        }
        await this.ensureCanvasJsonIsValid(sourceFile);

        const defsByGroup = await this.parseWithMasteredMode(sourceFile, 'group');
        const defsByColor = await this.parseWithMasteredMode(sourceFile, 'color');
        const merged = this.mergeMasteredUnion(defsByGroup, defsByColor);
        const deduped = this.dedupeByWordWithLastWins(merged);
        const now = Date.now();
        const records: JsonlWordRecord[] = deduped.map((definition) => {
            return this.jsonlService.createRecordFromDefinition(definition, now);
        });
        const content = this.jsonlService.serializeRecords(records);
        await this.app.vault.create(outputPath, content);

        return {
            sourcePath: sourceFile.path,
            outputPath,
            sourceCount: merged.length,
            importedCount: records.length,
        };
    }

    private getCanvasFile(bookPath: string): TFile {
        const file = this.app.vault.getAbstractFileByPath(bookPath);
        if (!(file instanceof TFile)) {
            throw new Error(`找不到 Canvas 词书: ${bookPath}`);
        }
        if (file.extension.toLowerCase() !== 'canvas') {
            throw new Error(`文件不是 Canvas 格式: ${bookPath}`);
        }
        return file;
    }

    private toJsonlPath(canvasPath: string): string {
        return canvasPath.replace(/\.canvas$/i, '.jsonl');
    }

    private async parseWithMasteredMode(
        file: TFile,
        mode: 'group' | 'color'
    ): Promise<WordDefinition[]> {
        const parser = new CanvasParser(this.app, {
            ...this.settings,
            masteredDetection: mode,
        });
        return parser.parseCanvasFile(file);
    }

    private async ensureCanvasJsonIsValid(file: TFile): Promise<void> {
        const content = await this.app.vault.read(file);
        if (!content.trim()) {
            throw new Error(`Canvas 文件内容为空: ${file.path}`);
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(content);
        } catch (error) {
            throw new Error(`Canvas JSON 解析失败: ${(error as Error).message}`);
        }

        if (!parsed || typeof parsed !== 'object') {
            throw new Error(`Canvas 数据结构无效: ${file.path}`);
        }

        const data = parsed as Record<string, unknown>;
        if (!Array.isArray(data.nodes)) {
            throw new Error(`Canvas 缺少有效 nodes 数组: ${file.path}`);
        }
        if (data.edges !== undefined && !Array.isArray(data.edges)) {
            throw new Error(`Canvas edges 字段无效: ${file.path}`);
        }
    }

    private mergeMasteredUnion(
        defsByGroup: WordDefinition[],
        defsByColor: WordDefinition[]
    ): WordDefinition[] {
        const colorMasteredByNodeId = new Map<string, boolean>();
        for (const definition of defsByColor) {
            colorMasteredByNodeId.set(definition.nodeId, definition.mastered === true);
        }

        return defsByGroup.map((definition) => ({
            ...definition,
            mastered: (definition.mastered === true) || (colorMasteredByNodeId.get(definition.nodeId) === true),
        }));
    }

    private dedupeByWordWithLastWins(definitions: WordDefinition[]): WordDefinition[] {
        const deduped = new Map<string, WordDefinition>();

        for (const definition of definitions) {
            const key = definition.word.trim().toLowerCase();
            if (deduped.has(key)) {
                deduped.delete(key);
            }
            deduped.set(key, definition);
        }

        return Array.from(deduped.values());
    }
}
