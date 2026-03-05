/**
 * Canvas 服务
 * 负责所有 Canvas 文件的操作
 */

import { App, TFile } from 'obsidian';
import { WordDefinition, HiWordsSettings } from '../utils';
import { CanvasParser, CanvasEditor } from '../canvas';

/**
 * Canvas 服务
 * 整合所有 Canvas 相关操作
 */
export class CanvasService {
    private app: App;
    private canvasParser: CanvasParser;
    private canvasEditor: CanvasEditor;
    private settings: HiWordsSettings;

    constructor(app: App, settings: HiWordsSettings) {
        this.app = app;
        this.settings = settings;
        this.canvasParser = new CanvasParser(app, settings);
        this.canvasEditor = new CanvasEditor(app, settings);
    }

    /**
     * 更新设置
     */
    updateSettings(settings: HiWordsSettings): void {
        this.settings = settings;
        
        // 同步给 CanvasEditor
        if (this.canvasEditor && (this.canvasEditor as any).updateSettings) {
            this.canvasEditor.updateSettings(settings);
        }
        
        // 同步给 CanvasParser（影响掌握判定等）
        if (this.canvasParser && (this.canvasParser as any).updateSettings) {
            this.canvasParser.updateSettings(settings);
        }
    }

    /**
     * 检查文件是否为 Canvas 文件
     */
    static isCanvasFile(file: TFile): boolean {
        return CanvasParser.isCanvasFile(file);
    }

    /**
     * 解析 Canvas 文件，获取词汇定义
     * @param file Canvas 文件
     * @returns 词汇定义数组
     */
    async parseCanvasFile(file: TFile): Promise<WordDefinition[]> {
        return this.canvasParser.parseCanvasFile(file);
    }

    /**
     * 添加词汇到 Canvas 文件
     * @param bookPath Canvas 文件路径
     * @param word 单词
     * @param definition 定义
     * @param color 颜色（可选）
     * @param etymology 词源（可选）
     * @param pronunciation 发音（可选）
     * @returns 操作是否成功
     */
    async addWordToCanvas(
        bookPath: string,
        word: string,
        definition: string,
        color?: number,
        etymology?: string,
        pronunciation?: string
    ): Promise<boolean> {
        try {
            return await this.canvasEditor.addWordToCanvas(
                bookPath,
                word,
                definition,
                color,
                etymology,
                pronunciation
            );
        } catch (error) {
            console.error('[CanvasService] 添加词汇失败:', error);
            return false;
        }
    }

    /**
     * 更新 Canvas 文件中的词汇
     * @param bookPath Canvas 文件路径
     * @param nodeId 节点 ID
     * @param word 单词
     * @param definition 定义
     * @param color 颜色（可选）
     * @param etymology 词源（可选）
     * @param pronunciation 发音（可选）
     * @returns 操作是否成功
     */
    async updateWordInCanvas(
        bookPath: string,
        nodeId: string,
        word: string,
        definition: string,
        color?: number,
        etymology?: string,
        pronunciation?: string
    ): Promise<boolean> {
        try {
            return await this.canvasEditor.updateWordInCanvas(
                bookPath,
                nodeId,
                word,
                definition,
                color,
                etymology,
                pronunciation
            );
        } catch (error) {
            console.error('[CanvasService] 更新词汇失败:', error);
            return false;
        }
    }

    /**
     * 从 Canvas 文件中删除词汇
     * @param bookPath Canvas 文件路径
     * @param nodeId 节点 ID
     * @returns 操作是否成功
     */
    async deleteWordFromCanvas(bookPath: string, nodeId: string): Promise<boolean> {
        try {
            return await this.canvasEditor.deleteWordFromCanvas(bookPath, nodeId);
        } catch (error) {
            console.error('[CanvasService] 删除词汇失败:', error);
            return false;
        }
    }

    /**
     * 设置节点颜色
     * @param bookPath Canvas 文件路径
     * @param nodeId 节点 ID
     * @param color 颜色（可选，undefined 表示清除颜色）
     * @returns 操作是否成功
     */
    async setNodeColor(
        bookPath: string,
        nodeId: string,
        color?: number
    ): Promise<boolean> {
        try {
            return await this.canvasEditor.setNodeColor(bookPath, nodeId, color);
        } catch (error) {
            console.error('[CanvasService] 设置节点颜色失败:', error);
            return false;
        }
    }

    /**
     * 保存单词定义到 Canvas 文件
     * @param bookPath Canvas 文件路径
     * @param nodeId 节点 ID
     * @param wordDef 单词定义
     */
    async saveWordDefinitionToCanvas(
        bookPath: string,
        nodeId: string,
        wordDef: WordDefinition
    ): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(bookPath);
        if (!(file instanceof TFile)) {
            throw new Error(`Canvas 文件不存在: ${bookPath}`);
        }

        try {
            // 使用 Vault.process 修改文件
            await this.app.vault.process(file, (content) => {
                const canvasData = JSON.parse(content);

                // 找到要更新的节点
                const node = canvasData.nodes.find((n: any) => n.id === wordDef.nodeId);
                if (!node) {
                    throw new Error(`找不到节点 ID: ${wordDef.nodeId}`);
                }

                // 构建纯文本内容，不包含 frontmatter
                let textContent = wordDef.word;

                if (wordDef.pronunciation) {
                    textContent += `\n【${wordDef.pronunciation}】`;
                }

                if (wordDef.etymology) {
                    textContent += `\n[${wordDef.etymology}]`;
                }

                if (wordDef.definition) {
                    const needsBlankLine = !!wordDef.pronunciation || !!wordDef.etymology;
                    textContent += `${needsBlankLine ? '\n\n' : '\n'}${wordDef.definition}`;
                }

                // 更新节点内容
                node.text = textContent;

                // 返回更新后的内容
                return JSON.stringify(canvasData);
            });
        } catch (error) {
            console.error('[CanvasService] 保存 Canvas 文件失败:', error);
            throw error;
        }
    }

    /**
     * 获取 Canvas 解析器
     */
    getParser(): CanvasParser {
        return this.canvasParser;
    }

    /**
     * 获取 Canvas 编辑器
     */
    getEditor(): CanvasEditor {
        return this.canvasEditor;
    }
}

