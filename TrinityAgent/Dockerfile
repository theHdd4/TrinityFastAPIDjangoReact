FROM python:3.11-slim
WORKDIR /app

# Copy requirements.txt from root (build context is root directory)
COPY requirements.txt ./

# Configure pip to handle network issues better
# Set environment variables for pip configuration
ENV PIP_DEFAULT_TIMEOUT=1000
ENV PIP_DISABLE_PIP_VERSION_CHECK=1

# Increase pip's network timeout and add retries to avoid timeouts when
# downloading large dependencies like PyTorch
# Upgrade pip first, then install with retry logic to handle network/JSON errors
# The JSON decode error often happens due to incomplete responses from PyPI
RUN pip install --upgrade pip setuptools wheel && \
    pip install --no-cache-dir --timeout 1000 -r requirements.txt || \
    (echo "First attempt failed, retrying with fresh pip cache..." && \
     pip cache purge && \
     sleep 10 && \
     pip install --no-cache-dir --timeout 1000 -r requirements.txt) || \
    (echo "Second attempt failed, retrying with increased timeout..." && \
     sleep 20 && \
     pip install --no-cache-dir --timeout 2000 -r requirements.txt) || \
    (echo "Third attempt failed, trying with even longer timeout..." && \
     sleep 30 && \
     pip install --no-cache-dir --timeout 3000 -r requirements.txt)

# Copy the entire TrinityAgent directory contents to /app
# This matches the old structure where everything was at /app root
COPY TrinityAgent/ ./

# Run download_model (matching old structure: Agent_fetch_atom/download_model.py)
# Note: Old structure had Agent_fetch_atom, new has Agent_FetchAtom
RUN if [ -f "Agent_FetchAtom/download_model.py" ]; then python Agent_FetchAtom/download_model.py; fi || \
    if [ -f "Agent_fetch_atom/download_model.py" ]; then python Agent_fetch_atom/download_model.py; fi || true

# Run the main API (main_api.py is now at /app/main_api.py, matching old structure)
CMD ["uvicorn", "main_api:app", "--host", "0.0.0.0", "--port", "8002"]

