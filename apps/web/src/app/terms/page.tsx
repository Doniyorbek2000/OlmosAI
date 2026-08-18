import Link from 'next/link';
import { brand } from '@/lib/brand';

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <Link href="/" className="text-sm text-content-muted hover:text-content">
        ← Back
      </Link>
      <h1 className="mt-6 text-2xl font-semibold">Terms of Service</h1>
      <p className="mt-4 text-sm leading-relaxed text-content-muted">
        By using {brand.name} you agree to use generated content in accordance with the licenses of
        the underlying AI models (see the model registry). Credits are consumed per successful
        generation; failed generations are refunded. This is placeholder copy for the platform
        scaffold and should be replaced with counsel-reviewed terms before launch.
      </p>
    </main>
  );
}
