# Orchestration Troubleshooting Guide

## Common Error: "I'm experiencing a delay in processing your request"

This error occurs when the **LLM (Ollama/DeepSeek) is not responding** or taking too long.

### ✅ **Fixes Applied**

1. **Increased timeout**: From 30s → 120s (DeepSeek needs more time)
2. **Better error handling**: Specific error messages for timeout vs connection issues
3. **Detailed logging**: Track LLM calls and responses

### 🔍 **Root Causes & Solutions**

#### **1. Ollama/DeepSeek Not Running**

**Symptoms:**
- Error: "Connection error to LLM"
- Orchestration returns empty workflow

**Check:**
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Should return list of models
```

**Solution:**
```bash
# Start Ollama service
docker-compose up -d ollama

# Or if running locally
ollama serve
```

#### **2. Wrong LLM_API_URL Configuration**

**Symptoms:**
- Connection timeout
- "Failed to connect to LLM API"

**Check Environment Variables:**
```bash
# In Docker environment
docker-compose exec trinity-ai env | grep LLM

# Should show:
# LLM_API_URL=http://ollama:11434/api/chat
# LLM_MODEL_NAME=deepseek-r1:32b
```

**Fix in docker-compose.yml:**
```yaml
services:
  trinity-ai:
    environment:
      - LLM_API_URL=http://ollama:11434/api/chat
      - OLLAMA_IP=ollama
      - OLLAMA_PORT=11434
      - LLM_MODEL_NAME=deepseek-r1:32b
```

#### **3. DeepSeek Model Not Downloaded**

**Symptoms:**
- Error: "model not found"
- LLM returns 404

**Check:**
```bash
# List available models
docker-compose exec ollama ollama list

# Should show deepseek-r1:32b
```

**Solution:**
```bash
# Pull DeepSeek model
docker-compose exec ollama ollama pull deepseek-r1:32b
```

#### **4. LLM Taking Too Long (Normal for DeepSeek)**

**Symptoms:**
- Request succeeds but takes 60-90 seconds
- No error, just slow response

**This is NORMAL for DeepSeek!** The timeout has been increased to 120 seconds.

**If still timing out:**
```python
# In agent_orchestrator.py, line 282
timeout=120  # Increase to 180 or 240 if needed
```

#### **5. Network Issues Between Services**

**Symptoms:**
- Works locally but not in Docker
- Connection refused errors

**Check Docker Network:**
```bash
# Verify services can communicate
docker-compose exec trinity-ai ping ollama -c 3

# Should get successful ping responses
```

**Fix:**
Ensure services are on same Docker network in `docker-compose.yml`:
```yaml
services:
  trinity-ai:
    networks:
      - trinity-network
  
  ollama:
    networks:
      - trinity-network

networks:
  trinity-network:
    driver: bridge
```

### 📊 **Debugging Steps**

#### **Step 1: Check Service Status**

```bash
# Check all services running
docker-compose ps

# Should show trinity-ai, ollama, etc. as "Up"
```

#### **Step 2: Check Logs**

```bash
# Check Trinity AI logs
docker-compose logs trinity-ai --tail=50

# Look for:
# "Calling LLM API: http://..."
# "LLM Response received"
# Or errors: "Connection error to LLM"

# Check Ollama logs
docker-compose logs ollama --tail=50

# Should show model loading and inference requests
```

#### **Step 3: Test LLM Directly**

```bash
# Test Ollama API directly
curl http://localhost:11434/api/generate -d '{
  "model": "deepseek-r1:32b",
  "prompt": "Hello",
  "stream": false
}'

# Should return JSON with model response
```

#### **Step 4: Test Orchestration Endpoint**

```bash
# Test with simple prompt
curl -X POST http://localhost:8002/trinityai/superagent/orchestrate \
  -H "Content-Type: application/json" \
  -d '{"message": "merge file1 and file2"}'

# Check response for:
# - success: true/false
# - final_response: error message or workflow results
```

### 🔧 **Quick Fixes**

#### **Fix 1: Restart Services**

```bash
# Restart both services
docker-compose restart trinity-ai ollama

# Wait 30 seconds for Ollama to load model
sleep 30

# Test again
```

#### **Fix 2: Increase Resources**

If DeepSeek is very slow, increase Docker resources:

```yaml
# In docker-compose.yml
services:
  ollama:
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G
```

#### **Fix 3: Use Smaller/Faster Model**

If DeepSeek is too slow, try a faster model:

```yaml
# In docker-compose.yml or .env
environment:
  - LLM_MODEL_NAME=llama2:7b  # Much faster than DeepSeek
```

Then pull the model:
```bash
docker-compose exec ollama ollama pull llama2:7b
```

### 📝 **Error Messages Explained**

| Error Message | Cause | Solution |
|---------------|-------|----------|
| "LLM request timed out after 120 seconds" | DeepSeek taking too long | Increase timeout or use faster model |
| "Connection error to LLM" | Ollama not running or wrong URL | Start Ollama, check LLM_API_URL |
| "model not found" | DeepSeek not downloaded | Run `ollama pull deepseek-r1:32b` |
| "No workflow generated" | LLM returned invalid JSON | Check LLM logs, may need to restart |
| "I couldn't create a workflow" | LLM timeout or non-data-science request | Check request is data-science related |

### ✅ **Verification Checklist**

After making changes, verify:

- [ ] Ollama service is running: `docker-compose ps`
- [ ] DeepSeek model is available: `ollama list`
- [ ] LLM API is accessible: `curl http://localhost:11434/api/tags`
- [ ] Environment variables are set correctly
- [ ] Logs show LLM requests succeeding
- [ ] Test endpoint responds successfully

### 🎯 **Performance Tips**

1. **First request is always slow** (model loading) - subsequent requests are faster
2. **DeepSeek is thorough but slow** - consider using for production only
3. **For development**, use faster models like `llama2:7b` or `mistral:7b`
4. **Monitor resources**: DeepSeek needs 4-8GB RAM for optimal performance

### 📞 **Still Having Issues?**

Check the logs with verbose logging:

```bash
# Enable debug logging
docker-compose exec trinity-ai python -c "
import logging
logging.basicConfig(level=logging.DEBUG)
"

# Then check logs again
docker-compose logs trinity-ai -f
```

The logs will show exactly what's happening with LLM calls and responses.

