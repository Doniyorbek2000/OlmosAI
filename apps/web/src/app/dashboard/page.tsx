'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ImageIcon, Boxes, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { api } from '@/lib/api';
import { Card, CardMuted, CardTitle } from '@/components/ui/card';

interface Job {
  id: string;
  kind: string;
  status: string;
  progress: number;
  createdAt: string;
  resultAssetId?: string | null;
}

const STATUS_ICON: Record<string, typeof Clock> = {
  COMPLETED: CheckCircle2,
  FAILED: XCircle,
  CANCELLED: XCircle,
};

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Job[]>('/generations?take=8')
      .then(setJobs)
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, []);

  const completed = jobs.filter((j) => j.status === 'COMPLETED').length;
  const successRate = jobs.length ? Math.round((completed / jobs.length) * 100) : 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl p-8">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-content-muted">Your recent activity and quick actions.</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Card>
            <CardMuted>Recent generations</CardMuted>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{jobs.length}</p>
          </Card>
          <Card>
            <CardMuted>Success rate</CardMuted>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{successRate}%</p>
          </Card>
          <Card>
            <CardMuted>Completed</CardMuted>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{completed}</p>
          </Card>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Link href="/create/image-to-3d">
            <Card className="transition-colors hover:bg-surface-raised">
              <ImageIcon className="h-5 w-5 text-accent" />
              <CardTitle className="mt-3">Image to 3D</CardTitle>
              <CardMuted className="mt-1">Upload a photo and generate a textured mesh.</CardMuted>
            </Card>
          </Link>
          <Link href="/assets">
            <Card className="transition-colors hover:bg-surface-raised">
              <Boxes className="h-5 w-5 text-accent" />
              <CardTitle className="mt-3">Your assets</CardTitle>
              <CardMuted className="mt-1">Browse, open in the editor, and export.</CardMuted>
            </Card>
          </Link>
        </div>

        <h2 className="mb-3 mt-10 text-sm font-semibold">Recent jobs</h2>
        {loading ? (
          <div className="flex items-center gap-2 text-content-faint">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : jobs.length === 0 ? (
          <Card>
            <CardMuted>No generations yet. Start with Image to 3D.</CardMuted>
          </Card>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-surface">
            {jobs.map((job) => {
              const Icon = STATUS_ICON[job.status] ?? Clock;
              return (
                <div key={job.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Icon
                      className={
                        job.status === 'COMPLETED'
                          ? 'h-4 w-4 text-success'
                          : job.status === 'FAILED' || job.status === 'CANCELLED'
                            ? 'h-4 w-4 text-danger'
                            : 'h-4 w-4 text-content-faint'
                      }
                    />
                    <div>
                      <p className="text-sm text-content">{job.kind.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-content-faint">
                        {new Date(job.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  {job.resultAssetId ? (
                    <Link href={`/editor/${job.resultAssetId}`} className="text-sm text-accent hover:underline">
                      Open
                    </Link>
                  ) : (
                    <span className="text-xs uppercase tracking-wide text-content-faint">
                      {job.status.toLowerCase()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
