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
      build-essential libpq-dev && \
    rm -rf /var/lib/apt/lists/*

# 5. Copy and install Python deps into venv
COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install -r requirements.txt \
    && pip install gunicorn django-guardian  # ensure guardian & gunicorn are present

# 6. Copy project files
COPY . .

# 7. Collect static files
RUN python manage.py collectstatic --noinput

# 8. Expose port and run
EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3"]
