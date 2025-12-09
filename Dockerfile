FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt ./
# Configure pip to handle network issues better
ENV PIP_DEFAULT_TIMEOUT=1000
ENV PIP_DISABLE_PIP_VERSION_CHECK=1

# Increase pip's network timeout and add retries to avoid timeouts when
# downloading large dependencies like PyTorch
# Upgrade pip first, then install with retry logic to handle network/JSON errors
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
COPY . .
RUN python Agent_fetch_atom/download_model.py
CMD ["uvicorn", "main_api:app", "--host", "0.0.0.0", "--port", "8002"]
