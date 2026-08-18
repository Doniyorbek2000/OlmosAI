'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Check, Mail, Trash2, Languages } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { api } from '@/lib/api';
import { Card, CardMuted, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LOCALE_NAMES, useTranslation, type Locale } from '@/i18n';

interface Me {
  email: string;
  displayName?: string;
  role?: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const { locale, setLocale } = useTranslation();
  const [me, setMe] = useState<Me | null>(null);
  const [resent, setResent] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.get<Me>('/auth/me').then(setMe).catch(() => undefined);
  }, []);

  async function resendVerification() {
    await api.post('/auth/resend-verification').catch(() => undefined);
    setResent(true);
  }

  async function deleteAccount() {
    setDeleting(true);
    await api.del('/auth/account').catch(() => undefined);
    router.replace('/');
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-xl font-semibold">Settings</h1>

        <Card className="mt-6">
          <CardTitle>Account</CardTitle>
          <div className="mt-3 space-y-1 text-sm">
            <p className="text-content-muted">
              Email: <span className="text-content">{me?.email ?? '…'}</span>
            </p>
            <p className="text-content-muted">
              Name: <span className="text-content">{me?.displayName ?? '—'}</span>
            </p>
          </div>
          <Button variant="secondary" size="sm" className="mt-4 gap-2" disabled={resent} onClick={resendVerification}>
            {resent ? <Check className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
            {resent ? 'Verification sent' : 'Resend email verification'}
          </Button>
        </Card>

        <Card className="mt-4">
          <CardTitle className="flex items-center gap-2">
            <Languages className="h-4 w-4" /> Language
          </CardTitle>
          <div className="mt-3 flex gap-2">
            {(Object.keys(LOCALE_NAMES) as Locale[]).map((l) => (
              <Button key={l} size="sm" variant={locale === l ? 'primary' : 'secondary'} onClick={() => setLocale(l)}>
                {LOCALE_NAMES[l]}
              </Button>
            ))}
          </div>
        </Card>

        <Card className="mt-4 border-danger/30">
          <CardTitle className="text-danger">Danger zone</CardTitle>
          <CardMuted className="mt-1">
            Deleting your account removes your projects, assets, and data. This cannot be undone.
          </CardMuted>
          {confirmingDelete ? (
            <div className="mt-4 flex gap-2">
              <Button variant="danger" size="sm" className="gap-2" disabled={deleting} onClick={deleteAccount}>
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Yes, delete my account
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="danger" size="sm" className="mt-4 gap-2" onClick={() => setConfirmingDelete(true)}>
              <Trash2 className="h-4 w-4" /> Delete account
            </Button>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
