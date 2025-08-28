# Arrow Client Path Fix - Multi-Path Fallback Mechanism

## Problem Description

The chart maker was failing because of a path mismatch between the AI response and the backend file lookup:

- **AI Response**: Correctly identifies full file path as `Quant_Matrix_AI_Schema/blank/blank project/20250822_063400_D0_KHC_UK_Mayo.arrow`
- **Backend Search**: Still looking in default path `default_client/default_app/default_project/`
- **Result**: File not found because it's looking in the wrong location

## Root Cause

The issue was in the `arrow_client.py` file where the fallback mechanism only tried to find files in the default prefix path, ignoring the full path provided by the AI. This caused a disconnect between:

1. **AI Intelligence**: Correctly identifying the actual file location
2. **Backend File Lookup**: Only searching in the default/cached path
3. **File Access**: Failing to find files in their actual locations

## Solution Implemented

### **Multi-Path Fallback Mechanism**

The arrow client now implements a 4-method fallback system to find files regardless of where they're stored:

#### **Method 1: AI-Provided Full Path (Priority 1)**
```python
# Try the AI-provided full path first (if it looks like a full path)
if "/" in path and not path.startswith("default_client/"):
    ai_path = path
    logger.info(f"🔍 METHOD 1: Trying AI-provided full path: {ai_path}")
    try:
        resp = m_client.get_object(bucket, ai_path)
        # Process file and return data
        return table.to_pandas()
    except Exception as ai_exc:
        logger.warning(f"❌ METHOD 1 FAILED: AI path {ai_path} not found: {ai_exc}")
```

**When Used**: When the AI provides a full path that's not the default path
**Priority**: Highest - tries the exact path the AI identified
**Example**: `Quant_Matrix_AI_Schema/blank/blank project/data.arrow`

#### **Method 2: Default Prefix Path (Priority 2)**
```python
# Try the default prefix path
logger.info(f"🔍 METHOD 2: Trying default prefix path: {default_prefix}")
arrow_obj = _find_latest_object(basename + ".arrow", m_client, bucket, default_prefix)
if arrow_obj is None:
    arrow_obj = os.path.join(default_prefix, basename)
```

**When Used**: When Method 1 fails or when no full path is provided
**Priority**: Second - uses the cached/default environment path
**Example**: `default_client/default_app/default_project/data.arrow`

#### **Method 3: Resolved Path Download (Priority 3)**
```python
# Try to download from the resolved path
try:
    resp = m_client.get_object(bucket, arrow_obj)
    data = resp.read()
    table = ipc.RecordBatchFileReader(pa.BufferReader(data)).read_all()
    return table.to_pandas()
except Exception as exc:
    logger.error(f"❌ METHOD 3 FAILED: fallback minio download failed for {path}: {exc}")
```

**When Used**: After Method 2 resolves a path
**Priority**: Third - attempts download from the resolved path
**Example**: Downloads from whatever path was found in Method 2

#### **Method 4: Bucket-Wide Search (Priority 4 - Last Resort)**
```python
# Last resort - try to find the file anywhere in the bucket
logger.info(f"🔍 METHOD 4: Last resort - searching entire bucket for {basename}")
try:
    # Search the entire bucket for the file
    for obj in m_client.list_objects(bucket, recursive=True):
        if obj.object_name.endswith(basename):
            logger.info(f"🔍 Found file in bucket: {obj.object_name}")
            try:
                resp = m_client.get_object(bucket, obj.object_name)
                data = resp.read()
                return data
            except Exception as bucket_exc:
                logger.warning(f"❌ Failed to read file from bucket path {obj.object_name}: {bucket_exc}")
                continue
except Exception as search_exc:
    logger.error(f"❌ Failed to search bucket: {search_exc}")
```

**When Used**: When all other methods fail
**Priority**: Last resort - searches the entire bucket
**Example**: Finds `client/app/project/data.arrow` anywhere in the bucket

## Implementation Details

### **Files Modified**

1. **`TrinityBackendFastAPI/app/DataStorageRetrieval/arrow_client.py`**
   - Updated `download_dataframe()` function
   - Updated `download_table_bytes()` function
   - Added comprehensive logging for each method
   - Implemented intelligent path detection

### **Key Features**

✅ **Intelligent Path Detection**: Automatically detects if path is full or partial
✅ **Priority-Based Fallback**: Tries most likely paths first
✅ **Comprehensive Logging**: Shows exactly which method succeeds/fails
✅ **Flight Caching**: Caches successful downloads for future requests
✅ **Error Handling**: Graceful degradation through all methods

### **Path Detection Logic**

```python
# Check if this looks like a full path (not default)
if "/" in path and not path.startswith("default_client/"):
    # This is likely an AI-provided full path
    ai_path = path
else:
    # This is likely a basename or default path
    default_prefix = get_minio_prefix()
```

## Benefits

### **1. File Discovery Success Rate**
- **Before**: Only tried default path, often failed
- **After**: Tries 4 different methods, much higher success rate

### **2. AI Integration**
- **Before**: AI could identify correct path but backend ignored it
- **After**: AI path is tried first, ensuring integration works

### **3. Backward Compatibility**
- **Before**: Only worked with default paths
- **After**: Works with both default and custom paths

### **4. Debugging**
- **Before**: Hard to understand why files weren't found
- **After**: Clear logging shows exactly which method succeeded/failed

## Usage Examples

### **Scenario 1: AI Provides Full Path**
```
AI Response: "file_name": "Quant_Matrix_AI_Schema/blank/blank project/data.arrow"
Backend: Method 1 succeeds - file found immediately
Result: ✅ Success
```

### **Scenario 2: AI Provides Basename Only**
```
AI Response: "file_name": "data.arrow"
Backend: Method 1 fails, Method 2 finds in default path
Result: ✅ Success
```

### **Scenario 3: File in Unexpected Location**
```
AI Response: "file_name": "data.arrow"
Backend: Methods 1-3 fail, Method 4 finds file elsewhere
Result: ✅ Success
```

### **Scenario 4: File Not Found Anywhere**
```
AI Response: "file_name": "nonexistent.arrow"
Backend: All methods fail
Result: ❌ Clear error with detailed logging
```

## Testing

### **Test Cases**

1. **Full Path Success**
   ```bash
   # AI provides full path
   curl -X POST "http://localhost:8000/chart-maker/chart" \
     -H "Content-Type: application/json" \
     -d '{"prompt": "Create chart from Quant_Matrix_AI_Schema/blank/blank project/data.arrow"}'
   ```

2. **Basename Path Success**
   ```bash
   # AI provides basename only
   curl -X POST "http://localhost:8000/chart-maker/chart" \
     -H "Content-Type: application/json" \
     -d '{"prompt": "Create chart from data.arrow"}'
   ```

3. **Mixed Path Scenarios**
   ```bash
   # Test with various path formats
   curl -X POST "http://localhost:8000/chart-maker/chart" \
     -H "Content-Type: application/json" \
     -d '{"prompt": "Create chart from client/app/project/data.arrow"}'
   ```

### **Expected Logs**

With the fix, you should see logs like:
```
🔍 METHOD 1: Trying AI-provided full path: Quant_Matrix_AI_Schema/blank/blank project/data.arrow
✅ METHOD 1 SUCCESS: Found file at AI path Quant_Matrix_AI_Schema/blank/blank project/data.arrow with 1000 rows
```

Instead of the previous error:
```
❌ fallback minio download failed: S3 operation failed; code: NoSuchKey
```

## Summary

The arrow client path fix provides:

✅ **Multi-Path Support**: Tries AI path, default path, and bucket-wide search
✅ **Intelligent Fallback**: Priority-based approach for maximum success rate
✅ **AI Integration**: Respects the paths identified by the AI
✅ **Comprehensive Logging**: Clear visibility into which method succeeds
✅ **Backward Compatibility**: Still works with existing default path setup

This fix ensures that the chart maker can find files regardless of whether they're stored in:
- The AI-identified custom path (e.g., `Quant_Matrix_AI_Schema/blank/blank project/`)
- The default cached path (e.g., `default_client/default_app/default_project/`)
- Any other location in the MinIO bucket

The system now gracefully handles both scenarios, making the chart maker much more reliable and user-friendly.
