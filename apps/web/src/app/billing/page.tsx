'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Coins, CreditCard, Check, Loader2, ExternalLink } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { api, ApiRequestError } from '@/lib/api';
import { Card, CardMuted, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/utils';

interface Plan {
  id: string;
  key: string;
  name: string;
  priceCentsMonthly: number;
  monthlyCredits: number;
  storageGb: number;
  parallelGenerations: number;
  maxQualityTier: string;
  apiAccess: boolean;
  priorityQueue: boolean;
}
interface Txn {
  id: string;
  type: string;
  amount: number;
  reason?: string | null;
  createdAt: string;
}
interface Pack {
  key: string;
  name: string;
  credits: number;
  priceCents: number;
}
interface Summary {
  balance: { balance: number; reserved: number; available: number };
  subscription?: { status: string; plan?: { key: string; name: string } } | null;
  recentTransactions: Txn[];
  paymentsEnabled: boolean;
  creditPacks: Pack[];
}

const money = (cents: number) => `$${(cents / 100).toFixed(0)}`;

export default function BillingPage() {
  return (
    <Suspense fallback={<AppShell><div className="p-8 text-content-faint">Loading…</div></AppShell>}>
      <BillingInner />
    </Suspense>
  );
}

function BillingInner() {
  const searchParams = useSearchParams();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = searchParams.get('status');

  useEffect(() => {
    Promise.all([api.get<Summary>('/billing/summary'), api.get<Plan[]>('/billing/plans')])
      .then(([s, p]) => {
        setSummary(s);
        setPlans(p);
      })
      .catch(() => setError('Could not load billing.'))
      .finally(() => setLoading(false));
  }, []);

  async function checkout(kind: 'subscription' | 'credits', key: string) {
    setError(null);
    setPending(key);
    try {
      const body = kind === 'subscription' ? { planKey: key } : { packKey: key };
      const res = await api.post<{ url: string }>(`/billing/checkout/${kind}`, body);
      window.location.href = res.url;
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Checkout unavailable');
      setPending(null);
    }
  }

  async function openPortal() {
    setError(null);
    setPending('portal');
    try {
      const res = await api.post<{ url: string }>('/billing/portal');
      window.location.href = res.url;
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Billing portal unavailable');
      setPending(null);
    }
  }

  const currentPlanKey = summary?.subscription?.plan?.key;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl p-8">
        <h1 className="text-xl font-semibold">Billing</h1>
        <p className="mt-1 text-sm text-content-muted">Manage your plan and credits.</p>

        {status === 'success' && (
          <div className="mt-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
            Payment successful — your balance updates shortly after the webhook is processed.
          </div>
        )}
        {status === 'cancel' && (
          <div className="mt-4 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-content-muted">
            Checkout canceled.
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        {loading ? (
          <p className="mt-6 flex items-center gap-2 text-content-faint">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Card>
                <CardMuted>Available credits</CardMuted>
                <p className="mt-1 flex items-center gap-2 text-2xl font-semibold tabular-nums">
                  <Coins className="h-5 w-5 text-accent" />
                  {formatNumber(summary?.balance.available ?? 0)}
                </p>
                {summary && summary.balance.reserved > 0 && (
                  <CardMuted className="mt-1">{summary.balance.reserved} reserved</CardMuted>
                )}
              </Card>
              <Card>
                <CardMuted>Current plan</CardMuted>
                <p className="mt-1 text-2xl font-semibold">
                  {summary?.subscription?.plan?.name ?? 'Free'}
                </p>
                <CardMuted className="mt-1">{summary?.subscription?.status ?? 'ACTIVE'}</CardMuted>
              </Card>
              <Card className="flex flex-col justify-between">
                <CardMuted>Manage payment methods & invoices</CardMuted>
                <Button
                  variant="secondary"
                  className="mt-3 gap-2"
                  disabled={!summary?.paymentsEnabled || pending === 'portal'}
                  onClick={openPortal}
                >
                  <ExternalLink className="h-4 w-4" /> Billing portal
                </Button>
              </Card>
            </div>

            {!summary?.paymentsEnabled && (
              <p className="mt-4 text-xs text-content-faint">
                Payments are not configured in this environment. Plans and packs are shown for
                reference; checkout is disabled.
              </p>
            )}

            <h2 className="mb-3 mt-10 text-sm font-semibold">Plans</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((p) => {
                const current = p.key === currentPlanKey;
                return (
                  <Card key={p.id} className={current ? 'border-accent' : ''}>
                    <CardTitle>{p.name}</CardTitle>
                    <p className="mt-2 text-2xl font-semibold">
                      {money(p.priceCentsMonthly)}
                      <span className="text-sm font-normal text-content-faint">/mo</span>
                    </p>
                    <ul className="mt-3 space-y-1 text-xs text-content-muted">
                      <li>{formatNumber(p.monthlyCredits)} credits / mo</li>
                      <li>{p.storageGb} GB storage</li>
                      <li>{p.parallelGenerations} parallel jobs</li>
                      <li>Up to {p.maxQualityTier}</li>
                      {p.apiAccess && <li>API access</li>}
                      {p.priorityQueue && <li>Priority queue</li>}
                    </ul>
                    <Button
                      className="mt-4 w-full gap-2"
                      variant={current ? 'secondary' : 'primary'}
                      disabled={current || !summary?.paymentsEnabled || p.priceCentsMonthly === 0 || pending === p.key}
                      onClick={() => checkout('subscription', p.key)}
                    >
                      {pending === p.key ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : current ? (
                        <>
                          <Check className="h-4 w-4" /> Current
                        </>
                      ) : (
                        'Choose'
                      )}
                    </Button>
                  </Card>
                );
              })}
            </div>

            <h2 className="mb-3 mt-10 text-sm font-semibold">Buy credits</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {(summary?.creditPacks ?? []).map((pack) => (
                <Card key={pack.key}>
                  <CardTitle>{pack.name}</CardTitle>
                  <p className="mt-2 text-2xl font-semibold">{money(pack.priceCents)}</p>
                  <Button
                    className="mt-4 w-full gap-2"
                    variant="secondary"
                    disabled={!summary?.paymentsEnabled || pending === pack.key}
                    onClick={() => checkout('credits', pack.key)}
                  >
                    {pending === pack.key ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <CreditCard className="h-4 w-4" /> Buy
                      </>
                    )}
                  </Button>
                </Card>
              ))}
            </div>

            <h2 className="mb-3 mt-10 text-sm font-semibold">Recent transactions</h2>
            {summary && summary.recentTransactions.length > 0 ? (
              <div className="divide-y divide-border rounded-xl border border-border bg-surface">
                {summary.recentTransactions.map((t) => (
                  <div key={t.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div>
                      <span className="text-content">{t.reason ?? t.type}</span>
                      <span className="ml-2 text-xs uppercase tracking-wide text-content-faint">
                        {t.type}
                      </span>
                    </div>
                    <span className={t.amount >= 0 ? 'tabular-nums text-success' : 'tabular-nums text-content-muted'}>
                      {t.amount >= 0 ? '+' : ''}
                      {t.amount}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <Card>
                <CardMuted>No transactions yet.</CardMuted>
              </Card>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
