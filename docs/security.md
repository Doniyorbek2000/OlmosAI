# Security

## Authentication & sessions

- Passwords hashed with scrypt (memory-hard, stdlib — no native build).
- Access tokens: short-lived HS256 JWTs. Refresh tokens: opaque random, **only
  the SHA-256 hash is stored**; refresh rotates and revokes the old session.
- `logout-all` revokes every session for a user.
- Secure `httpOnly`, `sameSite` cookies; `secure` in production.

## Authorization (RBAC)

`RolesGuard` + `@Roles()` enforce USER / ADMIN / SUPPORT. Resource ownership is
checked on every project/asset/job access.

## API keys

`${prefix}${random}` (`vyr_live_` / `vyr_test_`); only the SHA-256 hash + prefix
+ last4 are stored. Keys carry scopes and can be revoked/expired.

## Uploads (untrusted input)

- Presigned direct-to-storage uploads; large files never stream through the API.
- Content type + size validated on presign; **magic bytes** validated before
  processing (`@veyra/storage/validation`) — extensions are never trusted.
- Uploaded scripts are never executed.

## Storage

Private buckets only. Downloads use short-lived signed URLs. User assets are
never public unless explicitly marked (gallery), and prompts are private by
default.

## Worker isolation

Workers sit on an internal network and require `WORKER_SHARED_SECRET`. Admin
panels never allow arbitrary remote command execution.

## Transport & app hardening

Helmet security headers, CORS locked to `WEB_URL`, global validation pipe
(`whitelist` + `forbidNonWhitelisted`), Redis-backed rate limits by surface
(auth/UI/API/admin/worker), request IDs for tracing.

## Errors

Structured `VeyraError` codes map to HTTP; stack traces are never returned to
clients. Server errors are logged with the request id.

## Secrets

All secrets come from validated env (`@veyra/config`), which **fails fast** on
missing/default secrets in production and forbids the mock provider in prod. CI
runs a gitleaks secret scan.
