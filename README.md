<div align="center">
  <h1>HiWords - Vocabulary Manager for Obsidian (Fork)</h1>
  <p><em>基于 <a href="https://github.com/CatMuse/HiWords">CatMuse/HiWords</a> 的个人扩展版，重点强化韩语形态学与 Canvas 管理体验。</em></p>
</div>

---

HiWords 是一个在阅读时帮助你积累词汇的 Obsidian 插件，会自动高亮生词并提供释义。本仓库是在原项目基础上的长期维护分支，主要用于满足韩语学习和 Canvas 管理的个性化需求。

![Screenshot](https://github.com/user-attachments/assets/359f874d-299c-4dd6-9fa1-bacd4664fb42)

## Fork 新增特性

- **韩语形态学引擎**  
  集成 `lindera-wasm-ko-dic`（`src/core/korean-morphology-service.ts`），初始化时自动加载 WASM，并针对韩语词性做了专项处理：支持复合名词、派生动词以及不规则变化等，将活用形统一映射到 Canvas 中的原型词条。

- **全模式形态学高亮**  
  通过 `Trie` 前缀树与 `MorphologyIndexManager` 对 Markdown、阅读模式以及 PDF 视图进行统一的高亮匹配（`src/core/word-highlighter.ts`、`src/ui/pdf-highlighter.ts`）。高亮结果会自动去重并优先保留更长的匹配，所有编辑器实例由 `highlighterManager` 统一刷新。

- **词汇添加与编辑体验升级**  
  新的模态框会异步解析韩语原型、记住最近使用的词书、支持词源字段，批量同步到 Canvas（`src/ui/add-word-modal.ts`）。选择已经存在的词条会直接进入编辑模式，避免重复输入。

- **调试与维护工具**  
  新增调试模式（Settings -> Debug Mode）输出形态学处理日志，改进 Canvas 文件监听与增量刷新策略，并跟进上游 0.4.0 版本的性能优化。

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

## 命令

- `hi-words:refresh-vocabulary`：重新解析所有词书。
- `hi-words:open-vocabulary-sidebar`：打开词条侧边栏。
- `hi-words:add-selected-word`：将选中文本添加或编辑为词条。

## 配置要点

- **自动高亮**：开启后，编辑器、阅读模式、PDF 视图共用形态学索引。  
- **Mastered 功能**：支持“移动到 Mastered 分组”或“以颜色区分”两种模式。  
- **自动布局**：控制 Canvas 词卡尺寸、列数、间距，保持画布整洁。  
- **调试模式**：在控制台查看形态学分析与索引详情，便于排查错漏。  
- **模糊释义**：在公共环境中隐藏释义，悬浮或展开时查看。  
- **发音模板**：配置任意 TTS 服务，通过侧边栏或悬浮卡片播放。

## 致谢

原始项目由 [CatMuse](https://github.com/CatMuse/HiWords) 创建，如果这款插件对你有帮助，请为上游项目点赞或赞助支持。
