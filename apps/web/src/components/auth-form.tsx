'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { brand } from '@/lib/brand';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const payload = {
      email: String(form.get('email')),
      password: String(form.get('password')),
      ...(mode === 'register' ? { displayName: String(form.get('displayName') || '') } : {}),
    };
    try {
      await api.post(`/auth/${mode}`, payload);
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Link href="/" className="mb-8 text-sm font-semibold tracking-tight">
        {brand.name}
      </Link>
      <h1 className="text-2xl font-semibold">
        {mode === 'login' ? 'Welcome back' : 'Create your account'}
      </h1>
      <p className="mt-1 text-sm text-content-muted">
        {mode === 'login' ? 'Sign in to continue creating.' : 'Start with free credits, no card required.'}
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        {mode === 'register' && (
          <div>
            <Label htmlFor="displayName">Name</Label>
            <Input id="displayName" name="displayName" placeholder="Ada Lovelace" autoComplete="name" />
          </div>
        )}
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required placeholder="you@example.com" autoComplete="email" />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={mode === 'register' ? 10 : 1}
            placeholder="••••••••••"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </div>

        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-content-muted">
        {mode === 'login' ? (
          <>
            No account?{' '}
            <Link href="/register" className="text-accent hover:underline">
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <Link href="/login" className="text-accent hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
