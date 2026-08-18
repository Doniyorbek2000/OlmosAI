# CPU image — procedural fallback for dev/CI. See MODEL.md for the GPU build.
FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 WORKER_GPU_AVAILABLE=false
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
COPY services/ai-workers/_shared /app/_shared
RUN pip install /app/_shared
COPY services/ai-workers/triposg/requirements.txt /app/requirements.txt
RUN pip install -r /app/requirements.txt
COPY services/ai-workers/triposg /app/triposg
EXPOSE 8003
CMD ["uvicorn", "triposg.worker:app", "--host", "0.0.0.0", "--port", "8003", "--app-dir", "/app"]
