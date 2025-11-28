# Robust Chart Rendering Solution for Playwright Screenshots

## Overview
This solution ensures charts are fully rendered and animations complete before Playwright captures screenshots. The same PNG screenshot is used for both JPG and PDF exports, ensuring consistency.

## Architecture

### 1. Frontend Signaling (JavaScript/React)

Charts signal completion through **three mechanisms** for maximum reliability:

#### Signal 1: DOM Attribute
```javascript
chartElement.setAttribute('data-chart-rendered', 'true');
chartElement.setAttribute('data-chart-render-timestamp', Date.now().toString());
```

#### Signal 2: Window Variable (Per Chart)
```javascript
window.chartRenderingStatus[chartId] = {
  rendered: true,
  timestamp: Date.now()
};
```

#### Signal 3: Global Flag (All Charts)
```javascript
window.allChartsRendered = true; // When all charts are done
```

### 2. Playwright Wait Logic

The renderer waits for **all three signals** before capturing:

```python
page.wait_for_function(
    """
    () => {
        const charts = document.querySelectorAll('[data-exhibition-chart-root="true"]');
        if (charts.length === 0) return true; // No charts, proceed
        
        // Check all three signals
        const allHaveAttribute = Array.from(charts).every(
            el => el.getAttribute('data-chart-rendered') === 'true'
        );
        const windowSignal = window.allChartsRendered === true;
        // ... individual chart status check
        
        return allHaveAttribute && windowSignal;
    }
    """,
    timeout=30000  # 30 second timeout
)
```

### 3. Single Image Approach

**PNG is captured once** and used for both formats:

1. **Screenshot Capture**: Playwright captures as PNG
2. **PDF Export**: PNG embedded directly in PDF
3. **JPG Export**: PNG converted to JPG using PIL (if needed)

```python
# Capture once as PNG
screenshot_bytes = page.screenshot(type="png", full_page=False)

# Use for PDF (direct embedding)
pdf.addImage(screenshot_bytes, 'PNG', ...)

# Convert to JPG if needed
jpg_bytes = _convert_png_to_jpg(screenshot_bytes, quality=95)
```

## Implementation Details

### Frontend: Chart Completion Detection

**Location**: `TrinityFrontend/src/templates/charts/RechartsChartRenderer.tsx`

**Key Features**:
- Waits for Recharts animation duration (800ms) + buffer (400ms) = 1200ms total
- Verifies chart has actual content (SVG paths, bars, lines, etc.)
- Sets multiple completion signals for redundancy
- Resets on data/type changes

**Code Structure**:
```typescript
useEffect(() => {
  // Reset on chart data change
  chartRenderedRef.current = false;
  
  // Wait for animation + buffer
  setTimeout(() => {
    // Verify chart has content
    if (hasContent()) {
      // Set all three signals
      setDOMAttribute();
      setWindowVariable();
      setGlobalFlag();
    }
  }, ANIMATION_DURATION);
}, [data, type, captureId]);
```

### Backend: Playwright Wait Logic

**Location**: `TrinityBackendFastAPI/app/features/exhibition/renderer.py`

**Key Features**:
- Waits for all charts to signal completion
- Checks multiple signals for robustness
- 30-second timeout with graceful fallback
- 500ms buffer after completion before screenshot

**Wait Strategy**:
1. Wait for fonts to load
2. Wait for chart completion signals (DOM + Window variables)
3. Small buffer (500ms) for final rendering
4. Capture screenshot

### Image Conversion (PNG → JPG)

**Location**: `TrinityBackendFastAPI/app/features/exhibition/export.py`

**Function**: `_convert_png_to_jpg()`

**Features**:
- Handles RGBA → RGB conversion (JPG doesn't support transparency)
- Configurable quality (default 95)
- Graceful fallback to PNG if conversion fails

## Usage Example

### For Chart.js or Other Libraries

If using Chart.js or other charting libraries, add similar completion detection:

```javascript
// Chart.js example
const chart = new Chart(ctx, config);

chart.options.animation.onComplete = () => {
  // Set completion signals
  document.getElementById('chart-container')
    .setAttribute('data-chart-rendered', 'true');
  
  if (window.chartRenderingStatus) {
    window.chartRenderingStatus[chartId] = {
      rendered: true,
      timestamp: Date.now()
    };
  }
};
```

### For ECharts

```javascript
const chart = echarts.init(dom);

chart.on('finished', () => {
  // Set completion signals
  dom.setAttribute('data-chart-rendered', 'true');
  window.chartRenderingStatus[chartId] = { rendered: true };
});
```

## Benefits

1. **Reliable**: Multiple signals ensure detection even if one fails
2. **Robust**: Works with varying render times
3. **Consistent**: Same image for JPG and PDF
4. **Efficient**: Single screenshot capture
5. **Flexible**: Works with any charting library

## Testing

To verify the solution works:

1. **Check Console**: Look for `[Chart Renderer] Chart {id} rendering complete signal set`
2. **Check DOM**: Verify `data-chart-rendered="true"` attribute exists
3. **Check Window**: Verify `window.allChartsRendered === true`
4. **Check Screenshots**: Verify charts are complete in exported images

## Troubleshooting

**Issue**: Charts still incomplete in screenshots
- **Solution**: Increase `ANIMATION_DURATION` in frontend (currently 1200ms)
- **Solution**: Increase timeout in Playwright (currently 30000ms)

**Issue**: Timeout errors
- **Solution**: Check if charts are actually rendering (inspect DOM)
- **Solution**: Verify chart completion signals are being set (check console)

**Issue**: Different images in JPG vs PDF
- **Solution**: Ensure both use the same `screenshot_bytes` from Playwright
- **Solution**: Verify PNG→JPG conversion is only for JPG export, not PDF

## Summary

This solution provides:
- ✅ Frontend signaling when charts complete
- ✅ Playwright waiting for signals before screenshot
- ✅ Single image approach for JPG and PDF
- ✅ Robust error handling and fallbacks
- ✅ Works with varying render times

The key is **signaling from frontend** and **waiting in Playwright**, not arbitrary timeouts.

