import { App, TFile } from 'obsidian';
import { CanvasData, CanvasNode, WordDefinition, HiWordsSettings, parsePhrase } from '../utils';

export class CanvasParser {
    private app: App;
    private settings?: HiWordsSettings;

    constructor(app: App, settings?: HiWordsSettings) {
        this.app = app;
        this.settings = settings;
    }

    updateSettings(settings: HiWordsSettings) {
        this.settings = settings;
    }

    /**
     * 去除文本中的 Markdown 格式符号
     * @param text 要处理的文本
     * @returns 处理后的文本
     */
    private removeMarkdownFormatting(text: string): string {
        if (!text) return text;
        
        // 去除加粗格式 **text** 或 __text__
        text = text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/__(.*?)__/g, '$1');
        
        // 去除斜体格式 *text* 或 _text_
        text = text.replace(/\*(.*?)\*/g, '$1').replace(/_(.*?)_/g, '$1');
        
        // 去除行内代码格式 `text`
        text = text.replace(/`(.*?)`/g, '$1');
        
        // 去除删除线格式 ~~text~~
        text = text.replace(/~~(.*?)~~/g, '$1');
        
        // 去除高亮格式 ==text==
        text = text.replace(/==(.*?)==/g, '$1');
        
        // 去除链接格式 [text](url)
        text = text.replace(/\[(.*?)\]\(.*?\)/g, '$1');
        
        return text.trim();
    }

    /**
     * 去除 Markdown 文本开头的 Frontmatter（YAML）
     * 仅在文本以 --- 开头时尝试移除首个 frontmatter 块
     */
    private removeFrontmatter(text: string): string {
        if (!text) return text;
        // 去除 BOM
        if (text.charCodeAt(0) === 0xFEFF) {
            text = text.slice(1);
        }
        // 仅当以 --- 开头时尝试剥离到下一处 --- 为止
        if (text.startsWith('---')) {
            const fmEnd = text.indexOf('\n---');
            if (fmEnd !== -1) {
                const after = text.slice(fmEnd + 4); // 跳过 "\n---"
                // 去掉可能紧随其后的一个换行
                return after.replace(/^\r?\n/, '');
            }
        }
        return text;
    }

    /**
     * 解析 Canvas 文件，提取词汇定义
     */
    async parseCanvasFile(file: TFile): Promise<WordDefinition[]> {
        try {
            const content = await this.app.vault.read(file);
            const canvasData: CanvasData = JSON.parse(content);
            
            const detectionMode = this.settings?.masteredDetection ?? 'group';
            // 查找 "Mastered" 分组（当使用分组模式时）
            const masteredGroup = detectionMode === 'group'
                ? canvasData.nodes.find(node => 
                    node.type === 'group' && 
                    (node.label === 'Mastered' || node.label === '已掌握')
                )
                : undefined;
            
            const definitions: WordDefinition[] = [];
            
            for (const node of canvasData.nodes) {
                // 文本节点
                if (node.type === 'text' && node.text) {
                    const wordDef = this.parseTextNode(node, file.path);
                    if (wordDef) {
                        if (detectionMode === 'group') {
                            if (masteredGroup && this.isNodeInGroup(node, masteredGroup)) {
                                wordDef.mastered = true;
                            }
                        } else if (detectionMode === 'color') {
                            if (node.color === '4') {
                                wordDef.mastered = true;
                            }
                        }
                        definitions.push(wordDef);
                    }
                }
                // 文件节点（Markdown）
                else if (node.type === 'file' && node.file) {
                    const wordDef = await this.parseFileNode(node, file.path);
                    if (wordDef) {
                        if (detectionMode === 'group') {
                            if (masteredGroup && this.isNodeInGroup(node, masteredGroup)) {
                                wordDef.mastered = true;
                            }
                        } else if (detectionMode === 'color') {
                            if (node.color === '4') {
                                wordDef.mastered = true;
                            }
                        }
                        definitions.push(wordDef);
                    }
                }
            }
            
            return definitions;
        } catch (error) {
            console.error(`Failed to parse canvas file ${file.path}:`, error);
            return [];
        }
    }

    /**
     * 从任意文本内容解析单词和定义
     */
    private parseFromText(text: string, node: CanvasNode, sourcePath: string): WordDefinition | null {
        if (!text) return null;

        // 先移除 Frontmatter，再整体修剪
        text = this.removeFrontmatter(text).trim();
        let word = '';
        let pronunciation = '';
        let etymology = '';
        let definition = '';

        try {
            // 分割文本行
            const lines = text.split('\n');
            if (lines.length === 0) return null;
            
            // 获取第一行作为主词
            word = lines[0].replace(/^#+\s*/, '').trim();
            
            // 去除 Markdown 格式符号（加粗、斜体、代码块等）
            word = this.removeMarkdownFormatting(word);
            
            if (!word) return null;
            const phraseInfo = parsePhrase(word);
            
            // 解析剩余行，寻找可选元数据（发音/词源）和定义
            let definitionStartIndex = 1;
            while (lines.length > definitionStartIndex) {
                const line = lines[definitionStartIndex].trim();
                if (!line) {
                    definitionStartIndex++;
                    continue;
                }

                // 跳过旧格式中的斜体别名行
                if (line.startsWith('*') && line.endsWith('*') && line.length > 2) {
                    definitionStartIndex++;
                    continue;
                }

                const pronunciationMatch = line.match(/^【(.+)】$/);
                if (pronunciationMatch) {
                    pronunciation = pronunciationMatch[1];
                    definitionStartIndex++;
                    continue;
                }

                const etymologyMatch = line.match(/^\[(.+)\]$/);
                if (etymologyMatch) {
                    etymology = etymologyMatch[1];
                    definitionStartIndex++;
                    continue;
                }

                break;
            }

            // 获取定义部分（从词源/别名之后开始）
            if (lines.length > definitionStartIndex) {
                definition = lines.slice(definitionStartIndex).join('\n').trim();
            }

            const result: WordDefinition = {
                word: phraseInfo.isPattern ? phraseInfo.original : word,
                definition,
                pronunciation: pronunciation || undefined,
                etymology: etymology || undefined,
                source: sourcePath,
                nodeId: node.id,
                color: node.color,
                mastered: false, // 在 parseCanvasFile 中统一设置
                isPattern: phraseInfo.isPattern,
                patternParts: phraseInfo.isPattern ? phraseInfo.parts : undefined
            };
            
            return result;
        } catch (error) {
            console.error(`解析节点文本时出错: ${error}`);
            return null;
        }
    }

    /**
     * 解析文本节点，提取单词和定义（包装通用文本解析）
     */
    private parseTextNode(node: CanvasNode, sourcePath: string): WordDefinition | null {
        if (!node.text) return null;
        return this.parseFromText(node.text, node, sourcePath);
    }

    /**
     * 解析文件节点（Markdown），通过路径读取文件并复用文本解析规则
     */
    private async parseFileNode(node: CanvasNode, sourcePath: string): Promise<WordDefinition | null> {
        try {
            const filePath = node.file;
            if (!filePath) return null;

            const abs = this.app.vault.getAbstractFileByPath(filePath);
            if (!(abs instanceof TFile)) return null;
            if (abs.extension !== 'md') return null;

            const mode = this.settings?.fileNodeParseMode || 'filename-with-content';
            const fileName = abs.basename;
            const normalizedFileName = fileName.toLowerCase();

            if (mode === 'filename') {
                const phraseInfo = parsePhrase(normalizedFileName);
                return {
                    word: phraseInfo.isPattern ? phraseInfo.original : normalizedFileName,
                    definition: '',
                    source: sourcePath,
                    nodeId: node.id,
                    color: node.color,
                    mastered: false,
                    isPattern: phraseInfo.isPattern,
                    patternParts: phraseInfo.isPattern ? phraseInfo.parts : undefined
                };
            }

            const md = await this.app.vault.cachedRead(abs);

            if (mode === 'content') {
                return this.parseFromText(md, node, sourcePath);
            }

            // filename-with-content
            const parsed = this.parseFromText(md, node, sourcePath);
            if (parsed) {
                return parsed;
            }

            const fallbackPhraseInfo = parsePhrase(normalizedFileName);
            return {
                word: fallbackPhraseInfo.isPattern ? fallbackPhraseInfo.original : normalizedFileName,
                definition: '',
                source: sourcePath,
                nodeId: node.id,
                color: node.color,
                mastered: false,
                isPattern: fallbackPhraseInfo.isPattern,
                patternParts: fallbackPhraseInfo.isPattern ? fallbackPhraseInfo.parts : undefined
            };
        } catch (error) {
            console.error('解析文件节点失败:', error);
            return null;
        }
    }

    /**
     * 检查文件是否为 Canvas 文件
     */
    static isCanvasFile(file: TFile): boolean {
        return file.extension === 'canvas';
    }

    /**
     * 验证 Canvas 文件格式
     */
    async validateCanvasFile(file: TFile): Promise<boolean> {
        try {
            const content = await this.app.vault.read(file);
            const trimmed = content?.trim() ?? '';
            // 新建但尚未写入内容的空 Canvas 也视为有效
            if (trimmed === '') return true;

            const data = JSON.parse(trimmed);
            // 若字段缺失，视为默认空数组也有效
            const nodesOk = !('nodes' in data) || Array.isArray(data.nodes);
            const edgesOk = !('edges' in data) || Array.isArray(data.edges);
            return nodesOk && edgesOk;
        } catch {
            // 解析失败，但既然是 .canvas 文件，允许添加，后续解析将返回空结果
            return true;
        }
    }

    /**
     * 检查节点是否在指定分组内
     * @param node 要检查的节点
     * @param group 分组节点
     * @returns 是否在分组内
     */
    public isNodeInGroup(node: CanvasNode, group: CanvasNode): boolean {
        // 仅使用几何判定，避免与 node.group 字段产生二义性
        const nodeX = typeof node.x === 'number' ? node.x : 0;
        const nodeY = typeof node.y === 'number' ? node.y : 0;
        const nodeW = typeof node.width === 'number' ? node.width : 200; // 文本默认宽
        const nodeH = typeof node.height === 'number' ? node.height : 60; // 文本默认高

        const groupX = typeof group.x === 'number' ? group.x : 0;
        const groupY = typeof group.y === 'number' ? group.y : 0;
        const groupW = typeof group.width === 'number' ? group.width : 300; // 分组默认宽
        const groupH = typeof group.height === 'number' ? group.height : 150; // 分组默认高

        const nodeLeft = nodeX;
        const nodeRight = nodeX + nodeW;
        const nodeTop = nodeY;
        const nodeBottom = nodeY + nodeH;

        const groupLeft = groupX;
        const groupRight = groupX + groupW;
        const groupTop = groupY;
        const groupBottom = groupY + groupH;

        const isInside =
            nodeLeft >= groupLeft &&
            nodeRight <= groupRight &&
            nodeTop >= groupTop &&
            nodeBottom <= groupBottom;

        if (!isInside) {
            const hasOverlap =
                nodeLeft < groupRight &&
                nodeRight > groupLeft &&
                nodeTop < groupBottom &&
                nodeBottom > groupTop;

            if (hasOverlap) {
                const overlapLeft = Math.max(nodeLeft, groupLeft);
                const overlapRight = Math.min(nodeRight, groupRight);
                const overlapTop = Math.max(nodeTop, groupTop);
                const overlapBottom = Math.min(nodeBottom, groupBottom);
                const overlapArea = (overlapRight - overlapLeft) * (overlapBottom - overlapTop);
                const nodeArea = nodeW * nodeH;
                return overlapArea >= nodeArea * 0.5;
            }
            return false;
        }

        return true;
    }
}
