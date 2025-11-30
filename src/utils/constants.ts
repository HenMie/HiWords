/**
 * 全局常量配置
 * 统一管理插件中的魔法数字和配置常量
 */

// ==================== 性能相关 ====================

/** 防抖延迟时间（毫秒） */
export const DEBOUNCE_DELAY = 300;

/** 性能监控阈值（毫秒），超过此时间会输出警告 */
export const PERFORMANCE_THRESHOLD = 100;

/** 侧边栏更新防抖延迟（毫秒） */
export const SIDEBAR_UPDATE_DELAY = {
    /** 切换标签页时的延迟 */
    TAB_SWITCH: 120,
    /** 编辑器内容变化时的延迟 */
    EDITOR_CHANGE: 500,
    /** Canvas 文件修改时的延迟 */
    CANVAS_MODIFY: 250,
    /** 设置变化时的延迟 */
    SETTINGS_CHANGE: 100,
    /** 立即更新 */
    IMMEDIATE: 0,
};

// ==================== UI 相关 ====================

/** 侧边栏卡片折叠相关 */
export const COLLAPSIBLE = {
    /** 最大折叠高度（像素），超过此高度显示展开按钮 */
    MAX_HEIGHT: 140,
    /** 高度判断容差（像素） */
    TOLERANCE: 4,
};

/** 输入框焦点延迟（毫秒） */
export const INPUT_FOCUS_DELAY = 50;

/** 消息自动隐藏时间（毫秒） */
export const MESSAGE_AUTO_HIDE = {
    /** 成功消息 */
    SUCCESS: 3000,
    /** 错误消息 */
    ERROR: 5000,
};

/** 高亮同步到单词卡片后的高亮持续时间（毫秒） */
export const WORD_CARD_HIGHLIGHT_DURATION = 3000;

// ==================== 文件处理相关 ====================

/** Canvas 同步相关 */
export const CANVAS_SYNC = {
    /** 批量同步延迟（毫秒） */
    BATCH_DELAY: 1000,
};

/** PDF 文本提取延迟（毫秒） */
export const PDF_TEXT_EXTRACT_DELAY = 500;

// ==================== 文档分析相关 ====================

/** 文档位置选择相关（用于侧边栏单词排序） */
export const DOCUMENT_POSITION = {
    /** 文档前1/3阈值比例 */
    FIRST_THIRD_RATIO: 1 / 3,
    /** 文档前2/3阈值比例 */
    SECOND_THIRD_RATIO: 2 / 3,
    /** 文档末尾判定比例（最后5%） */
    END_RATIO: 0.95,
};

// ==================== 插件卸载相关 ====================

/** 插件卸载超时时间（毫秒） */
export const PLUGIN_UNLOAD_TIMEOUT = 2000;

// ==================== 高亮刷新相关 ====================

/** 高亮刷新延迟（毫秒） */
export const HIGHLIGHTER_REFRESH = {
    /** 文件切换后的延迟 */
    FILE_SWITCH: 100,
    /** 索引完成后的延迟 */
    INDEX_COMPLETE: 200,
};

