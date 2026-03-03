<div align="center">
  <h1>HiWords - Vocabulary Manager for Obsidian (Fork)</h1>
  <p><em>基于 <a href="https://github.com/CatMuse/HiWords">CatMuse/HiWords</a> 的个人扩展版，重点强化韩语形态学与 Canvas 管理体验。</em></p>
</div>

---

HiWords 是一个在阅读时帮助你积累词汇的 Obsidian 插件，会自动高亮生词并提供释义。本仓库是在原项目基础上的长期维护分支，主要用于满足韩语学习和 Canvas 管理的个性化需求。

![Screenshot](https://github.com/user-attachments/assets/359f874d-299c-4dd6-9fa1-bacd4664fb42)

## Fork 新增特性

- **统一多语言形态学引擎（韩语 + 日语）**  
  通过 `UnifiedMorphologyService` 聚合 `lindera-wasm-ko-dic` 与 `lindera-wasm-ipadic`（`src/core/unified-morphology-service.ts`），在自动语言检测后走统一分析链路，并支持候选结果评分与可追踪决策（source/POS/context/book-language 权重）。

- **形态学策略可切换（Hybrid / Legacy）**  
  新增 `Morphology Engine` 与 `Morphology Fallback` 两项设置（`src/ui/settings-tab.ts`）：  
  `Hybrid` 以逆向分析为主，`Legacy` 保持历史“活用生成优先”行为；`Conservative` 仅在分析器不可用时启用生成兜底，`Aggressive` 则始终启用。

- **全模式形态学高亮与快照一致性**  
  通过 `Trie` + `MorphologyIndexManager` 对 Markdown、阅读模式、PDF 与侧边栏扫描保持一致匹配（`src/core/word-highlighter.ts`、`src/ui/pdf-highlighter.ts`、`src/core/word-matcher-service.ts`）。高亮结果自动去重并优先保留更长匹配，且基于版本化快照避免不同视图出现词表不一致。

- **词汇添加与编辑体验升级**  
  新的模态框会异步解析韩语原型、记住最近使用的词书、支持词源字段，批量同步到 Canvas（`src/ui/add-word-modal.ts`）。选择已经存在的词条会直接进入编辑模式，避免重复输入。

- **调试与维护工具**  
  新增调试模式（Settings -> Debug Mode）输出形态学处理日志，改进 Canvas 文件监听与增量刷新策略，并跟进上游 0.4.0 版本的性能优化。
- **AI 释义生成**  
  在设置中配置 API（支持 OpenAI / Claude / Gemini 等兼容接口），可在添加单词时一键调用 AI 自动生成释义。
- **文件夹过滤与解析模式**  
  支持限定高亮生效的文件夹，并可自定义 Canvas 文件节点的解析方式（文件名 / 内容 / 混合）。
- **响应式多栏侧边栏**  
  词汇侧边栏根据宽度自动调整列数，阅读更高效。

## 仍保留的核心功能

- Canvas 词书：使用多个 Canvas 文件做分类管理，节点颜色对应高亮颜色。
- 自动高亮：切换笔记时动态刷新，能够处理较大的文档。
- 悬浮释义：鼠标指向即可阅读 Markdown 释义。
- 侧边栏词表：展示当前文档出现的词条并支持快速定位。
- 快捷操作：右键菜单、命令面板与快捷键均可快速添加或刷新词条。

## 快速上手

1. 将插件复制到 `.obsidian/plugins/hi-words/` 并在 Obsidian 设置中启用。  
2. 创建 Canvas 词书（示例结构）：

   ```
   word
   [etymology]

   definition or translation
   ```

3. 在设置页添加词书、启用自动高亮与悬浮释义，根据需要调整自动布局、Mastered 管理、TTS 模板或调试选项。

## 使用 BRAT 安装

1. 在 Obsidian 的社区插件中安装并启用 BRAT。  
2. 打开 BRAT 设置，选择 `Add Beta plugin`。  
3. 输入本仓库路径（`owner/repo`），例如 `yourname/HiWords`。  
4. BRAT 会从 GitHub Release 下载 `manifest.json`、`main.js`、`styles.css` 并安装。

> 发布说明（维护者）：发布 BRAT 版本时，请确保 `Release Tag`、`Release Name`、`manifest.json.version` 三者一致。

## 命令

- `hi-words:refresh-vocabulary`：重新解析所有词书。
- `hi-words:open-vocabulary-sidebar`：打开词条侧边栏。
- `hi-words:add-selected-word`：将选中文本添加或编辑为词条。

## 配置要点

- **自动高亮**：开启后，编辑器、阅读模式、PDF 视图共用形态学索引。  
- **形态学引擎模式**：`Hybrid`（推荐）与 `Legacy` 可切换，平衡准确率与兼容行为。  
- **形态学兜底策略**：`Conservative`（推荐）仅在必要时生成活用，`Aggressive` 始终生成。  
- **Mastered 功能**：支持“移动到 Mastered 分组”或“以颜色区分”两种模式。  
- **自动布局**：控制 Canvas 词卡尺寸、列数、间距，保持画布整洁。  
- **调试模式**：在控制台查看形态学分析与索引详情，便于排查错漏。  
- **模糊释义**：在公共环境中隐藏释义，悬浮或展开时查看。  
- **发音模板**：配置任意 TTS 服务，通过侧边栏或悬浮卡片播放。

## 致谢

原始项目由 [CatMuse](https://github.com/CatMuse/HiWords) 创建，如果这款插件对你有帮助，请为上游项目点赞或赞助支持。
