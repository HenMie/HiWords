import type { MorphologyLanguage } from '../utils/types';

export type MorphologyDetectionLanguage = 'korean' | 'japanese' | 'unknown';
export type MorphologyCandidateSource = 'tokenizer' | 'reverse-rule' | 'fallback';
export type MorphologyDecisionReason =
    | 'accepted-high-confidence'
    | 'accepted-single-candidate'
    | 'language-undetermined'
    | 'no-candidates'
    | 'score-below-threshold'
    | 'ambiguous-top-candidates'
    | 'fallback-only-candidate';

export interface MorphologyAnalyzeOptions {
    languagePolicy?: MorphologyLanguage;
    contextText?: string;
}

export interface MorphologyCandidate {
    surface: string;
    baseForm: string;
    partOfSpeech: string;
    language: MorphologyDetectionLanguage;
    confidence: number;
    source: MorphologyCandidateSource;
    sourceWeight: number;
    confidenceWeight: number;
    posWeight: number;
    contextWeight: number;
    bookLanguageWeight: number;
    finalScore: number;
}

export interface MorphologyAnalysisTrace {
    threshold: number;
    minimumMargin: number;
    candidates: MorphologyCandidate[];
    selectedCandidate: MorphologyCandidate | null;
    selectedCandidateMargin: number | null;
    rejected: boolean;
    acceptanceReason?: MorphologyDecisionReason;
    reason?: MorphologyDecisionReason;
}

export interface MorphologyDecision {
    surface: string;
    language: MorphologyDetectionLanguage;
    accepted: boolean;
    baseForm: string | null;
    partOfSpeech: string | null;
    confidence: number;
    finalScore: number;
    candidates: MorphologyCandidate[];
    trace: MorphologyAnalysisTrace;
}
