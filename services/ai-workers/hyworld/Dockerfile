# CPU image — procedural world fallback for dev/CI. GPU build (real HY-World) is
# gated on license + territory review; see MODEL.md. Runs as an ISOLATED
# service — never co-scheduled with object-generation workers.
FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 WORKER_GPU_AVAILABLE=false
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
COPY services/ai-workers/_shared /app/_shared
RUN pip install /app/_shared
COPY services/ai-workers/hyworld/requirements.txt /app/requirements.txt
RUN pip install -r /app/requirements.txt
COPY services/ai-workers/hyworld /app/hyworld
EXPOSE 8007
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8007/health')" || exit 1
CMD ["uvicorn", "worker:app", "--host", "0.0.0.0", "--port", "8007", "--app-dir", "/app/hyworld"]
