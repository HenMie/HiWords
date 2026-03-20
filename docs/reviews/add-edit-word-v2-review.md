# Add/Edit Word V2 Review Notes

## Scope
- PRD: `.omx/plans/prd-add-edit-word-ux-redesign-20260320T113757Z.md`
- Test spec: `.omx/plans/test-spec-add-edit-word-ux-redesign-20260320T113757Z.md`
- Review focus: V2 rename flow, global duplicate policy, entrypoint consistency, and verification evidence
- Reviewed implementation baseline: `4363ef4` plus follow-up fixes in current worktree

## Current baseline on current branch
当前分支已经落地 V2 的基础实现：
- 入口分流改为 `getWordEntryIntent()`，不再只靠 `hasWord()`
- edit 模式可编辑词头，并在提交前通过 `checkRenameConflict()` 做冲突预检查
- 已新增 legacy duplicate audit command
- add/edit copy、ownership cues、inline blocking error、i18n key 已补齐

本次 follow-up review 的目标不是确认“V2 是否存在”，而是确认其 duplicate gate、入口行为与文档是否一致。

## Verified follow-up fixes on current worktree
1. **允许针对 legacy duplicate 词条进入具体编辑页**
   - `src/core/vocabulary-manager.ts` 现在优先返回带 `definition` 的 `edit` intent；若当前词本身存在重复，只把 duplicate entries 挂到 edit intent 上，不再一律卡死在入口外。
   - `main.ts` 会把 `definition + duplicateEntries` 传给 `AddWordModal`，从而允许用户查看、删除、或仅修改 metadata。
2. **legacy duplicate 阻断改为局部相关，而非全局误伤**
   - `checkRenameConflict()` 只在 `currentNormalizedWord` 或 `candidateNormalizedWord` 命中历史重复时返回 `legacy-duplicate-state`。
   - 无关词条不再因为仓库里其它重复词而被全局禁止 rename/move。
3. **文档改为反映当前分支状态**
   - review/verification 文档已从“V2 尚未实现”更新为“V2 已实现，但仍需手工矩阵补完”。

## Remaining review verdict
### Strengths
- 入口、modal、store、i18n 的职责边界比 V1 清晰。
- duplicate audit 已形成可重复执行的 debug command，输出包含 normalized/raw/book/node 信息。
- rename/move 仍复用 `updateWordInCanvas()` / `moveWordToBook()`，没有引入平行持久化通道。

### Remaining gaps / watch items
1. **Manual matrix evidence is still missing**
   - `npm run build` / `npm run lint` 可以覆盖静态链路，但 PRD/test spec 明确要求 V1/V2 手工矩阵和至少一组 UI 证据。
2. **Direct ambiguous entry is still blocked outside the sidebar path**
   - 当用户只通过选区入口命中“历史重复词”且系统无法唯一定位 node 时，当前仍会 notice 提示改从侧边栏进入。这是可接受的保守策略，但应在后续 UX 中确认是否需要更直接的 disambiguation chooser。

## Review verdict on current branch
- **V1 status:** 已实现，且未见本轮 follow-up 回归。
- **V2 status:** 已实现基础 contract，并修复了 duplicate gate 的两处阻断级问题。
- **Release readiness for V2:** **有条件通过** —— 代码层 blocking issue 已修复，但在补齐手工矩阵、duplicate audit 实录和 UI 证据前，不应把 V2 宣称为 fully verified。

## Verification commands rerun on current branch
```bash
npm run build
npm run lint
```

## Evidence snapshot on this review branch
- `npm run build` ✅ 通过
- `npm run lint` ✅ 通过
- 手工 V1/V2 matrix：未在本 follow-up lane 执行
- legacy duplicate audit 实录：未在真实词书数据上留档
- screenshot / recording：未收集
