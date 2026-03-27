export interface Token {
    surface: string;
    feature: string[];
    partOfSpeech?: string;
    baseForm?: string;
    [key: string]: unknown;
}

export interface Tokenizer {
    tokenize(text: string): Token[];
    free(): void;
}

export interface NormalizedToken {
    surface: string;
    baseForm: string;
    partOfSpeech: string;
    features: string[];
    reading?: string;
    morphemeInfo?: string;
    rawToken: Token;
}

export type TokenRuleScope = 'word' | 'document';

export interface TokenRuleContext {
    tokens: NormalizedToken[];
    index: number;
    scope: TokenRuleScope;
    originalText: string;
    processedTokens: Set<number>;
    debugLog?: (...args: unknown[]) => void;
    calculateConfidence?: (token: Token) => number;
}

export interface MorphologyAnalysisResult {
    surface: string;
    baseForm: string;
    partOfSpeech: string;
    confidence: number;
    analysisSource?: 'tokenizer' | 'reconstructed-tokenizer' | 'reverse-rule' | 'fallback';
    rejectionHint?: 'lemma-changing-auxiliary-boundary';
}

export interface DocumentAnalysisResult {
    morphologyIndex: Map<string, Set<string>>;
    analysisResults: MorphologyAnalysisResult[];
}

export interface RuleResult {
    result: MorphologyAnalysisResult;
    consumedTokenIndices: number[];
}

export interface TokenAnalysisRule {
    name: string;
    apply(context: TokenRuleContext): RuleResult | null;
}
