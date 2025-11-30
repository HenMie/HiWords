import { ItemView, WorkspaceLeaf, TFile, MarkdownView, MarkdownRenderer, setIcon, Notice } from 'obsidian';
import HiWordsPlugin from '../../main';
import { 
    WordDefinition, 
    mapCanvasColorToCSSVar, 
    getColorWithOpacity, 
    playWordTTS, 
    MarkdownLinkBinder, 
    Debouncer, 
    removeOverlappingMatches, 
    WordActionUtils,
    COLLAPSIBLE,
    SIDEBAR_UPDATE_DELAY,
    MESSAGE_AUTO_HIDE,
    PDF_TEXT_EXTRACT_DELAY,
    DOCUMENT_POSITION,
    WORD_CARD_HIGHLIGHT_DURATION
} from '../utils';
import { t } from '../i18n';
import { WordMatcherService } from '../core/word-matcher-service';

export const SIDEBAR_VIEW_TYPE = 'hi-words-sidebar';

export class HiWordsSidebarView extends ItemView {
    private plugin: HiWordsPlugin;
    private currentWords: WordDefinition[] = [];
    private activeTab: 'learning' | 'mastered' = 'learning';
    private currentFile: TFile | null = null;
    private lastActiveMarkdownView: MarkdownView | null = null; // 缓存最后一个活动的MarkdownView
    private firstLoadForFile: boolean = false; // 仅在切换到新文件后的首次渲染生效
    private updateDebouncer: Debouncer; // 更新防抖器
    private measureQueue: HTMLElement[] = []; // 批量测量的队列
    private measureScheduled = false; // 是否已安排 RAF 测量
    private delegatedBound = false; // 是否已绑定根级事件委托
    private linkBinder: MarkdownLinkBinder; // Markdown 链接绑定器
    private wordActionUtils: WordActionUtils; // 单词操作工具类
    private wordMatcherService: WordMatcherService; // 单词匹配服务
    // 排序缓存优化
    private sortedWordsCache: WordDefinition[] = [];
    private cacheInvalidated = true;

    constructor(leaf: WorkspaceLeaf, plugin: HiWordsPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.linkBinder = new MarkdownLinkBinder(plugin.app);
        this.wordActionUtils = new WordActionUtils(plugin.app, plugin);
        this.wordMatcherService = new WordMatcherService(plugin.vocabularyManager);
        this.updateDebouncer = new Debouncer(() => {
            void this.updateView();
        }, 0); // 初始延迟为 0，后续通过 scheduleUpdate 指定
    }

    /**
     * 安排一次 requestAnimationFrame，把所有待测量的 collapsible 高度一次性计算并写回
     */
    private scheduleMeasure() {
        if (this.measureScheduled) return;
        this.measureScheduled = true;
        requestAnimationFrame(() => {
            this.measureScheduled = false;
            if (this.measureQueue.length === 0) return;

            const items = this.measureQueue.splice(0, this.measureQueue.length);

            // 先读后写：先生成读集（使用常量配置的最大折叠高度）
            const results: Array<{ el: HTMLElement; needsToggle: boolean }> = items.map((el) => ({
                el,
                needsToggle: el.scrollHeight > COLLAPSIBLE.MAX_HEIGHT + COLLAPSIBLE.TOLERANCE,
            }));

            // 再统一写
            for (const { el, needsToggle } of results) {
                if (!needsToggle) {
                    el.removeClass('collapsed');
                    continue;
                }
                const definition = el.parentElement as HTMLElement; // collapsible 的父级就是 definition 容器
                if (!definition) continue;
                const overlay = definition.createEl('div', { cls: 'hi-words-expand-overlay', text: t('actions.expand') });
                const updateText = () => {
                    overlay.setText(el.hasClass('collapsed') ? t('actions.expand') : t('actions.collapse'));
                };
                updateText();
                overlay.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (el.hasClass('collapsed')) {
                        el.removeClass('collapsed');
                    } else {
                        el.addClass('collapsed');
                    }
                    updateText();
                });
            }
        });
    }

    getViewType(): string {
        return SIDEBAR_VIEW_TYPE;
    }

    getDisplayText(): string {
        return t('sidebar.title');
    }

    getIcon(): string {
        return 'book-open';
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('hi-words-sidebar');
        this.bindDelegatedHandlers(container as HTMLElement);


        // 初始化显示
        this.scheduleUpdate(SIDEBAR_UPDATE_DELAY.IMMEDIATE);

        // 监听活动文件变化（忽略自身视图激活，避免首次点击被重渲打断）
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf: WorkspaceLeaf | null) => {
                if (leaf === this.leaf) return; // 自身变为激活视图时不刷新
                this.scheduleUpdate(SIDEBAR_UPDATE_DELAY.TAB_SWITCH);
            })
        );

        // 监听文件内容变化
        this.registerEvent(
            this.app.workspace.on('editor-change', () => {
                // 延迟更新，避免频繁刷新
                this.scheduleUpdate(SIDEBAR_UPDATE_DELAY.EDITOR_CHANGE);
            })
        );

        // 监听文件修改（包括 Canvas 文件的修改）
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                // 如果修改的是 Canvas 文件，则刷新侧边栏
                if (file instanceof TFile && file.extension === 'canvas') {
                    this.scheduleUpdate(SIDEBAR_UPDATE_DELAY.CANVAS_MODIFY);
                }
            })
        );

        // 监听已掌握功能状态变化
        this.registerEvent(
            this.app.workspace.on('hi-words:mastered-changed' as any, () => {
                this.scheduleUpdate(SIDEBAR_UPDATE_DELAY.SETTINGS_CHANGE);
            })
        );

        // 监听设置变化（如模糊效果开关）
        this.registerEvent(
            this.app.workspace.on('hi-words:settings-changed' as any, () => {
                this.scheduleUpdate(SIDEBAR_UPDATE_DELAY.SETTINGS_CHANGE);
            })
        );

    }

    async onClose() {
        // 清理资源
        this.wordMatcherService.destroy();
    }

    /**
     * 更新侧边栏视图
     */
    private async updateView() {
        const activeFile = this.app.workspace.getActiveFile();
        
        if (!activeFile || (activeFile.extension !== 'md' && activeFile.extension !== 'pdf')) {
            this.showEmptyState('请打开一个 Markdown 文档或 PDF 文件');
            return;
        }

        // 缓存当前活动的 MarkdownView（如果有的话）
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
            this.lastActiveMarkdownView = activeView;
        }

        if (activeFile === this.currentFile && this.currentWords.length > 0) {
            // 文件未变化且已有数据，不需要重新扫描
            return;
        }

        // 记录是否为切换到新文件
        const isFileChanged = activeFile !== this.currentFile;
        this.currentFile = activeFile;
        if (isFileChanged) {
            this.firstLoadForFile = true;
        }
        await this.scanCurrentDocument();
        this.renderWordList();
    }

    /**
     * 合并/防抖更新：多事件密集触发时，避免排队大量 setTimeout
     * 注意：由于 Debouncer 在创建时固定延迟，这里我们手动管理延迟
     */
    private scheduleUpdate(delay: number) {
        this.updateDebouncer.cancel();
        
        // 创建新的 Debouncer 以支持不同的延迟时间
        this.updateDebouncer = new Debouncer(() => {
            void this.updateView();
        }, Math.max(0, delay));
        
        this.updateDebouncer.trigger();
    }

    /**
     * 扫描当前文档中的生词
     */
    private async scanCurrentDocument() {
        if (!this.currentFile) return;

        // 显示加载状态
        this.showLoadingIndicator('正在扫描文档中的生词...');

        try {
            const startTime = Date.now();
            let content: string;
            
            // 根据文件类型提取内容
            if (this.currentFile.extension === 'pdf') {
                content = await this.extractPDFText();
            } else {
                content = await this.app.vault.read(this.currentFile);
            }

            // 重建 Trie 以确保使用最新的词汇数据（包含所有单词，包括已掌握的）
            this.wordMatcherService.buildTrie(true);

            // 使用 WordMatcherService 查找所有匹配（包括变形）
            const matches = this.wordMatcherService.findMatches(content);

            // 使用与文章高亮相同的重叠处理逻辑，优先保留更长的匹配
            const filteredMatches = removeOverlappingMatches(matches);

            // 改进的位置计算：创建一个 Map 来存储每个单词的所有出现位置
            const wordAllPositionsMap = new Map<string, { wordDef: WordDefinition, positions: number[] }>();

            // 遍历过滤后的匹配，记录每个单词的所有出现位置
            for (const match of filteredMatches) {
                const definition = match.payload as WordDefinition;
                if (definition && definition.nodeId) {
                    if (!wordAllPositionsMap.has(definition.nodeId)) {
                        wordAllPositionsMap.set(definition.nodeId, {
                            wordDef: definition,
                            positions: []
                        });
                    }
                    wordAllPositionsMap.get(definition.nodeId)!.positions.push(match.from);
                }
            }

            // 对每个单词的位置进行排序，并选择最佳代表位置
            const wordPositionMap = new Map<string, { wordDef: WordDefinition, position: number }>();
            const contentLength = content.length;
            
            for (const [nodeId, { wordDef, positions }] of wordAllPositionsMap.entries()) {
                // 对位置进行排序
                positions.sort((a, b) => a - b);
                
                // 使用改进的位置选择策略
                const bestPosition = this.selectBestPosition(positions, contentLength);
                
                wordPositionMap.set(nodeId, {
                    wordDef,
                    position: bestPosition
                });
            }

            // 按照单词在文档中首次出现的位置排序
            const foundWordsWithPosition = Array.from(wordPositionMap.values());
            foundWordsWithPosition.sort((a, b) => a.position - b.position);
            this.currentWords = foundWordsWithPosition.map(item => item.wordDef);

            // 存储单词位置信息用于鼠标位置映射
            // 注意：这里我们保留位置信息，但不再用于文档滚动同步
            
            // 标记缓存失效
            this.cacheInvalidated = true;

            const elapsed = Date.now() - startTime;
            console.log(`[HiWords] 文档扫描完成，耗时 ${elapsed}ms，找到 ${this.currentWords.length} 个生词`);

            // 显示成功状态
            this.showSuccessMessage(`文档扫描完成，找到 ${this.currentWords.length} 个生词`);
        } catch (error) {
            console.error('Failed to scan document:', error);
            this.currentWords = [];
            this.cacheInvalidated = true;
            this.showErrorMessage(error, '文档扫描失败');
        } finally {
            this.hideLoadingIndicator();
        }
    }

    /**
     * 从单词的所有出现位置中选择最佳代表位置
     * 改进版本：更平衡的位置选择策略，确保文档各部分都有合适的代表
     * @param positions 单词的所有出现位置（已排序）
     * @param contentLength 文档总长度
     * @returns 最佳代表位置
     */
    private selectBestPosition(positions: number[], contentLength: number): number {
        if (positions.length === 1) {
            return positions[0];
        }

        // 将文档分为三个部分：前1/3、中1/3、后1/3（使用常量配置）
        const firstThirdThreshold = contentLength * DOCUMENT_POSITION.FIRST_THIRD_RATIO;
        const secondThirdThreshold = contentLength * DOCUMENT_POSITION.SECOND_THIRD_RATIO;

        // 策略1：优先选择在文档前1/3部分的首次出现
        const earlyPosition = positions.find(pos => pos <= firstThirdThreshold);
        if (earlyPosition !== undefined) {
            return earlyPosition;
        }

        // 策略2：如果没有在前1/3部分出现，选择在中1/3部分的首次出现
        const middlePosition = positions.find(pos => pos > firstThirdThreshold && pos <= secondThirdThreshold);
        if (middlePosition !== undefined) {
            return middlePosition;
        }

        // 策略3：如果只出现在后1/3部分，选择该部分的首次出现
        // 但确保不会太集中在文档末尾
        const latePosition = positions.find(pos => pos > secondThirdThreshold);
        if (latePosition !== undefined) {
            // 如果位置太接近文档末尾，稍微向前调整
            const endThreshold = contentLength * DOCUMENT_POSITION.END_RATIO;
            if (latePosition > endThreshold && positions.length > 1) {
                // 尝试选择一个稍微靠前的位置
                const adjustedPosition = positions.find(pos => pos <= endThreshold);
                if (adjustedPosition !== undefined) {
                    return adjustedPosition;
                }
            }
            return latePosition;
        }

        // 策略4：如果以上都不满足，选择首次出现
        return positions[0];
    }

    /**
     * 显示加载状态指示
     */
    private showLoadingIndicator(message: string): void {
        const container = this.containerEl.querySelector('.hi-words-sidebar');
        if (!container) return;

        // 移除已存在的加载指示器
        const existingLoading = container.querySelector('.hi-words-loading');
        if (existingLoading) {
            existingLoading.remove();
        }

        // 创建新的加载指示器
        const loadingEl = container.createEl('div', { cls: 'hi-words-loading' }) as HTMLElement;
        loadingEl.innerHTML = `
            <div class="hi-words-spinner"></div>
            <div class="hi-words-loading-text">${message}</div>
        `;
        loadingEl.style.display = 'flex';
    }

    /**
     * 隐藏加载状态指示
     */
    private hideLoadingIndicator(): void {
        const loadingEl = this.containerEl.querySelector('.hi-words-loading') as HTMLElement;
        if (loadingEl) {
            loadingEl.style.display = 'none';
        }
    }

    /**
     * 显示成功消息
     */
    private showSuccessMessage(message: string): void {
        const container = this.containerEl.querySelector('.hi-words-sidebar');
        if (!container) return;

        // 移除已存在的消息
        const existingMessage = container.querySelector('.hi-words-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        // 创建成功消息
        const messageEl = container.createEl('div', { cls: 'hi-words-message hi-words-success' }) as HTMLElement;
        messageEl.textContent = message;
        messageEl.style.display = 'block';

        // 自动隐藏成功消息
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.style.display = 'none';
            }
        }, MESSAGE_AUTO_HIDE.SUCCESS);
    }

    /**
     * 显示错误消息
     */
    private showErrorMessage(error: unknown, context: string): void {
        const container = this.containerEl.querySelector('.hi-words-sidebar');
        if (!container) return;

        // 移除已存在的消息
        const existingMessage = container.querySelector('.hi-words-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        // 格式化错误信息
        let userFriendlyMessage = context;
        if (error instanceof Error) {
            if (error.message.includes('ENOENT') || error.message.includes('not found')) {
                userFriendlyMessage = `${context}：文件不存在`;
            } else if (error.message.includes('EACCES') || error.message.includes('permission')) {
                userFriendlyMessage = `${context}：权限不足`;
            } else if (error.message.includes('parse') || error.message.includes('JSON')) {
                userFriendlyMessage = `${context}：文件格式错误`;
            } else {
                userFriendlyMessage = `${context}：未知错误`;
            }
        }

        // 创建错误消息
        const messageEl = container.createEl('div', { cls: 'hi-words-message hi-words-error' }) as HTMLElement;
        messageEl.textContent = userFriendlyMessage;
        messageEl.style.display = 'block';

        // 自动隐藏错误消息
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.style.display = 'none';
            }
        }, MESSAGE_AUTO_HIDE.ERROR);

        console.error(`[HiWords] ${context}:`, error);
    }

    /**
     * 渲染生词列表
     */
    private renderWordList() {
        const container = this.containerEl.querySelector('.hi-words-sidebar');
        if (!container) return;

        container.empty();
        // 确保事件委托已绑定（容器清空后仍然存在于同一根上）
        this.bindDelegatedHandlers(container as HTMLElement);

        if (this.currentWords.length === 0) {
            this.showEmptyState(t('sidebar.empty_state'));
            return;
        }

        // 使用缓存的排序结果（如果缓存有效）
        let wordsToRender: WordDefinition[];
        if (this.cacheInvalidated) {
            // 缓存失效，重新处理
            this.sortedWordsCache = [...this.currentWords];
            this.cacheInvalidated = false;
            wordsToRender = this.sortedWordsCache;
        } else {
            // 使用缓存
            wordsToRender = this.sortedWordsCache;
        }

        // 分组单词：未掌握和已掌握
        const unmasteredWords = wordsToRender.filter(word => !word.mastered);
        const masteredWords = wordsToRender.filter(word => word.mastered);
        

        // 智能初始标签页选择：仅在切换到新文件后的首次加载时进行
        if (this.firstLoadForFile && this.activeTab === 'learning' && unmasteredWords.length === 0 && masteredWords.length > 0) {
            this.activeTab = 'mastered';
        }
        // 首次渲染完成后，重置标记，避免用户点击时被强制切回
        this.firstLoadForFile = false;
        
        // 创建 Tab 导航
        this.createTabNavigation(container as HTMLElement, unmasteredWords.length, masteredWords.length);
        
        // 创建 Tab 内容
        this.createTabContent(container as HTMLElement, unmasteredWords, masteredWords);
    }

    /**
     * 创建 Tab 导航
     */
    private createTabNavigation(container: HTMLElement, learningCount: number, masteredCount: number) {
        const tabNav = container.createEl('div', { cls: 'hi-words-tab-nav' });
        
        // 待学习 Tab
        const learningTab = tabNav.createEl('div', { 
            cls: `hi-words-tab ${this.activeTab === 'learning' ? 'active' : ''}`,
            attr: { 'data-tab': 'learning' }
        });
        learningTab.createEl('span', { text: `${t('sidebar.vocabulary_book')} (${learningCount})` });
        
        // 已掌握 Tab (只有在启用功能时显示)
        if (this.plugin.settings.enableMasteredFeature) {
            const masteredTab = tabNav.createEl('div', { 
                cls: `hi-words-tab ${this.activeTab === 'mastered' ? 'active' : ''}`,
                attr: { 'data-tab': 'mastered' }
            });
            masteredTab.createEl('span', { text: `${t('sidebar.mastered')} (${masteredCount})` });
            
            // 添加点击事件
            masteredTab.addEventListener('click', () => {
                this.switchTab('mastered');
            });
        }
        
        // 添加点击事件
        learningTab.addEventListener('click', () => {
            this.switchTab('learning');
        });
    }
    
    /**
     * 创建 Tab 内容
     */
    private createTabContent(container: HTMLElement, unmasteredWords: WordDefinition[], masteredWords: WordDefinition[]) {
        if (this.activeTab === 'learning') {
            if (unmasteredWords.length > 0) {
                this.createWordList(container, unmasteredWords, false);
            } else {
                this.createEmptyState(container, t('sidebar.no_learning_words'));
            }
        } else if (this.activeTab === 'mastered') {
            if (masteredWords.length > 0) {
                this.createWordList(container, masteredWords, true);
            } else {
                this.createEmptyState(container, t('sidebar.no_mastered_words'));
            }
        }

        // 在完成当前 Tab 的所有渲染后，统一安排一次测量折叠高度
        this.scheduleMeasure();
    }
    
    /**
     * 切换 Tab
     */
    private switchTab(tab: 'learning' | 'mastered') {
        if (this.activeTab === tab) return;
        
        this.activeTab = tab;
        this.renderWordList(); // 重新渲染
    }
    
    /**
     * 创建单词列表
     */
    private createWordList(container: HTMLElement, words: WordDefinition[], isMastered: boolean) {
        const wordList = container.createEl('div', { cls: 'hi-words-word-list' });
        
        words.forEach(wordDef => {
            this.createWordCard(wordList, wordDef, isMastered);
        });
    }

    /**
     * 创建单词分组区域
     * @param container 容器元素
     * @param title 分组标题
     * @param words 单词列表
     * @param icon 图标名称
     * @param isMastered 是否为已掌握分组
     */
    private createWordSection(container: HTMLElement, title: string, words: WordDefinition[], icon: string, isMastered: boolean) {
        // 创建分组容器
        const section = container.createEl('div', { 
            cls: isMastered ? 'hi-words-mastered-section' : 'hi-words-section'
        });
        
        // 创建分组标题
        const sectionTitle = section.createEl('div', { cls: 'hi-words-section-title' });
        
        // 添加图标
        const iconEl = sectionTitle.createEl('span', { cls: 'hi-words-section-icon' });
        setIcon(iconEl, icon);
        
        // 添加标题文本
        sectionTitle.createEl('span', { 
            text: `${title} (${words.length})`,
            cls: 'hi-words-section-text'
        });
        
        // 创建单词列表
        const wordList = section.createEl('div', { cls: 'hi-words-word-list' });
        
        words.forEach(wordDef => {
            this.createWordCard(wordList, wordDef, isMastered);
        });
    }

    /**
     * 创建生词卡片
     * @param container 容器元素
     * @param wordDef 单词定义
     * @param isMastered 是否为已掌握单词
     */
    private createWordCard(container: HTMLElement, wordDef: WordDefinition, isMastered: boolean = false) {
        const card = container.createEl('div', {
            cls: 'hi-words-word-card',
            attr: { 'data-word-id': wordDef.nodeId }
        });
        
        // 设置卡片颜色边框，使用Obsidian CSS变量
        const borderColor = mapCanvasColorToCSSVar(wordDef.color, 'var(--color-base-60)');
        card.style.borderLeftColor = borderColor;
        
        // 设置卡片彩色背景
        if (wordDef.color) {
            card.style.setProperty('--word-card-accent-color', borderColor);
            // 设置更明显的彩色背景
            const bgColor = getColorWithOpacity(borderColor, 0.1);
            card.style.setProperty('--word-card-bg-color', bgColor);
        }

        // 词汇标题
        const wordTitle = card.createEl('div', { cls: 'hi-words-word-title' });
        const wordTextEl = wordTitle.createEl('span', { text: wordDef.word, cls: 'hi-words-word-text' });
        // 点击主词发音
        wordTextEl.style.cursor = 'pointer';
        wordTextEl.addEventListener('click', async (e) => {
            e.stopPropagation();
            await playWordTTS(this.plugin, wordDef.word);
        });
        
        // 已掌握按钮（如果启用了功能）
        if (this.plugin.settings.enableMasteredFeature && this.plugin.masteredService) {
            const buttonContainer = wordTitle.createEl('div', { 
                cls: 'hi-words-title-mastered-button',
                attr: {
                    'aria-label': isMastered ? t('actions.unmark_mastered') : t('actions.mark_mastered')
                }
            });
            
            // 设置图标（未掌握显示smile供用户点击标记为已掌握，已掌握显示frown供用户点击取消）
            setIcon(buttonContainer, isMastered ? 'frown' : 'smile');
            
            // 事件处理已经通过 bindDelegatedHandlers 的事件委托统一处理，无需重复绑定
        }
        
        // 词源显示（如果存在）
        if (wordDef.etymology && wordDef.etymology.trim()) {
            const etymologyEl = card.createEl('div', { 
                cls: 'hi-words-word-etymology',
                text: wordDef.etymology
            });
        }
        
        // 定义内容
        if (wordDef.definition && wordDef.definition.trim()) {
            const definition = card.createEl('div', { cls: 'hi-words-word-definition' });

            // 外层可折叠容器
            const collapsible = definition.createEl('div', { cls: 'hi-words-collapsible collapsed' });

            // 真正的 Markdown 内容容器
            const defContainer = collapsible.createEl('div', {
                cls: this.plugin.settings.blurDefinitions ? 'hi-words-definition blur-enabled' : 'hi-words-definition'
            });

            // 使用工具类添加点击事件
            this.wordActionUtils.addDefinitionClickListener(defContainer, wordDef);

            // 渲染 Markdown 内容
            try {
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView) || this.lastActiveMarkdownView;
                const sourcePath = (activeView && activeView.file?.path) || this.app.workspace.getActiveFile()?.path || '';
                // 始终优先使用 Obsidian 原生渲染（第四参使用 this 作为 Component）
                MarkdownRenderer.renderMarkdown(
                    wordDef.definition,
                    defContainer,
                    sourcePath,
                    this
                );
                // 渲染完成后绑定交互（下一帧确保节点已生成）
                requestAnimationFrame(() => this.bindInternalLinksAndTags(defContainer, sourcePath, defContainer));
            } catch (error) {
                console.error('Markdown 渲染失败:', error);
                // 兜底文本
                defContainer.textContent = wordDef.definition;
            }

            // 交由批量测量队列统一处理折叠逻辑，避免逐卡片触发布局计算
            this.measureQueue.push(collapsible);
        }
        
        // 来源信息
        if (this.plugin.settings.showWordSource ?? true) {
            const source = card.createEl('div', { cls: 'hi-words-word-source' });
            const bookName = this.getBookNameFromPath(wordDef.source);
            source.createEl('span', { text: `${t('sidebar.source_prefix')}${bookName}`, cls: 'hi-words-source-text' });
            
            // 使用工具类添加点击事件
            this.wordActionUtils.addSourceClickListener(source, wordDef);
        }
        
        // 添加已掌握状态样式
        if (isMastered) {
            card.addClass('hi-words-word-card-mastered');
        }
    }

    /**
     * 在容器中创建空状态（不清空Tab导航）
     */
    private createEmptyState(container: HTMLElement, message: string) {
        const emptyState = container.createEl('div', { cls: 'hi-words-empty-state' });
        emptyState.createEl('div', { text: message, cls: 'hi-words-empty-text' });
    }

    /**
     * 显示空状态（用于全局空状态，会清空整个容器）
     */
    private showEmptyState(message: string) {
        const container = this.containerEl.querySelector('.hi-words-sidebar');
        if (!container) return;

        container.empty();
        const emptyState = container.createEl('div', { cls: 'hi-words-empty-state' });
        emptyState.createEl('div', { text: message, cls: 'hi-words-empty-text' });
    }

    /**
     * 根级事件委托：使用捕获阶段的 mousedown，解决首次点击 click 丢失
     */
    private bindDelegatedHandlers(root: HTMLElement) {
        if (this.delegatedBound) return;
        root.addEventListener(
            'mousedown',
            (e) => {
                const target = e.target as HTMLElement | null;
                if (!target) return;

                // Tab 切换
                const tabEl = target.closest('.hi-words-tab') as HTMLElement | null;
                if (tabEl && root.contains(tabEl)) {
                    e.preventDefault();
                    e.stopPropagation();
                    const tab = (tabEl.getAttr('data-tab') as 'learning' | 'mastered') || 'learning';
                    if (tab !== this.activeTab) this.switchTab(tab);
                    return;
                }

                // 展开/收起：覆盖层
                const overlay = target.closest('.hi-words-expand-overlay') as HTMLElement | null;
                if (overlay && root.contains(overlay)) {
                    e.preventDefault();
                    e.stopPropagation();
                    const definition = overlay.parentElement as HTMLElement | null;
                    const collapsible = definition?.querySelector('.hi-words-collapsible') as HTMLElement | null;
                    const el = collapsible || definition;
                    if (el) {
                        const nextCollapsed = !el.hasClass('collapsed');
                        el.toggleClass('collapsed', nextCollapsed);
                        overlay.setText(nextCollapsed ? t('actions.expand') : t('actions.collapse'));
                    }
                    return;
                }

                // 已掌握/取消按钮
                const masteredBtn = target.closest('.hi-words-title-mastered-button') as HTMLElement | null;
                if (masteredBtn && root.contains(masteredBtn)) {
                    e.preventDefault();
                    e.stopPropagation();
                    const card = masteredBtn.closest('.hi-words-word-card') as HTMLElement | null;
                    const isMastered = !!card?.hasClass('hi-words-word-card-mastered');
                    const wordText = card?.querySelector('.hi-words-word-text') as HTMLElement | null;
                    const word = wordText?.textContent?.trim();
                    if (word && this.plugin.settings.enableMasteredFeature && this.plugin.masteredService) {
                        const detail = this.currentWords.find((w) => w.word === word);
                        if (detail) {
                            (async () => {
                                try {
                                    if (isMastered) {
                                        await this.plugin.masteredService!.unmarkWordAsMastered(detail.source, detail.nodeId, detail.word);
                                    } else {
                                        await this.plugin.masteredService!.markWordAsMastered(detail.source, detail.nodeId, detail.word);
                                    }
                                    setTimeout(() => this.updateView(), 100);
                                } catch (err) {
                                    console.error('切换已掌握状态失败:', err);
                                }
                            })();
                        }
                    }
                    return;
                }

                // 来源跳转 - 现在由工具类处理，这里可以移除重复逻辑
            },
            { capture: true } as any
        );
        this.delegatedBound = true;
    }

    /**
     * 从路径获取生词本名称
     */
    private getBookNameFromPath(path: string): string {
        const book = this.plugin.settings.vocabularyBooks.find(b => b.path === path);
        return book ? book.name : path.split('/').pop()?.replace('.canvas', '') || '未知';
    }

    /**
     * 截断文本
     */
    private truncateText(text: string, maxLength: number): string {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength).trim();
    }

    /**
     * 转义正则表达式特殊字符
     */
    private escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * 从 PDF 文件中提取文本内容
     */
    private async extractPDFText(): Promise<string> {
        try {
            // 等待 PDF 视图加载并获取文本层内容
            await new Promise(resolve => setTimeout(resolve, PDF_TEXT_EXTRACT_DELAY));
            
            // 查找所有 PDF 文本层
            const textLayers = document.querySelectorAll('.textLayer');
            let extractedText = '';
            
            textLayers.forEach((textLayer: Element) => {
                // 检查是否在当前活动的 PDF 视图中
                const pdfContainer = textLayer.closest('.pdf-container, .mod-pdf');
                if (pdfContainer) {
                    // 获取文本层中的所有文本内容
                    const textSpans = textLayer.querySelectorAll('span[role="presentation"]');
                    textSpans.forEach((span: Element) => {
                        const text = span.textContent || '';
                        if (text.trim()) {
                            extractedText += text + ' ';
                        }
                    });
                    extractedText += '\n'; // 每个文本层后添加换行
                }
            });
            
            // 如果没有找到文本层，尝试从 PDF 视图中提取
            if (!extractedText.trim()) {
                const pdfViews = document.querySelectorAll('.pdf-container, .mod-pdf');
                pdfViews.forEach((pdfView: Element) => {
                    const allText = pdfView.textContent || '';
                    if (allText.trim()) {
                        extractedText += allText + '\n';
                    }
                });
            }
            
            return extractedText.trim();
        } catch (error) {
            console.error('PDF 文本提取失败:', error);
            return '';
        }
    }

    /**
     * 构建用于扫描文档的正则。
     * - 对仅包含拉丁字符的词：使用 \b 边界避免误匹配，如 "art" 不匹配 "start"。
     * - 对包含日语/CJK/韩语的词：不使用 \b（因为 CJK 文本常无空格），并使用 Unicode 标志。
     */
    private buildSearchRegex(term: string): RegExp {
        const escaped = this.escapeRegExp(term);
        // 检测是否包含 CJK、日语或韩语脚本
        const hasCJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(term);
        const pattern = hasCJK ? `${escaped}` : `\\b${escaped}\\b`;
        const flags = hasCJK ? 'giu' : 'gi';

        return new RegExp(pattern, flags);
    }

    /**
     * 为侧边栏渲染内容绑定内部链接与标签交互（使用统一的 MarkdownLinkBinder）
     */
    private bindInternalLinksAndTags(root: HTMLElement, sourcePath: string, hoverParent: HTMLElement) {
        this.linkBinder.bindInternalLinksAndTags(root, sourcePath, hoverParent);
    }

    /**
     * 打开生词本文件
     */
    private async openVocabularyBook(wordDef: WordDefinition) {
        const file = this.app.vault.getAbstractFileByPath(wordDef.source);
        if (file instanceof TFile) {
            await this.app.workspace.openLinkText(file.path, '');
        }
    }

    /**
     * 强制刷新视图
     */
    public refresh() {
        this.currentFile = null; // 强制重新扫描
        this.wordMatcherService.buildTrie(true); // 重建 Trie（包含所有单词）
        this.scheduleUpdate(0);
    }

    /**
     * 外部调用：同步侧边栏滚动到指定词汇（用于悬浮卡片触发）
     */
    public syncToWord(wordNodeId: string) {
        const container = this.containerEl.querySelector('.hi-words-sidebar') as HTMLElement;
        if (!container) return;

        // 查找对应的单词卡片
        const wordCard = container.querySelector(`[data-word-id="${wordNodeId}"]`) as HTMLElement;
        if (!wordCard) return;

        // 高亮当前目标词汇卡片
        wordCard.addClass('visible-word');

        // 获取单词卡片的位置
        const cardTop = wordCard.offsetTop;
        const containerHeight = container.clientHeight;
        const cardHeight = wordCard.offsetHeight;

        // 计算目标滚动位置，使单词卡片居中显示
        const targetScrollTop = cardTop - (containerHeight - cardHeight) / 2;

        // 平滑滚动到目标位置
        container.scrollTo({
            top: targetScrollTop,
            behavior: 'smooth'
        });

        // 延迟移除高亮样式
        setTimeout(() => {
            if (wordCard && wordCard.hasClass('visible-word')) {
                wordCard.removeClass('visible-word');
            }
        }, WORD_CARD_HIGHLIGHT_DURATION);
    }
}
