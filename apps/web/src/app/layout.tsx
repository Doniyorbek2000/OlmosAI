import type { Metadata } from 'next';
import './globals.css';
import { brand } from '@/lib/brand';

export const metadata: Metadata = {
  title: `${brand.name} — ${brand.tagline}`,
  description:
    'Generate production-ready 3D models from text and images. PBR texturing, mesh optimization, and game-ready export in one AI-powered platform.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
