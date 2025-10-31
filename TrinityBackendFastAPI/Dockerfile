# Dockerfile

FROM python:3.11-slim

WORKDIR /app

# Install system dependencies required for Playwright and build tooling
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    build-essential \
    libffi-dev \
    libssl-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Ensure Playwright stores browsers in a predictable, cacheable location
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Copy requirements and install them
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --timeout 1000 -r requirements.txt && \
    python -m playwright install --with-deps chromium && \
    rm -rf /var/lib/apt/lists/*

# Copy application code
COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]