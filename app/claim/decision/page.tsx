'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { maskEmail } from '@/lib/format';
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

type ClaimStatusUi = {
  badge: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
};

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

function ClaimDecisionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token')?.trim() ?? '';
  const payoutId = searchParams.get('payoutId')?.trim() ?? '';
  const { ready, authenticated, user } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { wallets, ready: walletsReady } = useWallets();
  const { createWallet } = useCreateWallet();

  const [preview, setPreview] = useState<PayoutPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(Boolean(token));
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isCreatingEmbeddedWallet, setIsCreatingEmbeddedWallet] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const walletCreateAttemptedRef = useRef(false);
  const previewRequestIdRef = useRef(0);

  const walletAddress = wallets[0]?.address ?? null;
  const recipientEmailMasked = preview?.recipient_email ? maskEmail(preview.recipient_email) : null;
  const statusUi = preview ? getClaimStatusUi(preview.status) : null;

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      router.replace('/');
    }
  }, [authenticated, ready, router]);

  useEffect(() => {
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
  }, [authenticated, createWallet, ready, wallets, walletsReady]);

  useEffect(() => {
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
  }, [token]);

  const claimReference = useMemo(() => {
    return preview?.payout_id ?? preview?.id ?? payoutId ?? null;
  }, [payoutId, preview?.id, preview?.payout_id]);

  const openWallet = useCallback(() => {
    router.replace('/app?tab=wallet');
  }, [router]);

  const handleClaimNow = useCallback(async () => {
    if (claiming) return;
    setClaimError(null);

    if (!walletAddress) {
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
          response = await confirmClaim(token, walletAddress, authToken);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Claim failed';
          const canRetryById =
            Boolean(claimReference) && message.toLowerCase().includes('missing claim_token');
          if (!canRetryById) {
            throw error;
          }
          response = await confirmClaimByPayoutId(claimReference as string, walletAddress, authToken);
        }
      } else {
        const payoutRef = claimReference;
        if (!payoutRef) {
          throw new Error('Claim reference is missing.');
        }
        response = await confirmClaimByPayoutId(payoutRef, walletAddress, authToken);
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
  }, [claimReference, claiming, identityToken, payoutId, preview?.id, preview?.payout_id, router, token, user?.id, walletAddress]);

  if (!ready || !authenticated) {
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

  if (previewLoading || (isCreatingEmbeddedWallet && !walletAddress)) {
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

      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-8">
        <section className="animate-fade-in-up rounded-3xl border border-white/10 bg-[#111111]/95 p-6 text-center shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
          <p className="text-xs font-medium tracking-[0.14em] text-gray-400">EVOLUTE WALLET</p>
          <h1 className="mt-3 text-2xl font-semibold leading-tight text-white">Choose next action</h1>
          <p className="mt-2 text-sm text-gray-400">
            You are signed in. Claim now or continue to wallet.
          </p>

          {preview ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left">
              <p className="text-[11px] tracking-[0.12em] text-gray-400">CLAIM</p>
              <p className="mt-2 text-xl font-semibold text-white">
                {formatAmount(preview.amount_minor_units)}{' '}
                <span className="text-gray-300">{preview.asset}</span>
              </p>
              {statusUi ? (
                <span
                  className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
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
              ) : null}
              {recipientEmailMasked ? (
                <p className="mt-2 text-xs text-gray-400">Recipient: {recipientEmailMasked}</p>
              ) : null}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left">
              <p className="text-sm text-gray-300">
                {previewError
                  ? `Claim details unavailable: ${previewError}`
                  : 'Claim details are unavailable for this launch token.'}
              </p>
            </div>
          )}

          {claimError ? <p className="mt-3 text-sm text-red-300">{claimError}</p> : null}

          <div className="mt-5 space-y-3">
            <button
              type="button"
              onClick={() => void handleClaimNow()}
              disabled={claiming || !walletAddress || (preview?.status !== undefined && preview.status !== 'CREATED')}
              className="interactive-fx no-shimmer inline-flex w-full items-center justify-center rounded-2xl border border-transparent bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:bg-white/30"
            >
              {claiming ? 'Claiming...' : 'Claim now'}
            </button>
            <button
              type="button"
              onClick={openWallet}
              className="interactive-fx no-shimmer inline-flex w-full items-center justify-center rounded-2xl border border-white/20 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.07]"
            >
              Go to wallet
            </button>
          </div>
        </section>
      </div>
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
