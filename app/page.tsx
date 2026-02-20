'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLoginWithOAuth, usePrivy } from '@privy-io/react-auth';
import { EmailLoginSheet } from '@/components/auth/EmailLoginSheet';

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z" />
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </svg>
  );
}

export default function Home() {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();
  const { initOAuth, loading: googleLoginLoading } = useLoginWithOAuth();
  const [loginSheetOpen, setLoginSheetOpen] = useState(false);
  const [googleLoginError, setGoogleLoginError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !authenticated) return;
    router.replace('/app');
  }, [ready, authenticated, router]);

  const handleGoogleLogin = async () => {
    setGoogleLoginError(null);
    try {
      await initOAuth({ provider: 'google' });
    } catch {
      setGoogleLoginError('Google sign-in failed. Try again.');
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-16 h-64 w-64 rounded-full bg-white/[0.04] blur-3xl" />
        <div className="absolute -right-20 bottom-24 h-72 w-72 rounded-full bg-white/[0.03] blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-8">
        <section className="relative animate-fade-in-up overflow-hidden rounded-3xl border border-white/10 bg-[#111111]/95 p-6 text-center shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-4 h-4 w-4 rounded-tl-md border-l border-t border-white/25"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-4 top-4 h-4 w-4 rounded-tr-md border-r border-t border-white/25"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-8 top-8 h-1.5 w-1.5 rounded-full bg-white/25"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-8 top-8 h-1.5 w-1.5 rounded-full bg-white/25"
          />

          <div className="mb-4 text-xs font-medium tracking-[0.14em] text-gray-400">
            EVOLUTE WALLET
          </div>

          <h1 className="text-3xl font-semibold leading-tight text-white">Sign in</h1>

          <button
            type="button"
            onClick={() => setLoginSheetOpen(true)}
            disabled={!ready}
            className="interactive-fx no-shimmer mt-5 inline-flex w-full items-center justify-center rounded-2xl border border-transparent bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:border-white/12 disabled:bg-white/10 disabled:text-white/40"
          >
            {ready ? 'Continue with email' : 'Loading...'}
          </button>

          <button
            type="button"
            onClick={() => void handleGoogleLogin()}
            disabled={!ready || googleLoginLoading}
            className="interactive-fx no-shimmer mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.07] disabled:border-white/12 disabled:bg-white/10 disabled:text-white/40"
          >
            <GoogleIcon />
            {googleLoginLoading ? 'Redirecting to Google...' : 'Continue with Google'}
          </button>

          {googleLoginError ? <p className="mt-2 text-xs text-red-300">{googleLoginError}</p> : null}

          <p className="mt-3 text-xs text-gray-500">Secure sign-in powered by Privy</p>
        </section>
      </div>

      <EmailLoginSheet open={loginSheetOpen} onClose={() => setLoginSheetOpen(false)} />
    </main>
  );
}
