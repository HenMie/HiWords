import { KoreanMorphologyService, DocumentAnalysisResult } from './korean-morphology-service';
import { TFile } from 'obsidian';

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
 * 负责管理整个工作区的韩语形态学索引，建立从原型到活用形的映射
 */
export class MorphologyIndexManager {
    private morphologyService: KoreanMorphologyService;
    private noteIndexes: Map<string, NoteIndexData> = new Map(); // 文件路径 -> 索引数据
    private globalIndex: Map<string, Set<string>> = new Map(); // 全局索引：原型 -> 活用形集合
    private isEnabled = true;

    constructor(morphologyService: KoreanMorphologyService) {
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
     */
    public async indexNote(file: TFile, content: string): Promise<void> {
        if (!this.isEnabled) {
            return;
        }

        try {
            const filePath = file.path;
            const lastModified = file.stat.mtime;

            // 检查是否需要重新索引
            const existingIndex = this.noteIndexes.get(filePath);
            if (existingIndex && existingIndex.lastModified === lastModified) {
                // 文件未修改，跳过
                return;
            }

            // 分析文档
            const analysisResult = await this.morphologyService.analyzeDocument(content);

            // 如果之前有索引，先从全局索引中移除
            if (existingIndex) {
                this.removeNoteFromGlobalIndex(existingIndex);
            }

            // 保存笔记索引
            const noteIndex: NoteIndexData = {
                filePath,
                lastModified,
                morphologyIndex: analysisResult.morphologyIndex
            };
            this.noteIndexes.set(filePath, noteIndex);

            // 更新全局索引
            this.addNoteToGlobalIndex(noteIndex);


        } catch (error) {
            console.error(`索引笔记失败 ${file.path}:`, error);
        }
    }

    /**
     * 移除笔记索引
     */
    public removeNoteIndex(filePath: string): void {
        const existingIndex = this.noteIndexes.get(filePath);
        if (existingIndex) {
            // 从全局索引中移除
            this.removeNoteFromGlobalIndex(existingIndex);
            // 从笔记索引中移除
            this.noteIndexes.delete(filePath);
        }
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
     * 获取指定原型在所有笔记中的活用形
     */
    public getAllInflectionForms(baseForm: string): Set<string> {
        if (!this.isEnabled) {
            return new Set([baseForm]); // 如果未启用，只返回原型本身
        }

        return this.globalIndex.get(baseForm) || new Set();
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
    } {
        let totalInflections = 0;
        for (const forms of this.globalIndex.values()) {
            totalInflections += forms.size;
        }

        return {
            totalNotes: this.noteIndexes.size,
            totalBaseForms: this.globalIndex.size,
            totalInflections
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
                this.globalIndex.set(baseForm, new Set());
            }
            
            const globalInflections = this.globalIndex.get(baseForm)!;
            for (const inflection of inflections) {
                globalInflections.add(inflection);
            }
        }
    }

    /**
     * 从全局索引中移除笔记索引
     */
    private removeNoteFromGlobalIndex(noteIndex: NoteIndexData): void {
        for (const [baseForm, inflections] of noteIndex.morphologyIndex.entries()) {
            const globalInflections = this.globalIndex.get(baseForm);
            if (globalInflections) {
                for (const inflection of inflections) {
                    globalInflections.delete(inflection);
                }
                
                // 如果该原型没有任何活用形了，从全局索引中移除
                if (globalInflections.size === 0) {
                    this.globalIndex.delete(baseForm);
                }
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
}
