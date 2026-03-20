# Add/Edit Word V2 Verification Plan

## Scope
- Task lane: current branch verification follow-up
- Contract sources:
  - `.omx/plans/prd-add-edit-word-ux-redesign-20260320T113757Z.md`
  - `.omx/plans/test-spec-add-edit-word-ux-redesign-20260320T113757Z.md`
- Scope focus: V2 rename flow, global duplicate policy, entrypoint consistency
- Guardrails: preserve V1 draft state and `analysisRunId` protections while validating V2 duplicate behavior

## Current implementation baseline
- V2 implementation has landed on the current branch
- Follow-up fixes now ensure:
  - duplicate words can still open a concrete edit modal when the caller already knows the node/definition
  - legacy duplicate blocking in `checkRenameConflict()` is scoped to the current/candidate normalized word rather than any duplicate anywhere in the repo
  - stale review / verification docs no longer claim “V2 not implemented”

## Verification gates to rerun
1. Build gate
   - `npm run build`
   - Expect exit 0
2. Lint gate
   - `npm run lint`
   - Expect exit 0
3. Diagnostics gate
   - covered by build pipeline (`tsc -noEmit -skipLibCheck`)
4. V2 manual matrix
   - R1 same-book rename unique
   - R2 same-book rename conflict
   - R3 cross-book move unique
   - R4 cross-book move+rename conflict
   - R5 rename no-op (whitespace/case only)
   - I1 command entry consistency
   - I2 editor menu consistency
   - I3 main flow consistency
   - G1 legacy duplicate audit / blocked rollout signal
   - G2 post-rename re-entry consistency under global uniqueness

## Read-only checks already satisfied on current branch
- Single source of truth exists for rename precheck / conflict evaluation via `VocabularyManager.checkRenameConflict()`
- UI blocks save on conflict and keeps modal open
- No add-then-rollback “normal path” was introduced for conflict handling
- Three entrypoints share `getWordEntryIntent()` semantics for add vs edit
- Cache / matcher invalidation still runs through existing update/move/delete paths
- V1 add-mode `draft` + `analysisRunId` protections remain in place

## Known remaining gaps
- No built-in automated harness exists for modal UX flows; acceptance still depends on manual matrix evidence
- Legacy duplicate audit output exists as a command, but a real-data artifact has not yet been captured into docs
- No screenshot/recording evidence has been collected yet

## Evidence snapshot on current branch
- `npm run build` — PASS
- `npm run lint` — PASS
- Manual V1/V2 matrix — not yet executed in this lane
- Legacy duplicate audit artifact — command exists, real-data evidence pending
- Screenshots / recording — pending

## Exit note
在当前代码状态下，V2 的 blocking code issues 已修复；剩余 gate 主要是验收证据而不是实现缺口。若 manual matrix / audit evidence 缺失，则只能宣布“implemented but not fully manually verified”。
