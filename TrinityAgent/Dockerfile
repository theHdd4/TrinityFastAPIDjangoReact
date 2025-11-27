FROM python:3.11-slim
WORKDIR /app

# Copy requirements.txt from root (build context is root directory)
COPY requirements.txt ./

# Increase pip's network timeout to avoid timeouts when
# downloading large dependencies like PyTorch
RUN pip install --no-cache-dir --timeout 1000 -r requirements.txt

# Copy the entire TrinityAgent directory contents to /app
# This matches the old structure where everything was at /app root
COPY TrinityAgent/ ./

# Run download_model (matching old structure: Agent_fetch_atom/download_model.py)
# Note: Old structure had Agent_fetch_atom, new has Agent_FetchAtom
RUN if [ -f "Agent_FetchAtom/download_model.py" ]; then python Agent_FetchAtom/download_model.py; fi || \
    if [ -f "Agent_fetch_atom/download_model.py" ]; then python Agent_fetch_atom/download_model.py; fi || true

# Run the main API (main_api.py is now at /app/main_api.py, matching old structure)
CMD ["uvicorn", "main_api:app", "--host", "0.0.0.0", "--port", "8002"]

