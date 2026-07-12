FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    FLASK_ENV=production \
    PORT=8080

COPY requirements.docker.txt .
RUN pip install --no-cache-dir -r requirements.docker.txt

COPY . .

EXPOSE 8080

# Single worker: JSON-file storage is not safe across processes.
# Threads handle concurrent requests within the one worker.
CMD ["gunicorn", "--workers", "1", "--threads", "8", "--timeout", "120", "--bind", "0.0.0.0:8080", "app:app"]
