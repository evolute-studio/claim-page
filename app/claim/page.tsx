'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { usePrivy } from '@privy-io/react-auth';
import { useState, useEffect, useLayoutEffect, useRef, Suspense } from 'react';
import type { FormEvent } from 'react';
import { getClaimPreview } from '@/lib/api';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { maskEmail } from '@/lib/format';
import type { PayoutPreview } from '@/types/payout';

function ShieldIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 3 5 6v6c0 4.4 2.6 7.8 7 9 4.4-1.2 7-4.6 7-9V6l-7-3Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m9.5 12.2 1.8 1.8 3.2-3.4"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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

function formatAmount(minor: number): string {
  const amount = minor / 1_000_000;
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(amount);
}

type ClaimStatusUi = {
  badge: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
};
type ClaimDebugState = 'loading' | 'input' | 'error' | 'not_found' | 'ready' | 'paid';

function getClaimStatusUi(status: PayoutPreview['status']): ClaimStatusUi {
  switch (status) {
    case 'CREATED':
      return {
        badge: 'Claim available',
        tone: 'neutral',
      };
    case 'PENDING_EMAIL':
      return {
        badge: 'Pending email',
        tone: 'warning',
      };
    case 'PENDING_APPROVAL':
      return {
        badge: 'Pending approval',
        tone: 'warning',
      };
    case 'PAYING':
      return {
        badge: 'Paying',
        tone: 'warning',
      };
    case 'PAID':
      return {
        badge: 'Paid',
        tone: 'success',
      };
    case 'EXPIRED':
      return {
        badge: 'Expired',
        tone: 'danger',
      };
    case 'CANCELLED':
      return {
        badge: 'Cancelled',
        tone: 'danger',
      };
    case 'FAILED':
      return {
        badge: 'Failed',
        tone: 'danger',
      };
    default:
      return {
        badge: status,
        tone: 'neutral',
      };
  }
}

function ClaimContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token')?.trim() ?? '';
  const debugStateRaw = searchParams.get('debugState')?.trim().toLowerCase() ?? '';
  const debugState: ClaimDebugState | null =
    debugStateRaw === 'loading' ||
    debugStateRaw === 'input' ||
    debugStateRaw === 'error' ||
    debugStateRaw === 'not_found' ||
    debugStateRaw === 'ready' ||
    debugStateRaw === 'paid'
      ? debugStateRaw
      : null;
  const isDebugPreview = process.env.NODE_ENV !== 'production' && !!debugState;

  const { ready, authenticated } = usePrivy();

  const [preview, setPreview] = useState<PayoutPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const previewRequestIdRef = useRef(0);
  const [manualToken, setManualToken] = useState('');
  const [amountFontSizePx, setAmountFontSizePx] = useState(52);
  const amountContainerRef = useRef<HTMLDivElement | null>(null);
  const amountMeasureRef = useRef<HTMLSpanElement | null>(null);
  const amountLabel = preview ? `${formatAmount(preview.amount_minor_units)} ${preview.asset}` : '';
  const recipientEmailMasked = preview?.recipient_email ? maskEmail(preview.recipient_email) : null;
  const statusUi = preview ? getClaimStatusUi(preview.status) : null;
  const isClaimActionable = preview?.status === 'CREATED';
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
      const SAFE_SIDE_PADDING_PX = 6;
      const availableWidth = Math.max(container.clientWidth - SAFE_SIDE_PADDING_PX, 0);
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

      setAmountFontSizePx(Math.floor(best * 10) / 10);
    };

    const scheduleFit = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(fitAmount);
    };

    fitAmount();

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
    if (isDebugPreview) return;
    if (!ready || !authenticated) return;
    if (loading) return;
    if (!preview || !!error) return;

    const params = new URLSearchParams();
    params.set('tab', isClaimActionable ? 'wallet' : 'history');
    if (token) {
      params.set('focusToken', token);
    }
    if (previewFocusPayoutRef) {
      params.set('focusPayout', previewFocusPayoutRef);
    }
    router.replace(`/app?${params.toString()}`);
  }, [
    authenticated,
    error,
    isClaimActionable,
    loading,
    preview,
    previewFocusPayoutRef,
    ready,
    router,
    token,
    isDebugPreview,
  ]);

  useEffect(() => {
    if (isDebugPreview) {
      if (debugState === 'loading') {
        setLoading(true);
        setPreview(null);
        setError(null);
        return;
      }
      if (debugState === 'input') {
        setLoading(false);
        setPreview(null);
        setError(null);
        return;
      }
      if (debugState === 'error') {
        setLoading(false);
        setPreview(null);
        setError('Mock error: claim not found.');
        return;
      }
      if (debugState === 'not_found') {
        setLoading(false);
        setPreview(null);
        setError(null);
        return;
      }

      const status = debugState === 'paid' ? 'PAID' : 'CREATED';
      setLoading(false);
      setError(null);
      setPreview({
        id: 'debug-payout-id',
        payout_id: 'debug-payout-id',
        claim_token: 'debug-claim-token',
        asset: 'USDC',
        chain: 'base',
        amount_minor_units: 12_345_000,
        amount_formatted: '12.345',
        status,
        expires_at: Date.now() + 60 * 60 * 1000,
        recipient_email: 'player@example.com',
      });
      return;
    }

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
  }, [debugState, isDebugPreview, token]);

  const handleTokenSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = manualToken.trim();
    if (!trimmed) return;
    router.push(`/claim?token=${encodeURIComponent(trimmed)}`);
  };

  const handleOpenWallet = () => {
    const params = new URLSearchParams();
    params.set('tab', 'history');
    if (isDebugPreview) {
      params.set('debug', '1');
    }
    if (token) params.set('focusToken', token);
    if (previewFocusPayoutRef) params.set('focusPayout', previewFocusPayoutRef);
    router.push(`/app?${params.toString()}`);
  };

  if (loading) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-16 h-64 w-64 rounded-full bg-white/[0.04] blur-3xl" />
          <div className="absolute -right-20 bottom-24 h-72 w-72 rounded-full bg-white/[0.03] blur-3xl" />
        </div>
        <EvoluteTopLogo />
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

  if (!token && (!isDebugPreview || debugState === 'input')) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-16 h-64 w-64 rounded-full bg-white/[0.04] blur-3xl" />
          <div className="absolute -right-20 bottom-24 h-72 w-72 rounded-full bg-white/[0.03] blur-3xl" />
        </div>
        <EvoluteTopLogo />

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
        <EvoluteTopLogo />

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
        <EvoluteTopLogo />

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
      <EvoluteTopLogo />

      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 pb-16 pt-28">
        <section className="relative animate-fade-in-up overflow-hidden rounded-3xl border border-white/10 bg-[#111111]/95 p-6 text-center shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-4 h-4 w-4 rounded-tl-md border-l border-t border-white/25"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-8 top-8 h-1.5 w-1.5 rounded-full bg-white/25"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-4 top-4 h-4 w-4 rounded-tr-md border-r border-t border-white/25"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-8 top-8 h-1.5 w-1.5 rounded-full bg-white/25"
          />

          <div className="mx-auto w-full max-w-[320px]">
            <p className="text-xs font-medium tracking-[0.14em] text-gray-400">YOU EARNED</p>
            {!isClaimActionable && statusUi ? (
              <div className="mt-2 flex items-center justify-center">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                    statusUi.tone === 'success'
                      ? 'border-emerald-300/35 text-emerald-200'
                      : statusUi.tone === 'warning'
                        ? 'border-amber-300/35 text-amber-200'
                        : statusUi.tone === 'danger'
                          ? 'border-red-300/35 text-red-200'
                          : 'border-white/15 text-gray-300'
                  }`}
                >
                  {statusUi.badge}
                </span>
              </div>
            ) : null}
            <div
              ref={amountContainerRef}
              className="relative mx-auto mt-3 w-full overflow-hidden"
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
            {recipientEmailMasked ? (
              <div className="mt-3 flex items-center justify-center">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-[13px] text-gray-200"
                  title={`Recipient: ${recipientEmailMasked}`}
                >
                  <span className="max-w-[240px] truncate font-medium text-white">
                    {recipientEmailMasked}
                  </span>
                </span>
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-5 animate-fade-in-up text-center">
          <div className="mx-auto w-full max-w-[320px]">
            <p
              className={
                isClaimActionable
                  ? 'text-xl font-semibold leading-tight text-white'
                  : 'text-base font-medium text-white'
              }
            >
              {isClaimActionable
                ? 'Open wallet from game to claim'
                : 'Open wallet from game to continue.'}
            </p>

            {authenticated ? (
              <button
                type="button"
                onClick={handleOpenWallet}
                className="interactive-fx no-shimmer mt-4 inline-flex w-full items-center justify-center rounded-2xl border border-white/20 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.07]"
              >
                Open wallet
              </button>
            ) : (
              <p className="mt-4 text-xs text-gray-500">
                Direct web sign-in is disabled.
              </p>
            )}
          </div>
        </section>
      </div>

      <footer className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
        <p className="inline-flex items-center justify-center gap-1.5 text-xs text-gray-500">
          <ShieldIcon />
          Secure sign-in powered by Privy
        </p>
      </footer>
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
          <EvoluteTopLogo />
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
