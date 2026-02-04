'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getIdentityToken, useIdentityToken, useWallets } from '@privy-io/react-auth';
import { confirmClaim, confirmClaimByPayoutId, getMyPayouts } from '@/lib/api';
import { PayoutPreview, PayoutStatus } from '@/types/payout';
import { StatusBadge } from '@/components/StatusBadge';

const FILTERS: Array<{ label: string; value: 'ALL' | PayoutStatus }> = [
  { label: 'All', value: 'ALL' },
  { label: 'Claimable', value: 'CREATED' },
  { label: 'Paid', value: 'PAID' },
  { label: 'Pending', value: 'PENDING_APPROVAL' },
  { label: 'Failed', value: 'FAILED' },
  { label: 'Expired', value: 'EXPIRED' },
];

function formatAmount(item: PayoutPreview): string {
  if (item.amount_formatted) return item.amount_formatted;
  const amount = item.amount_minor_units / 1_000_000;
  return `${amount.toFixed(2)} ${item.asset}`;
}

function formatDate(timestamp?: number): string {
  if (!timestamp) return '—';
  const ms = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  return new Date(ms).toLocaleString();
}

function formatTimeRemaining(expiresAt: number): string {
  const expiresAtMs = expiresAt < 1_000_000_000_000 ? expiresAt * 1000 : expiresAt;
  const diff = expiresAtMs - Date.now();
  if (diff <= 0) return 'Expired';

  const totalMinutes = Math.floor(diff / (1000 * 60));
  if (totalMinutes < 60) {
    const minutes = Math.max(totalMinutes, 1);
    return `Expires in ${minutes} minute${minutes > 1 ? 's' : ''}`;
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) {
    return `Expires in ${days} day${days > 1 ? 's' : ''}`;
  }
  return `Expires in ${hours} hour${hours > 1 ? 's' : ''}`;
}

function truncateHash(value: string): string {
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function USDCIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <path
        d="M20.5 18.5C20.5 16.5 19 15.5 16 15C14 14.5 13.5 14 13.5 13C13.5 12 14.5 11.5 16 11.5C17.5 11.5 18.5 12 19 13L21 12C20.5 10.5 19 9.5 17 9V7H15V9C12.5 9.5 11 11 11 13C11 15 12.5 16 15.5 16.5C17.5 17 18 17.5 18 18.5C18 19.5 17 20.5 15.5 20.5C14 20.5 12.5 19.5 12 18L10 19C10.5 21 12.5 22.5 15 23V25H17V23C19.5 22.5 21 21 20.5 18.5Z"
        fill="white"
      />
    </svg>
  );
}

function openExplorerUrl(chain: string, txHash: string) {
  const normalized = chain.toLowerCase();
  if (normalized.includes('base')) {
    return `https://basescan.org/tx/${txHash}`;
  }
  if (normalized.includes('arbitrum')) {
    return `https://arbiscan.io/tx/${txHash}`;
  }
  if (normalized.includes('optimism')) {
    return `https://optimistic.etherscan.io/tx/${txHash}`;
  }
  if (normalized.includes('polygon')) {
    return `https://polygonscan.com/tx/${txHash}`;
  }
  if (normalized.includes('ethereum')) {
    return `https://etherscan.io/tx/${txHash}`;
  }
  return '';
}

export function PayoutsPanel({ focusToken }: { focusToken?: string | null }) {
  const { identityToken } = useIdentityToken();
  const { wallets } = useWallets();
  const walletAddress = wallets[0]?.address;

  const [payouts, setPayouts] = useState<PayoutPreview[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'ALL' | PayoutStatus>('ALL');
  const [selectedPayout, setSelectedPayout] = useState<PayoutPreview | null>(null);

  const getAuthToken = useCallback(async () => {
    const token = identityToken ?? (await getIdentityToken());
    if (!token) {
      throw new Error('Missing identity token. Please re-login.');
    }
    return token;
  }, [identityToken]);

  const loadPayouts = useCallback(async (mode: 'initial' | 'background' = 'background') => {
    if (mode === 'initial') {
      setLoading(true);
      setError(null);
    } else {
      setRefreshing(true);
    }
    try {
      const token = await getAuthToken();
      const data = await getMyPayouts(token);
      setPayouts(data.payouts);
      setNextCursor(data.next_cursor ?? null);
      setError(null);
      if (focusToken) {
        const focused = data.payouts.find((item) => item.claim_token === focusToken);
        if (focused) {
          setSelectedPayout(focused);
        }
      }
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : 'Failed to fetch payouts';
      setError(message);
    } finally {
      if (mode === 'initial') {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }, [focusToken, getAuthToken]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const data = await getMyPayouts(token, nextCursor);
      setPayouts((current) => [...current, ...data.payouts]);
      setNextCursor(data.next_cursor ?? null);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Failed to load more';
      setError(message);
    } finally {
      setLoadingMore(false);
    }
  }, [getAuthToken, loadingMore, nextCursor]);

  useEffect(() => {
    loadPayouts('initial');
  }, [loadPayouts]);

  useEffect(() => {
    if (loading || claimingId) return;
    const hasInFlightPayout = payouts.some(
      (item) => item.status === 'PENDING_APPROVAL' || item.status === 'PAYING'
    );
    if (!hasInFlightPayout) return;

    const timerId = window.setInterval(() => {
      loadPayouts('background');
    }, 20_000);

    return () => window.clearInterval(timerId);
  }, [claimingId, loadPayouts, loading, payouts]);

  const visiblePayouts = useMemo(() => {
    const filtered =
      activeFilter === 'ALL'
        ? payouts
        : payouts.filter((item) => item.status === activeFilter);

    if (!focusToken) return filtered;
    return [...filtered].sort((a, b) => {
      const aFocused = a.claim_token === focusToken ? 1 : 0;
      const bFocused = b.claim_token === focusToken ? 1 : 0;
      return bFocused - aFocused;
    });
  }, [activeFilter, payouts, focusToken]);

  const handleClaim = async (item: PayoutPreview) => {
    if (!walletAddress) return;
    const payoutId = item.payout_id ?? item.id;
    if (!item.claim_token && !payoutId) return;

    setClaimingId(item.id ?? item.payout_id ?? item.claim_token ?? null);
    setError(null);
    try {
      const token = await getAuthToken();
      if (item.claim_token) {
        try {
          await confirmClaim(item.claim_token, walletAddress, token);
        } catch (claimByTokenError) {
          const message =
            claimByTokenError instanceof Error ? claimByTokenError.message : 'Claim failed';
          const canRetryById = !!payoutId && message.toLowerCase().includes('missing claim_token');
          if (!canRetryById) {
            throw claimByTokenError;
          }
          await confirmClaimByPayoutId(payoutId, walletAddress, token);
        }
      } else if (payoutId) {
        await confirmClaimByPayoutId(payoutId, walletAddress, token);
      }
      await loadPayouts('background');
    } catch (claimError) {
      const message = claimError instanceof Error ? claimError.message : 'Claim failed';
      setError(
        message === 'Missing claim token'
          ? 'Server expects claim token for this payout. Check `/payouts/me` response fields.'
          : message
      );
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <section className="w-full rounded-xl border border-gray-800 bg-gray-900/40 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Your payouts</h2>
        <button
          type="button"
          onClick={() => loadPayouts('background')}
          className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-200 transition hover:border-gray-500"
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setActiveFilter(filter.value)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              activeFilter === filter.value
                ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                : 'border-gray-700 text-gray-300 hover:border-gray-500'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading payouts...</p>
      ) : visiblePayouts.length === 0 ? (
        <p className="text-sm text-gray-400">No payouts found.</p>
      ) : (
        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          {visiblePayouts.map((item) => {
            const itemId =
              item.id ?? item.payout_id ?? item.claim_token ?? `${item.status}-${item.expires_at}`;
            const isFocused = !!focusToken && item.claim_token === focusToken;
            const hasClaimRef = !!item.claim_token || !!item.payout_id || !!item.id;
            const canClaim = item.status === 'CREATED' && hasClaimRef && !!walletAddress;
            const isClaiming = claimingId === itemId;

            return (
              <article
                key={itemId}
                className="rounded-xl bg-gradient-to-r from-purple-500/40 via-pink-500/30 to-purple-500/40 p-[1px]"
              >
                <div
                  className={`rounded-xl border p-4 space-y-3 transition ${
                    isFocused
                      ? 'border-purple-400 bg-[#15111f]'
                      : 'border-gray-800 bg-black/40 hover:border-gray-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <USDCIcon />
                      <div>
                        <p className="text-base font-semibold text-white">{formatAmount(item)}</p>
                        <p className="text-xs text-gray-400 capitalize">{item.chain} Network</p>
                      </div>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-gray-500">{formatTimeRemaining(item.expires_at)}</p>
                    {item.rank ? (
                      <span className="rounded-full bg-gradient-to-r from-yellow-500 to-orange-500 px-2.5 py-1 text-xs font-bold text-black">
                        #{item.rank}
                      </span>
                    ) : null}
                  </div>

                  <div className="rounded-lg bg-gray-800/40 p-3">
                    <p className="text-xs text-gray-500">Recipient</p>
                    <p className="text-sm text-gray-200">{item.recipient_email || '—'}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    {canClaim && (
                      <button
                        type="button"
                        onClick={() => handleClaim(item)}
                        disabled={isClaiming}
                        className="flex-1 rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-green-500 disabled:opacity-60"
                      >
                        {isClaiming ? 'Claiming...' : 'Claim payout'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedPayout(item)}
                      className="rounded-md border border-gray-700 px-3 py-2 text-sm text-gray-200 transition hover:border-gray-500"
                    >
                      Details
                    </button>
                  </div>
                </div>
              </article>
            );
          })}

          {nextCursor && activeFilter === 'ALL' && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full rounded-md border border-gray-700 px-3 py-2 text-sm text-gray-200 transition hover:border-gray-500 disabled:opacity-60"
            >
              {loadingMore ? 'Loading more...' : 'Load more payouts'}
            </button>
          )}
        </div>
      )}

      {selectedPayout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-gray-800 bg-[#111111] p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Payout details</h3>
                <p className="text-sm text-gray-400">{formatAmount(selectedPayout)}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPayout(null)}
                className="rounded-md border border-gray-700 px-2.5 py-1 text-xs text-gray-200 transition hover:border-gray-500"
              >
                Close
              </button>
            </div>

            <StatusBadge status={selectedPayout.status} />

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-gray-500">Chain</p>
                <p className="text-gray-200">{selectedPayout.chain}</p>
              </div>
              <div>
                <p className="text-gray-500">Recipient</p>
                <p className="text-gray-200">{selectedPayout.recipient_email || '—'}</p>
              </div>
              <div>
                <p className="text-gray-500">Created</p>
                <p className="text-gray-200">{formatDate(selectedPayout.created_at)}</p>
              </div>
              <div>
                <p className="text-gray-500">Updated</p>
                <p className="text-gray-200">{formatDate(selectedPayout.updated_at)}</p>
              </div>
              <div>
                <p className="text-gray-500">Claimed</p>
                <p className="text-gray-200">{formatDate(selectedPayout.claimed_at)}</p>
              </div>
              <div>
                <p className="text-gray-500">Paid</p>
                <p className="text-gray-200">{formatDate(selectedPayout.paid_at)}</p>
              </div>
            </div>

            {selectedPayout.tx_hash && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Transaction</p>
                <p className="text-xs text-gray-300 break-all">{truncateHash(selectedPayout.tx_hash)}</p>
                {openExplorerUrl(selectedPayout.chain, selectedPayout.tx_hash) && (
                  <a
                    href={openExplorerUrl(selectedPayout.chain, selectedPayout.tx_hash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs text-purple-300 hover:underline"
                  >
                    View in explorer
                  </a>
                )}
              </div>
            )}

            {selectedPayout.failure_reason && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3">
                <p className="text-xs text-red-300">{selectedPayout.failure_reason}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
