# Korean Morphology Optimal Improvement Verification Plan

## Scope
- Plan: `.omx/plans/korean-morphology-complete-optimal-plan-20260327T112019Z.md`
- Verification lane: Task 3 documentation + review support on baseline `e10ed6a`
- Focus: matcher boundary integration, rule-family split readiness, build/lint/manual evidence expectations

## Verification goals
1. Prove the phased work preserves `languagePolicy` as the runtime truth.
2. Prove word-level scorer changes do not silently redefine matcher/highlighting or document-index semantics.
3. Prove Korean reconstruction/rule work does not weaken lemma-changing-auxiliary safety.
4. Capture enough evidence to distinguish implemented behavior from still-unverified aspirations.

## Lane contract

### Global rules
- `VocabularyBook.languagePolicy` is the runtime truth source.
- Add Word and Definition Popover must align with `word-analysis`.
- `document-index` may differ only for documented document-safe reasons.
- `matcher-highlighting` may differ only when generated fallback is explicitly allowed.
- Lemma-changing auxiliary boundaries stay conservative by default.
- Word-level reconstruction must not silently change document-index semantics.

### Surface contract table

| Surface | languagePolicy | word-analysis | add-word | popover | document-index | matcher-highlighting | service-state | why-different |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `다가왔습니다` | `korean` | accept -> `다가오다` | same-as-word-analysis | same-as-word-analysis | non-goal | same-as-word-analysis | service-loaded | None |
| `다가온` | `korean` | accept -> `다가오다` | same-as-word-analysis | same-as-word-analysis | non-goal | same-as-word-analysis | service-loaded | None |
| `풋풋한` | `korean` | accept -> `풋풋하다` | same-as-word-analysis | same-as-word-analysis | non-goal | same-as-word-analysis | service-loaded | None |
| `다가와요` | `korean` | accept -> `다가오다` | same-as-word-analysis | same-as-word-analysis | non-goal | same-as-word-analysis | service-loaded | Targeted word-level reconstruction covers tokenizer-split lexical prefix + verb cases |
| `먹고싶다` | `korean` | reject -> `lemma-changing-auxiliary-boundary` | same-as-word-analysis | same-as-word-analysis | partial-block | documented-exception-for-generated-fallback-only | service-loaded | Prevent unsafe partial highlights and silent lemma upgrades |
| `읽어주다` | `korean` | reject -> `lemma-changing-auxiliary-boundary` | same-as-word-analysis | same-as-word-analysis | partial-block | documented-exception-for-generated-fallback-only | service-loaded | Same auxiliary-boundary guard as above |
| `좋아지고` | `korean` | reject -> `lemma-changing-auxiliary-boundary` | same-as-word-analysis | same-as-word-analysis | partial-block | documented-exception-for-generated-fallback-only | service-loaded | Same auxiliary-boundary guard as above |
| `공부하고있다` | `auto` | non-goal | non-goal | non-goal | index -> `공부하다` | same-as-document-index | service-loaded | Document-safe indexing allows lemma-preserving auxiliary merge |
| `예쁘지않다` | `auto` | non-goal | non-goal | non-goal | index -> `예쁘다` | same-as-document-index | service-loaded | Document-safe indexing allows explicit negation chain handling |
| `다가와 요` | `auto` | non-goal | non-goal | non-goal | non-goal | non-goal | service-loaded | Cross-space chain remains outside current approved scope |
| `다가왔습니다` | `korean` | reject/no-upgrade if service unavailable | must-not-silently-upgrade-from-reject | must-not-silently-upgrade-from-reject | non-goal | explicit-secondary-lane-only | generated-fallback-path | Generated inflections are a separate matcher lane only when morphology service is unavailable |

### Contract checkpoints
- Checkpoint A requires:
  - matrix + harness green
  - this contract table checked in
  - manual smoke checklist artifact prepared
- Checkpoint B additionally requires:
  - scorer trace / reject reasons still align with this table
  - any new reconstruction-only cases are added here before claiming success

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
- tokenizer-split reconstruction examples such as `다가와요 -> 다가오다` once Phase 4 lands

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

### Preconditions
- Morphology assets downloaded for Korean in the target vault/session
- `npm run build` passes on the build being tested
- `node scripts/run-korean-morphology-verification.mjs` passes on the build being tested
- Target book `languagePolicy` is known before each run (`korean` for word-level checks, `auto` for document-index checks)

### Word-level parity checks

| Case | Surface | Entry | Expected | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| W1 | `다가왔습니다` | Add Word | normalize to `다가오다` | PENDING | Must match popover result |
| W2 | `다가왔습니다` | Definition Popover | normalize to `다가오다` | PENDING | Must match Add Word |
| W3 | `다가온` | Add Word / Popover | normalize to `다가오다` | PENDING | Check same output in both entrypoints |
| W4 | `풋풋한` | Add Word / Popover | normalize to `풋풋하다` | PENDING | Check same output in both entrypoints |
| W5 | `다가와요` | Add Word / Popover | normalize to `다가오다` | PENDING | Targeted reconstruction regression check |
| W6 | `먹고싶다` | Add Word / Popover | preserve original word, no fake lemma | PENDING | Reject path should stay honest |
| W7 | `읽어주다` | Add Word / Popover | preserve original word, no fake lemma | PENDING | Reject path should stay honest |
| W8 | `좋아지고` | Add Word / Popover | preserve original word, no fake lemma | PENDING | Reject path should stay honest |

### Document-safe checks

| Case | Surface | Entry | Expected | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| D1 | `공부하고있다` | document index + highlight | indexed under `공부하다` | PENDING | Verify expected highlight exists |
| D2 | `예쁘지않다` | document index + highlight | indexed under `예쁘다` | PENDING | Verify expected highlight exists |
| D3 | `먹고싶다` | document highlight | no unsafe partial `먹고` highlight | PENDING | Safety regression guard |
| D4 | `다가와 요` | document highlight | remains non-goal / no new merge | PENDING | Cross-space chain should not silently expand |

### Matcher / fallback checks

| Case | Surface | Service State | Expected | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| M1 | `다가왔습니다` | service-loaded | match semantics align with word-analysis | PENDING | No generated fallback override |
| M2 | `다가왔습니다` | generated-fallback-path | generated form may highlight only as explicit secondary lane | PENDING | Must not change Add Word / Popover result |

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

### Evidence to capture during manual run
- Vault / book path
- Book `languagePolicy`
- Whether Korean asset was loaded successfully
- Screenshot or concise note for each `FAIL`
- Any UI copy issue when reject cases preserve original word

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
- Manual/E2E morphology evidence: checklist prepared, but not captured in this shell-only lane

## Exit note
对这次 morphology 任务，**“代码改完”不等于“完成验收”**。只有 build/lint 通过、corpus/contract 落盘、并且 UI + matcher + document-safe 三条线都有明确 PASS/FAIL 证据时，才能宣布这轮韩语形态学优化真正收口。
