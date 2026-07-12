FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    FLASK_ENV=production \
    PORT=7156

# Install dependencies first (cached layer — only re-runs when the lock changes)
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY . .

EXPOSE 7156

# Single worker: JSON-file storage is not safe across processes.
# Threads handle concurrent requests within the one worker.
CMD ["uv", "run", "--no-sync", "gunicorn", "--workers", "1", "--threads", "8", "--timeout", "120", "--bind", "0.0.0.0:7156", "app:app"]
