## Cell Integration Plan

### Phase 1 - Selection Utilities & Logging
- [x] Reintroduce selectionUtils.ts with SelectionDescriptor, CellLocator, toAddress, parseAddress.
- [x] Wrap utilities with unit tests (Vitest) for column letter/index conversion and address parsing.
- [x] Add debugSelection(event, payload) helper (no-op unless window.__dfDebug is true).

### Phase 2 - Mirror Legacy Selection into activeSelection
- [ ] In DataFrameOperationsCanvas, create activeSelection state without changing downstream usage.
- [ ] Update cell, column, row select handlers to set both legacy fields and activeSelection.
- [ ] Add warning logger if legacy and descriptor state diverge (use debugSelection).
- [ ] Verify pagination/filter transitions keep locators and selectedCell in sync.

### Phase 3 - Registry Shell & Inspector
- [ ] Restore useOperationRegistry (read/write to settings) without auto-populating formulas.
- [ ] Build small inspector panel (toggle via ?dfDebug=1) showing cellRegistry entries.
- [ ] Ensure reset/upload handlers clear registry and snapshot.
- [ ] Add debug log on registry add/remove.

### Phase 4 - Action Capability Module
- [ ] Implement pure actionCapabilities.ts with evaluateAction(actionId, ctx) and action metadata.
- [ ] Context structure: { headers, rows, selection, filters, searchTerm, permanentlyDeletedRows }.
- [ ] Add helper to expose capability decisions when window.__dfCapDebug = true.
- [ ] Unit tests covering main action cases (no selection, single column, multi-column, filters active).

### Phase 5 - Toolbar Integration
- [ ] Introduce renderActionButton(id, onClick) that consumes capability result.
- [ ] Apply to non-destructive actions first (sort/filter), ensure tooltips show disabledReason.
- [ ] Add data-capability-id attributes for E2E targeting.
- [ ] Manual QA: confirm disabled buttons explain why.

### Phase 6 - Context Menu Integration
- [ ] Use capability map for column context menu (compute descriptor from multi-selection).
- [ ] Repeat for row menu; handle single vs multi row selection.
- [ ] Provide fallback to default behavior if action missing (avoid hard failures).
- [ ] Extend Exhibition mode with capability matrix view.

### Phase 7 - Registry Mutation Sync
- [ ] Implement withRegistrySync wrappers around insert/delete/rename/move actions.
- [ ] Add tests ensuring registry keys update when columns renamed or rows removed.
- [ ] Soft warnings when registry references missing targets post-mutation.

### Phase 8 - Backend Alignment Prep
- [ ] Draft docs/dataframe-selection-actions.md describing descriptor + action payload.
- [ ] Implement mock service (simulateSelectionAction) used in Exhibition mode.
- [ ] Provide stub API wrapper returning throw new Error("Not implemented") to prevent silent use.

### Phase 9 - Automated Testing & Instrumentation
- [ ] Vitest suite for capability map and selection utils.
- [ ] Cypress/Playwright journeys: no selection, column selection, multi-column, range, filter scenarios.
- [ ] Feature flag (DF_SELECTION_DEBUG env or query) enabling visual overlays & verbose logs.
- [ ] Document debugging toggles and QA checklist in EXCEL_UNIFIED_OPERATIONS_BACKUP_PLAN.md.

### Rollout Safety
- [ ] After each phase: npm run lint, npm run build, docker compose build --no-cache frontend, docker compose up -d frontend.
- [ ] Capture console screenshots and capability exports to verify actions match expectations.
- [ ] Maintain a changelog entry per phase with regression checklist.

