# Korean Morphology Optimal Improvement Verification Plan

## Scope
- Plan: `.omx/plans/korean-morphology-optimal-improvement-20260326T164853Z.md`
- Verification lane: Task 3 documentation + review support on baseline `e10ed6a`
- Focus: matcher boundary integration, rule-family split readiness, build/lint/manual evidence expectations

## Verification goals
1. Prove the phased work preserves `languagePolicy` as the runtime truth.
2. Prove word-level scorer changes do not silently redefine matcher/highlighting or document-index semantics.
3. Prove Korean reconstruction/rule work does not weaken lemma-changing-auxiliary safety.
4. Capture enough evidence to distinguish implemented behavior from still-unverified aspirations.

## Automated gates

### Gate A — typecheck/build
```bash
npm run build
```
Expected:
- PASS
- Includes `tsc -noEmit -skipLibCheck`
- No new TypeScript or bundling errors after morphology changes

### Gate B — lint
```bash
npx eslint tests/korean-morphology/harness.ts tests/korean-morphology/run-behavior-matrix.ts scripts/run-korean-morphology-verification.mjs
```
Expected:
- PASS
- Covers the new Korean verification harness/script files introduced by this work

### Gate C — focused diagnostics on modified TypeScript files
Run diagnostics on every changed TS file in the final lane diff.
Expected:
- PASS
- No file-specific diagnostics left unresolved

## Corpus / behavior-matrix gates
The implementation is not fully verified unless a checked-in Korean matrix covers these dimensions per case:
- input surface
- entrypoint (`add-word`, `popover`, `word-analysis`, `document-index`, `matcher-highlighting`)
- `languagePolicy` (`korean`, `auto`, `none` where relevant)
- service state (service-loaded vs generated-fallback branch where relevant)
- expected lemma or explicit reject
- document-safe outcome (`index`, `do-not-index`, `partial-block`, or `non-goal`)
- whether generated inflections are allowed to participate

### Minimum required Korean cases

#### Word-level should-accept
- `다가왔습니다 -> 다가오다`
- `다가온 -> 다가오다`
- `풋풋한 -> 풋풋하다`
- tokenizer-split reconstruction examples such as `다가와요` once Phase 3 lands

#### Word-level should-reject / preserve-boundary
- `먹고싶다`
- `읽어주다`
- `좋아지고`
- any case where a lemma-changing auxiliary would make a document-safe partial match unsafe

#### Document-index / highlighting safety
- `공부하고있다`
- `예쁘지않다`
- blocked partial-surface regressions such as `먹고` inside `먹고싶다`
- known non-goals such as cross-space chains unless separately approved

## Contract-freeze gates (Phase 1.5 / 3.5)
Before or alongside scorer/reconstruction changes, capture explicit PASS/FAIL evidence for:
1. Whether generated inflections are only an availability fallback or an intentionally separate matching lane.
2. Which entrypoints must align exactly (`add-word`, `popover`, word analysis) versus which may intentionally differ (`matcher-highlighting`, `document-index`).
3. Service-loaded vs generated-fallback behavior for the same Korean surface.
4. Whether a rejected word-level analysis can still appear in matcher/highlighting, and if so, under what documented rule.

## Manual verification checklist

### UI / entrypoint parity
- Add Word normalizes the same Korean input to the same lemma as Definition Popover under the same `languagePolicy`.
- If morphology rejects a word-level surface, the UI preserves the original word instead of silently inventing a lemma.
- No entrypoint bypasses the runtime book language configuration.

### Matcher / highlighting
- Indexed forms continue to highlight expected document-safe variants.
- Generated inflection matches do not silently contradict the frozen word-level contract.
- Cross-space behavior remains limited to approved noun-like cases.

### Document safety
- Lemma-changing auxiliary chains remain blocked unless the plan explicitly re-validates them.
- No reintroduction of unsafe partial highlights after reconstruction/rule updates.

## Evidence format for final task closeout
Use a structured result with at least:
- `Review:` artifact path(s)
- `Verification:`
  - `PASS` / `FAIL` for build
  - `PASS` / `FAIL` for lint
  - `PASS` / `FAIL` for diagnostics on changed TS files (or `N/A` for docs-only lane)
  - `PASS` / `FAIL` / `PENDING` for corpus/manual checks
- `Risks:` remaining verification gaps or contract decisions still pending

## Current baseline evidence in this doc lane
- Build: runnable and expected to cover typecheck
- Lint: runnable
- Automated test suite: no dedicated Korean test runner is present in `package.json` yet
- Manual/E2E morphology evidence: not captured in this doc-only lane

## Exit note
对这次 morphology 任务，**“代码改完”不等于“完成验收”**。只有 build/lint 通过、corpus/contract 落盘、并且 UI + matcher + document-safe 三条线都有明确 PASS/FAIL 证据时，才能宣布这轮韩语形态学优化真正收口。
