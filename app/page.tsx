'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';

export default function Home() {
  const router = useRouter();
  const { ready, authenticated, login } = usePrivy();

  useEffect(() => {
    if (!ready || !authenticated) return;
    router.replace('/app');
  }, [ready, authenticated, router]);

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
            onClick={login}
            disabled={!ready}
            className="interactive-fx no-shimmer mt-5 inline-flex w-full items-center justify-center rounded-2xl border border-transparent bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:border-white/12 disabled:bg-white/10 disabled:text-white/40"
          >
            {ready ? 'Continue with Privy' : 'Loading...'}
          </button>

          <p className="mt-3 text-xs text-gray-500">Secure sign-in powered by Privy</p>
        </section>
      </div>
    </main>
  );
}
