'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { brand } from '@/lib/brand';
import { Button } from '@/components/ui/button';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-content-faint">Loading…</div>}>
      <VerifyInner />
    </Suspense>
  );
}

function VerifyInner() {
  const token = useSearchParams().get('token') ?? '';
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    if (!token) { setState('error'); return; }
    api.post('/auth/verify-email', { token }).then(() => setState('ok')).catch(() => setState('error'));
  }, [token]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <Link href="/" className="mb-8 text-sm font-semibold tracking-tight">{brand.name}</Link>
      {state === 'loading' && <Loader2 className="h-8 w-8 animate-spin text-content-faint" />}
      {state === 'ok' && (
        <>
          <CheckCircle2 className="h-10 w-10 text-success" />
          <h1 className="mt-4 text-xl font-semibold">Email verified</h1>
          <Link href="/dashboard" className="mt-6"><Button>Go to dashboard</Button></Link>
        </>
      )}
      {state === 'error' && (
        <>
          <XCircle className="h-10 w-10 text-danger" />
          <h1 className="mt-4 text-xl font-semibold">Verification failed</h1>
          <p className="mt-1 text-sm text-content-muted">The link may be invalid or expired.</p>
        </>
      )}
    </div>
  );
}
