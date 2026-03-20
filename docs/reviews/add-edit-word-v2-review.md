# Add/Edit Word V2 Review Notes

## Scope
- PRD: `.omx/plans/prd-add-edit-word-ux-redesign-20260320T113757Z.md`
- Test spec: `.omx/plans/test-spec-add-edit-word-ux-redesign-20260320T113757Z.md`
- Review focus: V2 rename flow, global duplicate policy, entrypoint consistency, and verification evidence

## Current baseline on `ee16a6a`
The current branch only contains the V1 UX-contract cleanup from `ee16a6a`.
That V1 work keeps add/edit copy honest, preserves `draft` + `analysisRunId`, and makes ownership cues visible, but it does **not** implement the V2 acceptance contract yet.

### Verified baseline gaps
1. **Rename is still unavailable in edit mode**
   - `src/ui/add-word-form.ts` only renders the word input in add mode.
   - `src/ui/add-word-form.ts` submits `initialWord` in edit mode, so edit cannot change the headword.
2. **No global duplicate precheck API exists yet**
   - `src/core/vocabulary-manager.ts` exposes `hasWord()`, `updateWordInCanvas()`, and `moveWordToBook()`, but no V2-style `checkRenameConflict()` or legacy duplicate audit helper.
3. **Entry intent still depends on global `hasWord()` only**
   - `main.ts`, `src/plugin-events.ts`, and `src/plugin-commands.ts` still resolve add-vs-edit from `vocabularyManager.hasWord(selection)` and do not yet expose any V2-specific rename or legacy-duplicate guardrail.
4. **No repeatable legacy duplicate audit artifact exists yet**
   - The test spec requires repeatable output containing normalized word, book path, node id, and raw word.
5. **No V2 manual-evidence record exists yet**
   - The test spec requires build output, V1/V2 matrix results, legacy duplicate audit output, and at least one screenshot or recording set.

## Acceptance review checklist

### V2 rename / collision behavior
- [ ] Same-book rename with globally unique normalized word succeeds.
- [ ] Same-book rename conflict blocks save and leaves data untouched.
- [ ] Cross-book move without rename succeeds when no global conflict exists.
- [ ] Cross-book move + rename conflict blocks save and leaves source/target untouched.
- [ ] Case-only / whitespace-only rename is treated as metadata-only.

### Entry-point consistency
- [ ] `main.ts#addOrEditWord()` matches the same mode/result as editor menu flow.
- [ ] `src/plugin-events.ts` editor menu flow matches command flow.
- [ ] `src/plugin-commands.ts` `add-selected-word` flow matches main flow.
- [ ] Post-rename re-entry from all three entrypoints hits the updated unique word.

### Global duplicate / audit gates
- [ ] A repeatable audit command or script reports legacy duplicate state.
- [ ] Audit output includes normalized word, raw word, book path, and node id.
- [ ] V2 does not claim completion if legacy cross-book duplicates still exist.

### Regression protection
- [ ] Add-mode still preserves draft state on book switch.
- [ ] Add-mode `analysisRunId` still prevents stale morphology writes.
- [ ] V1 truthful-copy and mode-specific affordances still hold after V2 lands.

## Files that should change when V2 is actually complete
- `src/core/vocabulary-manager.ts`
- `src/core/vocabulary-book-store.ts` and/or lower-level lookup helpers
- `src/ui/add-word-modal.ts`
- `src/ui/add-word-form.ts`
- `src/i18n/*`
- `main.ts`
- `src/plugin-events.ts`
- `src/plugin-commands.ts`
- one repeatable audit/evidence artifact (script or doc)

## Review verdict on current branch
- **V1 status:** implemented previously by `ee16a6a`, but not re-manually-verified in this review lane.
- **V2 status:** **not implemented on current branch**.
- **Release readiness for V2:** **blocked** until the rename conflict API, duplicate audit path, entrypoint consistency changes, and manual evidence are added.

## Verification commands for the eventual V2 lane
```bash
npm run build
npm run lint
```

Manual evidence to collect before calling V2 done:
- V1 matrix results (V1-A1 .. V1-O1)
- V2 matrix results (V2-R1 .. V2-G2)
- legacy duplicate audit output
- at least one screenshot or recording set for add/edit + rename conflict flows


## Verification snapshot on this review branch
- `npm ci` ✅ installed local dependencies successfully.
- `npm run build` ✅ passed after installing dependencies.
- `npm run lint` ⚠️ fails on pre-existing repository issues in `main.ts` (`TFile`, `Editor`, `MarkdownView`, `extractSentenceFromEditorMultiline`, `HIGHLIGHTER_REFRESH`, `t` are unused). This review lane did not modify `main.ts`, so the lint failure is recorded as baseline debt rather than introduced by this documentation change.
- Manual V1/V2 matrix: not executed in this lane because the branch does not yet contain the V2 implementation required by the test spec.
