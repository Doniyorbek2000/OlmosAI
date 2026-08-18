'use client';

import Link from 'next/link';
import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { brand } from '@/lib/brand';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="p-8 text-content-faint">Loading…</div>}>
      <ResetInner />
    </Suspense>
  );
}

function ResetInner() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const password = String(new FormData(e.currentTarget).get('password'));
    try {
      await api.post('/auth/reset-password', { token, password });
      router.push('/login');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Reset failed');
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Link href="/" className="mb-8 text-sm font-semibold tracking-tight">{brand.name}</Link>
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      {!token ? (
        <p className="mt-4 text-sm text-danger">Missing or invalid reset token.</p>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div>
            <Label htmlFor="password">New password</Label>
            <Input id="password" name="password" type="password" required minLength={10} placeholder="••••••••••" autoComplete="new-password" />
          </div>
          {error && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />} Reset password
          </Button>
        </form>
      )}
    </div>
  );
}
