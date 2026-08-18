'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, Download, PencilRuler, Wand2 } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { api, ApiRequestError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ViewerPanel } from '@/components/viewer/viewer-panel';
import { cn } from '@/lib/utils';

interface JobResponse {
  id: string;
  status: string;
  resultAssetId?: string | null;
}

const MODES = [
  { value: 'FAST', label: 'Fast' },
  { value: 'BALANCED', label: 'Balanced' },
  { value: 'QUALITY', label: 'Quality' },
  { value: 'GAME_READY', label: 'Game-ready' },
] as const;

const EXAMPLES = [
  'A realistic Viking axe, 15k polygons maximum, PBR texture, optimized for Unity',
  'A low-poly pine tree',
  'A photorealistic ceramic teapot',
  'A stylized treasure chest with iron bands',
];

const STAGE_LABELS: Record<string, string> = {
  PROMPT_ANALYSIS: 'Analyzing prompt',
  PROMPT_ENHANCEMENT: 'Enhancing prompt',
  CONCEPT_IMAGE: 'Generating concept image',
  IMAGE_PREPROCESS: 'Preprocessing image',
  SHAPE_GENERATION: 'Generating geometry',
  TEXTURE_GENERATION: 'Applying textures',
  POSTPROCESS: 'Optimizing',
  QUALITY_CHECK: 'Validating',
  EXPORT: 'Exporting',
};

type Phase = 'idle' | 'generating' | 'done' | 'error';

export default function TextTo3DPage() {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState('BALANCED');
  const [requirePbr, setRequirePbr] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => () => esRef.current?.close(), []);

  async function generate() {
    if (prompt.trim().length < 2) return;
    setError(null);
    setPhase('generating');
    setProgress(0);
    setStage('Queued');
    setModelUrl(null);
    setAssetId(null);
    try {
      const job = await api.post<JobResponse>('/generations/text-to-3d', {
        prompt: prompt.trim(),
        mode,
        requirePbr,
        idempotencyKey: crypto.randomUUID(),
      });
      streamJob(job.id);
    } catch (err) {
      setPhase('error');
      setError(err instanceof ApiRequestError ? err.message : 'Generation failed to start');
    }
  }

  function streamJob(jobId: string) {
    esRef.current?.close();
    const es = new EventSource(`/api/v1/jobs/${jobId}/stream`, { withCredentials: true });
    esRef.current = es;
    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data) as { status: string; progress: number; stage?: string };
        setProgress(data.progress);
        setStage(data.stage ? (STAGE_LABELS[data.stage] ?? data.stage) : data.status);
        if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(data.status)) {
          es.close();
          if (data.status === 'COMPLETED') void finish(jobId);
          else {
            setPhase('error');
            setError('Generation failed');
          }
        }
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      es.close();
      void poll(jobId);
    };
  }

  async function poll(jobId: string) {
    for (let i = 0; i < 80; i++) {
      const job = await api.get<JobResponse>(`/jobs/${jobId}`).catch(() => null);
      if (job?.status === 'COMPLETED') return finish(jobId);
      if (job && ['FAILED', 'CANCELLED'].includes(job.status)) {
        setPhase('error');
        setError('Generation failed');
        return;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  async function finish(jobId: string) {
    const job = await api.get<JobResponse>(`/jobs/${jobId}`);
    if (!job.resultAssetId) {
      setPhase('error');
      setError('No asset produced');
      return;
    }
    const dl = await api.get<{ url: string }>(`/assets/${job.resultAssetId}/download`);
    setAssetId(job.resultAssetId);
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
            <Wand2 className="h-5 w-5 text-accent" /> Text to 3D
          </h1>
          <p className="mt-1 text-sm text-content-muted">
            Describe an object — we generate a concept image, then a 3D model.
          </p>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="A realistic Viking axe, 15k polygons, PBR, optimized for Unity"
            className="mt-5 w-full resize-none rounded-lg border border-border bg-surface-raised p-3 text-sm text-content placeholder:text-content-faint focus-visible:border-accent focus-visible:outline-none"
          />

          <div className="mt-3 flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setPrompt(ex)}
                className="rounded-full border border-border px-2.5 py-1 text-[11px] text-content-muted hover:bg-surface-raised"
              >
                {ex.length > 34 ? ex.slice(0, 34) + '…' : ex}
              </button>
            ))}
          </div>

          <div className="mt-6">
            <p className="mb-2 text-xs font-medium text-content-muted">Quality</p>
            <div className="grid grid-cols-4 gap-1.5">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMode(m.value)}
                  className={cn(
                    'rounded-lg border px-1 py-2 text-[11px] transition-colors',
                    mode === m.value
                      ? 'border-accent bg-accent-soft text-content'
                      : 'border-border text-content-muted hover:bg-surface-raised',
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <label className="mt-4 flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm">
            <span className="text-content-muted">PBR textures</span>
            <input
              type="checkbox"
              checked={requirePbr}
              onChange={(e) => setRequirePbr(e.target.checked)}
              className="accent-accent"
            />
          </label>

          <Button
            onClick={generate}
            size="lg"
            disabled={prompt.trim().length < 2 || busy}
            className="mt-6 w-full gap-2"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy ? 'Generating…' : 'Generate'}
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
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
          <div className="min-h-0 flex-1">
            <ViewerPanel url={modelUrl} />
          </div>
          {phase === 'done' && assetId && (
            <div className="mt-4 flex gap-2">
              <Link href={`/editor/${assetId}`}>
                <Button variant="secondary" className="gap-2">
                  <PencilRuler className="h-4 w-4" /> Open in editor
                </Button>
              </Link>
              {modelUrl && (
                <a href={modelUrl} download>
                  <Button className="gap-2">
                    <Download className="h-4 w-4" /> Download GLB
                  </Button>
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
