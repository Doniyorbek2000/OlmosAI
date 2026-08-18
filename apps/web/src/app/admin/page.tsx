'use client';

import { useEffect, useState } from 'react';
import { Users, DollarSign, Boxes, AlertTriangle, Server, Loader2 } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { api, ApiRequestError } from '@/lib/api';
import { Card, CardMuted } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatBytes, formatNumber } from '@/lib/utils';

interface Overview {
  users: { total: number; activeLast30d: number };
  revenue: { totalCents: number; mrrCents: number; creditsConsumed: number; activeSubscriptions: number };
  jobs: { total: number; failed: number; queueDepth: number; byStatus: Record<string, number> };
  storageBytes: number;
  apiCalls: number;
}
interface Provider {
  id: string;
  providerId: string;
  displayName: string;
  enabled: boolean;
  priority: number;
  costMultiplier: number;
  draining: boolean;
  licenseStatus: string;
}

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <Card>
      <div className="flex items-center gap-2 text-content-muted">
        <Icon className="h-4 w-4" />
        <CardMuted>{label}</CardMuted>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </Card>
  );
}

export default function AdminPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  function load() {
    Promise.all([api.get<Overview>('/admin/overview'), api.get<Provider[]>('/admin/providers')])
      .then(([o, p]) => {
        setOverview(o);
        setProviders(p);
      })
      .catch((err) =>
        setError(err instanceof ApiRequestError && err.code === 'FORBIDDEN' ? 'Admin access required.' : 'Could not load admin data.'),
      )
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function patchProvider(providerId: string, patch: Record<string, unknown>) {
    setSaving(providerId);
    try {
      await api.patch(`/admin/providers/${providerId}`, patch);
      load();
    } catch {
      /* ignore */
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="p-8 text-content-faint">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl p-8">
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl p-8">
        <h1 className="text-xl font-semibold">Admin</h1>
        <p className="mt-1 text-sm text-content-muted">Platform overview and provider controls.</p>

        {overview && (
          <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Stat icon={Users} label="Users" value={formatNumber(overview.users.total)} />
            <Stat icon={DollarSign} label="Revenue" value={`$${(overview.revenue.totalCents / 100).toFixed(0)}`} />
            <Stat icon={DollarSign} label="MRR" value={`$${(overview.revenue.mrrCents / 100).toFixed(0)}`} />
            <Stat icon={Boxes} label="Generations" value={formatNumber(overview.jobs.total)} />
            <Stat icon={AlertTriangle} label="Failed jobs" value={formatNumber(overview.jobs.failed)} />
            <Stat icon={Server} label="Queue depth" value={formatNumber(overview.jobs.queueDepth)} />
            <Stat icon={Boxes} label="Storage" value={formatBytes(overview.storageBytes)} />
            <Stat icon={Boxes} label="API calls" value={formatNumber(overview.apiCalls)} />
          </div>
        )}

        <h2 className="mb-3 mt-10 text-sm font-semibold">Providers</h2>
        <div className="divide-y divide-border rounded-xl border border-border bg-surface">
          {providers.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm text-content">
                  {p.displayName}{' '}
                  <span className="ml-1 rounded bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] text-content-faint">
                    {p.providerId}
                  </span>
                </p>
                <p className="text-xs text-content-faint">
                  priority {p.priority} · ×{p.costMultiplier} · {p.licenseStatus}
                  {p.draining && ' · draining'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={p.enabled ? 'secondary' : 'primary'}
                  disabled={saving === p.providerId}
                  onClick={() => patchProvider(p.providerId, { enabled: !p.enabled })}
                >
                  {p.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={saving === p.providerId}
                  onClick={() => patchProvider(p.providerId, { draining: !p.draining })}
                >
                  {p.draining ? 'Resume' : 'Drain'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
