'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { FolderOpen, Plus } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { api } from '@/lib/api';
import { Card, CardMuted } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Project {
  id: string;
  name: string;
  type: string;
  _count?: { assets: number };
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);

  function load() {
    api
      .get<Project[]>('/projects')
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await api.post('/projects', { name: name.trim() });
    setName('');
    load();
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl p-8">
        <h1 className="text-xl font-semibold">Projects</h1>
        <p className="mt-1 text-sm text-content-muted">Organize your generations.</p>

        <form onSubmit={create} className="mt-6 flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New project name"
            className="max-w-xs"
          />
          <Button type="submit" className="gap-2">
            <Plus className="h-4 w-4" /> Create
          </Button>
        </form>

        {loading ? (
          <p className="mt-6 text-content-faint">Loading…</p>
        ) : projects.length === 0 ? (
          <Card className="mt-6">
            <CardMuted>No projects yet.</CardMuted>
          </Card>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <Card key={p.id}>
                <FolderOpen className="h-5 w-5 text-accent" />
                <p className="mt-3 truncate text-sm font-medium">{p.name}</p>
                <p className="mt-0.5 text-xs text-content-faint">
                  {p.type} · {p._count?.assets ?? 0} assets
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
