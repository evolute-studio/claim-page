'use client';

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  getIdentityToken,
  useCreateWallet,
  useIdentityToken,
  usePrivy,
  useWallets,
} from '@privy-io/react-auth';
import { confirmClaim, confirmClaimByPayoutId, getClaimPreview } from '@/lib/api';
import { resolvePrivyIdentityToken } from '@/lib/identityToken';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { CoinIcon } from '@/components/CoinIcon';
import type { ConfirmResponse, PayoutPreview } from '@/types/payout';

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

function ClaimDecisionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token')?.trim() ?? '';
  const payoutId = searchParams.get('payoutId')?.trim() ?? '';
  const debugStateRaw = searchParams.get('debugState')?.trim().toLowerCase() ?? '';
  const { ready, authenticated, user } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { wallets, ready: walletsReady } = useWallets();
  const { createWallet } = useCreateWallet();
  const debugState: 'loading' | 'ready' | 'error' | null =
    debugStateRaw === 'loading' || debugStateRaw === 'ready' || debugStateRaw === 'error'
      ? debugStateRaw
      : null;
  const isDebugPreview = process.env.NODE_ENV !== 'production' && !!debugState;

  const [preview, setPreview] = useState<PayoutPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(Boolean(token));
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isCreatingEmbeddedWallet, setIsCreatingEmbeddedWallet] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [amountFontSizePx, setAmountFontSizePx] = useState(52);
  const walletCreateAttemptedRef = useRef(false);
  const previewRequestIdRef = useRef(0);
  const amountContainerRef = useRef<HTMLDivElement | null>(null);
  const amountMeasureRef = useRef<HTMLSpanElement | null>(null);

  const walletAddress = wallets[0]?.address ?? null;
  const amountLabel = preview ? `${formatAmount(preview.amount_minor_units)} ${preview.asset}` : '';
  const isClaimActionable = preview?.status === 'CREATED';
  const effectiveWalletAddress = walletAddress || (isDebugPreview ? '0xdebug000000000000000000000000000000000000' : null);

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
    if (!ready) return;
    if (!authenticated) {
      router.replace('/');
    }
  }, [authenticated, isDebugPreview, ready, router]);

  useEffect(() => {
    if (isDebugPreview) return;
    if (!ready || !authenticated || !walletsReady) return;
    const hasEmbeddedWallet = wallets.some(
      (wallet) => wallet.walletClientType === 'privy' || wallet.walletClientType === 'privy-v2'
    );
    if (hasEmbeddedWallet || walletCreateAttemptedRef.current) return;

    walletCreateAttemptedRef.current = true;
    setIsCreatingEmbeddedWallet(true);
    void createWallet()
      .catch((error: unknown) => {
        console.error('Failed to create embedded wallet before claim confirmation', error);
      })
      .finally(() => {
        setIsCreatingEmbeddedWallet(false);
      });
  }, [authenticated, createWallet, isDebugPreview, ready, wallets, walletsReady]);

  useEffect(() => {
    if (isDebugPreview) {
      if (debugState === 'loading') {
        setPreviewLoading(true);
        setPreview(null);
        setPreviewError(null);
        return;
      }
      setPreviewLoading(false);
      if (debugState === 'error') {
        setPreview(null);
        setPreviewError('Mock error: claim not found.');
        return;
      }
      setPreviewError(null);
      setPreview({
        id: 'debug-payout-id',
        payout_id: 'debug-payout-id',
        claim_token: 'debug-claim-token',
        asset: 'USDC',
        chain: 'base',
        amount_minor_units: 12_345_000,
        amount_formatted: '12.345',
        status: 'CREATED',
        expires_at: Date.now() + 60 * 60 * 1000,
        recipient_email: 'player@example.com',
      });
      return;
    }

    const requestId = ++previewRequestIdRef.current;
    const controller = new AbortController();

    if (!token) {
      setPreview(null);
      setPreviewError(null);
      setPreviewLoading(false);
      controller.abort();
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);

    getClaimPreview(token, { signal: controller.signal })
      .then((data) => {
        if (previewRequestIdRef.current !== requestId) return;
        setPreview(data);
      })
      .catch((error: unknown) => {
        if (previewRequestIdRef.current !== requestId) return;
        if (error instanceof Error && error.name === 'AbortError') return;
        setPreview(null);
        setPreviewError(error instanceof Error ? error.message : 'Failed to load claim');
      })
      .finally(() => {
        if (previewRequestIdRef.current !== requestId) return;
        setPreviewLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [debugState, isDebugPreview, token]);

  const claimReference = useMemo(() => {
    return preview?.payout_id ?? preview?.id ?? payoutId ?? null;
  }, [payoutId, preview?.id, preview?.payout_id]);

  const openWallet = useCallback(() => {
    router.replace('/app?tab=wallet');
  }, [router]);

  const handleClaimNow = useCallback(async () => {
    if (claiming) return;
    setClaimError(null);

    if (isDebugPreview) {
      setClaimError('Debug preview mode: claim request is disabled.');
      return;
    }

    if (!effectiveWalletAddress) {
      setClaimError('Wallet is not ready yet. Please wait and try again.');
      return;
    }

    const privyUserId = user?.id?.trim() ?? '';
    if (!privyUserId) {
      setClaimError('User session is not ready. Please reopen from game.');
      return;
    }

    if (!token && !payoutId && !preview?.payout_id && !preview?.id) {
      setClaimError('Claim reference is missing.');
      return;
    }

    setClaiming(true);
    try {
      const authToken = await resolvePrivyIdentityToken({
        cachedToken: identityToken ?? null,
        expectedPrivyUserId: privyUserId,
        fetchFreshToken: () => getIdentityToken(),
        source: 'ClaimDecisionPage.handleClaimNow',
      });

      let response: ConfirmResponse;
      if (token) {
        try {
          response = await confirmClaim(token, effectiveWalletAddress, authToken);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Claim failed';
          const canRetryById =
            Boolean(claimReference) && message.toLowerCase().includes('missing claim_token');
          if (!canRetryById) {
            throw error;
          }
          response = await confirmClaimByPayoutId(claimReference as string, effectiveWalletAddress, authToken);
        }
      } else {
        const payoutRef = claimReference;
        if (!payoutRef) {
          throw new Error('Claim reference is missing.');
        }
        response = await confirmClaimByPayoutId(payoutRef, effectiveWalletAddress, authToken);
      }

      const params = new URLSearchParams();
      params.set('tab', 'wallet');
      if (token) params.set('focusToken', token);
      const focusPayout = response.payout_id || claimReference || payoutId;
      if (focusPayout) {
        params.set('focusPayout', focusPayout);
      }
      router.replace(`/app?${params.toString()}`);
    } catch (error: unknown) {
      setClaimError(error instanceof Error ? error.message : 'Claim failed');
    } finally {
      setClaiming(false);
    }
  }, [
    claimReference,
    claiming,
    effectiveWalletAddress,
    identityToken,
    isDebugPreview,
    payoutId,
    preview?.id,
    preview?.payout_id,
    router,
    token,
    user?.id,
  ]);

  if (!isDebugPreview && (!ready || !authenticated)) {
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
            <p className="mt-3 text-sm text-gray-400">Authorizing session...</p>
            <div className="mt-4 inline-flex items-center justify-center">
              <LoadingSpinner size="lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (previewLoading || (!isDebugPreview && isCreatingEmbeddedWallet && !walletAddress)) {
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
            <p className="mt-3 text-sm text-gray-400">
              {previewLoading ? 'Loading claim details...' : 'Preparing your wallet...'}
            </p>
            <div className="mt-4 inline-flex items-center justify-center">
              <LoadingSpinner size="lg" />
            </div>
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
            className="pointer-events-none absolute right-4 top-4 h-4 w-4 rounded-tr-md border-r border-t border-white/25"
          />

          {preview ? (
            <div className="mx-auto w-full max-w-[320px]">
              <p className="relative z-[2] text-xs font-medium tracking-[0.14em] text-gray-300">YOU EARNED</p>
              <div
                className="relative mx-auto mt-3 w-full overflow-hidden px-2 py-2"
              >
                <div
                  ref={amountContainerRef}
                  className="relative mx-auto w-full overflow-hidden"
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
              </div>

              <p
                className={`mt-5 ${
                  isClaimActionable
                    ? 'text-xl font-semibold leading-tight text-white'
                    : 'text-base font-medium text-white'
                }`}
              >
                {isClaimActionable
                  ? 'Claim now or continue to wallet'
                  : 'Continue to wallet'}
              </p>

              {claimError ? <p className="mt-3 text-sm text-red-300">{claimError}</p> : null}

              <div className="mt-4 space-y-3">
                {isClaimActionable ? (
                  <button
                    type="button"
                    onClick={() => void handleClaimNow()}
                    disabled={claiming || !effectiveWalletAddress}
                    className="claimable-cta-button inline-flex h-[50px] w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-all duration-200 active:translate-y-[1px] active:scale-[0.99] disabled:opacity-60"
                  >
                    {!claiming ? <CoinIcon /> : null}
                    {claiming ? 'Claiming...' : 'Claim now'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={openWallet}
                  className={`interactive-fx no-shimmer inline-flex h-[50px] w-full items-center justify-center rounded-xl border border-white/20 bg-white/[0.03] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.07] ${
                    isClaimActionable ? '' : 'mt-0'
                  }`}
                >
                  Go to wallet
                </button>
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-[320px]">
              <p className="text-xs font-medium tracking-[0.14em] text-gray-400">CLAIM</p>
              <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left">
                <p className="text-sm font-medium text-white">Claim is unavailable</p>
                <p className="mt-2 text-sm text-gray-300">
                  This claim link is invalid, expired, or no longer available.
                </p>
                <p className="mt-1 text-sm text-gray-300">
                  Open wallet to continue.
                </p>
                {isDebugPreview && previewError ? (
                  <p className="mt-2 text-xs text-gray-500">Debug: {previewError}</p>
                ) : null}
              </div>

              {claimError ? <p className="mt-3 text-sm text-red-300">{claimError}</p> : null}

              <div className="mt-4">
                <button
                  type="button"
                  onClick={openWallet}
                  className="interactive-fx no-shimmer inline-flex h-[50px] w-full items-center justify-center rounded-xl border border-white/20 bg-white/[0.03] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.07]"
                >
                  Go to wallet
                </button>
              </div>
            </div>
          )}
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

export default function ClaimDecisionPage() {
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
      <ClaimDecisionContent />
    </Suspense>
  );
}
