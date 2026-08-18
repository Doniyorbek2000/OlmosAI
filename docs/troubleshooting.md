# Troubleshooting

**App fails to start with an env error.** `@veyra/config` failed validation —
read the listed keys. In production it also blocks the mock provider and default
JWT secrets.

**`prisma validate` says DATABASE_URL missing.** Export it or run via the app
which loads `.env`. `DATABASE_URL=... npx prisma validate`.

**Generation stuck in QUEUED.** The generation worker isn't running
(`pnpm --filter @veyra/api worker:dev`) or Redis is unreachable.

**Generation FAILED with PROVIDER_UNAVAILABLE.** No enabled+healthy provider for
the requested capability. Enable a worker (`TRIPOSR_WORKER_URL` +
`PROVIDER_TRIPOSR_ENABLED=true`) or the mock provider in dev.

**Viewer is blank but download works.** The GLB likely loaded; toggle grid/env,
or check the browser console for a CORS error on the signed URL (MinIO must
allow GET from the web origin).

**SSE progress never updates.** Ensure the API and worker share the same Redis;
progress is published to `job:progress:<id>`. The create page falls back to
polling if the stream drops.

**No space left on device (dev container).** Remove build caches
(`.next`, `dist`, `.turbo`, `.venv`) and stale Docker volumes.
