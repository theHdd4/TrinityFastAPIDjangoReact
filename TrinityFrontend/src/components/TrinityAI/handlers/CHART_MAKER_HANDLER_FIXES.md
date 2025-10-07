# Chart Maker Handler Fixes

## Issues Fixed

### 1. **Column Names Not Matching Backend Expectations**
**Problem:** The backend was expecting column names in lowercase, but the handler was sending them with original casing from the AI response, causing chart generation failures.

**Solution:** Convert all column names to lowercase before sending to the backend.

**Changes Made:**

#### In Chart Processing (Lines 108-117)
```typescript
// Before:
xAxis: traces[0]?.x_column || '',
yAxis: traces[0]?.y_column || '',
x_column: trace.x_column || '',
y_column: trace.y_column || '',

// After:
xAxis: traces[0]?.x_column?.toLowerCase() || '',
yAxis: traces[0]?.y_column?.toLowerCase() || '',
x_column: trace.x_column?.toLowerCase() || '',
y_column: trace.y_column?.toLowerCase() || '',
```

#### In Chart Request Payload (Lines 245-246)
```typescript
// Before:
x_column: trace.x_column || chart.xAxis,
y_column: trace.y_column || chart.yAxis,

// After:
x_column: (trace.x_column || chart.xAxis)?.toLowerCase() || '',
y_column: (trace.y_column || chart.yAxis)?.toLowerCase() || '',
```

### 2. **File Name Not Visible in Properties Section**
**Problem:** The file name wasn't being set in the atom settings with a property that would make it visible in the properties panel.

**Solution:** Add `fileName` property to atom settings updates.

**Changes Made:**

#### In Initial Settings Update (Line 138)
```typescript
updateAtomSettings(atomId, { 
  aiConfig: data,
  aiMessage: data.message,
  charts: charts,
  dataSource: targetFile,
  fileId: targetFile,
  fileName: targetFile, // 🔧 NEW: Add fileName property for visibility
  // ... rest of settings
});
```

#### In Post-Load Settings Update (Line 177)
```typescript
updateAtomSettings(atomId, {
  dataSource: targetFile,
  fileId: fileData.file_id,
  fileName: targetFile, // 🔧 NEW: Add fileName property for visibility
  uploadedData: {
    // ... data
  },
  // ... rest of settings
});
```

## Impact

### ✅ Benefits

1. **Chart Generation Success Rate Improved**
   - Column name case mismatches no longer cause chart generation failures
   - Backend can now properly match columns regardless of AI response casing

2. **Better User Experience**
   - File name now visible in properties section
   - Users can see which file the chart is using

3. **Consistent Data Flow**
   - All column names are normalized to lowercase throughout the pipeline
   - Consistent with backend expectations

### 🔍 Technical Details

**Lowercase Conversion Points:**
1. When creating chart configurations from AI response
2. When mapping traces within charts
3. When sending chart requests to backend API

**File Name Visibility:**
- Added to initial atom settings update (before data load)
- Added to post-load atom settings update (after data load)
- Ensures file name is always present in properties

## Testing Recommendations

Test these scenarios to verify the fixes:

1. **Mixed Case Column Names**
   - AI returns: `x_column: "Revenue"`, `y_column: "Region"`
   - Backend receives: `x_column: "revenue"`, `y_column: "region"`
   - ✅ Chart generates successfully

2. **File Name Display**
   - Open properties panel after AI chart generation
   - ✅ File name should be visible
   - Format: `client/app/project/filename.arrow`

3. **Multiple Charts**
   - Generate 2+ charts with AI
   - ✅ All charts should use lowercase column names
   - ✅ All charts should show the same file name in properties

4. **Chart Request Payload**
   - Check browser console for `Chart X request payload:`
   - ✅ Verify `x_column` and `y_column` are lowercase
   - ✅ Verify all trace columns are lowercase

## Example Flow

**Before Fix:**
```
AI Response → x_column: "Revenue", y_column: "Region"
                ↓
Chart Request → x_column: "Revenue", y_column: "Region"
                ↓
Backend → ❌ Column "Revenue" not found (expects lowercase)
                ↓
Chart Generation FAILED
```

**After Fix:**
```
AI Response → x_column: "Revenue", y_column: "Region"
                ↓
Handler → .toLowerCase() conversion
                ↓
Chart Request → x_column: "revenue", y_column: "region"
                ↓
Backend → ✅ Column "revenue" found
                ↓
Chart Generation SUCCESS
```

## Files Modified

- `TrinityFastAPIDjangoReact/TrinityFrontend/src/components/TrinityAI/handlers/chartMakerHandler.ts`

## Backward Compatibility

✅ **Fully backward compatible**
- Column name lowercasing is safe (backend expects lowercase)
- fileName property is additive (doesn't break existing functionality)
- All existing chart generation flows continue to work
