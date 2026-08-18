'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Box, Grid3x3, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/utils';
import type { ViewerStats } from './model-viewer';

// Three.js must never render on the server.
const ModelViewer = dynamic(() => import('./model-viewer').then((m) => m.ModelViewer), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-content-faint">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  ),
});

interface ViewerPanelProps {
  url: string | null;
  className?: string;
}

/** The viewport with a floating toolbar and live asset stats. */
export function ViewerPanel({ url }: ViewerPanelProps) {
  const [wireframe, setWireframe] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [environment, setEnvironment] = useState(true);
  const [stats, setStats] = useState<ViewerStats | null>(null);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-border bg-canvas grid-bg">
      {url ? (
        <ModelViewer
          url={url}
          wireframe={wireframe}
          showGrid={showGrid}
          environment={environment}
          onStats={setStats}
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-content-faint">
          <Box className="h-10 w-10" />
          <p className="text-sm">No model loaded yet</p>
        </div>
      )}

      {url && (
        <>
          <div className="absolute left-3 top-3 flex gap-1.5">
            <Button
              size="icon"
              variant={wireframe ? 'primary' : 'secondary'}
              title="Wireframe"
              onClick={() => setWireframe((v) => !v)}
            >
              <Box className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant={showGrid ? 'primary' : 'secondary'}
              title="Grid"
              onClick={() => setShowGrid((v) => !v)}
            >
              <Grid3x3 className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant={environment ? 'primary' : 'secondary'}
              title="Environment lighting"
              onClick={() => setEnvironment((v) => !v)}
            >
              <Sparkles className="h-4 w-4" />
            </Button>
          </div>

          {stats && (
            <div className="absolute bottom-3 left-3 rounded-lg border border-border bg-surface/90 px-3 py-2 text-xs text-content-muted backdrop-blur">
              <span className="mr-3">
                <span className="text-content-faint">Verts</span> {formatNumber(stats.vertices)}
              </span>
              <span className="mr-3">
                <span className="text-content-faint">Tris</span> {formatNumber(stats.triangles)}
              </span>
              <span className="mr-3">
                <span className="text-content-faint">Meshes</span> {stats.meshes}
              </span>
              <span>
                <span className="text-content-faint">Mats</span> {stats.materials}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
