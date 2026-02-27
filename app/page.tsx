'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { usePrivy } from '@privy-io/react-auth';

function sanitizeReturnTo(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/')) return null;
  if (trimmed.startsWith('//')) return null;
  return trimmed;
}

function EvoluteTopLogo() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-[42vh] min-h-32 max-h-72 items-center justify-center">
      <Image
        src="/logo.svg"
        alt="Evolute"
        width={170}
        height={44}
        priority
        className="h-auto w-[150px]"
      />
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, authenticated } = usePrivy();
  const [hintVisible, setHintVisible] = useState(false);

  useEffect(() => {
    if (!ready || !authenticated) return;
    const returnTo = sanitizeReturnTo(searchParams.get('returnTo'));
    router.replace(returnTo ?? '/app');
  }, [ready, authenticated, router, searchParams]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-16 h-64 w-64 rounded-full bg-white/[0.04] blur-3xl" />
        <div className="absolute -right-20 bottom-24 h-72 w-72 rounded-full bg-white/[0.03] blur-3xl" />
      </div>
      <EvoluteTopLogo />

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

          <div className="evolute-wallet-shimmer mb-4 text-xs font-medium tracking-[0.14em]">
            EVOLUTE WALLET
          </div>

          <h1 className="text-3xl font-semibold leading-tight text-white">Open from game</h1>
          <p className="mt-2 text-sm text-gray-400">
            Wallet sign-in is available only through the game launch flow.
          </p>

          <button
            type="button"
            onClick={() => setHintVisible(true)}
            disabled={!ready}
            className="interactive-fx no-shimmer mt-5 inline-flex w-full items-center justify-center rounded-2xl border border-white/20 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.07] disabled:border-white/12 disabled:bg-white/10 disabled:text-white/40"
          >
            Show sign-in hint
          </button>

          {hintVisible ? (
            <p className="mt-2 text-xs text-gray-400">
              Return to the game and open Wallet there to continue.
            </p>
          ) : null}

          <p className="mt-3 text-xs text-gray-500">Secure sign-in powered by Privy</p>
        </section>
      </div>
    </main>
  );
}
