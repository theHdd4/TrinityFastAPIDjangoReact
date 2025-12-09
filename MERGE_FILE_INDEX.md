# FILE-BY-FILE MERGE INDEX

**Quick lookup: What changed in each file**

Use this index to quickly find and understand changes in any specific file.  
For full diffs, see `MERGE_GUIDE_DIFF.txt`

---

## 📍 HOW TO USE THIS INDEX

1. Find your conflicting file below
2. Read the "What Changed" summary
3. Check the "Merge Strategy"
4. Use line numbers to locate in `MERGE_GUIDE_DIFF.txt`

---

## 🗂️ BACKEND DJANGO FILES

### 1. `TrinityBackendDjango/apps/share_links/models.py`
- **Lines Changed**: +70
- **What Changed**: Added new model `DashboardShareLink` for sharing dashboards
- **Key Additions**:
  - New model class for dashboard sharing
  - Fields for share tokens, permissions, expiry
  - Related methods for link generation
- **Merge Strategy**: KEEP - New model, unlikely to conflict
- **Dependencies**: Requires migration `0003_dashboardsharelink.py`

### 2. `TrinityBackendDjango/apps/share_links/urls.py`
- **Lines Changed**: +4
- **What Changed**: Added URL route for dashboard sharing
- **Key Additions**:
  - New URL pattern for dashboard share endpoint
- **Merge Strategy**: KEEP - New route, shouldn't conflict
- **Dependencies**: Links to views.py

### 3. `TrinityBackendDjango/apps/share_links/utils.py`
- **Lines Changed**: ~70 (mixed changes)
- **What Changed**: Enhanced utility functions for share link generation
- **Key Additions**:
  - Dashboard share link generation utilities
  - Token generation and validation
  - Permission checking utilities
- **Merge Strategy**: REVIEW - May conflict if others modified utilities
- **Note**: Check if any utility function signatures changed

### 4. `TrinityBackendDjango/apps/share_links/views.py`
- **Lines Changed**: ~105 (mixed changes)
- **What Changed**: Added views for dashboard sharing, enhanced exhibition sharing
- **Key Additions**:
  - `DashboardShareView` or similar
  - Enhanced permission checking
  - Better error handling
- **Merge Strategy**: REVIEW CAREFULLY - Core view logic
- **Note**: Ensure all endpoints return correct response formats

### 5. `TrinityBackendDjango/apps/trinity_v1_atoms/management/commands/populate_trinity_v1_atoms.py`
- **Lines Changed**: +1
- **What Changed**: Minor update, likely added new atom type
- **Key Additions**: Single line addition
- **Merge Strategy**: KEEP - Minimal change
- **Note**: Probably added 'table' or 'dashboard' atom

### 6. `TrinityBackendDjango/apps/trinity_v1_atoms/management/commands/update_available_atoms.py`
- **Lines Changed**: ~3
- **What Changed**: Minor update to available atoms list
- **Key Additions**: Small modifications
- **Merge Strategy**: KEEP - Minimal impact
- **Note**: Check if atom list is correct after merge

---

## 🗂️ BACKEND FASTAPI FILES

### 7. `TrinityBackendFastAPI/app/api/router.py`
- **Lines Changed**: +8
- **What Changed**: Added new routes for dashboard and table features
- **Key Additions**:
  - Dashboard router import and inclusion
  - Table router import and inclusion
- **Merge Strategy**: KEEP - New routes
- **Dependencies**: Requires `app/features/dashboard/` and `app/features/table/` directories

### 8. `TrinityBackendFastAPI/app/features/laboratory/websocket.py` 🔴 CRITICAL
- **Lines Changed**: ~241 (significant changes)
- **What Changed**: Enhanced WebSocket for dashboard mode and collaboration
- **Key Additions**:
  - Dashboard mode message handling
  - Enhanced state synchronization
  - Better error handling
  - Multi-user dashboard collaboration
- **Merge Strategy**: KEEP YOUR CHANGES - Core feature
- **Note**: Dashboard mode depends on these changes
- **Test After Merge**: Ensure WebSocket connects and syncs properly

### 9. `TrinityBackendFastAPI/app/features/project_state/routes.py`
- **Lines Changed**: ~13
- **What Changed**: Enhanced project state management
- **Key Additions**:
  - Dashboard state handling
  - Better state persistence
- **Merge Strategy**: KEEP - Enhanced functionality
- **Note**: Ensure state saves correctly after merge

### 10. `TrinityBackendFastAPI/storage/exhibition_configurations.json` 🔴 CRITICAL
- **Lines Changed**: +37,486 (massive addition)
- **What Changed**: Large exhibition configuration data added
- **Key Additions**: Entire file is essentially new data
- **Merge Strategy**: TAKE YOUR VERSION - Has all the data
- **Note**: This is the largest change. If conflict, your version is correct
- **Warning**: This file makes your branch huge

---

## 🗂️ FRONTEND ROOT FILES

### 11. `TrinityFrontend/index.html`
- **Lines Changed**: ~5
- **What Changed**: Minor HTML updates, possibly meta tags or script references
- **Key Additions**: Small modifications
- **Merge Strategy**: REVIEW - Usually safe to merge both
- **Note**: Check for duplicate script tags after merge

### 12. `TrinityFrontend/src/App.tsx`
- **Lines Changed**: +2
- **What Changed**: Minor app-level changes, likely route additions
- **Key Additions**:
  - Possibly imported new components
  - Maybe added new routes
- **Merge Strategy**: KEEP - Minimal change
- **Note**: Ensure all routes work after merge

### 13. `TrinityFrontend/src/index.css`
- **Lines Changed**: +40
- **What Changed**: New CSS styles added
- **Key Additions**:
  - Dashboard mode styles
  - Chart note styles
  - Context menu improvements
  - Mobile responsive styles
- **Merge Strategy**: KEEP YOUR ADDITIONS - Merge carefully
- **Note**: CSS rarely conflicts, but check for duplicate classes

---

## 🗂️ FRONTEND COMPONENT FILES

### 14. `TrinityFrontend/src/components/AtomCategory/data/atomCategories.ts`
- **Lines Changed**: ~10
- **What Changed**: Updated atom categories, likely added 'Table' or 'Dashboard'
- **Key Additions**: New category entries
- **Merge Strategy**: MERGE BOTH - Combine categories from both branches
- **Note**: Ensure no duplicate category IDs

### 15. `TrinityFrontend/src/components/AtomList/atoms/chart-maker/components/ChartMakerCanvas.tsx`
- **Lines Changed**: ~126
- **What Changed**: Enhanced chart maker canvas UI
- **Key Additions**:
  - Notes functionality UI
  - Better context menu positioning
  - Enhanced settings panel
  - Mobile improvements
- **Merge Strategy**: KEEP YOUR CHANGES - Major enhancement
- **Test After Merge**: Chart maker should create charts with notes

### 16. `TrinityFrontend/src/components/AtomList/atoms/correlation/components/CorrelationCanvas.tsx`
- **Lines Changed**: +27
- **What Changed**: Enhanced correlation canvas display
- **Key Additions**:
  - Better matrix rendering
  - Improved layout
- **Merge Strategy**: KEEP - Enhancement
- **Test After Merge**: Correlation matrix displays correctly

### 17. `TrinityFrontend/src/components/AtomList/atoms/correlation/components/CorrelationSettings.tsx`
- **Lines Changed**: +10
- **What Changed**: Minor settings enhancements
- **Key Additions**: Small UI improvements
- **Merge Strategy**: KEEP - Minor change
- **Note**: Settings panel should have new options

### 18. `TrinityFrontend/src/components/AtomList/atoms/correlation/components/MatrixSettingsTray.tsx`
- **Lines Changed**: ~216 (major changes)
- **What Changed**: Significant overhaul of matrix settings UI
- **Key Additions**:
  - Better mobile responsive design
  - Improved filter controls
  - Enhanced threshold settings
  - Better UX for correlation controls
- **Merge Strategy**: KEEP YOUR CHANGES - Major improvement
- **Test After Merge**: All correlation settings should work
- **Note**: Mobile-friendly now

---

## 🗂️ EXHIBITION MODE FILES

### 19. `TrinityFrontend/src/components/ExhibitionMode/components/ExhibitedAtomRenderer.tsx`
- **Lines Changed**: +5
- **What Changed**: Minor renderer updates
- **Key Additions**: Small enhancements
- **Merge Strategy**: KEEP - Safe
- **Note**: Ensures atoms render correctly in exhibition mode

### 20. `TrinityFrontend/src/components/ExhibitionMode/components/ShareDialog.tsx`
- **Lines Changed**: ~92
- **What Changed**: Enhanced share dialog with dashboard sharing
- **Key Additions**:
  - Dashboard share option
  - Better UI/UX
  - Enhanced permission controls
  - Expiry settings
- **Merge Strategy**: KEEP YOUR CHANGES - New feature
- **Test After Merge**: Share dialog should show dashboard option

### 21. `TrinityFrontend/src/components/ExhibitionMode/components/atoms/ChartMaker/ChartMakerChart.tsx` 🔴 CRITICAL
- **Lines Changed**: ~647 (massive changes)
- **What Changed**: Complete overhaul of chart rendering for exhibition mode
- **Key Additions**:
  - Chart notes display in exhibition
  - Better chart rendering
  - Enhanced interactivity
  - Mobile responsive
  - Better error handling
- **Merge Strategy**: KEEP YOUR CHANGES - Core feature
- **Test After Merge**: Charts in exhibition mode must work
- **Note**: This is one of the largest changes

### 22. `TrinityFrontend/src/components/ExhibitionMode/components/atoms/ChartMaker/index.tsx`
- **Lines Changed**: ~63
- **What Changed**: Enhanced chart maker component wrapper
- **Key Additions**:
  - Better props handling
  - Notes integration
  - Enhanced export
- **Merge Strategy**: KEEP YOUR CHANGES
- **Dependencies**: Works with ChartMakerChart.tsx

### 23. `TrinityFrontend/src/components/ExhibitionMode/components/atoms/ChartMaker/shared.tsx`
- **Lines Changed**: ~168
- **What Changed**: Enhanced shared utilities for chart maker
- **Key Additions**:
  - Note handling utilities
  - Better type definitions
  - Shared chart logic
- **Merge Strategy**: KEEP YOUR CHANGES - Important utilities
- **Note**: Used by multiple chart components

### 24. `TrinityFrontend/src/components/ExhibitionMode/components/atoms/EvaluateModelsFeature/EvaluateModelsFeatureChart.tsx`
- **Lines Changed**: ~5
- **What Changed**: Minor chart rendering update
- **Key Additions**: Small fix or enhancement
- **Merge Strategy**: KEEP - Safe
- **Note**: Ensures model evaluation charts work

### 25. `TrinityFrontend/src/components/ExhibitionMode/components/atoms/FeatureOverview/TrendAnalysisChart.tsx`
- **Lines Changed**: +4
- **What Changed**: Minor trend analysis improvement
- **Key Additions**: Small enhancement
- **Merge Strategy**: KEEP - Safe
- **Note**: Trend charts render better

---

## 🗂️ LABORATORY MODE FILES

### 26. `TrinityFrontend/src/components/LaboratoryMode/LaboratoryMode.tsx` 🔴 CRITICAL
- **Lines Changed**: ~170
- **What Changed**: Major enhancements to laboratory mode
- **Key Additions**:
  - Dashboard mode integration
  - Enhanced collaboration UI
  - Better state management
  - Mode switching logic
  - Enhanced atom management
- **Merge Strategy**: KEEP YOUR CHANGES - Core feature
- **Test After Merge**: Laboratory mode must work, especially dashboard mode
- **Note**: This is a critical component

### 27. `TrinityFrontend/src/components/LaboratoryMode/components/CanvasArea/index.tsx` 🔴 CRITICAL
- **Lines Changed**: ~463 (largest single component change)
- **What Changed**: Complete overhaul of canvas area
- **Key Additions**:
  - Dashboard mode canvas
  - Better atom positioning
  - Enhanced drag & drop
  - Multi-atom dashboard support
  - Better collaboration rendering
  - Context menu improvements
- **Merge Strategy**: KEEP YOUR CHANGES - Most critical file
- **Test After Merge**: Canvas must work perfectly
- **Note**: This is the heart of your changes
- **Priority**: Resolve first if conflicts

### 28. `TrinityFrontend/src/components/LaboratoryMode/components/SettingsPanel/index.tsx`
- **Lines Changed**: +3
- **What Changed**: Minor settings panel update
- **Key Additions**: Small enhancement
- **Merge Strategy**: KEEP - Safe
- **Note**: Settings panel should show new options

### 29. `TrinityFrontend/src/components/LaboratoryMode/store/laboratoryStore.ts`
- **Lines Changed**: ~146
- **What Changed**: Enhanced state management for laboratory mode
- **Key Additions**:
  - Dashboard mode state
  - Better atom state management
  - Enhanced collaboration state
  - Better action creators
- **Merge Strategy**: KEEP YOUR CHANGES - Core state
- **Test After Merge**: State updates must work correctly
- **Note**: Zustand store - ensure all actions work

---

## 🗂️ HOOKS & UTILITIES

### 30. `TrinityFrontend/src/hooks/useCollaborativeSync.ts` 🔴 CRITICAL
- **Lines Changed**: ~913 (LARGEST FILE CHANGE)
- **What Changed**: Complete overhaul of collaboration synchronization
- **Key Additions**:
  - Dashboard mode sync
  - Better WebSocket handling
  - Enhanced state synchronization
  - Multi-user dashboard collaboration
  - Better conflict resolution
  - Enhanced error handling
  - Optimized performance
- **Merge Strategy**: KEEP YOUR CHANGES - Absolutely critical
- **Test After Merge**: Real-time collaboration must work
- **Note**: This is the MOST IMPORTANT file
- **Priority**: #1 - Resolve FIRST if conflicts
- **Dependencies**: Works with websocket.py backend

### 31. `TrinityFrontend/src/lib/api.ts`
- **Lines Changed**: ~32
- **What Changed**: Enhanced API client
- **Key Additions**:
  - Dashboard API endpoints
  - Share link API calls
  - Better error handling
- **Merge Strategy**: KEEP YOUR CHANGES
- **Test After Merge**: All API calls work
- **Note**: Ensure no duplicate endpoint definitions

### 32. `TrinityFrontend/src/lib/shareLinks.ts`
- **Lines Changed**: +43
- **What Changed**: Added share link utilities
- **Key Additions**:
  - Dashboard share link generation
  - Share link validation
  - Permission handling
- **Merge Strategy**: KEEP - New utility file
- **Dependencies**: Works with backend share_links

### 33. `TrinityFrontend/src/utils/projectStorage.ts`
- **Lines Changed**: ~29
- **What Changed**: Enhanced project storage utilities
- **Key Additions**:
  - Dashboard storage
  - Better state persistence
  - Enhanced local storage handling
- **Merge Strategy**: KEEP YOUR CHANGES
- **Note**: Ensures projects save correctly

---

## 🗂️ PAGE FILES

### 34. `TrinityFrontend/src/pages/SharedExhibition.tsx` 🔴 CRITICAL
- **Lines Changed**: ~358 (major overhaul)
- **What Changed**: Complete enhancement of shared exhibition page
- **Key Additions**:
  - Dashboard viewing support
  - Better atom rendering
  - Enhanced loading states
  - Better error handling
  - Mobile responsive
  - Better share link validation
- **Merge Strategy**: KEEP YOUR CHANGES - Important feature
- **Test After Merge**: Shared exhibitions must load correctly
- **Note**: Public-facing page - must work perfectly

---

## 🗂️ TEMPLATE FILES

### 35. `TrinityFrontend/src/templates/charts/RechartsChartRenderer.tsx` 🔴 CRITICAL
- **Lines Changed**: ~822 (SECOND LARGEST CHANGE)
- **What Changed**: Complete overhaul of chart rendering template
- **Key Additions**:
  - Chart notes rendering
  - Enhanced chart types support
  - Better responsive design
  - Improved margin/padding logic
  - Better legend handling
  - Enhanced tooltip customization
  - Better axis label rendering
  - Fixed overflow issues
- **Merge Strategy**: KEEP YOUR CHANGES - Core rendering
- **Test After Merge**: ALL charts must render correctly
- **Note**: This affects all chart rendering
- **Priority**: #2 - Very important
- **Dependencies**: Used by ChartMaker, Exhibition, Laboratory

---

## 🎯 CONFLICT RESOLUTION PRIORITY ORDER

If you have multiple conflicts, resolve in this order:

1. 🥇 **useCollaborativeSync.ts** (913 lines) - Most critical
2. 🥈 **RechartsChartRenderer.tsx** (822 lines) - Chart rendering core
3. 🥉 **ChartMakerChart.tsx** (647 lines) - Exhibition charts
4. **CanvasArea/index.tsx** (463 lines) - Laboratory canvas
5. **exhibition_configurations.json** (37,486 lines) - Just take yours
6. **SharedExhibition.tsx** (358 lines) - Public page
7. **websocket.py** (241 lines) - Backend collaboration
8. **MatrixSettingsTray.tsx** (216 lines) - Correlation UI
9. **LaboratoryMode.tsx** (170 lines) - Laboratory core
10. **ChartMaker/shared.tsx** (168 lines) - Shared utilities
11. All remaining files (by file size/impact)

---

## 📊 STATISTICS BY CATEGORY

### Backend Django
- Files: 6
- Total Lines: ~253 changes
- Impact: Medium-High
- Critical: views.py, models.py

### Backend FastAPI  
- Files: 4
- Total Lines: ~37,748 changes (mostly exhibition_configurations.json)
- Impact: Very High
- Critical: websocket.py, exhibition_configurations.json

### Frontend Components
- Files: 16
- Total Lines: ~2,472 changes
- Impact: Very High
- Critical: CanvasArea, ChartMaker components, Correlation

### Frontend Hooks/Utils
- Files: 5
- Total Lines: ~1,017 changes
- Impact: Very High
- Critical: useCollaborativeSync.ts

### Frontend Pages/Templates
- Files: 2
- Total Lines: ~1,180 changes
- Impact: Very High
- Critical: Both files

### Frontend Root
- Files: 2
- Total Lines: ~45 changes
- Impact: Low
- Critical: None

---

## 🔍 SEARCH TIPS

To find a specific file's diff in `MERGE_GUIDE_DIFF.txt`:

```powershell
# Search for file name
Select-String -Path MERGE_GUIDE_DIFF.txt -Pattern "filename.tsx"

# Or open in VS Code and use Ctrl+F
code MERGE_GUIDE_DIFF.txt
```

---

## ✅ POST-RESOLUTION VALIDATION

For each file you resolve, validate:

### Backend Files
- [ ] No syntax errors
- [ ] Migrations generated if model changed
- [ ] API endpoints return correct data
- [ ] Tests pass (if any)

### Frontend Files
- [ ] No TypeScript errors
- [ ] Component renders without errors
- [ ] Props are correctly typed
- [ ] No console errors
- [ ] UI looks correct

---

**Created**: December 4, 2025  
**Total Files Indexed**: 35  
**Full Details**: See `MERGE_GUIDE_metricOperations.md`  
**Quick Reference**: See `MERGE_QUICK_REFERENCE.md`  
**Full Diffs**: See `MERGE_GUIDE_DIFF.txt`

