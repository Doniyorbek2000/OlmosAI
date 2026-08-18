'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Globe, Loader2, Sparkles } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { api, ApiRequestError } from '@/lib/api';
import { Card, CardMuted } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface WorldRow {
  id: string;
  name: string;
  prompt?: string;
  createdAt: string;
  _count?: { objects: number };
}
interface JobResponse {
  id: string;
  status: string;
  resultAssetId?: string | null;
}

export default function WorldsPage() {
  const router = useRouter();
  const [worlds, setWorlds] = useState<WorldRow[]>([]);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  function load() {
    api
      .get<WorldRow[]>('/worlds')
      .then(setWorlds)
      .catch((err) =>
        setError(err instanceof ApiRequestError && err.code === 'FORBIDDEN' ? 'World generation is not enabled in this environment.' : null),
      )
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    load();
    return () => esRef.current?.close();
  }, []);

  async function generate() {
    if (prompt.trim().length < 2) return;
    setError(null);
    setBusy(true);
    setProgress(0);
    setStage('Queued');
    try {
      const job = await api.post<JobResponse>('/worlds', { prompt: prompt.trim(), idempotencyKey: crypto.randomUUID() });
      const es = new EventSource(`/api/v1/jobs/${job.id}/stream`, { withCredentials: true });
      esRef.current = es;
      es.onmessage = async (evt) => {
        const d = JSON.parse(evt.data) as { status: string; progress: number; stage?: string; message?: string };
        setProgress(d.progress);
        setStage(d.message ?? d.stage ?? d.status);
        if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(d.status)) {
          es.close();
          setBusy(false);
          if (d.status === 'COMPLETED') {
            const done = await api.get<JobResponse>(`/jobs/${job.id}`);
            if (done.resultAssetId) router.push(`/worlds/${done.resultAssetId}`);
          } else {
            setError('World generation failed');
          }
        }
      };
      es.onerror = () => {
        es.close();
        setBusy(false);
      };
    } catch (err) {
      setBusy(false);
      setError(err instanceof ApiRequestError ? err.message : 'Failed to start');
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl p-8">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Globe className="h-5 w-5 text-accent" /> Worlds
        </h1>
        <p className="mt-1 text-sm text-content-muted">Generate explorable 3D worlds from a prompt.</p>

        <div className="mt-6 flex gap-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="a misty pine forest valley at dawn"
            className="h-11 flex-1 rounded-lg border border-border bg-surface-raised px-3 text-sm text-content placeholder:text-content-faint focus-visible:border-accent focus-visible:outline-none"
          />
          <Button onClick={generate} disabled={busy || prompt.trim().length < 2} size="lg" className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate
          </Button>
        </div>

        {busy && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-content-muted">
              <span>{stage}</span>
              <span className="tabular-nums">{progress}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        {loading ? (
          <p className="mt-6 text-content-faint">Loading…</p>
        ) : worlds.length === 0 ? (
          <Card className="mt-6">
            <CardMuted>No worlds yet.</CardMuted>
          </Card>
        ) : (
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {worlds.map((w) => (
              <Link key={w.id} href={`/worlds/${w.id}`}>
                <Card className="transition-colors hover:bg-surface-raised">
                  <div className="flex h-24 items-center justify-center rounded-lg bg-surface-raised">
                    <Globe className="h-8 w-8 text-content-faint" />
                  </div>
                  <p className="mt-3 truncate text-sm font-medium">{w.name}</p>
                  <p className="mt-0.5 text-xs text-content-faint">{w._count?.objects ?? 0} objects</p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
