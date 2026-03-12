// Canvas 节点类型定义
export interface CanvasNode {
    id: string;
    type: 'text' | 'group' | 'file' | string; // 支持分组和文件类型
    x: number;
    y: number;
    width: number;
    height: number;
    text?: string;      // 文本节点内容
    file?: string;
    color?: string;
    label?: string;     // 分组标签
    group?: string[];   // 所属分组ID数组
}

// Canvas 数据结构
export interface CanvasData {
    nodes: CanvasNode[];
    edges: unknown[];
}

// 词汇定义
export interface WordDefinition {
    word: string;
    definition: string;
    pronunciation?: string; // 发音（可选）
    etymology?: string; // 词源（可选）
    source: string; // Canvas 文件路径
    nodeId: string; // Canvas 节点 ID
    color?: string;
    mastered?: boolean; // 是否已掌握
    isPattern?: boolean; // 是否为模式短语（包含 ... 占位符）
    patternParts?: string[]; // 模式短语固定片段
}

// 形态学语言类型
export type MorphologyLanguage = 'none' | 'korean' | 'japanese' | 'auto';

// 形态学引擎模式
export type MorphologyEngineMode = 'hybrid' | 'legacy';

// 形态学兜底策略
export type MorphologyFallbackMode = 'conservative' | 'aggressive';

// 生词本配置
export interface VocabularyBook {
    path: string; // Canvas 文件路径
    name: string; // 显示名称
    enabled: boolean; // 是否启用
    languagePolicy: MorphologyLanguage; // 词书语言策略，默认 'none'
}

// 高亮样式类型
export type HighlightStyle = 'underline' | 'background' | 'bold' | 'dotted' | 'wavy';

/** 已掌握判定模式 */
export type MasteredDetectionMode = 'group' | 'color';

/** 高亮范围模式 */
export type HighlightMode = 'all' | 'exclude' | 'include';

/** 文件节点解析模式 */
export type FileNodeParseMode = 'filename' | 'content' | 'filename-with-content';

/** AI 词典配置 */
export interface AIDictionaryConfig {
    apiUrl: string; // AI API 地址
    apiKey: string; // API Key
    model: string; // 模型名称
    prompt: string; // 自定义 prompt 模板
}

// 插件设置
export interface HiWordsSettings {
    vocabularyBooks: VocabularyBook[];
    showDefinitionOnHover: boolean;
    enableAutoHighlight: boolean;
    highlightStyle: HighlightStyle; // 高亮样式
    enableMasteredFeature: boolean; // 启用已掌握功能
    showMasteredInSidebar: boolean; // 在侧边栏显示已掌握单词
    blurDefinitions: boolean; // 模糊定义内容，悬停时显示
    showWordSource?: boolean; // 是否显示词书来源信息
    // 已掌握判定模式：'group'（根据是否位于 Mastered 分组）或 'color'（根据颜色是否为绿色4）
    masteredDetection?: MasteredDetectionMode;
    // 发音地址模板（如：https://dict.youdao.com/dictvoice?audio={{word}}&type=2）
    ttsTemplate?: string;
    // 调试模式（开启后在控制台输出详细日志）
    debugMode?: boolean;
    // AI 词典配置
    aiDictionary?: AIDictionaryConfig;
    // 高亮范围设置
    highlightMode?: HighlightMode;
    highlightPaths?: string;
    // 文件节点解析模式
    fileNodeParseMode?: FileNodeParseMode;
    // 形态学引擎模式（hybrid: 混合逆向引擎，legacy: 旧版兼容模式）
    morphologyEngineMode?: MorphologyEngineMode;
    // 形态学兜底策略（conservative: 仅必要时启用活用生成，aggressive: 始终启用）
    morphologyFallbackMode?: MorphologyFallbackMode;
}

// 词汇匹配信息
export interface WordMatch {
    word: string;
    definition: WordDefinition;
    from: number;
    to: number;
    color: string;
    baseForm?: string; // 词汇的原型形式，用于悬浮卡片查找
    matchedText?: string; // 实际匹配到的文本（用于模式短语）
    segments?: Array<{from: number; to: number}>; // 分段高亮位置（用于模式短语）
}

// 导出工具类
export { WordActionUtils } from './word-action-utils';
