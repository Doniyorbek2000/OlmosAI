'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { brand } from '@/lib/brand';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const email = String(new FormData(e.currentTarget).get('email'));
    await api.post('/auth/forgot-password', { email }).catch(() => undefined);
    setSent(true);
    setLoading(false);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Link href="/" className="mb-8 text-sm font-semibold tracking-tight">{brand.name}</Link>
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      {sent ? (
        <p className="mt-4 text-sm text-content-muted">
          If an account exists for that email, a reset link is on its way. Check your inbox.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required placeholder="you@example.com" autoComplete="email" />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />} Send reset link
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-content-muted">
        <Link href="/login" className="text-accent hover:underline">Back to sign in</Link>
      </p>
    </div>
  );
}
