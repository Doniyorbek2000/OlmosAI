'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, Download, PersonStanding } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { api, ApiRequestError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ViewerPanel } from '@/components/viewer/viewer-panel';

interface JobResponse {
  id: string;
  status: string;
  resultAssetId?: string | null;
}
interface CharacterAsset {
  id: string;
  name: string;
  type: string;
}

type Phase = 'idle' | 'generating' | 'done' | 'error';

export default function MotionPage() {
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(3);
  const [characters, setCharacters] = useState<CharacterAsset[]>([]);
  const [characterId, setCharacterId] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [animationId, setAnimationId] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    api
      .get<CharacterAsset[]>('/assets?take=100')
      .then((a) => setCharacters(a.filter((x) => x.type === 'CHARACTER')))
      .catch(() => undefined);
    return () => esRef.current?.close();
  }, []);

  async function generate() {
    if (prompt.trim().length < 2) return;
    setError(null);
    setPhase('generating');
    setProgress(0);
    setStage('Queued');
    setModelUrl(null);
    try {
      const job = await api.post<JobResponse>('/motion/text-to-motion', {
        prompt: prompt.trim(),
        durationSeconds: duration,
        characterAssetId: characterId || undefined,
        idempotencyKey: crypto.randomUUID(),
      });
      stream(job.id);
    } catch (err) {
      setPhase('error');
      setError(err instanceof ApiRequestError ? err.message : 'Failed to start');
    }
  }

  function stream(jobId: string) {
    esRef.current?.close();
    const es = new EventSource(`/api/v1/jobs/${jobId}/stream`, { withCredentials: true });
    esRef.current = es;
    es.onmessage = (evt) => {
      const d = JSON.parse(evt.data) as { status: string; progress: number; stage?: string; message?: string };
      setProgress(d.progress);
      setStage(d.message ?? d.stage ?? d.status);
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(d.status)) {
        es.close();
        if (d.status === 'COMPLETED') void finish(jobId);
        else {
          setPhase('error');
          setError('Motion generation failed');
        }
      }
    };
    es.onerror = () => es.close();
  }

  async function finish(jobId: string) {
    const job = await api.get<JobResponse>(`/jobs/${jobId}`);
    if (!job.resultAssetId) {
      setPhase('error');
      setError('No animation produced');
      return;
    }
    const dl = await api.get<{ url: string }>(`/animations/${job.resultAssetId}/download`);
    setAnimationId(job.resultAssetId);
    setModelUrl(dl.url);
    setProgress(100);
    setPhase('done');
  }

  const busy = phase === 'generating';

  return (
    <AppShell>
      <div className="flex h-full">
        <div className="w-[380px] shrink-0 overflow-auto border-r border-border p-6">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <PersonStanding className="h-5 w-5 text-accent" /> Text to Motion
          </h1>
          <p className="mt-1 text-sm text-content-muted">
            Generate a rigged character animation from a description.
          </p>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="a character walking confidently"
            className="mt-5 w-full resize-none rounded-lg border border-border bg-surface-raised p-3 text-sm text-content placeholder:text-content-faint focus-visible:border-accent focus-visible:outline-none"
          />

          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium text-content-muted">Duration: {duration}s</p>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </div>

          {characters.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-medium text-content-muted">Attach to character (optional)</p>
              <select
                value={characterId}
                onChange={(e) => setCharacterId(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-surface-raised px-3 text-sm text-content focus-visible:border-accent focus-visible:outline-none"
              >
                <option value="">None</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Button onClick={generate} size="lg" disabled={prompt.trim().length < 2 || busy} className="mt-6 w-full gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy ? 'Generating…' : 'Generate motion'}
          </Button>

          {error && (
            <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col p-6">
          {busy && (
            <div className="mb-4">
              <div className="mb-1 flex justify-between text-xs text-content-muted">
                <span>{stage}</span>
                <span className="tabular-nums">{progress}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          <div className="min-h-0 flex-1">
            <ViewerPanel url={modelUrl} />
          </div>
          {phase === 'done' && animationId && modelUrl && (
            <div className="mt-4 flex gap-2">
              <a href={modelUrl} download>
                <Button className="gap-2">
                  <Download className="h-4 w-4" /> Download animated GLB
                </Button>
              </a>
              <Link href="/assets">
                <Button variant="secondary">Back to assets</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
