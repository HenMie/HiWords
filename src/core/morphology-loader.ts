import type { MorphologyLanguage, VocabularyBook } from '../utils/types';
import { KoreanMorphologyService } from './korean-morphology-service';
// 日语服务将在后续任务中实现，这里先用类型占位
import type { JapaneseMorphologyService } from './japanese-morphology-service';
import type { MorphologyAssetProvider } from './morphology-asset-manager';

/**
 * 形态学服务加载器
 * 负责按需加载韩语/日语形态学分析服务
 */
export class MorphologyLoader {
    private koreanService: KoreanMorphologyService | null = null;
    private japaneseService: JapaneseMorphologyService | null = null;
    private koreanLoading: Promise<KoreanMorphologyService> | null = null;
    private japaneseLoading: Promise<JapaneseMorphologyService> | null = null;
    private app: unknown;
    private debugMode = false;
    private assetProvider: MorphologyAssetProvider | null = null;

    constructor(app?: unknown, assetProvider?: MorphologyAssetProvider) {
        this.app = app;
        this.assetProvider = assetProvider ?? null;
    }

    /**
     * 设置调试模式
     */
    public setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
        if (this.koreanService) {
            this.koreanService.setDebugMode(enabled);
        }
        if (this.japaneseService) {
            this.japaneseService.setDebugMode(enabled);
        }
    }

    /**
     * 调试日志输出
     */
    private debugLog(...args: unknown[]): void {
        if (this.debugMode) {
            console.log('[MorphologyLoader]', ...args);
        }
    }

    /**
     * 根据词书配置获取需要加载的语言列表
     */
    public getRequiredLanguages(vocabularyBooks: VocabularyBook[]): Set<MorphologyLanguage> {
        const languages = new Set<MorphologyLanguage>();
        
        for (const book of vocabularyBooks) {
            if (book.enabled && book.morphology && book.morphology !== 'none') {
                languages.add(book.morphology);
            }
        }
        
        return languages;
    }

    /**
     * 检查是否需要韩语形态学服务
     */
    public needsKorean(vocabularyBooks: VocabularyBook[]): boolean {
        const languages = this.getRequiredLanguages(vocabularyBooks);
        return languages.has('korean') || languages.has('auto');
    }

    /**
     * 检查是否需要日语形态学服务
     */
    public needsJapanese(vocabularyBooks: VocabularyBook[]): boolean {
        const languages = this.getRequiredLanguages(vocabularyBooks);
        return languages.has('japanese') || languages.has('auto');
    }

    /**
     * 获取韩语形态学服务（按需加载）
     */
    public async getKoreanService(): Promise<KoreanMorphologyService> {
        // 如果已加载，直接返回
        if (this.koreanService) {
            return this.koreanService;
        }

        // 如果正在加载，等待加载完成
        if (this.koreanLoading) {
            return this.koreanLoading;
        }

        // 开始加载
        this.debugLog('开始加载韩语形态学服务...');
        this.koreanLoading = this.loadKoreanService();
        
        try {
            this.koreanService = await this.koreanLoading;
            this.debugLog('韩语形态学服务加载完成');
            return this.koreanService;
        } finally {
            this.koreanLoading = null;
        }
    }

    /**
     * 加载韩语形态学服务
     */
    private async loadKoreanService(): Promise<KoreanMorphologyService> {
        const service = new KoreanMorphologyService(this.app, this.assetProvider ?? undefined);
        service.setDebugMode(this.debugMode);
        return service;
    }

    /**
     * 获取日语形态学服务（按需加载）
     */
    public async getJapaneseService(): Promise<JapaneseMorphologyService | null> {
        // 如果已加载，直接返回
        if (this.japaneseService) {
            return this.japaneseService;
        }

        // 如果正在加载，等待加载完成
        if (this.japaneseLoading) {
            return this.japaneseLoading;
        }

        // 开始加载
        this.debugLog('开始加载日语形态学服务...');
        this.japaneseLoading = this.loadJapaneseService();
        
        try {
            this.japaneseService = await this.japaneseLoading;
            this.debugLog('日语形态学服务加载完成');
            return this.japaneseService;
        } catch (error) {
            console.warn('[MorphologyLoader] 日语形态学服务加载失败:', error);
            return null;
        } finally {
            this.japaneseLoading = null;
        }
    }

    /**
     * 加载日语形态学服务
     */
    private async loadJapaneseService(): Promise<JapaneseMorphologyService> {
        // 动态导入日语形态学服务，避免在不需要时加载
        const { JapaneseMorphologyService } = await import('./japanese-morphology-service');
        const service = new JapaneseMorphologyService(this.app, this.assetProvider ?? undefined);
        service.setDebugMode(this.debugMode);
        return service;
    }

    /**
     * 根据词书配置预加载所需的形态学服务
     */
    public async preloadServices(vocabularyBooks: VocabularyBook[]): Promise<void> {
        const loadPromises: Promise<unknown>[] = [];

        if (this.needsKorean(vocabularyBooks)) {
            loadPromises.push(this.getKoreanService());
        }

        if (this.needsJapanese(vocabularyBooks)) {
            loadPromises.push(this.getJapaneseService());
        }

        await Promise.all(loadPromises);
    }

    /**
     * 检查韩语服务是否已加载
     */
    public isKoreanLoaded(): boolean {
        return this.koreanService !== null;
    }

    /**
     * 检查日语服务是否已加载
     */
    public isJapaneseLoaded(): boolean {
        return this.japaneseService !== null;
    }

    /**
     * 获取已加载的韩语服务（不触发加载）
     */
    public getLoadedKoreanService(): KoreanMorphologyService | null {
        return this.koreanService;
    }

    /**
     * 获取已加载的日语服务（不触发加载）
     */
    public getLoadedJapaneseService(): JapaneseMorphologyService | null {
        return this.japaneseService;
    }

    /**
     * 卸载韩语服务
     */
    public unloadKoreanService(): void {
        if (this.koreanService) {
            this.debugLog('卸载韩语形态学服务');
            this.koreanService.destroy();
            this.koreanService = null;
        }
    }

    /**
     * 卸载日语服务
     */
    public unloadJapaneseService(): void {
        if (this.japaneseService) {
            this.debugLog('卸载日语形态学服务');
            this.japaneseService.destroy();
            this.japaneseService = null;
        }
    }

    /**
     * 根据词书配置更新服务加载状态
     * 卸载不再需要的服务，预加载新需要的服务
     */
    public async updateServices(vocabularyBooks: VocabularyBook[]): Promise<void> {
        const needsKorean = this.needsKorean(vocabularyBooks);
        const needsJapanese = this.needsJapanese(vocabularyBooks);

        // 卸载不再需要的服务
        if (!needsKorean && this.koreanService) {
            this.unloadKoreanService();
        }
        if (!needsJapanese && this.japaneseService) {
            this.unloadJapaneseService();
        }

        // 预加载需要的服务
        await this.preloadServices(vocabularyBooks);
    }

    /**
     * 清理所有资源
     */
    public destroy(): void {
        this.unloadKoreanService();
        this.unloadJapaneseService();
    }
}
