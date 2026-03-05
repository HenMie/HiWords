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
export { JsonlVocabularyService } from './jsonl-vocabulary-service';
export { CanvasJsonlImporter } from './canvas-jsonl-importer';
export { VocabularyCacheManager } from './vocabulary-cache-manager';
export { MorphologyLoader } from './morphology-loader';
export { UnifiedMorphologyService } from './unified-morphology-service';
export { MorphologyAssetManager } from './morphology-asset-manager';
export type { CanvasImportResult } from './canvas-jsonl-importer';
export type { JsonlWordRecord } from './jsonl-vocabulary-service';
export type {
    MorphologyAssetProvider,
    MorphologyAssetLanguage,
    MorphologyAssetState
} from './morphology-asset-manager';
export type { MorphologyResult, DocumentMorphologyResult } from './unified-morphology-service';
export type {
    MorphologyAnalyzeOptions,
    MorphologyCandidate,
    MorphologyCandidateSource,
    MorphologyAnalysisTrace,
    MorphologyDecision,
    MorphologyDetectionLanguage
} from './morphology-types';
