# Korean Morphology Manual Smoke Checklist

## Scope
- Plan: `.omx/plans/korean-morphology-complete-optimal-plan-20260327T112019Z.md`
- Goal: satisfy Layer 1 Phase 2 early manual UI smoke artifact
- Status legend: `PENDING`, `PASS`, `FAIL`, `N/A`

## Preconditions
- Morphology assets downloaded for Korean in the target vault/session
- `npm run build` passes on the build being tested
- `node scripts/run-korean-morphology-verification.mjs` passes on the build being tested
- Target book `languagePolicy` is known before each run (`korean` for word-level checks, `auto` for document-index checks)

## Word-level parity checks

| Case | Surface | Entry | Expected | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| W1 | `다가왔습니다` | Add Word | normalize to `다가오다` | PENDING | Must match popover result |
| W2 | `다가왔습니다` | Definition Popover | normalize to `다가오다` | PENDING | Must match Add Word |
| W3 | `다가온` | Add Word / Popover | normalize to `다가오다` | PENDING | Check same output in both entrypoints |
| W4 | `풋풋한` | Add Word / Popover | normalize to `풋풋하다` | PENDING | Check same output in both entrypoints |
| W5 | `먹고싶다` | Add Word / Popover | preserve original word, no fake lemma | PENDING | Reject path should stay honest |
| W6 | `읽어주다` | Add Word / Popover | preserve original word, no fake lemma | PENDING | Reject path should stay honest |
| W7 | `좋아지고` | Add Word / Popover | preserve original word, no fake lemma | PENDING | Reject path should stay honest |

## Document-safe checks

| Case | Surface | Entry | Expected | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| D1 | `공부하고있다` | document index + highlight | indexed under `공부하다` | PENDING | Verify expected highlight exists |
| D2 | `예쁘지않다` | document index + highlight | indexed under `예쁘다` | PENDING | Verify expected highlight exists |
| D3 | `먹고싶다` | document highlight | no unsafe partial `먹고` highlight | PENDING | Safety regression guard |
| D4 | `다가와 요` | document highlight | remains non-goal / no new merge | PENDING | Cross-space chain should not silently expand |

## Matcher / fallback checks

| Case | Surface | Service State | Expected | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| M1 | `다가왔습니다` | service-loaded | match semantics align with word-analysis | PENDING | No generated fallback override |
| M2 | `다가왔습니다` | generated-fallback-path | generated form may highlight only as explicit secondary lane | PENDING | Must not change Add Word / Popover result |

## Evidence to capture during manual run
- Vault / book path
- Book `languagePolicy`
- Whether Korean asset was loaded successfully
- Screenshot or concise note for each `FAIL`
- Any UI copy issue when reject cases preserve original word

## Current lane note
- This worker prepared the checklist artifact, but did not execute live Obsidian UI smoke inside this shell-only lane.
- Until the checklist is run live, manual status remains `PENDING` even though automated build + matrix verification pass.
