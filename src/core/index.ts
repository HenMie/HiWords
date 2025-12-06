/**
 * 核心业务逻辑模块
 */

export { VocabularyManager } from './vocabulary-manager';
export { MasteredService } from './mastered-service';
export { WordHighlighter, createWordHighlighterExtension, getWordUnderCursor, highlighterManager } from './word-highlighter';
export { KoreanMorphologyService } from './korean-morphology-service';
export { JapaneseMorphologyService } from './japanese-morphology-service';
export { MorphologyIndexManager } from './morphology-index-manager';
export { WordMatcherService } from './word-matcher-service';
export { CanvasService } from './canvas-service';
export { VocabularyCacheManager } from './vocabulary-cache-manager';
export { MorphologyLoader } from './morphology-loader';
export { UnifiedMorphologyService } from './unified-morphology-service';
export type { MorphologyResult, DocumentMorphologyResult } from './unified-morphology-service';
