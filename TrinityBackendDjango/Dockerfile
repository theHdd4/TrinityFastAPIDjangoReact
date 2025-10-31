# 1. Base image
FROM python:3.11-slim

# 2. Create & activate a virtual environment
ENV VIRTUAL_ENV=/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# 3. Set workdir
WORKDIR /code

# 4. System dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      build-essential \
      fonts-ubuntu \
      fonts-unifont \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libcups2 \
      libdrm2 \
      libgbm1 \
      libglib2.0-0 \
      libgtk-3-0 \
      libpq-dev \
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
      libnss3 \
      libpango-1.0-0 \
      libpangocairo-1.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Ensure Playwright stores browsers in a predictable, cacheable location
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# 5. Copy and install Python deps into venv
COPY requirements.txt .
# Ensure guardian & gunicorn remain available alongside project requirements
RUN pip install --upgrade pip \
    && pip install --timeout 1000 -r requirements.txt \
    && pip install gunicorn django-guardian \
    && python -m playwright install chromium \
    && rm -rf /var/lib/apt/lists/*

# 6. Copy project files
COPY . .

# 7. Collect static files
RUN python manage.py collectstatic --noinput

# 8. Expose port and run
EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3"]