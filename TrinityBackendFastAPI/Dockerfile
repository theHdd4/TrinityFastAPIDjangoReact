# Dockerfile

FROM python:3.11-slim

WORKDIR /app

# Install system dependencies required for Playwright and build tooling
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libffi-dev \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libssl-dev \
    libx11-xcb1 \
    libxcb-dri3-0 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libxss1 \
    libxtst6 \
    fonts-ubuntu \
    fonts-unifont \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Ensure Playwright stores browsers in a predictable, cacheable location
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Copy requirements and install them
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --timeout 1000 -r requirements.txt && \
    python -m playwright install chromium && \
    rm -rf /var/lib/apt/lists/*

# Copy application code
COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]