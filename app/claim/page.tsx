'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import {
  getIdentityToken,
  useIdentityToken,
  usePrivy,
  useWallets,
} from '@privy-io/react-auth';
import { UserPill } from '@privy-io/react-auth/ui';
import { useState, useEffect, useRef, Suspense } from 'react';
import type { FormEvent } from 'react';
import { getClaimPreview, confirmClaim } from '@/lib/api';
import { ClaimCard } from '@/components/ClaimCard';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { PayoutPreview } from '@/types/payout';

function ClaimContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const { ready, authenticated, login } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { wallets } = useWallets();

  const [preview, setPreview] = useState<PayoutPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewRequestIdRef = useRef(0);
  const [manualToken, setManualToken] = useState('');

  const walletAddress = wallets[0]?.address;

  // Load preview on mount
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

  // Handle connect
  const handleConnect = () => {
    login();
  };

  // Handle claim
  const handleClaim = async () => {
    if (!token || !walletAddress) return;

    setClaiming(true);
    setError(null);

    try {
      const privyIdentityToken = identityToken ?? (await getIdentityToken());
      if (!privyIdentityToken) {
        throw new Error('Missing identity token. Please re-login.');
      }

      await confirmClaim(token, walletAddress, privyIdentityToken);
      router.replace(`/app?focusToken=${encodeURIComponent(token)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Claim failed');
    } finally {
      setClaiming(false);
    }
  };

  // Parse amount for display
  const formatAmount = (preview: PayoutPreview): string => {
    const amount = preview.amount_minor_units / 1_000_000;
    return `${amount.toFixed(2)} ${preview.asset}`;
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <LoadingSpinner size="lg" />
          <p className="text-gray-400">Loading claim...</p>
        </div>
      </div>
    );
  }

  // No token provided: show input
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md mx-auto space-y-4">
          <h1 className="text-2xl font-bold text-white text-center">Enter claim token</h1>
          <form onSubmit={handleTokenSubmit} className="space-y-3">
            <input
              type="text"
              value={manualToken}
              onChange={(event) => setManualToken(event.target.value)}
              placeholder="Paste token here"
              className="w-full rounded-md bg-black/40 border border-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
            <button
              type="submit"
              className="w-full rounded-md bg-purple-600 px-3 py-2 text-sm font-semibold text-white transition"
            >
              Continue
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Error state (API error)
  if (error && !preview) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md mx-auto text-center space-y-4">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6">
            <h1 className="text-xl font-bold text-red-400 mb-2">Unable to load claim</h1>
            <p className="text-gray-400">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // No preview data
  if (!preview) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md mx-auto text-center space-y-4">
          <div className="bg-gray-500/10 border border-gray-500/20 rounded-lg p-6">
            <h1 className="text-xl font-bold text-gray-400 mb-2">Claim not found</h1>
            <p className="text-gray-400">This claim link is invalid or has expired.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      {/* Logo + Privy wallet UI */}
      <div className="mb-8 w-full max-w-md mx-auto flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Evolute</h1>
        <UserPill />
      </div>

      {/* Error message (for claim errors) */}
      {error && (
        <div className="w-full max-w-md mx-auto mb-4">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        </div>
      )}

      {/* Claim card */}
      <ClaimCard
        amount={formatAmount(preview)}
        chain={preview.chain}
        rank={preview.rank}
        status={preview.status}
        expiresAt={preview.expires_at}
        maskedEmail={preview.recipient_email}
        onConnect={handleConnect}
        onClaim={handleClaim}
        isLoading={claiming}
        walletAddress={walletAddress}
        isAuthenticated={authenticated}
        isPrivyReady={ready}
      />

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-xs text-gray-500">
          Prize will be sent to your wallet on Base network
        </p>
      </div>
    </div>
  );
}

export default function ClaimPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <LoadingSpinner size="lg" />
        </div>
      }
    >
      <ClaimContent />
    </Suspense>
  );
}
