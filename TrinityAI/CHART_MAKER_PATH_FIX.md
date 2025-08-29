# Chart Maker MinIO Path Fix

## Problem Description

The chart maker was not working properly because it was looking for files in the wrong MinIO path:

- **Current (Wrong) Path**: `default_client/default_app/default_project/`
- **Expected Path**: Your actual client/app/project path (e.g., `Quant_Matrix_AI_Schema/blank/bla project/`)

## Root Cause

The chart maker agent was not properly detecting the dynamic MinIO path and was falling back to default environment variable values:

```python
# ❌ PROBLEM: Using default values
client = os.getenv("CLIENT_NAME", "default_client")  # Always "default_client"
app = os.getenv("APP_NAME", "default_app")           # Always "default_app"  
project = os.getenv("PROJECT_NAME", "default_project") # Always "default_project"
```

## Fixes Implemented

### 1. Enhanced Path Detection (`llm_chartmaker.py`)

#### Multiple Detection Methods
The agent now tries multiple methods to get the correct path:

```python
def _maybe_update_prefix(self) -> None:
    # Method 1: Try to import and use get_object_prefix from data_upload_validate
    try:
        from app.features.data_upload_validate.app.routes import get_object_prefix
        current = loop.run_until_complete(get_object_prefix())
        # Use this path if successful
    except Exception as e:
        logger.warning(f"Method 1 (get_object_prefix) failed: {e}")
    
    # Method 2: Try to get from environment variables directly
    client = os.getenv("CLIENT_NAME", "").strip()
    app = os.getenv("APP_NAME", "").strip()
    project = os.getenv("PROJECT_NAME", "").strip()
    
    if client and app and project and not (client == "default_client" and app == "default_app" and project == "default_project"):
        current = f"{client}/{app}/{project}/"
        # Use this path if environment variables are not default
    
    # Method 3: Try to get from Redis cache or database via HTTP API
    try:
        response = requests.get(f"{base_url}/data-upload-validate/get_object_prefix")
        if response.status_code == 200:
            data = response.json()
            current = data.get("prefix", "")
            # Use this path if API call successful
    except Exception as e:
        logger.warning(f"Method 3 (HTTP API) failed: {e}")
```

#### Enhanced Debugging
Added comprehensive logging to show exactly what paths are being used:

```python
def _load_files(self) -> None:
    # 🔍 CRITICAL DEBUG: Show current path configuration
    print(f"\n🔍 ===== CHART MAKER PATH DEBUG =====")
    print(f"📁 Current MinIO Prefix: '{self.prefix}'")
    print(f"🪣 MinIO Bucket: '{self.bucket}'")
    print(f"🌐 MinIO Endpoint: '{self.minio_endpoint}'")
    
    # Check if we're using default values
    if self.prefix == "default_client/default_app/default_project/" or self.prefix == "":
        print(f"❌ CRITICAL WARNING: Using default path - this will likely fail!")
        print(f"❌ Expected: Your actual client/app/project path")
        print(f"❌ Current: {self.prefix}")
    else:
        print(f"✅ Using custom path: {self.prefix}")
```

### 2. Manual Path Setting

Added a method to manually set the correct path if automatic detection fails:

```python
def set_minio_path(self, new_path: str) -> bool:
    """
    🔧 CRITICAL FIX: Manually set the MinIO path and reload files
    This is useful when the automatic path detection fails
    """
    try:
        # Normalize the path
        if not new_path.endswith("/"):
            new_path += "/"
        
        logger.info(f"🔧 Manually setting MinIO path from '{self.prefix}' to '{new_path}'")
        
        if self.prefix != new_path:
            self.prefix = new_path
            logger.info(f"✅ MinIO path updated to: {self.prefix}")
            
            # Reload files with the new path
            self._load_files()
            return True
        else:
            logger.info(f"✅ MinIO path already set to: {self.prefix}")
            return True
            
    except Exception as e:
        logger.error(f"❌ Failed to set MinIO path: {e}")
        return False
```

### 3. Path Diagnostics

Added a diagnostic method to identify path issues:

```python
def diagnose_path_issues(self) -> Dict[str, Any]:
    """
    🔧 DIAGNOSTIC: Check current path configuration and suggest fixes
    This helps identify why the chart maker is not finding files
    """
    diagnosis = {
        "current_prefix": self.prefix,
        "bucket": self.bucket,
        "endpoint": self.minio_endpoint,
        "files_found": len(self.files_with_columns),
        "issues": [],
        "suggestions": []
    }
    
    # Check environment variables
    client = os.getenv("CLIENT_NAME", "").strip()
    app = os.getenv("APP_NAME", "").strip()
    project = os.getenv("PROJECT_NAME", "").strip()
    
    # Check for issues and suggest fixes
    if self.prefix == "default_client/default_app/default_project/" or self.prefix == "":
        diagnosis["issues"].append("Using default path - no files will be found")
        diagnosis["suggestions"].append("Set environment variables CLIENT_NAME, APP_NAME, PROJECT_NAME")
        diagnosis["suggestions"].append("Or use set_minio_path() method to set correct path")
    
    return diagnosis
```

## How to Fix the Path Issue

### Option 1: Set Environment Variables

Set the correct environment variables in your system:

```bash
export CLIENT_NAME="Quant_Matrix_AI_Schema"
export APP_NAME="blank"
export PROJECT_NAME="bla project"
```

### Option 2: Use the Manual Path Setting

If you know the correct path, you can set it manually in the chart maker agent:

```python
# In your chart maker code
chart_agent = ChartMakerAgent(...)

# Set the correct path manually
success = chart_agent.set_minio_path("Quant_Matrix_AI_Schema/blank/bla project/")
if success:
    print("✅ Path updated successfully")
else:
    print("❌ Failed to update path")
```

### Option 3: Check Redis/Database Configuration

The system should automatically get the correct path from Redis cache or database. Check:

1. **Redis**: Is Redis running and accessible?
2. **Database**: Does the `registry_environment` table have the correct client/app/project names?
3. **API Endpoint**: Can you access `/data-upload-validate/get_object_prefix`?

## Testing the Fix

### 1. Run the Path Diagnosis Tool

```bash
cd TrinityFastAPIDjangoReact/TrinityAI
python test_chart_maker_path_fix.py
```

This will:
- Check environment variables
- Test the API endpoint
- Test MinIO connection
- Suggest fixes

### 2. Check Chart Maker Logs

When you initialize the chart maker agent, you should see:

```
🔍 ===== CHART MAKER PATH DEBUG =====
📁 Current MinIO Prefix: 'Quant_Matrix_AI_Schema/blank/bla project/'
🪣 MinIO Bucket: 'trinity'
🌐 MinIO Endpoint: 'minio:9000'
✅ Using custom path: Quant_Matrix_AI_Schema/blank/bla project/
🔍 ===== END PATH DEBUG =====
```

### 3. Verify Files are Loaded

You should see:

```
🔍 Listing objects in bucket 'trinity' with prefix 'Quant_Matrix_AI_Schema/blank/bla project/'...
📊 Found X total objects in path
✅ SUCCESS: X files loaded successfully
✅ Chart maker should now work properly
```

## Expected Results

### Before Fix
- ❌ Chart maker looking in `default_client/default_app/default_project/`
- ❌ No files found
- ❌ Chart properties remain empty
- ❌ Error: "No table for [path]"

### After Fix
- ✅ Chart maker looking in correct path (e.g., `Quant_Matrix_AI_Schema/blank/bla project/`)
- ✅ Files found and loaded successfully
- ✅ Chart properties properly populated
- ✅ Charts render with real data

## Troubleshooting

### If Path Still Shows Default Values

1. **Check Environment Variables**:
   ```bash
   echo $CLIENT_NAME
   echo $APP_NAME
   echo $PROJECT_NAME
   ```

2. **Check Redis Cache**:
   - Verify Redis is running
   - Check if the cache has the correct client/app/project names

3. **Check Database**:
   - Verify database connection
   - Check `registry_environment` table

4. **Use Manual Path Setting**:
   ```python
   chart_agent.set_minio_path("your/actual/path/")
   ```

### If Files Still Not Found

1. **Verify MinIO Path**:
   - Check if files actually exist in the specified path
   - Verify MinIO permissions and access

2. **Check File Extensions**:
   - Chart maker looks for `.arrow` files
   - Make sure your data files have the correct extension

3. **Test MinIO Connection**:
   ```python
   from minio import Minio
   client = Minio("minio:9000", access_key="minio", secret_key="minio123", secure=False)
   objects = list(client.list_objects("trinity", prefix="your/path/", recursive=True))
   print(f"Found {len(objects)} objects")
   ```

## Files Modified

1. `TrinityAI/Agent_chartmaker/llm_chartmaker.py` - Enhanced path detection and debugging
2. `TrinityAI/test_chart_maker_path_fix.py` - Path diagnosis tool (new)
3. `TrinityAI/CHART_MAKER_PATH_FIX.md` - This documentation (new)

## Next Steps

1. **Run the diagnosis tool** to identify the current path issue
2. **Set the correct environment variables** or use manual path setting
3. **Test the chart maker** to ensure files are loaded
4. **Monitor logs** to verify the correct path is being used
5. **Test chart generation** to ensure the complete flow works

## Summary

The chart maker path issue has been fixed with:
- **Multiple path detection methods** (import, environment, API)
- **Enhanced debugging** to show exactly what paths are being used
- **Manual path setting** for cases where automatic detection fails
- **Comprehensive diagnostics** to identify and fix path issues
- **Testing tools** to verify the fix works

This should resolve the issue where the chart maker was looking in the wrong MinIO path and not finding any files.
