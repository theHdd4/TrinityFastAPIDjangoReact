FROM python:3.11-slim
WORKDIR /app
# Copy requirements from TrinityAI directory
COPY TrinityAI/requirements.txt ./
# Increase pip's network timeout to avoid timeouts when
# downloading large dependencies like PyTorch
RUN pip install --no-cache-dir --timeout 1000 -r requirements.txt
# Copy all TrinityAI files
COPY TrinityAI/ .
# Copy DataStorageRetrieval module from FastAPI backend (required for main_api.py)
COPY TrinityBackendFastAPI/app/DataStorageRetrieval ./DataStorageRetrieval
RUN python Agent_fetch_atom/download_model.py
CMD ["uvicorn", "main_api:app", "--host", "0.0.0.0", "--port", "8002"]
