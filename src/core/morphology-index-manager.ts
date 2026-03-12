import { TFile } from 'obsidian';
import type { UnifiedMorphologyService } from './unified-morphology-service';
import type { MorphologyLanguage } from '../utils/types';

/**
 * 笔记的形态学索引数据
 */
interface NoteIndexData {
    filePath: string;
    lastModified: number;
    morphologyIndex: Map<string, Set<string>>; // 原型 -> 活用形集合
}

/**
 * 形态学索引管理器
 * 负责管理整个工作区的形态学索引，建立从原型到活用形的映射
 */
export class MorphologyIndexManager {
    private morphologyService: UnifiedMorphologyService;
    private noteIndexes: Map<string, NoteIndexData> = new Map(); // 文件路径 -> 索引数据
    private globalIndex: Map<string, Map<string, number>> = new Map(); // 全局索引：原型 -> 活用形 -> 引用计数
    private isEnabled = true;

    constructor(morphologyService: UnifiedMorphologyService) {
        this.morphologyService = morphologyService;
    }

    /**
     * 启用或禁用形态学索引
     */
    public setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
        if (!enabled) {
            this.clearAllIndexes();
        }
    }

    /**
     * 检查是否启用
     */
    public isIndexingEnabled(): boolean {
        return this.isEnabled;
    }

    /**
     * 分析并索引单个笔记
     * @returns 是否发生索引变更
     */
    public async indexNote(file: TFile, content: string): Promise<boolean> {
        if (!this.isEnabled) {
            return false;
        }

        try {
            const filePath = file.path;
            const lastModified = file.stat.mtime;

            const existingIndex = this.noteIndexes.get(filePath);
            if (existingIndex && existingIndex.lastModified === lastModified) {
                return false;
            }

            const analysisResult = await this.morphologyService.analyzeDocument(
                content,
                'auto',
                { languagePolicy: this.getPreferredLanguageForIndexing() }
            );

            if (existingIndex) {
                this.removeNoteFromGlobalIndex(existingIndex);
            }

            const noteIndex: NoteIndexData = {
                filePath,
                lastModified,
                morphologyIndex: analysisResult.morphologyIndex
            };
            this.noteIndexes.set(filePath, noteIndex);

            this.addNoteToGlobalIndex(noteIndex);
            return true;
        } catch (error) {
            console.error(`索引笔记失败 ${file.path}:`, error);
            return false;
        }
    }

    /**
     * 移除笔记索引
     * @returns 是否发生索引变更
     */
    public removeNoteIndex(filePath: string): boolean {
        const existingIndex = this.noteIndexes.get(filePath);
        if (!existingIndex) {
            return false;
        }

        this.removeNoteFromGlobalIndex(existingIndex);
        this.noteIndexes.delete(filePath);
        return true;
    }

    /**
     * 获取指定原型在当前笔记中的所有活用形
     */
    public getInflectionFormsInNote(baseForm: string, filePath: string): Set<string> {
        const noteIndex = this.noteIndexes.get(filePath);
        if (!noteIndex) {
            return new Set();
        }

        return noteIndex.morphologyIndex.get(baseForm) || new Set();
    }

    /**
     * 获取指定原型在所有笔记中的活用形及引用计数
     */
    public getAllInflectionFormsWithCount(baseForm: string): Map<string, number> {
        if (!this.isEnabled) {
            return new Map([[baseForm, 1]]);
        }

        const countMap = this.globalIndex.get(baseForm);
        return countMap ? new Map(countMap) : new Map();
    }

    /**
     * 获取指定原型在所有笔记中的活用形
     */
    public getAllInflectionForms(baseForm: string): Set<string> {
        if (!this.isEnabled) {
            return new Set([baseForm]);
        }

        const countMap = this.globalIndex.get(baseForm);
        if (!countMap) {
            return new Set();
        }

        return new Set(
            Array.from(countMap.entries())
                .filter(([, count]) => count > 0)
                .map(([surface]) => surface)
        );
    }

    /**
     * 获取所有已索引的原型
     */
    public getAllBaseForms(): string[] {
        if (!this.isEnabled) {
            return [];
        }

        return Array.from(this.globalIndex.keys());
    }

    /**
     * 检查指定原型是否在索引中存在
     */
    public hasBaseForm(baseForm: string): boolean {
        if (!this.isEnabled) {
            return false;
        }

        return this.globalIndex.has(baseForm);
    }

    /**
     * 获取索引统计信息
     */
    public getStats(): {
        totalNotes: number;
        totalBaseForms: number;
        totalInflections: number;
        totalInflectionOccurrences: number;
    } {
        let totalInflections = 0;
        let totalInflectionOccurrences = 0;

        for (const forms of this.globalIndex.values()) {
            totalInflections += forms.size;
            for (const count of forms.values()) {
                totalInflectionOccurrences += count;
            }
        }

        return {
            totalNotes: this.noteIndexes.size,
            totalBaseForms: this.globalIndex.size,
            totalInflections,
            totalInflectionOccurrences
        };
    }

    /**
     * 清除所有索引
     */
    public clearAllIndexes(): void {
        this.noteIndexes.clear();
        this.globalIndex.clear();
    }

    /**
     * 重建全局索引
     */
    public rebuildGlobalIndex(): void {
        this.globalIndex.clear();

        for (const noteIndex of this.noteIndexes.values()) {
            this.addNoteToGlobalIndex(noteIndex);
        }
    }

    /**
     * 将笔记索引添加到全局索引
     */
    private addNoteToGlobalIndex(noteIndex: NoteIndexData): void {
        for (const [baseForm, inflections] of noteIndex.morphologyIndex.entries()) {
            if (!this.globalIndex.has(baseForm)) {
                this.globalIndex.set(baseForm, new Map());
            }

            const globalInflections = this.globalIndex.get(baseForm);
            if (!globalInflections) {
                continue;
            }
            for (const inflection of inflections) {
                const currentCount = globalInflections.get(inflection) || 0;
                globalInflections.set(inflection, currentCount + 1);
            }
        }
    }

    /**
     * 从全局索引中移除笔记索引
     */
    private removeNoteFromGlobalIndex(noteIndex: NoteIndexData): void {
        for (const [baseForm, inflections] of noteIndex.morphologyIndex.entries()) {
            const globalInflections = this.globalIndex.get(baseForm);
            if (!globalInflections) {
                continue;
            }

            for (const inflection of inflections) {
                const currentCount = globalInflections.get(inflection) || 0;
                const nextCount = currentCount - 1;
                if (nextCount <= 0) {
                    globalInflections.delete(inflection);
                } else {
                    globalInflections.set(inflection, nextCount);
                }
            }

            if (globalInflections.size === 0) {
                this.globalIndex.delete(baseForm);
            }
        }
    }

    /**
     * 获取需要重新索引的笔记列表
     */
    public getNotesToReindex(files: TFile[]): TFile[] {
        if (!this.isEnabled) {
            return [];
        }

        const toReindex: TFile[] = [];

        for (const file of files) {
            const existingIndex = this.noteIndexes.get(file.path);
            if (!existingIndex || existingIndex.lastModified !== file.stat.mtime) {
                toReindex.push(file);
            }
        }

        return toReindex;
    }

    /**
     * 清理资源
     */
    public destroy(): void {
        this.clearAllIndexes();
    }

    private getPreferredLanguageForIndexing(): MorphologyLanguage {
        const koreanLoaded = this.morphologyService.isKoreanLoaded();
        const japaneseLoaded = this.morphologyService.isJapaneseLoaded();

        if (koreanLoaded && !japaneseLoaded) {
            return 'korean';
        }

        if (japaneseLoaded && !koreanLoaded) {
            return 'japanese';
        }

        return 'auto';
    }
}
