import { App, TFile } from 'obsidian';
import { WordDefinition, genHex16 } from '../utils';

export interface JsonlWordRecord {
    id: string;
    word: string;
    definition: string;
    pronunciation?: string;
    etymology?: string;
    color?: string;
    mastered?: boolean;
    isPattern?: boolean;
    patternParts?: string[];
    createdAt: number;
    updatedAt: number;
}

interface JsonlWordPatch {
    word?: string;
    definition?: string;
    pronunciation?: string;
    etymology?: string;
    color?: string;
    mastered?: boolean;
    isPattern?: boolean;
    patternParts?: string[];
}

interface CreateWordInput {
    word: string;
    definition: string;
    pronunciation?: string;
    etymology?: string;
    color?: string;
    mastered?: boolean;
    isPattern?: boolean;
    patternParts?: string[];
}

export class JsonlVocabularyService {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    static isJsonlFile(file: TFile): boolean {
        return file.extension.toLowerCase() === 'jsonl';
    }

    async validateJsonlFile(file: TFile): Promise<boolean> {
        if (!JsonlVocabularyService.isJsonlFile(file)) {
            return false;
        }

        try {
            const content = await this.app.vault.read(file);
            this.parseJsonlContent(content, file.path);
            return true;
        } catch (error) {
            console.error(`[HiWords] JSONL 文件校验失败: ${file.path}`, error);
            return false;
        }
    }

    async parseJsonlFile(file: TFile): Promise<WordDefinition[]> {
        if (!JsonlVocabularyService.isJsonlFile(file)) {
            throw new Error(`文件不是 JSONL 格式: ${file.path}`);
        }

        const content = await this.app.vault.read(file);
        const records = this.parseJsonlContent(content, file.path);
        return records.map((record) => this.recordToDefinition(record, file.path));
    }

    async addWord(bookPath: string, input: CreateWordInput): Promise<WordDefinition> {
        const file = this.getJsonlFile(bookPath);
        const now = Date.now();
        const record: JsonlWordRecord = {
            id: genHex16(),
            word: input.word,
            definition: input.definition,
            pronunciation: input.pronunciation,
            etymology: input.etymology,
            color: input.color,
            mastered: input.mastered ?? false,
            isPattern: input.isPattern,
            patternParts: input.patternParts,
            createdAt: now,
            updatedAt: now,
        };

        await this.app.vault.process(file, (content) => {
            const normalized = content.endsWith('\n') || content.length === 0 ? content : `${content}\n`;
            return `${normalized}${JSON.stringify(record)}\n`;
        });

        return this.recordToDefinition(record, bookPath);
    }

    async updateWord(bookPath: string, nodeId: string, patch: JsonlWordPatch): Promise<WordDefinition | null> {
        const file = this.getJsonlFile(bookPath);
        let updatedRecord: JsonlWordRecord | null = null;

        await this.app.vault.process(file, (content) => {
            const records = this.parseJsonlContent(content, file.path);
            const index = records.findIndex((record) => record.id === nodeId);
            if (index === -1) {
                return content;
            }

            updatedRecord = this.applyPatch(records[index], patch);
            records[index] = updatedRecord;
            return this.serializeRecords(records);
        });

        if (!updatedRecord) {
            return null;
        }

        return this.recordToDefinition(updatedRecord, bookPath);
    }

    async deleteWord(bookPath: string, nodeId: string): Promise<boolean> {
        const file = this.getJsonlFile(bookPath);
        let deleted = false;

        await this.app.vault.process(file, (content) => {
            const records = this.parseJsonlContent(content, file.path);
            const index = records.findIndex((record) => record.id === nodeId);
            if (index === -1) {
                return content;
            }

            records.splice(index, 1);
            deleted = true;
            return this.serializeRecords(records);
        });

        return deleted;
    }

    async setNodeColor(bookPath: string, nodeId: string, color?: string): Promise<WordDefinition | null> {
        return this.updateWord(bookPath, nodeId, { color });
    }

    async saveWordDefinition(bookPath: string, nodeId: string, wordDef: WordDefinition): Promise<void> {
        const updated = await this.updateWord(bookPath, nodeId, {
            word: wordDef.word,
            definition: wordDef.definition,
            pronunciation: wordDef.pronunciation,
            etymology: wordDef.etymology,
            color: wordDef.color,
            mastered: wordDef.mastered ?? false,
            isPattern: wordDef.isPattern,
            patternParts: wordDef.patternParts,
        });

        if (!updated) {
            throw new Error(`找不到词条 ID: ${nodeId}`);
        }
    }

    serializeRecords(records: JsonlWordRecord[]): string {
        if (records.length === 0) {
            return '';
        }
        return `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
    }

    createRecordFromDefinition(def: WordDefinition, now: number = Date.now()): JsonlWordRecord {
        return {
            id: def.nodeId || genHex16(),
            word: def.word,
            definition: def.definition,
            pronunciation: def.pronunciation,
            etymology: def.etymology,
            color: def.color,
            mastered: def.mastered ?? false,
            isPattern: def.isPattern,
            patternParts: def.patternParts,
            createdAt: now,
            updatedAt: now,
        };
    }

    private applyPatch(source: JsonlWordRecord, patch: JsonlWordPatch): JsonlWordRecord {
        const next: JsonlWordRecord = {
            ...source,
            updatedAt: Date.now(),
        };

        if (patch.word !== undefined) next.word = patch.word;
        if (patch.definition !== undefined) next.definition = patch.definition;
        if (patch.pronunciation !== undefined) next.pronunciation = patch.pronunciation;
        if (patch.etymology !== undefined) next.etymology = patch.etymology;
        if (patch.mastered !== undefined) next.mastered = patch.mastered;
        if (patch.isPattern !== undefined) next.isPattern = patch.isPattern;
        if (patch.patternParts !== undefined) next.patternParts = patch.patternParts;
        if (patch.color !== undefined) {
            next.color = patch.color;
        } else if (Object.prototype.hasOwnProperty.call(patch, 'color')) {
            delete next.color;
        }

        return next;
    }

    private getJsonlFile(bookPath: string): TFile {
        const file = this.app.vault.getAbstractFileByPath(bookPath);
        if (!(file instanceof TFile)) {
            throw new Error(`词书文件不存在: ${bookPath}`);
        }
        if (!JsonlVocabularyService.isJsonlFile(file)) {
            throw new Error(`词书文件不是 JSONL: ${bookPath}`);
        }
        return file;
    }

    private parseJsonlContent(content: string, filePath: string): JsonlWordRecord[] {
        const records: JsonlWordRecord[] = [];
        const lines = content.split(/\r?\n/);

        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            const line = rawLine.trim();
            if (!line) {
                continue;
            }

            let parsed: unknown;
            try {
                parsed = JSON.parse(line);
            } catch (error) {
                throw new Error(`[${filePath}] 第 ${i + 1} 行 JSON 解析失败: ${(error as Error).message}`);
            }

            records.push(this.ensureRecordShape(parsed, filePath, i + 1));
        }

        return records;
    }

    private ensureRecordShape(value: unknown, filePath: string, lineNumber: number): JsonlWordRecord {
        if (!value || typeof value !== 'object') {
            throw new Error(`[${filePath}] 第 ${lineNumber} 行不是对象`);
        }

        const obj = value as Record<string, unknown>;
        if (typeof obj.id !== 'string' || obj.id.length === 0) {
            throw new Error(`[${filePath}] 第 ${lineNumber} 行缺少有效 id`);
        }
        if (typeof obj.word !== 'string') {
            throw new Error(`[${filePath}] 第 ${lineNumber} 行缺少有效 word`);
        }

        const now = Date.now();
        return {
            id: obj.id,
            word: obj.word,
            definition: typeof obj.definition === 'string' ? obj.definition : '',
            pronunciation: typeof obj.pronunciation === 'string' ? obj.pronunciation : undefined,
            etymology: typeof obj.etymology === 'string' ? obj.etymology : undefined,
            color: typeof obj.color === 'string' ? obj.color : undefined,
            mastered: typeof obj.mastered === 'boolean' ? obj.mastered : false,
            isPattern: typeof obj.isPattern === 'boolean' ? obj.isPattern : undefined,
            patternParts: Array.isArray(obj.patternParts)
                ? obj.patternParts.filter((part): part is string => typeof part === 'string')
                : undefined,
            createdAt: typeof obj.createdAt === 'number' ? obj.createdAt : now,
            updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : now,
        };
    }

    private recordToDefinition(record: JsonlWordRecord, sourcePath: string): WordDefinition {
        return {
            word: record.word,
            definition: record.definition,
            pronunciation: record.pronunciation,
            etymology: record.etymology,
            source: sourcePath,
            nodeId: record.id,
            color: record.color,
            mastered: record.mastered ?? false,
            isPattern: record.isPattern,
            patternParts: record.patternParts,
        };
    }
}
