import { App } from 'obsidian';
import en from './en';
import zh from './zh';
import es from './es';
import fr from './fr';
import de from './de';
import ja from './ja';

// 支持的语言
export type SupportedLocale = 'en' | 'zh' | 'es' | 'fr' | 'de' | 'ja';
type TranslationValue = string | { [key: string]: TranslationValue };

// 语言包接口
export interface LanguagePack {
    plugin_name: string;
    settings: {
        vocabulary_books: string;
        add_vocabulary_book: string;
        remove_vocabulary_book: string;
        show_definition_on_hover: string;
        show_definition_on_hover_desc: string;
        enable_auto_highlight: string;
        enable_auto_highlight_desc: string;
        highlight_style: string;
        highlight_style_desc: string;
        style_underline: string;
        style_background: string;
        style_bold: string;
        style_dotted: string;
        style_wavy: string;
        save_settings: string;
        no_vocabulary_books: string;
        path: string;
        reload_book: string;
        statistics: string;
        total_books: string;
        enabled_books: string;
        total_words: string;
        enable_mastered_feature: string;
        enable_mastered_feature_desc: string;
        // Mastered detection mode
        mastered_detection?: string;
        mastered_detection_desc?: string;
        mode_group?: string;
        mode_color?: string;
        blur_definitions: string;
        blur_definitions_desc: string;
        show_word_source?: string;
        show_word_source_desc?: string;
        // TTS template (optional for backward compatibility)
        tts_template?: string;
        tts_template_desc?: string;
        debug_mode?: string;
        debug_mode_desc?: string;
        // Highlighting scope
        highlight_mode?: string;
        highlight_mode_desc?: string;
        mode_all?: string;
        mode_exclude?: string;
        mode_include?: string;
        highlight_paths?: string;
        highlight_paths_desc?: string;
        highlight_paths_placeholder?: string;
        // File node parsing
        file_node_parse_mode?: string;
        file_node_parse_mode_desc?: string;
        mode_filename_with_content?: string;
        mode_filename?: string;
        mode_content?: string;
        morphology_assets?: string;
        morphology_assets_desc?: string;
        morphology_asset_status_loading?: string;
        morphology_asset_status_downloaded?: string;
        morphology_asset_status_missing?: string;
        morphology_asset_status_downloading?: string;
        morphology_asset_download?: string;
        morphology_asset_delete?: string;
        morphology_engine?: string;
        morphology_engine_desc?: string;
        morphology_engine_hybrid?: string;
        morphology_engine_legacy?: string;
        morphology_fallback?: string;
        morphology_fallback_desc?: string;
        morphology_fallback_conservative?: string;
        morphology_fallback_aggressive?: string;
    };
    sidebar: {
        title: string;
        empty_state: string;
        source_prefix: string;
        found: string;
        words: string;
    };
    commands: {
        add_word: string;
        refresh_vocabulary: string;
        show_sidebar: string;
    };
    notices: {
        vocabulary_refreshed: string;
        word_added: string;
        word_exists: string;
        error_adding_word: string;
        select_book_required: string;
        adding_word: string;
        word_added_success: string;
        add_word_failed: string;
        no_canvas_files: string;
        book_already_exists: string;
        invalid_canvas_file: string;
        book_added: string;
        book_reloaded: string;
        book_removed: string;
        morphology_asset_downloaded?: string;
        morphology_asset_deleted?: string;
        morphology_asset_operation_failed?: string;
    };
    modals: {
        add_word_title: string;
        word_label: string;
        definition_label: string;
        book_label: string;
        select_book: string;
        color_label: string;
        color_gray: string;
        pronunciation_label: string;
        pronunciation_placeholder: string;
        pronunciation_placeholder_japanese: string;
        pronunciation_placeholder_english: string;
        definition_placeholder: string;
        add_button: string;
        cancel_button: string;
        select_canvas_file: string;
    };
    // Common action labels used in UI
    actions?: {
        expand: string;        // 展开
        collapse: string;      // 收起
        mark_mastered: string; // 已掌握
        unmark_mastered: string; // 忘记了（取消已掌握）
    };
}

// 语言包集合
const languagePacks: Record<SupportedLocale, LanguagePack> = {
    en,
    zh,
    es,
    fr,
    de,
    ja,
};

/**
 * 国际化管理类
 */
export class I18n {
    private static instance: I18n;
    private app: App | null = null;
    
    /**
     * 获取单例实例
     */
    public static getInstance(): I18n {
        if (!I18n.instance) {
            I18n.instance = new I18n();
        }
        return I18n.instance;
    }
    
    /**
     * 设置 Obsidian App 实例
     */
    public setApp(app: App): void {
        this.app = app;
    }
    
    /**
     * 获取当前语言
     */
    private getCurrentLocale(): SupportedLocale {
        // 使用 Obsidian 的语言设置
        const obsidianLocale = window.localStorage.getItem('language') || 'en';
        
        // 将 Obsidian 语言设置映射到我们支持的语言
        if (obsidianLocale.startsWith('zh')) {
            return 'zh';
        }
        if (obsidianLocale.startsWith('es')) {
            return 'es';
        }
        if (obsidianLocale.startsWith('fr')) {
            return 'fr';
        }
        if (obsidianLocale.startsWith('de')) {
            return 'de';
        }
        if (obsidianLocale.startsWith('ja') || obsidianLocale.startsWith('jp')) {
            return 'ja';
        }
        
        // 默认返回英文
        return 'en';
    }
    
    /**
     * 获取翻译文本
     * @param key 翻译键，支持点号分隔的路径，如 'sidebar.title'
     * @param fallback 可选的后备值，当翻译键不存在时返回
     * @returns 翻译后的文本
     */
    public t(key: string, fallback?: string): string {
        const locale = this.getCurrentLocale();
        const pack = languagePacks[locale];
        const keys = key.split('.');
        let result: TranslationValue = pack as unknown as TranslationValue;
        
        for (const k of keys) {
            if (typeof result !== 'string' && result[k] !== undefined) {
                result = result[k];
            } else {
                // 尝试从英语语言包获取后备值
                if (locale !== 'en') {
                    const enResult = this.getFromPack(languagePacks['en'], keys);
                    if (enResult !== null) {
                        return enResult;
                    }
                }
                
                // 如果提供了后备值，使用后备值
                if (fallback !== undefined) {
                    return fallback;
                }
                
                // 否则返回键名本身（仅在开发环境中输出警告）
                if (process.env.NODE_ENV === 'development') {
                    console.warn(`翻译键 ${key} 不存在于 ${locale} 语言包中`);
                }
                return key;
            }
        }
        
        return typeof result === 'string' ? result : fallback ?? key;
    }
    
    /**
     * 从语言包中获取翻译
     * @param pack 语言包
     * @param keys 翻译键数组
     * @returns 翻译文本或 null
     */
    private getFromPack(pack: LanguagePack, keys: string[]): string | null {
        let result: TranslationValue = pack as unknown as TranslationValue;
        
        for (const k of keys) {
            if (typeof result !== 'string' && result[k] !== undefined) {
                result = result[k];
            } else {
                return null;
            }
        }
        
        return typeof result === 'string' ? result : null;
    }
}

// 导出单例实例
export const i18n = I18n.getInstance();

// 导出翻译函数，方便使用
export const t = (key: string): string => i18n.t(key);
