# Billing & Credits

Credit-based, transactional, idempotent. Corrupt output is never billed; server
or provider failures are refunded.

## Ledger model

`CreditBalance { balance, reserved }`. **Available = balance − reserved.**

| Step | Effect | Idempotency key |
| --- | --- | --- |
| Reserve | `reserved += cost` (fails if available < cost) | `reserve:<jobId>` |
| Capture | `reserved −= reserved`, `balance −= charge` | `capture:<jobId>` |
| Release | `reserved −= reserved` (refund) | `release:<jobId>` |

Every mutation is a `CreditTransaction` with a unique `idempotencyKey`, so a
retried worker or duplicate webhook can never double-charge or double-refund
(spec §28, §70–§72). Release is a no-op once a job is captured.

## Generation lifecycle

```
estimate cost → reserve → run generation → quality gate
  ├─ pass  → capture(actual ≤ reserved) → COMPLETED
  └─ fail  → release (full refund)       → FAILED
```

Implemented in `apps/api/src/billing/credits.service.ts` and driven by
`GenerationProcessor`. Unit tests cover reserve/insufficient/capture/release +
idempotency (`credits.service.test.ts`).

## Plans

Plans are DB rows (`Plan`) seeded from `packages/database/prisma/seed.ts` — never
hardcoded across the UI. Fields: monthly credits, storage, parallel generations,
max quality tier, private assets, API access, priority queue. FREE / STARTER /
PRO / STUDIO / ENTERPRISE ship by default; edit rows or the seed to change
pricing.

## Payments

`PaymentProvider` is an interface; Stripe is the first adapter. Subscription
logic is decoupled from Stripe via a webhook/event abstraction. Webhooks are
authenticated, **idempotent** (`Payment.eventId` unique), and logged.

## Internal cost engine

Each job records a `GenerationCost` (provider, GPU type, runtime, estimated GPU
USD, credits charged) so margins are auditable (spec §54).
