'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Boxes, LayoutDashboard, Coins, FolderOpen, Wand2, LogOut, Image as ImageIcon, Type } from 'lucide-react';
import { api } from '@/lib/api';
import { brand } from '@/lib/brand';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface Me {
  email: string;
  displayName?: string;
  creditBalance?: { balance: number; reserved: number };
  subscription?: { plan?: { name: string } };
}

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/create/text-to-3d', label: 'Text to 3D', icon: Type },
  { href: '/create/image-to-3d', label: 'Image to 3D', icon: ImageIcon },
  { href: '/projects', label: 'Projects', icon: FolderOpen },
  { href: '/assets', label: 'Assets', icon: Boxes },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    api
      .get<Me>('/auth/me')
      .then(setMe)
      .catch(() => router.replace('/login'))
      .finally(() => setChecked(true));
  }, [router]);

  async function logout() {
    await api.post('/auth/logout').catch(() => undefined);
    router.replace('/login');
  }

  const available = me?.creditBalance ? me.creditBalance.balance - me.creditBalance.reserved : 0;

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface">
        <div className="flex h-16 items-center px-5 text-sm font-semibold tracking-tight">
          {brand.name}
        </div>
        <nav className="flex-1 space-y-1 px-3">
          <Link href="/create/text-to-3d">
            <Button className="mb-3 w-full gap-2">
              <Wand2 className="h-4 w-4" /> New generation
            </Button>
          </Link>
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-surface-hover text-content'
                    : 'text-content-muted hover:bg-surface-hover hover:text-content',
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <div className="mb-2 flex items-center justify-between rounded-lg bg-surface-raised px-3 py-2 text-sm">
            <span className="flex items-center gap-2 text-content-muted">
              <Coins className="h-4 w-4 text-accent" /> Credits
            </span>
            <span className="font-medium tabular-nums">{available}</span>
          </div>
          <div className="flex items-center justify-between px-1">
            <div className="min-w-0">
              <p className="truncate text-xs text-content">{me?.displayName ?? me?.email ?? '…'}</p>
              <p className="truncate text-[11px] text-content-faint">
                {me?.subscription?.plan?.name ?? 'Free'}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={logout} title="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        {checked ? children : <div className="p-8 text-content-faint">Loading…</div>}
      </main>
    </div>
  );
}
