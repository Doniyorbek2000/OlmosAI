'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, Box, Lightbulb, Camera, Mountain, Cloud, Loader2 } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ViewerPanel } from '@/components/viewer/viewer-panel';

interface WorldObject {
  id: string;
  type: string;
  name: string;
  data?: Record<string, unknown>;
}
interface World {
  id: string;
  name: string;
  prompt?: string;
  providerId?: string;
  environment?: Record<string, unknown>;
  objects: WorldObject[];
}

const ICON: Record<string, typeof Box> = {
  TERRAIN: Mountain,
  MESH: Box,
  LIGHT: Lightbulb,
  CAMERA: Camera,
  ENVIRONMENT: Cloud,
};

export default function WorldViewerPage() {
  const params = useParams<{ id: string }>();
  const [world, setWorld] = useState<World | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = params.id;
    api
      .get<World>(`/worlds/${id}`)
      .then(async (w) => {
        setWorld(w);
        const dl = await api.get<{ url: string }>(`/worlds/${id}/download`);
        setUrl(dl.url);
      })
      .catch(() => setError('Could not load this world.'));
  }, [params.id]);

  const grouped = (world?.objects ?? []).reduce<Record<string, WorldObject[]>>((acc, o) => {
    (acc[o.type] ??= []).push(o);
    return acc;
  }, {});

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        <div className="flex h-14 items-center justify-between border-b border-border px-6">
          <div className="flex items-center gap-3">
            <Link href="/worlds">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <p className="text-sm font-medium">{world?.name ?? 'Loading…'}</p>
              <p className="text-xs text-content-faint">{world?.providerId ?? ''}</p>
            </div>
          </div>
          {url && (
            <a href={url} download>
              <Button className="gap-2">
                <Download className="h-4 w-4" /> Export world GLB
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
            <h2 className="text-sm font-semibold">Scene</h2>
            {world ? (
              <div className="mt-4 space-y-4">
                {Object.entries(grouped).map(([type, items]) => {
                  const Icon = ICON[type] ?? Box;
                  return (
                    <div key={type}>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-content-faint">
                        {type} ({items.length})
                      </p>
                      {items.map((o) => (
                        <div key={o.id} className="flex items-center gap-2 py-1 text-sm text-content-muted">
                          <Icon className="h-3.5 w-3.5 text-content-faint" />
                          <span className="truncate">{o.name}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
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
