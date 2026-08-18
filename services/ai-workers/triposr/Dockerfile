# CPU image — runs the deterministic procedural fallback. Suitable for local
# dev and CI where no GPU is present. See Dockerfile.gpu for the real model.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    WORKER_GPU_AVAILABLE=false

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install the shared framework first (better layer caching).
COPY services/ai-workers/_shared /app/_shared
RUN pip install /app/_shared

COPY services/ai-workers/triposr/requirements.txt /app/requirements.txt
RUN pip install -r /app/requirements.txt

COPY services/ai-workers/triposr /app/triposr

EXPOSE 8001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/health')" || exit 1

CMD ["uvicorn", "triposr.worker:app", "--host", "0.0.0.0", "--port", "8001", "--app-dir", "/app"]
