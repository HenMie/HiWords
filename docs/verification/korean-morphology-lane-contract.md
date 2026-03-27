# Korean Morphology Lane Contract

## Scope
- Plan: `.omx/plans/korean-morphology-complete-optimal-plan-20260327T112019Z.md`
- Layer: Layer 1 baseline freeze / contract artifact
- Source of truth fixtures:
  - `tests/korean-morphology/fixtures/behavior-matrix.json`
  - `tests/korean-morphology/harness.ts`
  - `scripts/run-korean-morphology-verification.mjs`

## Global rules
- `VocabularyBook.languagePolicy` is the runtime truth source.
- Add Word and Definition Popover must align with `word-analysis`.
- `document-index` may differ only for documented document-safe reasons.
- `matcher-highlighting` may differ only when generated fallback is explicitly allowed.
- Lemma-changing auxiliary boundaries stay conservative by default.
- Word-level reconstruction must not silently change document-index semantics.

## Surface contract table

| Surface | languagePolicy | word-analysis | add-word | popover | document-index | matcher-highlighting | service-state | why-different |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `다가왔습니다` | `korean` | accept -> `다가오다` | same-as-word-analysis | same-as-word-analysis | non-goal | same-as-word-analysis | service-loaded | None |
| `다가온` | `korean` | accept -> `다가오다` | same-as-word-analysis | same-as-word-analysis | non-goal | same-as-word-analysis | service-loaded | None |
| `풋풋한` | `korean` | accept -> `풋풋하다` | same-as-word-analysis | same-as-word-analysis | non-goal | same-as-word-analysis | service-loaded | None |
| `먹고싶다` | `korean` | reject -> `lemma-changing-auxiliary-boundary` | same-as-word-analysis | same-as-word-analysis | partial-block | documented-exception-for-generated-fallback-only | service-loaded | Prevent unsafe partial highlights and silent lemma upgrades |
| `읽어주다` | `korean` | reject -> `lemma-changing-auxiliary-boundary` | same-as-word-analysis | same-as-word-analysis | partial-block | documented-exception-for-generated-fallback-only | service-loaded | Same auxiliary-boundary guard as above |
| `좋아지고` | `korean` | reject -> `lemma-changing-auxiliary-boundary` | same-as-word-analysis | same-as-word-analysis | partial-block | documented-exception-for-generated-fallback-only | service-loaded | Same auxiliary-boundary guard as above |
| `공부하고있다` | `auto` | non-goal | non-goal | non-goal | index -> `공부하다` | same-as-document-index | service-loaded | Document-safe indexing allows lemma-preserving auxiliary merge |
| `예쁘지않다` | `auto` | non-goal | non-goal | non-goal | index -> `예쁘다` | same-as-document-index | service-loaded | Document-safe indexing allows explicit negation chain handling |
| `다가와 요` | `auto` | non-goal | non-goal | non-goal | non-goal | non-goal | service-loaded | Cross-space chain remains outside current approved scope |
| `다가왔습니다` | `korean` | reject/no-upgrade if service unavailable | must-not-silently-upgrade-from-reject | must-not-silently-upgrade-from-reject | non-goal | explicit-secondary-lane-only | generated-fallback-path | Generated inflections are a separate matcher lane only when morphology service is unavailable |

## Contract checkpoints
- Checkpoint A requires:
  - matrix + harness green
  - this contract table checked in
  - manual smoke checklist artifact prepared
- Checkpoint B additionally requires:
  - scorer trace / reject reasons still align with this table
  - any new reconstruction-only cases are added here before claiming success

## Current status
- Checked-in contract artifact: yes
- Automated matrix coverage: yes
- Manual UI execution evidence: pending live Obsidian session
