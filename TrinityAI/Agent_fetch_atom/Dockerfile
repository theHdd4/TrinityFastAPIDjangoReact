FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt ./
# Increase pip's network timeout to avoid timeouts when
# downloading large dependencies like PyTorch
RUN pip install --no-cache-dir --timeout 1000 -r requirements.txt
COPY . .
RUN python download_model.py
CMD ["uvicorn", "main_api:app", "--host", "0.0.0.0", "--port", "8002"]
