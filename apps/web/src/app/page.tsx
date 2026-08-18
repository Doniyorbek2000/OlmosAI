import Link from 'next/link';
import { ArrowRight, Boxes, Cpu, Gauge, Layers, Package, Wand2 } from 'lucide-react';
import { brand } from '@/lib/brand';
import { Button } from '@/components/ui/button';

const features = [
  { icon: Wand2, title: 'Text & Image to 3D', body: 'Turn a prompt or a photo into a clean, textured mesh.' },
  { icon: Layers, title: 'PBR materials', body: 'Base color, normal, roughness, metallic, AO, emissive.' },
  { icon: Gauge, title: 'Optimize & remesh', body: 'Decimate, retopo, and generate LODs for any budget.' },
  { icon: Package, title: 'Game-ready export', body: 'GLB, FBX, OBJ, STL for Unity, Unreal, Godot, and web.' },
  { icon: Cpu, title: 'Smart model routing', body: 'The best engine is chosen automatically per request.' },
  { icon: Boxes, title: 'Browser 3D editor', body: 'Inspect, edit materials, and export — no install.' },
];

export default function LandingPage() {
  return (
    <main className="relative">
      <header className="sticky top-0 z-20 border-b border-border bg-canvas/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <span className="text-sm font-semibold tracking-tight">{brand.name}</span>
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

      <section className="grid-bg border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-28 text-center">
          <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-content-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            AI 3D creation, end to end
          </div>
          <h1 className="mx-auto max-w-3xl text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
            {brand.tagline}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-content-muted">
            Input, generate, edit, export. {brand.name} hides the complexity of AI 3D models behind
            one clean workflow — built for real GPU workloads and real teams.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link href="/register">
              <Button size="lg" className="gap-2">
                Start creating <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="secondary">
                Sign in
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-surface p-5">
              <f.icon className="h-5 w-5 text-accent" />
              <h3 className="mt-3 text-sm font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-content-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8 text-xs text-content-faint">
          <span>
            © {new Date().getFullYear()} {brand.name}
          </span>
          <div className="flex gap-4">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
