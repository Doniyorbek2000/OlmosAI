# Kubernetes

Production manifests. Ordinary web/API pods must **not** carry GPU requests;
only AI worker pods request `nvidia.com/gpu` and should run on GPU node pools.
Isolate worker pods with a `NetworkPolicy` and inject `WORKER_SHARED_SECRET`
from a Secret.

Apply order: `namespace.yaml` → secrets/config (provide your own) →
`api.deployment.yaml`, `web.deployment.yaml`, `generation-worker.deployment.yaml`
→ `triposr-gpu.deployment.yaml`.

These are starting points, not a turnkey install — wire real Secrets, an
Ingress/TLS, and managed Postgres/Redis/S3 for your environment. A Helm chart
can wrap these later.
