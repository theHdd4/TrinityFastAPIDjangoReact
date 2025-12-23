# KPI Dashboard Data Loading Fix Plan

## Executive Summary

This document outlines a comprehensive plan to fix the missing API endpoint and debug telemetry service issues affecting the KPI Dashboard atom. The issues prevent the dashboard from loading dataframe data for chart and table configuration.

---

## Problem Analysis

### Issue 1: Missing API Endpoint Registration
**Symptom:** `POST api/data-validate/load_dataframe_by_key 404 (Not Found)`

**Root Cause:**
- The endpoint `load_dataframe_by_key` **exists** in `TrinityBackendFastAPI/app/features/data_upload_validate/app/routes.py` (line 2682)
- The endpoint is registered with prefix `/data-upload-validate` via `endpoint.py`
- The full path should be: `/api/data-upload-validate/load_dataframe_by_key`
- **However**, there's a potential routing/registration issue preventing it from being accessible
- Diagnostic logging was added in previous fixes, but endpoint may still not be registering correctly

**Evidence:**
- Frontend calls: `${VALIDATE_API}/load_dataframe_by_key` where `VALIDATE_API = /api/data-upload-validate`
- Expected path: `/api/data-upload-validate/load_dataframe_by_key`
- Endpoint exists in routes.py with `@router.post("/load_dataframe_by_key")`
- Router is included in endpoint.py with prefix `/data-upload-validate`

### Issue 2: Missing Ingest Service (Port 7242)
**Symptom:** Debug telemetry requests fail silently (expected behavior)

**Root Cause:**
- Frontend components make debug logging requests to `http://127.0.0.1:7242/ingest/c16dc138-1b27-4dba-8d9b-764693f664f3`
- This is a **debug/telemetry service** for development tracking
- Service doesn't exist in docker-compose.yml
- Requests use `.catch(()=>{})` so failures are silent
- **This is NOT blocking functionality** - it's optional debug logging

**Impact:** Low - debug logging only, doesn't affect core functionality

---

## How Other Atoms Handle Data Loading

### Pattern 1: Chart Maker (Working Example)
**Implementation:**
- Uses dedicated API service: `ChartMakerApiService.loadSavedDataframe()`
- Calls: `POST /api/chart-maker/load-saved-dataframe`
- Returns comprehensive data: columns, types, unique values, sample data
- Uses Celery task queue for async processing
- Includes pipeline tracking (card_id, canvas_position)

**Frontend Pattern:**
```typescript
const uploadResponse = await chartMakerApi.loadSavedDataframe(objectName, atomId, cardId, canvasPosition);
const chartData: ChartData = {
  columns: uploadResponse.columns,
  rows: uploadResponse.sample_data,
  numeric_columns: uploadResponse.numeric_columns,
  categorical_columns: uploadResponse.categorical_columns,
  unique_values: uploadResponse.unique_values,
  file_id: uploadResponse.file_id,
  row_count: uploadResponse.row_count,
};
```

**Backend Pattern:**
```python
@router.post("/load-saved-dataframe", response_model=CSVUploadResponse)
async def load_saved_dataframe(request: LoadSavedDataframeRequest):
    submission = celery_task_client.submit_callable(
        name="chart_maker.load_saved_dataframe",
        dotted_path="app.features.chart_maker.service.load_saved_dataframe_task",
        kwargs={"object_name": request.object_name},
    )
    return format_task_response(submission)
```

### Pattern 2: DataFrame Operations (Alternative)
**Implementation:**
- Uses: `POST /api/dataframe-operations/load_cached`
- Returns: DataFrame metadata and creates in-memory session
- Simpler response format

### Pattern 3: Table Atom
**Implementation:**
- Uses: `loadTable()` helper function
- Calls data-upload-validate endpoints indirectly
- Auto-loads on mount if sourceFile exists

### Pattern 4: Data Upload Validate (Current Implementation)
**Available Endpoints:**
1. `/load_dataframe_by_key` - Simple, returns headers and rows only
2. `/load-saved-dataframe` - Comprehensive, similar to chart-maker

**Current KPI Dashboard Usage:**
- Uses `/load_dataframe_by_key` (simpler endpoint)
- Expects: `{ key: "file.arrow" }`
- Returns: `{ headers: [], rows: [] }`

---

## Solution Options

### Option A: Fix Existing Endpoint (Recommended - Quick Fix)

**Approach:** Ensure `/load_dataframe_by_key` endpoint is properly registered and accessible

**Steps:**
1. **Verify Router Registration**
   - Check that `data_upload_validate_router` is correctly included in `app/api/router.py`
   - Verify no duplicate or conflicting registrations
   - Confirm endpoint appears in FastAPI route listing

2. **Add Route Verification Endpoint**
   - Add GET `/api/data-upload-validate/routes` to list all registered routes
   - Helpful for debugging registration issues

3. **Fix Path Matching**
   - Verify frontend is calling correct path
   - Check for any URL rewriting or proxy issues
   - Ensure endpoint prefix is correct

4. **Add Error Handling**
   - Improve error messages to include full path attempted
   - Add request logging to track 404s

**Pros:**
- Quickest solution
- Minimal code changes
- Maintains existing architecture

**Cons:**
- Doesn't address the more comprehensive data needs
- Limited error information

---

### Option B: Use Existing Comprehensive Endpoint (Recommended - Best Practice)

**Approach:** Switch KPI Dashboard to use `/load-saved-dataframe` endpoint (already exists and working)

**Steps:**
1. **Update Frontend to Use `/load-saved-dataframe`**
   - Modify `KPIDashboardSettings.tsx` and `KPIDashboardChartConfig.tsx`
   - Use same pattern as Chart Maker
   - Get comprehensive data (column types, unique values, etc.)

2. **Create KPI Dashboard API Service** (Optional but recommended)
   - Similar to `ChartMakerApiService`
   - Centralized API calls
   - Better error handling
   - Consistent with other atoms

3. **Update Response Handling**
   - Handle comprehensive response format
   - Extract headers, rows, column metadata
   - Use unique_values for dropdowns

**Pros:**
- Uses proven, working endpoint
- Provides more data (column types, unique values)
- Consistent with Chart Maker pattern
- Better error handling

**Cons:**
- Requires frontend refactoring
- Slightly more complex response handling

---

### Option C: Enhance load_dataframe_by_key Endpoint

**Approach:** Improve existing endpoint to match chart-maker functionality

**Steps:**
1. **Enhance Response Format**
   ```python
   return {
       "headers": headers,
       "rows": rows,
       "numeric_columns": numeric_columns,
       "categorical_columns": categorical_columns,
       "unique_values": unique_values,  # Per column
       "row_count": len(rows),
       "file_id": object_name
   }
   ```

2. **Add Column Type Detection**
   - Detect numeric vs categorical
   - Extract unique values for categorical columns

3. **Add Pipeline Tracking** (Optional)
   - Support card_id, canvas_position for analytics

**Pros:**
- Keeps simple endpoint name
- Enhances without breaking existing usage
- Can maintain backward compatibility

**Cons:**
- More backend changes
- Still need to verify registration

---

### Option D: WebSocket Implementation (Alternative/Future)

**Approach:** Use WebSocket for real-time data loading (similar to Trinity AI workflow)

**Analysis:**
- **Existing WebSocket Infrastructure:**
  - `/trinityai/execute-ws` - Workflow execution
  - `/trinityai/compose-ws` - Workflow composition
  - Collaborative sync WebSockets for Laboratory/Exhibition
  - Pattern: Real-time streaming with event types

- **Potential Benefits:**
  - Real-time progress updates
  - Better for large datasets
  - Streaming data transfer
  - Unified communication pattern

- **Considerations:**
  - Significant implementation effort
  - Overkill for simple data loading
  - Existing HTTP endpoints work well
  - WebSockets better suited for:
    - Long-running operations
    - Real-time collaboration
    - Streaming updates

**Recommendation:** Not recommended for this use case
- Data loading is quick, synchronous operation
- HTTP endpoints are simpler and proven
- WebSockets add unnecessary complexity
- Reserve for future if real-time streaming needed

---

## Recommended Implementation Plan

### Phase 1: Immediate Fix (Option B - Use Existing Endpoint)

**Priority: HIGH**

1. **Create KPI Dashboard API Service**
   - Location: `TrinityFrontend/src/components/AtomList/atoms/kpi-dashboard/services/kpiDashboardApi.ts`
   - Pattern: Similar to `chartMakerApi.ts`
   - Methods:
     - `loadSavedDataframe(objectName, atomId?, cardId?, canvasPosition?)`
     - `listSavedDataframes()`

2. **Update KPI Dashboard Components**
   - `KPIDashboardSettings.tsx`: Use new API service
   - `KPIDashboardChartConfig.tsx`: Use new API service
   - Handle comprehensive response format

3. **Verify Endpoint Registration**
   - Test `/api/data-upload-validate/load-saved-dataframe` is accessible
   - Add health check endpoint if needed
   - Verify in startup logs

**Estimated Time:** 2-3 hours

---

### Phase 2: Debug Service (Optional)

**Priority: LOW**

**Option 2A: Remove Debug Calls**
- Remove all `fetch('http://127.0.0.1:7242/ingest/...')` calls
- Clean up debug code
- Simplest solution

**Option 2B: Create Simple Debug Service**
- Add minimal FastAPI service on port 7242
- Simple POST endpoint to log debug data
- Store in file or database
- Only if debug logging is critical

**Option 2C: Redirect to Existing Service**
- Redirect to existing logging/analytics service
- Use existing infrastructure
- Requires identifying target service

**Recommendation:** Option 2A - Remove debug calls (they're optional and failing silently)

**Estimated Time:** 30 minutes (Option 2A) or 2-4 hours (Option 2B/C)

---

### Phase 3: Enhancements (Future)

**Priority: MEDIUM**

1. **Add Route Health Check**
   - GET `/api/data-upload-validate/health/routes`
   - List all registered routes
   - Helpful for debugging

2. **Improve Error Messages**
   - Include attempted URL in 404 errors
   - Add request ID for tracking
   - Better error context

3. **Add Endpoint Documentation**
   - Document all data-upload-validate endpoints
   - Include request/response examples
   - Update API docs

4. **Consider load_dataframe_by_key Enhancement**
   - If other atoms start using it
   - Add column metadata
   - Match chart-maker response format

---

## Implementation Details

### Step-by-Step: Option B Implementation

#### 1. Create API Service

**File:** `TrinityFrontend/src/components/AtomList/atoms/kpi-dashboard/services/kpiDashboardApi.ts`

```typescript
import { VALIDATE_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';

export interface KPIDataframeResponse {
  file_id: string;
  columns: string[];
  rows: any[];
  numeric_columns?: string[];
  categorical_columns?: string[];
  unique_values?: Record<string, any[]>;
  row_count?: number;
}

class KPIDashboardApiService {
  private baseUrl = VALIDATE_API;

  async loadSavedDataframe(
    objectName: string,
    atomId?: string,
    cardId?: string,
    canvasPosition?: number
  ): Promise<KPIDataframeResponse> {
    const response = await fetch(`${this.baseUrl}/load-saved-dataframe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        object_name: objectName,
        validator_atom_id: atomId,
        card_id: cardId,
        canvas_position: canvasPosition,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to load saved dataframe');
    }

    const payload = await response.json();
    const result = await resolveTaskResponse<any>(payload);
    
    // Transform to expected format
    return {
      file_id: result.file_id || objectName,
      columns: result.columns || [],
      rows: result.sample_data || result.rows || [],
      numeric_columns: result.numeric_columns,
      categorical_columns: result.categorical_columns,
      unique_values: result.unique_values,
      row_count: result.row_count,
    };
  }

  async listSavedDataframes(): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/list_saved_dataframes`);
    if (!response.ok) {
      throw new Error('Failed to list saved dataframes');
    }
    return response.json();
  }
}

export const kpiDashboardApi = new KPIDashboardApiService();
```

#### 2. Update KPIDashboardSettings.tsx

**Replace:**
```typescript
const response = await fetch(`${VALIDATE_API}/load_dataframe_by_key`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: fileId })
});
```

**With:**
```typescript
import { kpiDashboardApi } from '../services/kpiDashboardApi';

const responseData = await kpiDashboardApi.loadSavedDataframe(
  fileId,
  atomId,
  cardId,
  canvasPosition
);

// Use responseData.columns, responseData.rows, etc.
```

#### 3. Update KPIDashboardChartConfig.tsx

**Similar changes** - use new API service instead of direct fetch

---

## Testing Plan

### Test Cases

1. **Endpoint Accessibility**
   - [ ] Verify `/api/data-upload-validate/load-saved-dataframe` is accessible
   - [ ] Test with valid object_name
   - [ ] Test with invalid object_name (should return 400/404)
   - [ ] Test with missing object_name (should return 400)

2. **Frontend Integration**
   - [ ] Test file selection in KPI Dashboard Settings
   - [ ] Test file selection in Chart Config
   - [ ] Verify data loads correctly
   - [ ] Verify headers and rows are populated
   - [ ] Test error handling (network errors, invalid files)

3. **Cross-Environment Testing**
   - [ ] Test on developer's local machine
   - [ ] Test on other developers' machines
   - [ ] Test in dev environment
   - [ ] Verify different IP addresses work

4. **Data Integrity**
   - [ ] Verify column names are correct
   - [ ] Verify row data matches source
   - [ ] Test with various file sizes
   - [ ] Test with different data types

---

## Rollback Plan

If issues arise:

1. **Immediate Rollback:**
   - Revert frontend changes
   - Keep backend endpoint as-is
   - Use direct fetch with `/load_dataframe_by_key` if needed

2. **Partial Rollback:**
   - Keep API service but use different endpoint
   - Fallback to existing patterns

3. **Full Rollback:**
   - Revert all changes
   - Investigate router registration issue separately

---

## Risk Assessment

### Low Risk
- Using existing, proven endpoint
- Pattern matches other working atoms
- Minimal backend changes

### Medium Risk
- Frontend refactoring required
- Need to handle different response format
- Potential for regression in other components

### Mitigation
- Thorough testing before deployment
- Gradual rollout
- Monitor logs for errors
- Keep old code commented for quick rollback

---

## Success Criteria

1. ✅ KPI Dashboard can load dataframe data successfully
2. ✅ No 404 errors for data loading endpoints
3. ✅ Works across different developer environments
4. ✅ Consistent with other atom patterns
5. ✅ Error handling provides clear feedback
6. ✅ Debug service issues resolved (optional)

---

## Timeline

- **Phase 1:** 2-3 hours (Immediate fix)
- **Phase 2:** 30 minutes - 4 hours (Debug service, optional)
- **Phase 3:** Future enhancements

**Total Estimated Time:** 3-7 hours (depending on debug service approach)

---

## Notes

- The `load_dataframe_by_key` endpoint exists but may have registration issues
- The `/load-saved-dataframe` endpoint is proven and working (used by Chart Maker)
- Debug service on port 7242 is optional and not blocking
- WebSocket implementation is overkill for this use case
- Following Chart Maker pattern ensures consistency and reliability

---

## Questions to Resolve

1. **Router Registration:**
   - Why is `/load_dataframe_by_key` not accessible?
   - Is there a prefix mismatch?
   - Are there conflicting route registrations?

2. **Debug Service:**
   - Is the debug telemetry critical?
   - Should we remove it or implement it?
   - What was the original purpose?

3. **Response Format:**
   - Does KPI Dashboard need column metadata?
   - Should we enhance `/load_dataframe_by_key` instead?
   - Do other atoms use this endpoint?

---

## Next Steps

1. **Review this plan** with team
2. **Decide on approach** (recommended: Option B)
3. **Implement Phase 1** (use existing endpoint)
4. **Test thoroughly** across environments
5. **Deploy and monitor**
6. **Address Phase 2** if needed (debug service)

---

*Document Version: 1.0*  
*Last Updated: [Current Date]*  
*Status: Pending Review*

