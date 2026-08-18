import Link from 'next/link';
import { brand } from '@/lib/brand';

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <Link href="/" className="text-sm text-content-muted hover:text-content">
        ← Back
      </Link>
      <h1 className="mt-6 text-2xl font-semibold">Privacy Policy</h1>
      <p className="mt-4 text-sm leading-relaxed text-content-muted">
        {brand.name} stores only the data required to operate your account: your email, your
        projects and generated assets, and billing records. Uploaded images and generated models are
        private by default and served through short-lived signed URLs. You can delete assets,
        projects, or your entire account at any time. This is placeholder copy for the platform
        scaffold and should be replaced with counsel-reviewed policy before launch.
      </p>
    </main>
  );
}
