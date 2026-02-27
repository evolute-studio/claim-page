'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getIdentityToken, useIdentityToken, useWallets } from '@privy-io/react-auth';
import { confirmClaim, confirmClaimByPayoutId, getMyPayouts } from '@/lib/api';
import { getExplorerTxUrl } from '@/lib/explorer';
import { PayoutPreview, PayoutStatus } from '@/types/payout';
import { StatusBadge } from '@/components/StatusBadge';
import { CoinIcon } from '@/components/CoinIcon';
import { PayoutListCard } from '@/components/PayoutListCard';

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

function formatPillAmount(item: PayoutPreview): string {
  const amount = item.amount_minor_units / 1_000_000;
  return `${amount.toFixed(2)} ${item.asset}`;
}

function formatDate(timestamp?: number): string {
  if (!timestamp) return '—';
  const ms = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  return new Date(ms).toLocaleString();
}

function truncateHash(value: string): string {
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function openExplorerUrl(chain: string, txHash: string) {
  return getExplorerTxUrl(chain, txHash);
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
    const cachedToken = identityToken?.trim() ?? '';
    if (cachedToken) return cachedToken;

    try {
      const freshToken = await getIdentityToken();
      const normalizedFreshToken = freshToken?.trim() ?? '';
      if (normalizedFreshToken) return normalizedFreshToken;
    } catch {
      // Fall through to unified error message.
    }

    throw new Error('Missing identity token. Please re-login.');
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
    <section className="flex h-full min-h-0 w-full flex-col gap-4 rounded-2xl border border-white/10 bg-[#111111] p-5 animate-fade-in-up">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Your payouts</h2>
        <button
          type="button"
          onClick={() => loadPayouts('background')}
          className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-gray-100 transition hover:bg-white/10"
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
                ? 'border-white/30 bg-white/10 text-white'
                : 'border-white/15 bg-white/5 text-gray-300 hover:bg-white/10'
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
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {visiblePayouts.map((item) => {
            const itemId =
              item.id ?? item.payout_id ?? item.claim_token ?? `${item.status}-${item.expires_at}`;
            const isFocused = !!focusToken && item.claim_token === focusToken;
            const hasClaimRef = !!item.claim_token || !!item.payout_id || !!item.id;
            const canClaim = item.status === 'CREATED' && hasClaimRef && !!walletAddress;
            const isClaiming = claimingId === itemId;

            return (
              <PayoutListCard
                key={itemId}
                item={item}
                amountLabel={formatPillAmount(item)}
                sourceLabel="Tournament reward"
                highlighted={isFocused}
                onDetails={() => setSelectedPayout(item)}
                canClaim={canClaim}
                isClaiming={isClaiming}
                onClaim={() => handleClaim(item)}
              />
            );
          })}

          {nextCursor && activeFilter === 'ALL' && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-gray-100 transition hover:bg-white/10 disabled:opacity-60"
            >
              {loadingMore ? 'Loading more...' : 'Load more payouts'}
            </button>
          )}
        </div>
      )}

      {selectedPayout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#111111] p-5 space-y-4 animate-sheet-in">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Payout details</h3>
                <p className="text-sm text-gray-300">
                  {(() => {
                    const [amountPart, assetPart] = formatAmount(selectedPayout).split(' ');
                    return (
                      <>
                        {amountPart}
                        {assetPart ? <span className="ml-1 text-gray-400">{assetPart}</span> : null}
                      </>
                    );
                  })()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPayout(null)}
                className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-gray-100 transition hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <StatusBadge status={selectedPayout.status} />

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-gray-500">Source</p>
                <p className="text-gray-200">Tournament reward</p>
              </div>
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
                    className="mt-2 inline-block text-xs text-gray-200 hover:underline"
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

            {(() => {
              const selectedId =
                selectedPayout.id ??
                selectedPayout.payout_id ??
                selectedPayout.claim_token ??
                `${selectedPayout.status}-${selectedPayout.expires_at}`;
              const hasClaimRef =
                !!selectedPayout.claim_token || !!selectedPayout.payout_id || !!selectedPayout.id;
              const canClaim =
                selectedPayout.status === 'CREATED' && hasClaimRef && !!walletAddress;
              const isClaiming = claimingId === selectedId;

              if (!canClaim) return null;

              return (
                <button
                  type="button"
                  onClick={() => handleClaim(selectedPayout)}
                  disabled={isClaiming}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-300/30 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-100 transition-all duration-200 hover:border-emerald-200/50 hover:bg-emerald-500/22 active:translate-y-[1px] active:scale-[0.99] active:bg-emerald-500/18 disabled:opacity-60"
                >
                  {!isClaiming ? <CoinIcon /> : null}
                  {isClaiming ? 'Claiming...' : 'Claim payout'}
                </button>
              );
            })()}
          </div>
        </div>
      )}
    </section>
  );
}
