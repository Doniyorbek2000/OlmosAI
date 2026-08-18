# VEYRA 3D asset-processing worker (CPU). Blender is optional and only needed
# for BAKE_TEXTURE / FBX export; the CPU profile covers geometry ops + LOD +
# collider + GLB/OBJ/STL/GLTF export.
FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
COPY services/ai-workers/_shared /app/_shared
RUN pip install /app/_shared
COPY services/asset-worker/requirements.txt /app/requirements.txt
RUN pip install -r /app/requirements.txt
COPY services/asset-worker /app/asset-worker
EXPOSE 8010
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8010/health')" || exit 1
CMD ["uvicorn", "asset-worker.worker:app", "--host", "0.0.0.0", "--port", "8010", "--app-dir", "/app"]
