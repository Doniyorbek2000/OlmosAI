'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Boxes } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { api } from '@/lib/api';
import { Card, CardMuted } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils';

interface AssetVersion {
  vertexCount?: number;
  qualityScore?: number;
}
interface Asset {
  id: string;
  name: string;
  type: string;
  providerId?: string;
  createdAt: string;
  versions: AssetVersion[];
}

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Asset[]>('/assets?take=60')
      .then(setAssets)
      .catch(() => setAssets([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl p-8">
        <h1 className="text-xl font-semibold">Assets</h1>
        <p className="mt-1 text-sm text-content-muted">All models you have generated.</p>

        {loading ? (
          <p className="mt-6 text-content-faint">Loading…</p>
        ) : assets.length === 0 ? (
          <Card className="mt-6">
            <CardMuted>No assets yet — generate one from Image to 3D.</CardMuted>
          </Card>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {assets.map((a) => (
              <Link key={a.id} href={`/editor/${a.id}`}>
                <Card className="transition-colors hover:bg-surface-raised">
                  <div className="flex h-24 items-center justify-center rounded-lg bg-surface-raised">
                    <Boxes className="h-8 w-8 text-content-faint" />
                  </div>
                  <p className="mt-3 truncate text-sm font-medium">{a.name}</p>
                  <p className="mt-0.5 text-xs text-content-faint">
                    {a.providerId ?? 'model'} · {formatNumber(a.versions?.[0]?.vertexCount ?? 0)} verts
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
