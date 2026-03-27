# Korean Morphology Optimal Improvement Review

## Scope
- Plan: `.omx/plans/korean-morphology-complete-optimal-plan-20260327T112019Z.md`
- Review lane: Task 3 review/documentation on detached baseline `e10ed6a`
- Focus: word-level scorer behavior, matcher/generated-inflection contract, rule-family boundaries, and verification/documentation readiness

## Baseline reviewed
- `src/core/unified-morphology-service.ts`
- `src/core/korean-morphology-service.ts`
- `src/core/word-matcher-service.ts`
- `src/core/korean-morphology/rule-definitions.ts`
- `src/core/korean-morphology/token-normalizer.ts`
- `src/core/morphology-language-resolver.ts`
- `src/core/morphology-index-manager.ts`
- `src/ui/add-word-modal.ts`
- `src/ui/definition-popover.ts`

## Baseline findings

### 1. `languagePolicy` is already the runtime truth, but each lane must keep consuming it explicitly
- `UnifiedMorphologyService` resolves target language through `resolveMorphologyTargetLanguage(...)`, so word-level analysis already routes through runtime `languagePolicy` semantics rather than hard-coded Korean assumptions.
- Add Word uses `getBookLanguagePolicy(...)` before calling `analyzeWordToBaseForm(...)`, and document indexing passes `getPreferredLanguageForIndexing()` into `analyzeDocument(...)`.
- Matcher trie construction also uses `getBookLanguagePolicy(...)` per book before adding indexed/generated forms.
- Definition popover still reads `sourceBook?.languagePolicy || 'auto'` directly instead of reusing `getBookLanguagePolicy(...)`. This is not a current regression, but future edits should avoid drifting from the resolver-normalized path.

**Review verdict:** the plan's “languagePolicy stays authoritative” constraint matches the current architecture and should remain a hard guardrail.

### 2. Word-level acceptance is still governed by one brittle top-score threshold
- `UnifiedMorphologyService` still hard-codes `SCORE_THRESHOLD = 0.65` and accepts purely by `selectedCandidate.finalScore >= SCORE_THRESHOLD`.
- Candidate weighting is still coarse (`tokenizer`, `reverse-rule`, `fallback`) and only produces one service candidate plus one fallback candidate.
- Reject traces only distinguish `language-undetermined` and `score-below-threshold`; there is no explicit ambiguity margin, candidate subtype, or reason taxonomy.

**Review verdict:** Phase 2 is justified. The current scorer can explain too little and cannot distinguish “correct candidate generated but barely lost” from “candidate generation was weak”.

### 3. Tokenizer-split Korean forms still fall back too early
- `KoreanMorphologyService.analyzeTokens(...)` applies the word rule pipeline once, then falls back to the first token's base form if no rule matches.
- This keeps the current failure mode where tokenizer segmentation can collapse a multi-token Korean surface into an incorrect or overly weak first-token decision.

**Review verdict:** the plan's dedicated reconstruction phase is warranted; a scorer-only patch would not solve this class.

### 4. Document-safe lemma-changing-auxiliary boundaries already exist and must stay frozen by default
- `token-normalizer.ts` already separates lemma-preserving auxiliaries (`있다`, `없다`, `않다`) from lemma-changing auxiliaries.
- `mergeSubsequentInflectionChain(...)` explicitly blocks lemma-changing auxiliaries to avoid partial-highlight regressions like `먹고` inside `먹고싶다`.
- Document-oriented rules (`noun-hada`, `root-with-suffix`, document-side compound building) already opt into this guardrail.

**Review verdict:** the plan is correct to treat these boundaries as preserved-by-default. Any widening should require new corpus proof, not incidental reuse of word-level reconstruction.

### 5. Rule pipelines are already split by scope, but the families are still implicit
- `createKoreanMorphologyRulePipelines()` already distinguishes `wordRules` and `documentRules`.
- The current families are real but still ad hoc: `compound-noun`, `noun-hada`, `root-with-suffix`, `passive`, `verb-with-ending`, plus document-only `auxiliary-combination`.
- There is no explicit family ownership metadata such as “word-only / document-safe / shared-with-proof”, and rule outputs do not expose evidence fields that would help a better scorer.

**Review verdict:** the plan's Phase 4 rule-family split is aligned with current code reality; it should reorganize existing rules rather than invent a new parallel mechanism.

### 6. Matcher/generated-inflection semantics are currently broader than the word-level accept/reject contract
- `WordMatcherService.collectPrimaryForms(...)` unconditionally unions base word + indexed inflection forms, then adds generated inflections when `shouldUseGeneratedInflections(...)` allows it.
- This means matcher/highlighting can surface generated forms without consulting word-level morphology acceptance/rejection outcomes from `UnifiedMorphologyService.analyzeWordDetailed(...)`.
- Document indexing remains a separate lane through `MorphologyIndexManager.indexNote(...) -> analyzeDocument(...)`, so current behavior is already multi-lane even though the contract is undocumented.

**Review verdict:** Phase 1.5 / 3.5 contract freezing is necessary. Without it, scorer improvements could silently diverge from matcher behavior and make the user-visible system harder to reason about.

## Code quality verdict

### Strengths
- Runtime language routing is centralized instead of duplicated per UI entrypoint.
- Word-level and document-level Korean analysis are already structurally separated.
- Existing auxiliary-chain safety logic gives the improvement plan a concrete safety floor.
- Matcher/indexer/UI consumers are modular enough that the phased plan can land incrementally.

### Current design debt / risks
1. **Scoring opacity** — current acceptance logic is too coarse for evidence-driven Korean tuning.
2. **Tokenizer-first fragility** — first-token fallback remains the dominant escape hatch when rules miss.
3. **Contract drift risk** — matcher/generated inflections operate beside, not under, the word-level decision contract.
4. **Verification debt** — the repo still lacks a checked-in Korean behavior matrix/harness, so correctness claims would currently be anecdotal.

## Review verdict against the plan
- **Recommendation:** proceed with the phased plan as written.
- **Why this plan fits the baseline:** it preserves existing runtime truth (`languagePolicy`), keeps document-safe auxiliary blocking intact, and improves the weakest current areas in the right order: corpus/contract first, then scorer, then reconstruction, then systematic rule families.
- **What should not change implicitly:**
  - matcher/highlighting must not silently inherit word-level acceptance semantics;
  - document indexing must not reuse reconstruction heuristics without separate proof;
  - lemma-changing auxiliary boundaries must remain conservative until explicitly re-validated.

## Required documentation / verification artifacts before calling the morphology work "done"
1. Checked-in Korean behavior matrix with word-level and document-level expectations.
2. Frozen matcher/generated-inflection contract documenting where lanes align vs intentionally differ.
3. Verification record showing build/lint status plus corpus/manual evidence for the Korean cases called out in the plan.
4. Explicit note of any remaining non-goals (for example cross-space chains or unsupported tokenizer splits).

## Bottom line
当前 baseline 并不是“架构完全错误”，而是 **已经有正确的分层雏形，但缺少 corpus、合同和解释性 scorer**。因此，这次最优策略不是临时加几条韩语规则，而是按计划先冻住 contract，再把 scorer / reconstruction / rule families 逐层做实。
