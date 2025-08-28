# Trinity Frontend - Correlation Atom Properties Panel Issue

## Issue Summary
**Date:** August 7, 2025  
**Component:** Correlation Atom Properties Panel  
**Status:** RESOLVED  

### Problem Description
The correlation atom's properties were not displaying in the global properties panel when the atom was selected in Laboratory Mode. While other atoms (merge, concat, feature-overview, etc.) showed their properties correctly, the correlation atom would not display its expected CorrelationProperties component.

### Root Cause
**Import Path Mismatch in AuxiliaryMenu Component**

The issue was caused by two SettingsPanel files existing in the codebase:
1. `SettingsPanel.tsx` (old) - Missing correlation atom support
2. `SettingsPanel/index.tsx` (new) - Includes proper correlation atom support

The `AuxiliaryMenu.tsx` was importing from the wrong file:
```typescript
// Incorrect import (pointing to old file)
import SettingsPanel from './SettingsPanel';

// Should have been (pointing to new file with correlation support)
import SettingsPanel from './SettingsPanel/index';
```

### Why Other Atoms Worked Despite Wrong Import

**Critical Discovery:** The old `SettingsPanel.tsx` file included support for most atoms but was missing the correlation atom specifically. Here's what was included in the old file:

✅ **Supported atoms in old SettingsPanel.tsx:**
- `data-upload-validate` → DataUploadValidateProperties
- `feature-overview` → FeatureOverviewProperties  
- `concat` → ConcatProperties
- `merge` → MergeProperties
- `column-classifier` → ColumnClassifierProperties
- `create-column`/`createcolumn` → CreateColumnProperties
- `groupby-wtg-avg` → GroupByProperties
- `dataframe-operations` → DataFrameOperationsProperties
- `scope-selector` → ScopeSelectorProperties

❌ **Missing from old SettingsPanel.tsx:**
- `correlation` → CorrelationProperties (NOT INCLUDED)

When an atom wasn't explicitly handled, the old SettingsPanel would fall back to a default TextBox settings interface, which is why the correlation atom appeared to have some settings but not the proper CorrelationProperties component.

### Solution Applied
Updated the import in `AuxiliaryMenu.tsx`:
```typescript
// File: src/components/LaboratoryMode/components/AuxiliaryMenu.tsx
// Line 2: Changed import path
import SettingsPanel from './SettingsPanel/index';
```

### Technical Details
- **Files Modified:** `src/components/LaboratoryMode/components/AuxiliaryMenu.tsx`
- **Change Type:** Import path correction
- **Impact:** Correlation atom now displays proper properties with Settings, Exhibition, and Visualisation tabs

### Prevention Measures
1. **Code Review:** Ensure all new atoms are added to the correct SettingsPanel file
2. **File Consolidation:** Consider removing duplicate SettingsPanel files
3. **Testing:** Add integration tests for property panel routing
4. **Documentation:** Document the proper SettingsPanel architecture

### Files Involved
- `src/components/LaboratoryMode/components/AuxiliaryMenu.tsx` (MODIFIED)
- `src/components/LaboratoryMode/components/SettingsPanel.tsx` (old file - missing correlation)
- `src/components/LaboratoryMode/components/SettingsPanel/index.tsx` (new file - has correlation)
- `src/components/AtomList/atoms/correlation/components/properties/CorrelationProperties.tsx` (working correctly)

This issue highlights the importance of maintaining a single source of truth for component routing and ensuring all new features are properly integrated across the application architecture.
