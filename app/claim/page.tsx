'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useState, useEffect, useLayoutEffect, useRef, Suspense } from 'react';
import type { FormEvent } from 'react';
import { getClaimPreview } from '@/lib/api';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import type { PayoutPreview } from '@/types/payout';

function formatAmount(minor: number): string {
  const amount = minor / 1_000_000;
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function ClaimContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const { ready, authenticated, login } = usePrivy();

  const [preview, setPreview] = useState<PayoutPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const previewRequestIdRef = useRef(0);
  const [manualToken, setManualToken] = useState('');
  const [amountFontSizePx, setAmountFontSizePx] = useState(56);
  const amountContainerRef = useRef<HTMLDivElement | null>(null);
  const amountMeasureRef = useRef<HTMLSpanElement | null>(null);
  const amountLabel = preview ? `${formatAmount(preview.amount_minor_units)} ${preview.asset}` : '';
  const previewFocusPayoutRef =
    preview?.payout_id ??
    preview?.id ??
    ((preview as unknown as { payoutId?: string } | null)?.payoutId ?? null);

  useLayoutEffect(() => {
    if (!amountLabel) return;

    const container = amountContainerRef.current;
    const measure = amountMeasureRef.current;
    if (!container || !measure) return;

    const MIN_FONT_PX = 30;
    const MAX_FONT_PX = 72;
    let frameId = 0;

    const fitAmount = () => {
      const availableWidth = container.clientWidth;
      if (!availableWidth) return;

      let low = MIN_FONT_PX;
      let high = MAX_FONT_PX;
      let best = MIN_FONT_PX;

      for (let i = 0; i < 20; i += 1) {
        const mid = (low + high) / 2;
        measure.style.fontSize = `${mid}px`;
        const textWidth = measure.scrollWidth;

        if (textWidth <= availableWidth) {
          best = mid;
          low = mid;
        } else {
          high = mid;
        }
      }

      setAmountFontSizePx(Math.round(best * 10) / 10);
    };

    const scheduleFit = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(fitAmount);
    };

    scheduleFit();

    const resizeObserver = new ResizeObserver(() => {
      scheduleFit();
    });
    resizeObserver.observe(container);

    if (document.fonts) {
      document.fonts.ready.then(() => {
        scheduleFit();
      });
    }

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
    };
  }, [amountLabel]);

  useEffect(() => {
    if (!ready || !authenticated) return;
    if (token && loading) return;

    const params = new URLSearchParams();
    params.set('tab', 'wallet');
    if (token) {
      params.set('focusToken', token);
    }
    if (previewFocusPayoutRef) {
      params.set('focusPayout', previewFocusPayoutRef);
    }
    router.replace(`/app?${params.toString()}`);
  }, [authenticated, loading, previewFocusPayoutRef, ready, router, token]);

  useEffect(() => {
    const requestId = ++previewRequestIdRef.current;
    const controller = new AbortController();

    if (!token) {
      setPreview(null);
      setError(null);
      setLoading(false);
      controller.abort();
      return;
    }

    setLoading(true);
    setError(null);

    getClaimPreview(token, { signal: controller.signal })
      .then((data) => {
        if (previewRequestIdRef.current !== requestId) return;
        setPreview(data);
      })
      .catch((e: unknown) => {
        if (previewRequestIdRef.current !== requestId) return;
        if (e instanceof Error && e.name === 'AbortError') return;
        setPreview(null);
        setError(e instanceof Error ? e.message : 'Failed to load claim');
      })
      .finally(() => {
        if (previewRequestIdRef.current !== requestId) return;
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [token]);

  const handleTokenSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = manualToken.trim();
    if (!trimmed) return;
    router.push(`/claim?token=${encodeURIComponent(trimmed)}`);
  };

  const handleLogin = () => {
    login();
  };

  if (loading) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-16 h-64 w-64 rounded-full bg-white/[0.04] blur-3xl" />
          <div className="absolute -right-20 bottom-24 h-72 w-72 rounded-full bg-white/[0.03] blur-3xl" />
        </div>
        <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-8">
          <div className="animate-fade-in-up rounded-3xl border border-white/10 bg-[#111111]/95 p-6 text-center shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
            <p className="text-xs font-medium tracking-[0.14em] text-gray-400">EVOLUTE WALLET</p>
            <p className="mt-3 text-sm text-gray-400">Loading claim...</p>
            <div className="mt-4 inline-flex items-center justify-center">
              <LoadingSpinner size="lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-16 h-64 w-64 rounded-full bg-white/[0.04] blur-3xl" />
          <div className="absolute -right-20 bottom-24 h-72 w-72 rounded-full bg-white/[0.03] blur-3xl" />
        </div>

        <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-8">
          <div className="animate-fade-in-up rounded-3xl border border-white/10 bg-[#111111]/95 p-6 text-center shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
            <p className="text-xs font-medium tracking-[0.14em] text-gray-400">EVOLUTE WALLET</p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight text-white">Open claim link</h1>
            <p className="mt-2 text-sm text-gray-400">Paste your claim token to continue.</p>

            <form onSubmit={handleTokenSubmit} className="mt-5 space-y-3 text-left">
              <input
                type="text"
                value={manualToken}
                onChange={(event) => setManualToken(event.target.value)}
                placeholder="Paste token here"
                className="w-full rounded-2xl border border-white/12 bg-white/[0.02] px-3 py-2.5 text-sm text-white outline-none transition focus:border-white/25 focus:bg-white/[0.05]"
              />
              <button
                type="submit"
                disabled={!manualToken.trim()}
                className="interactive-fx no-shimmer inline-flex w-full items-center justify-center rounded-2xl border border-transparent bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:border-white/12 disabled:bg-white/10 disabled:text-white/40"
              >
                Continue
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (error && !preview) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-16 h-64 w-64 rounded-full bg-white/[0.04] blur-3xl" />
          <div className="absolute -right-20 bottom-24 h-72 w-72 rounded-full bg-white/[0.03] blur-3xl" />
        </div>

        <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-8">
          <div className="animate-fade-in-up rounded-3xl border border-white/10 bg-[#111111]/95 p-6 text-center shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
            <p className="text-xs font-medium tracking-[0.14em] text-gray-400">EVOLUTE WALLET</p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight text-white">Claim not found</h1>
            <p className="mt-2 text-sm text-gray-400">{error}</p>

            <button
              type="button"
              onClick={() => router.push('/claim')}
              className="interactive-fx no-shimmer mt-5 inline-flex w-full items-center justify-center rounded-2xl border border-transparent bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
            >
              Try another token
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-16 h-64 w-64 rounded-full bg-white/[0.04] blur-3xl" />
          <div className="absolute -right-20 bottom-24 h-72 w-72 rounded-full bg-white/[0.03] blur-3xl" />
        </div>

        <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-8">
          <div className="animate-fade-in-up rounded-3xl border border-white/10 bg-[#111111]/95 p-6 text-center shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
            <p className="text-xs font-medium tracking-[0.14em] text-gray-400">EVOLUTE WALLET</p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight text-white">Claim not found</h1>
            <p className="mt-2 text-sm text-gray-400">This claim link is invalid or expired.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white">
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

          <p className="text-xs font-medium tracking-[0.14em] text-gray-400">EVOLUTE WALLET</p>
          <h1 className="mt-3 text-xl font-semibold leading-tight text-white">You earned</h1>
          <div
            ref={amountContainerRef}
            className="mx-auto mt-3 overflow-hidden"
            style={{ width: 'calc(100% - 4rem)' }}
          >
            <p
              className="font-num mx-auto w-fit max-w-full whitespace-nowrap font-semibold leading-none tracking-[0.02em] text-white"
              style={{ fontSize: `${amountFontSizePx}px` }}
            >
              {formatAmount(preview.amount_minor_units)} <span className="text-gray-400">{preview.asset}</span>
            </p>
            <span
              ref={amountMeasureRef}
              aria-hidden="true"
              className="font-num pointer-events-none absolute -left-[9999px] top-0 whitespace-nowrap font-semibold leading-none tracking-[0.02em] opacity-0"
            >
              {amountLabel}
            </span>
          </div>
          <p className="mt-4 text-sm text-gray-400">Sign in to claim your payout.</p>

          <button
            type="button"
            onClick={handleLogin}
            disabled={!ready}
            className="interactive-fx no-shimmer mt-5 inline-flex w-full items-center justify-center rounded-2xl border border-transparent bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:border-white/12 disabled:bg-white/10 disabled:text-white/40"
          >
            {ready ? 'Continue with Privy' : 'Loading...'}
          </button>

          <p className="mt-3 text-xs text-gray-500">You will be redirected to your wallet.</p>
        </section>
      </div>
    </div>
  );
}

export default function ClaimPage() {
  return (
    <Suspense
      fallback={
        <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-24 top-16 h-64 w-64 rounded-full bg-white/[0.04] blur-3xl" />
            <div className="absolute -right-20 bottom-24 h-72 w-72 rounded-full bg-white/[0.03] blur-3xl" />
          </div>
          <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-8">
            <div className="animate-fade-in-up rounded-3xl border border-white/10 bg-[#111111]/95 p-6 text-center shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
              <p className="text-xs font-medium tracking-[0.14em] text-gray-400">EVOLUTE WALLET</p>
              <p className="mt-3 text-sm text-gray-400">Loading claim...</p>
              <div className="mt-4 inline-flex items-center justify-center">
                <LoadingSpinner size="lg" />
              </div>
            </div>
          </div>
        </div>
      }
    >
      <ClaimContent />
    </Suspense>
  );
}
