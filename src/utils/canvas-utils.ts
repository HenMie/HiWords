/**
 * Canvas 工具类
 * 提供 Canvas 文件操作的通用工具函数
 */

import { App, TFile } from 'obsidian';
import { CanvasData, CanvasNode } from './types';

/**
 * 生成 16 位十六进制小写 ID（贴近标准 Canvas ID 风格）
 */
export function genHex16(): string {
    const bytes = new Uint8Array(8);
    (window.crypto || (window as any).msCrypto).getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 矩形信息接口
 */
export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * 从 Canvas 节点获取矩形信息（带兜底）
 */
export function rectOf(node: Partial<CanvasNode>): Rect {
    return {
        x: typeof node.x === 'number' ? node.x : 0,
        y: typeof node.y === 'number' ? node.y : 0,
        w: typeof node.width === 'number' ? node.width : 200,
        h: typeof node.height === 'number' ? node.height : 60,
    };
}

/**
 * 检查两个一维范围是否重叠
 * @param ax 范围 A 起点
 * @param aw 范围 A 宽度
 * @param bx 范围 B 起点
 * @param bw 范围 B 宽度
 */
export function overlaps(ax: number, aw: number, bx: number, bw: number): boolean {
    return ax < bx + bw && ax + aw > bx;
}

/**
 * 将数值限制在指定范围内
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/**
 * 安全获取数值（带默认值）
 */
export function num(value: any, defaultValue: number): number {
    return typeof value === 'number' ? value : defaultValue;
}

/**
 * Canvas 文件加载器
 */
export class CanvasLoader {
    constructor(private app: App) {}

    /**
     * 加载 Canvas 文件数据
     * @param filePath Canvas 文件路径
     * @returns Canvas 数据或 null
     */
    async loadCanvas(filePath: string): Promise<CanvasData | null> {
        try {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!(file instanceof TFile)) {
                return null;
            }

            const content = await this.app.vault.read(file);
            return JSON.parse(content) as CanvasData;
        } catch (error) {
            console.error(`加载 Canvas 文件失败 ${filePath}:`, error);
            return null;
        }
    }

    /**
     * 保存 Canvas 文件数据
     * @param filePath Canvas 文件路径
     * @param canvasData Canvas 数据
     * @returns 操作是否成功
     */
    async saveCanvas(filePath: string, canvasData: CanvasData): Promise<boolean> {
        try {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!(file instanceof TFile)) {
                return false;
            }

            // 使用原子更新，避免并发覆盖
            await this.app.vault.process(file, () => {
                return JSON.stringify(canvasData);
            });
            return true;
        } catch (error) {
            console.error(`保存 Canvas 文件失败 ${filePath}:`, error);
            return false;
        }
    }

    /**
     * 使用处理函数修改 Canvas 文件
     * @param filePath Canvas 文件路径
     * @param processor 处理函数，接收当前内容字符串，返回新内容字符串
     * @returns 操作是否成功
     */
    async processCanvas(
        filePath: string, 
        processor: (currentContent: string) => string
    ): Promise<boolean> {
        try {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!(file instanceof TFile)) {
                return false;
            }

            await this.app.vault.process(file, processor);
            return true;
        } catch (error) {
            console.error(`处理 Canvas 文件失败 ${filePath}:`, error);
            return false;
        }
    }
}

