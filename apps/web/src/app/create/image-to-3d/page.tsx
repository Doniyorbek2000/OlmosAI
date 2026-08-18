'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Upload, Loader2, Sparkles, Download, PencilRuler, X } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { api, uploadToPresigned, ApiRequestError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ViewerPanel } from '@/components/viewer/viewer-panel';
import { cn } from '@/lib/utils';

interface PresignResponse {
  uploadId: string;
  key: string;
  upload: { url: string; headers: Record<string, string>; method: 'PUT' };
}
interface JobResponse {
  id: string;
  status: string;
  resultAssetId?: string | null;
}

const MODES = [
  { value: 'FAST', label: 'Fast', hint: 'Preview quality, lowest cost' },
  { value: 'BALANCED', label: 'Balanced', hint: 'Good quality and speed' },
  { value: 'QUALITY', label: 'Quality', hint: 'High-fidelity geometry' },
] as const;

type Phase = 'idle' | 'uploading' | 'generating' | 'done' | 'error';

export default function ImageTo3DPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [mode, setMode] = useState<string>('BALANCED');
  const [requirePbr, setRequirePbr] = useState(false);
  const [targetPolygons, setTargetPolygons] = useState<number | ''>('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => () => esRef.current?.close(), []);

  function pickFile(f: File | null) {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setPhase('idle');
    setError(null);
    setModelUrl(null);
    setAssetId(null);
  }

  async function generate() {
    if (!file) return;
    setError(null);
    setPhase('uploading');
    setProgress(0);
    setStage('Uploading');
    try {
      const contentType = file.type || 'image/png';
      const presign = await api.post<PresignResponse>('/uploads/presign', {
        filename: file.name,
        contentType,
        kind: 'image',
        sizeBytes: file.size,
      });
      await uploadToPresigned(presign.upload, file);

      setPhase('generating');
      setStage('Queued');
      const idempotencyKey = crypto.randomUUID();
      const job = await api.post<JobResponse>('/generations/image-to-3d', {
        images: [{ key: presign.key }],
        mode,
        requirePbr,
        targetPolygons: targetPolygons === '' ? undefined : Number(targetPolygons),
        idempotencyKey,
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
        const data = JSON.parse(evt.data) as {
          status: string;
          progress: number;
          stage?: string;
          message?: string;
        };
        setProgress(data.progress);
        setStage(data.message ?? data.stage ?? data.status);
        if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(data.status)) {
          es.close();
          if (data.status === 'COMPLETED') void finishJob(jobId);
          else {
            setPhase('error');
            setError(data.message ?? 'Generation failed');
          }
        }
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      // Stream ended; fall back to a status poll.
      es.close();
      void pollUntilDone(jobId);
    };
  }

  async function pollUntilDone(jobId: string) {
    for (let i = 0; i < 60; i++) {
      const job = await api.get<JobResponse>(`/jobs/${jobId}`).catch(() => null);
      if (job?.status === 'COMPLETED') return finishJob(jobId);
      if (job && ['FAILED', 'CANCELLED'].includes(job.status)) {
        setPhase('error');
        setError('Generation failed');
        return;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  async function finishJob(jobId: string) {
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

  const busy = phase === 'uploading' || phase === 'generating';

  return (
    <AppShell>
      <div className="flex h-full">
        {/* Left: controls */}
        <div className="w-[380px] shrink-0 overflow-auto border-r border-border p-6">
          <h1 className="text-lg font-semibold">Image to 3D</h1>
          <p className="mt-1 text-sm text-content-muted">Upload an image and generate a 3D model.</p>

          <div className="mt-6">
            <label
              className={cn(
                'flex h-44 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface transition-colors hover:bg-surface-raised',
                preview && 'border-solid p-2',
              )}
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="input" className="h-full w-full rounded-lg object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-content-faint">
                  <Upload className="h-6 w-6" />
                  <span className="text-sm">PNG, JPEG or WEBP</span>
                </div>
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {file && (
              <button
                onClick={() => {
                  setFile(null);
                  setPreview(null);
                }}
                className="mt-2 inline-flex items-center gap-1 text-xs text-content-faint hover:text-content"
              >
                <X className="h-3 w-3" /> Remove
              </button>
            )}
          </div>

          <div className="mt-6">
            <p className="mb-2 text-xs font-medium text-content-muted">Quality</p>
            <div className="grid grid-cols-3 gap-2">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMode(m.value)}
                  title={m.hint}
                  className={cn(
                    'rounded-lg border px-2 py-2 text-xs transition-colors',
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

          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium text-content-muted">
              Target polygons (optional)
            </p>
            <input
              type="number"
              min={100}
              placeholder="e.g. 20000"
              value={targetPolygons}
              onChange={(e) => setTargetPolygons(e.target.value === '' ? '' : Number(e.target.value))}
              className="h-10 w-full rounded-lg border border-border bg-surface-raised px-3 text-sm text-content placeholder:text-content-faint focus-visible:border-accent focus-visible:outline-none"
            />
          </div>

          <Button
            onClick={generate}
            size="lg"
            disabled={!file || busy}
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

        {/* Right: viewport */}
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
