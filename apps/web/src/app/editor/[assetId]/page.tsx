'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Download, ArrowLeft, Loader2 } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ViewerPanel } from '@/components/viewer/viewer-panel';
import { formatBytes, formatNumber } from '@/lib/utils';

interface AssetFile {
  role: string;
  format: string;
  sizeBytes: number;
}
interface AssetVersion {
  id: string;
  version: number;
  label?: string;
  qualityScore?: number;
  vertexCount?: number;
  faceCount?: number;
  triangleCount?: number;
  materialCount?: number;
  fileSizeBytes?: number;
  files: AssetFile[];
}
interface Asset {
  id: string;
  name: string;
  type: string;
  providerId?: string;
  modelFamily?: string;
  modelVersion?: string;
  seed?: number;
  versions: AssetVersion[];
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
      <span className="text-content-muted">{label}</span>
      <span className="tabular-nums text-content">{value}</span>
    </div>
  );
}

export default function EditorPage() {
  const params = useParams<{ assetId: string }>();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = params.assetId;
    api
      .get<Asset>(`/assets/${id}`)
      .then(async (a) => {
        setAsset(a);
        const dl = await api.get<{ url: string }>(`/assets/${id}/download`);
        setUrl(dl.url);
      })
      .catch(() => setError('Could not load this asset.'));
  }, [params.assetId]);

  const version = asset?.versions?.[0];

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        <div className="flex h-14 items-center justify-between border-b border-border px-6">
          <div className="flex items-center gap-3">
            <Link href="/assets">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <p className="text-sm font-medium">{asset?.name ?? 'Loading…'}</p>
              <p className="text-xs text-content-faint">
                {asset?.modelFamily ? `${asset.modelFamily} · v${asset.modelVersion}` : ''}
              </p>
            </div>
          </div>
          {url && (
            <a href={url} download>
              <Button className="gap-2">
                <Download className="h-4 w-4" /> Export GLB
              </Button>
            </a>
          )}
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="min-h-0 flex-1 p-6">
            {error ? (
              <div className="flex h-full items-center justify-center text-content-faint">{error}</div>
            ) : (
              <ViewerPanel url={url} />
            )}
          </div>

          <aside className="w-72 shrink-0 overflow-auto border-l border-border p-5">
            <h2 className="text-sm font-semibold">Properties</h2>
            {version ? (
              <div className="mt-4">
                <Stat label="Quality score" value={version.qualityScore ?? '—'} />
                <Stat label="Vertices" value={formatNumber(version.vertexCount ?? 0)} />
                <Stat label="Faces" value={formatNumber(version.faceCount ?? 0)} />
                <Stat label="Triangles" value={formatNumber(version.triangleCount ?? 0)} />
                <Stat label="Materials" value={version.materialCount ?? 0} />
                <Stat label="File size" value={formatBytes(version.fileSizeBytes ?? 0)} />
                <Stat label="Provider" value={asset?.providerId ?? '—'} />
                <Stat label="Seed" value={asset?.seed ?? '—'} />

                <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-content-faint">
                  Files
                </h3>
                {version.files.map((f, i) => (
                  <div key={i} className="flex justify-between py-1 text-sm">
                    <span className="text-content-muted">{f.role}</span>
                    <span className="text-content">
                      {f.format} · {formatBytes(f.sizeBytes)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-2 text-content-faint">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            )}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
