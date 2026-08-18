'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Webhook, Trash2, Copy, Check, Plus, Loader2 } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { api, ApiRequestError } from '@/lib/api';
import { Card, CardMuted, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  last4: string;
  scopes: string[];
  livemode: boolean;
  lastUsedAt?: string | null;
}
interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
}

const SCOPES = ['generations:read', 'generations:write', 'assets:read', 'assets:write'];
const EVENTS = ['generation.started', 'generation.completed', 'generation.failed', 'asset.created'];

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [hooks, setHooks] = useState<WebhookEndpoint[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [hookUrl, setHookUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    Promise.all([api.get<ApiKey[]>('/api-keys'), api.get<WebhookEndpoint[]>('/webhooks')])
      .then(([k, w]) => {
        setKeys(k);
        setHooks(w);
      })
      .catch(() => setError('Could not load developer settings.'))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function createKey(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await api.post<{ key: string }>('/api-keys', {
        name: keyName || 'API key',
        scopes: SCOPES,
      });
      setNewKey(res.key);
      setKeyName('');
      load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to create key');
    }
  }

  async function revokeKey(id: string) {
    await api.del(`/api-keys/${id}`).catch(() => undefined);
    load();
  }

  async function createHook(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await api.post<{ secret: string }>('/webhooks', { url: hookUrl, events: EVENTS });
      setNewSecret(res.secret);
      setHookUrl('');
      load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to create webhook');
    }
  }

  async function deleteHook(id: string) {
    await api.del(`/webhooks/${id}`).catch(() => undefined);
    load();
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="text-xl font-semibold">Developer</h1>
        <p className="mt-1 text-sm text-content-muted">API keys and webhooks for the VEYRA API.</p>

        {error && (
          <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        {newKey && (
          <div className="mt-4 rounded-lg border border-accent/40 bg-accent-soft p-3">
            <p className="text-xs text-content-muted">
              Copy your API key now — it is shown only once.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded bg-surface px-2 py-1.5 font-mono text-xs">
                {newKey}
              </code>
              <Button size="sm" variant="secondary" onClick={() => copy(newKey)}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}

        <h2 className="mb-3 mt-8 flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="h-4 w-4" /> API keys
        </h2>
        <form onSubmit={createKey} className="flex gap-2">
          <Input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="Key name" className="max-w-xs" />
          <Button type="submit" className="gap-2">
            <Plus className="h-4 w-4" /> Create key
          </Button>
        </form>

        {loading ? (
          <p className="mt-4 text-content-faint">Loading…</p>
        ) : keys.length === 0 ? (
          <Card className="mt-4">
            <CardMuted>No API keys yet.</CardMuted>
          </Card>
        ) : (
          <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-surface">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm text-content">
                    {k.name}{' '}
                    <span className="ml-1 rounded bg-surface-raised px-1.5 py-0.5 text-[10px] uppercase text-content-faint">
                      {k.livemode ? 'live' : 'test'}
                    </span>
                  </p>
                  <p className="font-mono text-xs text-content-faint">
                    {k.prefix}…{k.last4} · {k.scopes.join(', ')}
                  </p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => revokeKey(k.id)} title="Revoke">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <h2 className="mb-3 mt-10 flex items-center gap-2 text-sm font-semibold">
          <Webhook className="h-4 w-4" /> Webhooks
        </h2>
        {newSecret && (
          <div className="mb-3 rounded-lg border border-accent/40 bg-accent-soft p-3">
            <p className="text-xs text-content-muted">Signing secret (shown once):</p>
            <code className="mt-1 block overflow-x-auto rounded bg-surface px-2 py-1.5 font-mono text-xs">
              {newSecret}
            </code>
          </div>
        )}
        <form onSubmit={createHook} className="flex gap-2">
          <Input
            value={hookUrl}
            onChange={(e) => setHookUrl(e.target.value)}
            placeholder="https://your-app.com/webhooks/veyra"
            className="max-w-md"
          />
          <Button type="submit" className="gap-2">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </form>
        {!loading && hooks.length === 0 ? (
          <Card className="mt-4">
            <CardMuted>No webhooks configured.</CardMuted>
          </Card>
        ) : (
          <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-surface">
            {hooks.map((h) => (
              <div key={h.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-content">{h.url}</p>
                  <p className="text-[11px] text-content-faint">{h.events.join(', ')}</p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => deleteHook(h.id)} title="Delete">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Card className="mt-8">
          <CardTitle>Using the API</CardTitle>
          <CardMuted className="mt-2">
            Authenticate with{' '}
            <code className="rounded bg-surface-raised px-1 py-0.5 font-mono text-xs">
              Authorization: Bearer &lt;key&gt;
            </code>
            . Example:
          </CardMuted>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-canvas p-3 font-mono text-xs text-content-muted">
{`curl -X POST $API/v1/generations/text-to-3d \\
  -H "Authorization: Bearer vyr_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt":"a low-poly pine tree"}'`}
          </pre>
        </Card>
      </div>
    </AppShell>
  );
}
