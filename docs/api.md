# Developer API

Base URL: `/v1` (external) — the same handlers back the UI at `/api/v1`.
Authenticate with an API key: `Authorization: Bearer vyr_live_...`.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/v1/generations/image-to-3d` | Start an image→3D job |
| POST | `/v1/generations/text-to-3d` | Start a text→3D workflow |
| GET | `/v1/jobs/:id` | Job status + stages |
| GET | `/v1/jobs/:id/stream` | SSE progress |
| GET | `/v1/assets/:id` | Asset + versions |
| POST | `/v1/assets/:id/optimize` | Optimize/decimate/LOD |
| POST | `/v1/assets/:id/retexture` | Re-texture |
| GET | `/v1/assets/:id/download` | Signed download URL |
| DELETE | `/v1/assets/:id` | Delete asset |

## Keys

Created per user (test/live). Only the hash is stored; the plaintext is shown
once. Keys have scopes, usage tracking (`ApiUsage`), credit charging, and
revocation. Rate limits are separate from the UI surface.

## Webhooks

Create endpoints subscribed to events: `generation.started`,
`generation.progress`, `generation.completed`, `generation.failed`,
`asset.created`. Payloads are HMAC-signed; failed deliveries retry with
exponential backoff and are logged (`WebhookDelivery`).

## Errors

JSON `{ error: { code, message, retryable }, requestId }`. Codes:
`PROVIDER_UNAVAILABLE`, `INSUFFICIENT_CREDITS`, `INVALID_INPUT`, `GPU_OOM`,
`GENERATION_FAILED`, `ASSET_PROCESSING_FAILED`, `UNSUPPORTED_FORMAT`,
`QUALITY_CHECK_FAILED`, `RATE_LIMITED`, …
