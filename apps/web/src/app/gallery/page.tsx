'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Heart, Eye, Boxes } from 'lucide-react';
import { api } from '@/lib/api';
import { brand } from '@/lib/brand';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/utils';

interface GalleryItem {
  id: string;
  name: string;
  provider?: string;
  likeCount: number;
  viewCount: number;
  creator: string;
  prompt?: string | null;
}

export default function GalleryPage() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [sort, setSort] = useState<'recent' | 'popular'>('recent');
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .get<GalleryItem[]>(`/gallery?sort=${sort}`)
      .then(setItems)
      .catch(() => setDisabled(true))
      .finally(() => setLoading(false));
  }, [sort]);

  async function like(id: string) {
    try {
      await api.post(`/assets/${id}/like`);
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, likeCount: i.likeCount + 1 } : i)));
    } catch {
      window.location.href = '/login';
    }
  }

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-canvas/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            {brand.name}
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Get started</Button>
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Gallery</h1>
            <p className="mt-1 text-sm text-content-muted">Community-shared 3D creations.</p>
          </div>
          <div className="flex gap-1.5">
            {(['recent', 'popular'] as const).map((s) => (
              <Button key={s} size="sm" variant={sort === s ? 'primary' : 'secondary'} onClick={() => setSort(s)}>
                {s === 'recent' ? 'Recent' : 'Popular'}
              </Button>
            ))}
          </div>
        </div>

        {disabled ? (
          <p className="mt-8 text-content-faint">The public gallery is not enabled.</p>
        ) : loading ? (
          <p className="mt-8 text-content-faint">Loading…</p>
        ) : items.length === 0 ? (
          <p className="mt-8 text-content-faint">No public creations yet.</p>
        ) : (
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <div key={item.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex h-32 items-center justify-center rounded-lg bg-surface-raised">
                  <Boxes className="h-10 w-10 text-content-faint" />
                </div>
                <p className="mt-3 truncate text-sm font-medium">{item.name}</p>
                {item.prompt && <p className="mt-1 line-clamp-2 text-xs text-content-faint">{item.prompt}</p>}
                <div className="mt-3 flex items-center justify-between text-xs text-content-muted">
                  <span>by {item.creator}</span>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" /> {formatNumber(item.viewCount)}
                    </span>
                    <button onClick={() => like(item.id)} className="flex items-center gap-1 hover:text-accent">
                      <Heart className="h-3.5 w-3.5" /> {formatNumber(item.likeCount)}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
