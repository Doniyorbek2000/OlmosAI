# Deployment

## Topology

Stateless web + API scale horizontally. The generation worker scales
independently (GPU dispatch never blocks HTTP). Postgres, Redis, and
S3-compatible storage are managed services in production.

## Docker

`infra/docker/*.Dockerfile` build the API (+worker) and web images;
`docker-compose.yml` runs the local stack. Build worker images per model from
their `Dockerfile`/`Dockerfile.gpu`.

## Kubernetes

`infra/kubernetes/` holds manifests. GPU workers request
`nvidia.com/gpu` resources; ordinary API/web pods must NOT carry GPU requests.
Use separate node pools and a `NetworkPolicy` isolating worker pods.

## Reverse proxy

Provide Nginx/Caddy in front for TLS (terminated at ingress) and correct upload
limits (`client_max_body_size` ≥ 210m so presign flows and any proxied uploads
work). See `infra/docker/` for a sample.

## Migrations & rollout

Run `pnpm db:migrate` (prisma migrate deploy) as a pre-deploy step. Never run
destructive resets. Roll out AI model updates deliberately (see
upstream-updates policy in `docs/model-registry.md`) — never track upstream
`main` in production.

## Backups / DR

Nightly `pg_dump` + WAL PITR; object-storage versioning + lifecycle. Document
restore drills.
