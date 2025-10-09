# 🔧 Trinity AI 405 Method Not Allowed Error - Complete Fix

## 🚨 **Problem Summary**

The Trinity AI service was returning **405 Method Not Allowed** errors for all AI atom endpoints:
- `POST /trinityai/merge` → 405 Error
- `POST /trinityai/concat` → 405 Error  
- `POST /trinityai/create-transform` → 405 Error
- `POST /trinityai/groupby` → 405 Error
- `POST /trinityai/chart-maker` → 405 Error
- `POST /trinityai/explore` → 405 Error

## 🔍 **Root Cause Analysis**

### 1. **Routing Conflict in main_api.py**
The main issue was conflicting route definitions in `TrinityAI/main_api.py`:

```python
# ❌ PROBLEMATIC CODE (lines 581-583):
@api_router.post("")      # Empty string - catches ALL POST requests!
@api_router.post("/")     # Root path - catches ALL POST requests!
@api_router.post("/chat")
```

**Problem**: The empty string `""` route was intercepting ALL POST requests to `/trinityai/` before they could reach specific agent routes like `/trinityai/merge`.

### 2. **Frontend API Configuration Issue**
The frontend was making requests to the wrong port:
- **Expected**: `http://10.2.2.131:8002/trinityai/merge` (AI service port)
- **Actual**: `http://10.2.2.131:8080/trinityai/merge` (Django port)

This happened because the `VITE_AI_PORT` environment variable wasn't properly configured.

## ✅ **Complete Solution Applied**

### 1. **Fixed Routing Conflict**
**File**: `TrinityAI/main_api.py`

**Before**:
```python
@api_router.post("")      # ❌ Removed
@api_router.post("/")     # ❌ Removed  
@api_router.post("/chat")
```

**After**:
```python
@api_router.post("/chat") # ✅ Only this remains
```

**Key Changes**:
- Removed conflicting empty string `""` and root `"/"` routes
- Moved agent router includes BEFORE main chat endpoints
- Ensured specific routes like `/trinityai/merge` are registered first

### 2. **Fixed Frontend API Configuration**
**Files**: `docker-compose.yml` and `docker-compose-dev.example.yml`

**Added explicit environment variables**:
```yaml
frontend:
  build:
    context: ./TrinityFrontend
    dockerfile: Dockerfile
    args:
      VITE_HOST_IP: ${HOST_IP:-10.2.2.131}
      VITE_DJANGO_PORT: "8000"
      VITE_FASTAPI_PORT: "8001"
      VITE_AI_PORT: "8002"                    # ✅ Correct AI port
      VITE_FRONTEND_PORT: "8080"
      VITE_BACKEND_ORIGIN: "http://${HOST_IP:-10.2.2.131}:8000"
      VITE_TRINITY_AI_API: "http://${HOST_IP:-10.2.2.131}:8002/trinityai"  # ✅ Explicit AI API URL
      VITE_ENVIRONMENT: "production"
```

### 3. **Enhanced Trinity AI Service Configuration**
**File**: `docker-compose.yml`

**Added proper environment variables**:
```yaml
trinity-ai:
  environment:
    OLLAMA_IP: ${OLLAMA_IP:-10.2.4.48}
    HOST_IP: ${HOST_IP:-10.2.2.131}          # ✅ Added HOST_IP
    MONGO_URI: "mongodb://root:rootpass@mongo:27017/trinity_prod?authSource=admin"
    CLASSIFY_MONGO_URI: "mongodb://root:rootpass@mongo:27017/?authSource=admin"
```

## 🚀 **How to Apply the Fix**

### Option 1: Use the Automated Script
```bash
# Windows
fix_ai_routing.bat

# Linux/Mac
./fix_ai_routing.sh
```

### Option 2: Manual Steps
```bash
# 1. Stop services
docker-compose down

# 2. Rebuild frontend with correct configuration
docker-compose build --no-cache frontend

# 3. Rebuild Trinity AI service
docker-compose build --no-cache trinity-ai

# 4. Start services
docker-compose up -d
```

## 🧪 **Verification**

After applying the fix, verify that:

1. **Frontend makes correct API calls**:
   - ✅ `http://10.2.2.131:8002/trinityai/merge`
   - ✅ `http://10.2.2.131:8002/trinityai/concat`
   - ✅ `http://10.2.2.131:8002/trinityai/create-transform`
   - ✅ `http://10.2.2.131:8002/trinityai/groupby`
   - ✅ `http://10.2.2.131:8002/trinityai/chart-maker`
   - ✅ `http://10.2.2.131:8002/trinityai/explore`

2. **No more 405 errors** in browser console

3. **AI atoms work correctly**:
   - Merge operations
   - Concat operations
   - Create/Transform operations
   - GroupBy operations
   - Chart making operations
   - Data exploration operations

## 📋 **Files Modified**

1. `TrinityAI/main_api.py` - Fixed routing conflicts
2. `docker-compose.yml` - Added frontend environment variables
3. `docker-compose-dev.example.yml` - Added dev environment variables
4. `fix_ai_routing.bat` - Windows fix script
5. `fix_ai_routing.sh` - Linux/Mac fix script

## 🎯 **Expected Results**

- ✅ **405 Method Not Allowed errors eliminated**
- ✅ **All AI atoms functional**
- ✅ **Correct API endpoint routing**
- ✅ **Consistent behavior across dev and production**
- ✅ **Proper IP address configuration**

## 🔧 **Troubleshooting**

If issues persist:

1. **Check service logs**:
   ```bash
   docker-compose logs trinity-ai
   docker-compose logs frontend
   ```

2. **Verify environment variables**:
   ```bash
   docker-compose config
   ```

3. **Test endpoints directly**:
   ```bash
   curl -X POST "http://10.2.2.131:8002/trinityai/merge" \
     -H "Content-Type: application/json" \
     -d '{"prompt": "test", "session_id": "test123"}'
   ```

4. **Check browser console** for correct API calls

---

**The 405 Method Not Allowed error should now be completely resolved for all AI atoms!** 🎉
