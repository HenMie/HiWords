/**
 * 统一形态学服务
 * 封装韩语/日语形态学服务的统一接口
 * 支持自动检测文本语言并路由到对应服务
 */

import type { MorphologyLanguage, VocabularyBook } from '../utils/types';
import { isKoreanText } from '../utils/korean-text-utils';
import { isJapaneseText } from '../utils/japanese-text-utils';
import { MorphologyLoader } from './morphology-loader';
import type { KoreanMorphologyService } from './korean-morphology-service';
import type { JapaneseMorphologyService } from './japanese-morphology-service';

/**
 * 形态学分析结果（通用）
 */
export interface MorphologyResult {
    surface: string;
    baseForm: string;
    partOfSpeech: string;
    confidence: number;
    language: 'korean' | 'japanese' | 'unknown';
}

/**
 * 文档分析结果（通用）
 */
export interface DocumentMorphologyResult {
    morphologyIndex: Map<string, Set<string>>;
    analysisResults: MorphologyResult[];
}

/**
 * 统一形态学服务
 */
export class UnifiedMorphologyService {
    private loader: MorphologyLoader;
    private debugMode: boolean = false;

    constructor(app?: unknown) {
        this.loader = new MorphologyLoader(app);
    }

    /**
     * 设置调试模式
     */
    public setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
        this.loader.setDebugMode(enabled);
    }

    /**
     * 调试日志输出
     */
    private debugLog(...args: unknown[]): void {
        if (this.debugMode) {
            console.log('[UnifiedMorphology]', ...args);
        }
    }

    /**
     * 检测文本语言
     */
    public detectLanguage(text: string): 'korean' | 'japanese' | 'unknown' {
        if (!text) return 'unknown';
        
        // 韩语优先检测（因为韩语字符范围独立）
        if (isKoreanText(text)) {
            return 'korean';
        }
        
        // 日语检测（通过假名判断）
        if (isJapaneseText(text)) {
            return 'japanese';
        }
        
        return 'unknown';
    }

    /**
     * 根据词书配置获取词书的形态学语言
     */
    public getBookMorphologyLanguage(book: VocabularyBook): MorphologyLanguage {
        return book.morphology || 'none';
    }

    /**
     * 根据词书配置预加载所需的形态学服务
     */
    public async preloadServices(vocabularyBooks: VocabularyBook[]): Promise<void> {
        await this.loader.preloadServices(vocabularyBooks);
    }

    /**
     * 根据词书配置更新服务加载状态
     */
    public async updateServices(vocabularyBooks: VocabularyBook[]): Promise<void> {
        await this.loader.updateServices(vocabularyBooks);
    }

    /**
     * 分析单词
     * @param word 要分析的单词
     * @param language 指定语言，或 'auto' 自动检测
     */
    public async analyzeWord(
        word: string,
        language: MorphologyLanguage = 'auto'
    ): Promise<MorphologyResult | null> {
        if (!word || word.trim().length === 0) {
            return null;
        }

        let targetLanguage: 'korean' | 'japanese' | 'unknown';

        if (language === 'auto') {
            targetLanguage = this.detectLanguage(word);
        } else if (language === 'none') {
            return null;
        } else {
            targetLanguage = language;
        }

        this.debugLog(`分析单词: ${word}, 语言: ${targetLanguage}`);

        try {
            if (targetLanguage === 'korean') {
                const service = await this.loader.getKoreanService();
                const result = await service.analyzeWord(word);
                if (result) {
                    return {
                        ...result,
                        language: 'korean'
                    };
                }
            } else if (targetLanguage === 'japanese') {
                const service = await this.loader.getJapaneseService();
                if (service) {
                    const result = await service.analyzeWord(word);
                    if (result) {
                        return {
                            ...result,
                            language: 'japanese'
                        };
                    }
                }
            }
        } catch (error) {
            console.error(`[UnifiedMorphology] 分析单词失败 (${targetLanguage}):`, error);
        }

        return null;
    }

    /**
     * 分析文档
     * @param text 要分析的文本
     * @param language 指定语言，或 'auto' 自动检测
     */
    public async analyzeDocument(
        text: string,
        language: MorphologyLanguage = 'auto'
    ): Promise<DocumentMorphologyResult> {
        const morphologyIndex = new Map<string, Set<string>>();
        const analysisResults: MorphologyResult[] = [];

        if (!text || text.trim().length === 0) {
            return { morphologyIndex, analysisResults };
        }

        let targetLanguage: 'korean' | 'japanese' | 'unknown';

        if (language === 'auto') {
            targetLanguage = this.detectLanguage(text);
        } else if (language === 'none') {
            return { morphologyIndex, analysisResults };
        } else {
            targetLanguage = language;
        }

        this.debugLog(`分析文档, 语言: ${targetLanguage}`);

        try {
            if (targetLanguage === 'korean') {
                const service = await this.loader.getKoreanService();
                const result = await service.analyzeDocument(text);
                
                // 转换结果
                for (const [baseForm, inflections] of result.morphologyIndex) {
                    morphologyIndex.set(baseForm, inflections);
                }
                
                for (const item of result.analysisResults) {
                    analysisResults.push({
                        ...item,
                        language: 'korean'
                    });
                }
            } else if (targetLanguage === 'japanese') {
                const service = await this.loader.getJapaneseService();
                if (service) {
                    const result = await service.analyzeDocument(text);
                    
                    // 转换结果
                    for (const [baseForm, inflections] of result.morphologyIndex) {
                        morphologyIndex.set(baseForm, inflections);
                    }
                    
                    for (const item of result.analysisResults) {
                        analysisResults.push({
                            ...item,
                            language: 'japanese'
                        });
                    }
                }
            }
        } catch (error) {
            console.error(`[UnifiedMorphology] 分析文档失败 (${targetLanguage}):`, error);
        }

        return { morphologyIndex, analysisResults };
    }

    /**
     * 检查文本是否需要形态学分析
     */
    public needsMorphologyAnalysis(text: string, language: MorphologyLanguage): boolean {
        if (language === 'none') {
            return false;
        }
        
        if (language === 'auto') {
            const detected = this.detectLanguage(text);
            return detected !== 'unknown';
        }
        
        if (language === 'korean') {
            return isKoreanText(text);
        }
        
        if (language === 'japanese') {
            return isJapaneseText(text);
        }
        
        return false;
    }

    /**
     * 获取韩语形态学服务（如果已加载）
     */
    public getKoreanService(): KoreanMorphologyService | null {
        return this.loader.getLoadedKoreanService();
    }

    /**
     * 获取日语形态学服务（如果已加载）
     */
    public getJapaneseService(): JapaneseMorphologyService | null {
        return this.loader.getLoadedJapaneseService();
    }

    /**
     * 异步获取韩语形态学服务（按需加载）
     */
    public async getKoreanServiceAsync(): Promise<KoreanMorphologyService> {
        return this.loader.getKoreanService();
    }

    /**
     * 异步获取日语形态学服务（按需加载）
     */
    public async getJapaneseServiceAsync(): Promise<JapaneseMorphologyService | null> {
        return this.loader.getJapaneseService();
    }

    /**
     * 检查韩语服务是否已加载
     */
    public isKoreanLoaded(): boolean {
        return this.loader.isKoreanLoaded();
    }

    /**
     * 检查日语服务是否已加载
     */
    public isJapaneseLoaded(): boolean {
        return this.loader.isJapaneseLoaded();
    }

    /**
     * 获取加载器实例
     */
    public getLoader(): MorphologyLoader {
        return this.loader;
    }

    /**
     * 清理资源
     */
    public destroy(): void {
        this.loader.destroy();
    }
}

