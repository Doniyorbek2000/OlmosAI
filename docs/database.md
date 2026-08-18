# Database

PostgreSQL via Prisma (`packages/database/prisma/schema.prisma`). UUID PKs,
`createdAt/updatedAt`, `deletedAt` soft-deletes for recoverable user data,
explicit indexes/FKs/cascades. Transactions guard credits, payments, job
finalization, and asset creation.

## Domains

- **Auth**: User, Session (hashed refresh token), Account (OAuth), VerificationToken, UserSetting
- **Billing**: Plan, Subscription, Payment, Invoice, CreditBalance, CreditTransaction
- **Content**: Project, Asset, AssetVersion, AssetFile, Material, Texture
- **Jobs**: GenerationJob, GenerationStage, JobAttempt, GenerationCost
- **AI infra**: AIProvider, AIProviderModel, GPUWorker, WorkerHeartbeat
- **Developer**: ApiKey, ApiUsage, WebhookEndpoint, WebhookDelivery
- **System**: AuditLog, Notification, SystemSetting

## Asset versioning

Originals are never overwritten. Each operation creates an `AssetVersion`
(v1 original → v2 remeshed → v3 textured → …) with a `parentId` lineage for
rollback. `Asset.currentVersionId` points at the active version.

## Migrations

```bash
pnpm --filter @veyra/database exec prisma migrate dev --name <name>   # dev
pnpm db:migrate                                                       # deploy (prod)
```
Never use destructive resets in production.

## Backups

Document nightly `pg_dump` + WAL archiving for PITR; enable object-storage
versioning + lifecycle rules for asset durability (spec §77).
