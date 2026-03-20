# Add/Edit Word V2 Verification Plan

## Scope
- Task lane: worker-2 verification only
- Contract sources:
  - `.omx/plans/prd-add-edit-word-ux-redesign-20260320T113757Z.md`
  - `.omx/plans/test-spec-add-edit-word-ux-redesign-20260320T113757Z.md`
- Scope focus: V2 rename flow, global duplicate policy, entrypoint consistency
- Guardrails: do not expand V1 scope; preserve existing V1 draft state and `analysisRunId` protections

## Baseline (current worktree before V2 patches)
- `npm ci` — PASS (dependencies installed locally in worker-2 worktree)
- `npm run build` — PASS after `npm ci`
- `npm run lint` — FAIL on pre-existing `main.ts` unused imports:
  - `TFile`
  - `Editor`
  - `MarkdownView`
  - `extractSentenceFromEditorMultiline`
  - `HIGHLIGHTER_REFRESH`
  - `t`
- Automated test runner: none present in `package.json` (no vitest/jest/mocha script)

## Verification gates to rerun after implementation lands
1. Build gate
   - `npm run build`
   - Expect exit 0
2. Lint gate
   - `npm run lint`
   - Current baseline already red on `main.ts`; treat as pre-existing unless implementation changes that file and resolves/regresses it
3. Diagnostics gate
   - `tsc -noEmit -skipLibCheck` via build pipeline
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

## Read-only checks to perform on incoming implementation diff
- Confirm a single source of truth exists for rename precheck / conflict evaluation
- Confirm UI blocks save on conflict and keeps modal open
- Confirm no add-then-rollback "normal path" remains for conflict handling
- Confirm three entrypoints share the same mode decision semantics
- Confirm matcher/cache invalidation path still runs after rename/move
- Confirm V1 add-mode-only morphology UI and `analysisRunId` logic remain untouched or intentionally preserved

## Known blockers / gaps
- No implementation patch has landed in worker-2 worktree yet
- No built-in automated test harness exists for modal flows; acceptance currently depends on build/lint plus manual matrix evidence
- Lint baseline is already red before V2 work

## Evidence template
- Build: PASS/FAIL + command output excerpt
- Lint: PASS/FAIL + whether failure is baseline vs regression
- Manual matrix: scenario id -> PASS/FAIL/blocked + notes
- Legacy duplicate audit: command/script path + sample output
- Screenshots/recording: path or note from implementation lane
