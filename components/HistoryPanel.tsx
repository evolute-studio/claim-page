'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getIdentityToken, useIdentityToken, useWallets } from '@privy-io/react-auth';
import { RotateCw } from 'lucide-react';
import {
  confirmClaim,
  confirmClaimByPayoutId,
  getMyPayouts,
  getMyWithdrawals,
} from '@/lib/api';
import { getCctpConfig, getDestinationChains } from '@/lib/cctp';
import { CoinIcon } from '@/components/CoinIcon';
import { StatusBadge } from '@/components/StatusBadge';
import { WithdrawalStatusBadge } from '@/components/WithdrawalStatusBadge';
import { truncateAddress } from '@/lib/format';
import type { PayoutPreview } from '@/types/payout';
import type { DestinationChain, WithdrawalListItem } from '@/types/withdrawal';

type HistoryView = 'incomes' | 'outcomes';
type LoadHistoryOptions = {
  showRefreshIndicator?: boolean;
};
type HistorySelected =
  | { kind: 'income'; item: PayoutPreview }
  | { kind: 'outcome'; item: WithdrawalListItem };

function formatUsdc(minor: number): string {
  return (minor / 1_000_000).toFixed(2);
}

function formatDate(timestamp?: number | null): string {
  if (!timestamp) return '—';
  const ms = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  return new Date(ms).toLocaleString();
}

function truncateHash(value: string): string {
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function openExplorerUrl(chain: string, txHash: string) {
  const normalized = chain.toLowerCase();
  if (normalized.includes('base')) return `https://basescan.org/tx/${txHash}`;
  if (normalized.includes('arbitrum')) return `https://arbiscan.io/tx/${txHash}`;
  if (normalized.includes('optimism')) return `https://optimistic.etherscan.io/tx/${txHash}`;
  if (normalized.includes('polygon')) return `https://polygonscan.com/tx/${txHash}`;
  if (normalized.includes('ethereum')) return `https://etherscan.io/tx/${txHash}`;
  return '';
}

function VerticalDotsIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12 6h.01M12 12h.01M12 18h.01"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M18 6 6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m6 6 12 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HistoryPanel({
  focusToken,
  isActive = true,
}: {
  focusToken?: string | null;
  isActive?: boolean;
}) {
  const { identityToken } = useIdentityToken();
  const { wallets } = useWallets();
  const walletAddress = wallets[0]?.address;
  const config = useMemo(() => getCctpConfig(), []);
  const destinations = useMemo(() => getDestinationChains(config.sourceChain), [config.sourceChain]);
  const [view, setView] = useState<HistoryView>('incomes');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshIconSpinning, setRefreshIconSpinning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payouts, setPayouts] = useState<PayoutPreview[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalListItem[]>([]);
  const [selected, setSelected] = useState<HistorySelected | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [incomesScrolling, setIncomesScrolling] = useState(false);
  const [outcomesScrolling, setOutcomesScrolling] = useState(false);
  const incomesScrollTimeoutRef = useRef<number | null>(null);
  const outcomesScrollTimeoutRef = useRef<number | null>(null);
  const incomesScrollArmedRef = useRef(false);
  const outcomesScrollArmedRef = useRef(false);
  const identityTokenRef = useRef<string | null>(identityToken ?? null);
  const didInitialLoadRef = useRef(false);
  const incomesListRef = useRef<HTMLDivElement | null>(null);
  const outcomesListRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollRestoreRef = useRef<{ incomes: number; outcomes: number } | null>(null);
  const refreshSpinHasFullTurnRef = useRef(false);
  const refreshSpinStopRequestedRef = useRef(false);

  useEffect(() => {
    identityTokenRef.current = identityToken ?? null;
  }, [identityToken]);

  const getAuthToken = useCallback(async () => {
    let freshToken: string | null = null;
    try {
      freshToken = await getIdentityToken();
    } catch {
      freshToken = null;
    }
    const token = freshToken ?? identityTokenRef.current;
    if (!token) throw new Error('Missing identity token. Please re-login.');
    return token;
  }, []);

  const loadHistory = useCallback(
    async (mode: 'initial' | 'background' = 'background', options: LoadHistoryOptions = {}) => {
      const showRefreshIndicator = options.showRefreshIndicator ?? false;
      if (mode === 'initial') {
        setLoading(true);
        setError(null);
      } else if (showRefreshIndicator) {
        setRefreshing(true);
        pendingScrollRestoreRef.current = {
          incomes: incomesListRef.current?.scrollTop ?? 0,
          outcomes: outcomesListRef.current?.scrollTop ?? 0,
        };
      }
      try {
        const token = await getAuthToken();
        const [payoutData, withdrawalData] = await Promise.all([
          getMyPayouts(token),
          getMyWithdrawals(token),
        ]);
        setPayouts(payoutData.payouts);
        setWithdrawals(withdrawalData.withdrawals);
        setError(null);

        if (focusToken) {
          const focused = payoutData.payouts.find((item) => item.claim_token === focusToken);
          if (focused) {
            setView('incomes');
            setSelected({ kind: 'income', item: focused });
          }
        }
      } catch (requestError) {
        const message =
          requestError instanceof Error ? requestError.message : 'Failed to load history';
        setError(message);
      } finally {
        if (mode === 'initial') {
          setLoading(false);
        } else if (showRefreshIndicator) {
          setRefreshing(false);
        }
      }
    },
    [focusToken, getAuthToken]
  );

  useEffect(() => {
    if (didInitialLoadRef.current) return;
    didInitialLoadRef.current = true;
    void loadHistory('initial');
  }, [loadHistory]);

  useEffect(() => {
    if (loading) return;
    const timerId = window.setInterval(() => {
      void loadHistory('background');
    }, 12_000);

    return () => window.clearInterval(timerId);
  }, [loading, loadHistory]);

  useLayoutEffect(() => {
    const pending = pendingScrollRestoreRef.current;
    if (!pending) return;
    if (incomesListRef.current) incomesListRef.current.scrollTop = pending.incomes;
    if (outcomesListRef.current) outcomesListRef.current.scrollTop = pending.outcomes;
    pendingScrollRestoreRef.current = null;
  }, [payouts, withdrawals]);

  const incomes = useMemo(
    () =>
      [...payouts]
        .filter((item) => item.status !== 'CREATED')
        .sort((a, b) => (b.updated_at ?? b.created_at ?? 0) - (a.updated_at ?? a.created_at ?? 0)),
    [payouts]
  );
  const outcomes = useMemo(
    () =>
      [...withdrawals].sort(
        (a, b) =>
          (b.updated_at ?? b.forward_tx_at ?? b.created_at ?? 0) -
          (a.updated_at ?? a.forward_tx_at ?? a.created_at ?? 0)
      ),
    [withdrawals]
  );

  const handleClaim = useCallback(
    async (item: PayoutPreview) => {
      if (!walletAddress) return;
      const payoutId = item.payout_id ?? item.id;
      if (!item.claim_token && !payoutId) return;

      const itemId = item.id ?? item.payout_id ?? item.claim_token ?? null;
      setClaimingId(itemId);
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
            if (!canRetryById) throw claimByTokenError;
            await confirmClaimByPayoutId(payoutId, walletAddress, token);
          }
        } else if (payoutId) {
          await confirmClaimByPayoutId(payoutId, walletAddress, token);
        }
        await loadHistory('background');
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
    },
    [getAuthToken, loadHistory, walletAddress]
  );

  const baseExplorer =
    config.sourceChain.id === 84532 ? 'https://sepolia.basescan.org/tx/' : 'https://basescan.org/tx/';
  const getDestinationExplorer = (chain: DestinationChain): string | null => {
    const match = destinations.find((item) => item.key === chain);
    return match?.explorerTxBase ?? null;
  };
  const handleViewChange = useCallback(
    (nextView: HistoryView) => {
      if (nextView === view) return;
      setView(nextView);
    },
    [view]
  );
  const markListScrolling = useCallback((kind: HistoryView) => {
    if (kind === 'incomes') {
      setIncomesScrolling(true);
      if (incomesScrollTimeoutRef.current) {
        window.clearTimeout(incomesScrollTimeoutRef.current);
      }
      incomesScrollTimeoutRef.current = window.setTimeout(() => {
        setIncomesScrolling(false);
        incomesScrollArmedRef.current = false;
      }, 1100);
      return;
    }

    setOutcomesScrolling(true);
    if (outcomesScrollTimeoutRef.current) {
      window.clearTimeout(outcomesScrollTimeoutRef.current);
    }
    outcomesScrollTimeoutRef.current = window.setTimeout(() => {
      setOutcomesScrolling(false);
      outcomesScrollArmedRef.current = false;
    }, 1100);
  }, []);

  const armListScroll = useCallback((kind: HistoryView) => {
    if (kind === 'incomes') {
      incomesScrollArmedRef.current = true;
      return;
    }
    outcomesScrollArmedRef.current = true;
  }, []);

  const handleListScroll = useCallback(
    (kind: HistoryView) => {
      const armed = kind === 'incomes' ? incomesScrollArmedRef.current : outcomesScrollArmedRef.current;
      if (!armed) return;
      markListScrolling(kind);
    },
    [markListScrolling]
  );

  useEffect(() => {
    return () => {
      if (incomesScrollTimeoutRef.current) {
        window.clearTimeout(incomesScrollTimeoutRef.current);
      }
      if (outcomesScrollTimeoutRef.current) {
        window.clearTimeout(outcomesScrollTimeoutRef.current);
      }
      incomesScrollArmedRef.current = false;
      outcomesScrollArmedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (refreshing) {
      refreshSpinStopRequestedRef.current = false;
      refreshSpinHasFullTurnRef.current = false;
      setRefreshIconSpinning(true);
      return;
    }

    if (refreshIconSpinning) {
      refreshSpinStopRequestedRef.current = true;
    }
  }, [refreshing, refreshIconSpinning]);

  const handleRefreshSpinIteration = useCallback(() => {
    refreshSpinHasFullTurnRef.current = true;
    if (!refreshSpinStopRequestedRef.current) return;

    refreshSpinStopRequestedRef.current = false;
    refreshSpinHasFullTurnRef.current = false;
    setRefreshIconSpinning(false);
  }, []);

  const handleManualRefresh = useCallback(() => {
    if (refreshing || refreshIconSpinning) return;
    void loadHistory('background', { showRefreshIndicator: true });
  }, [loadHistory, refreshIconSpinning, refreshing]);

  return (
    <section className="flex h-full min-h-0 w-full flex-col gap-4 rounded-2xl border border-white/10 bg-[#111111] p-5 animate-fade-in-up">
      <div
        className={`flex items-center justify-between gap-3 transition-[transform,opacity,filter] duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isActive ? 'translate-x-0 opacity-100 brightness-100' : 'translate-x-8 opacity-35 brightness-50'
        }`}
        style={{ transitionDelay: '0ms' }}
      >
        <h2 className="text-lg font-semibold text-white">History</h2>
        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={refreshing || refreshIconSpinning}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-gray-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
          aria-label="Refresh history"
          title="Refresh history"
        >
          <span
            onAnimationIteration={handleRefreshSpinIteration}
            className={refreshIconSpinning ? 'animate-history-refresh-spin' : ''}
          >
            <RotateCw className="h-4 w-4" />
          </span>
        </button>
      </div>

      <div
        className={`relative flex items-center rounded-xl border border-white/10 bg-black/35 p-1 transition-[transform,opacity,filter] duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isActive ? 'translate-x-0 opacity-100 brightness-100' : 'translate-x-8 opacity-35 brightness-50'
        }`}
        style={{ transitionDelay: '80ms' }}
      >
        <span
          className={`pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-white/10 transition-transform duration-300 ease-out ${
            view === 'outcomes' ? 'translate-x-full' : 'translate-x-0'
          }`}
          aria-hidden="true"
        />
        <button
          type="button"
          onClick={() => handleViewChange('incomes')}
          className={`relative z-10 h-10 flex-1 rounded-lg text-sm font-medium transition ${
            view === 'incomes' ? 'text-white' : 'text-gray-300 hover:bg-white/5'
          }`}
        >
          Incomes
        </button>
        <button
          type="button"
          onClick={() => handleViewChange('outcomes')}
          className={`relative z-10 h-10 flex-1 rounded-lg text-sm font-medium transition ${
            view === 'outcomes' ? 'text-white' : 'text-gray-300 hover:bg-white/5'
          }`}
        >
          Outcomes
        </button>
      </div>

      {error && (
        <div
          className={`rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300 transition-[transform,opacity,filter] duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
            isActive ? 'translate-x-0 opacity-100 brightness-100' : 'translate-x-8 opacity-35 brightness-50'
          }`}
          style={{ transitionDelay: '120ms' }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div
          className={`min-h-0 flex-1 overflow-hidden transition-[transform,opacity,filter] duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
            isActive ? 'translate-x-0 opacity-100 brightness-100' : 'translate-x-8 opacity-35 brightness-50'
          }`}
          style={{ transitionDelay: '160ms' }}
        >
          <div className="h-full space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={`history-skeleton-${index}`}
                className="rounded-2xl border border-white/8 bg-black/35 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="inline-flex h-6 w-28 animate-pulse rounded bg-white/10" />
                    <span className="mt-2 block h-3.5 w-24 animate-pulse rounded bg-white/8" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-24 animate-pulse rounded-full bg-white/10" />
                    <span className="inline-flex h-8 w-8 animate-pulse rounded-full bg-white/10" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div
          className={`min-h-0 flex-1 overflow-hidden transition-[transform,opacity,filter] duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
            isActive ? 'translate-x-0 opacity-100 brightness-100' : 'translate-x-8 opacity-35 brightness-50'
          }`}
          style={{ transitionDelay: '160ms' }}
        >
          <div
            className={`flex h-full w-[200%] transition-transform duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
              view === 'outcomes' ? '-translate-x-1/2' : 'translate-x-0'
            }`}
          >
            <div className="min-h-0 h-full w-1/2">
              {incomes.length === 0 ? (
                <p className="text-sm text-gray-400">No incomes found.</p>
              ) : (
                <div
                  ref={incomesListRef}
                  onWheel={() => {
                    armListScroll('incomes');
                    markListScrolling('incomes');
                  }}
                  onTouchStart={() => armListScroll('incomes')}
                  onTouchMove={() => armListScroll('incomes')}
                  onScroll={() => handleListScroll('incomes')}
                  className={`min-h-0 h-full space-y-3 transient-scrollbar ${
                    incomesScrolling && view === 'incomes' ? 'transient-scrollbar--visible' : ''
                  }`}
                >
                  {incomes.map((item, index) => {
                    const itemId =
                      item.id ?? item.payout_id ?? item.claim_token ?? `${item.status}-${item.expires_at}`;
                    return (
                      <div
                        key={itemId}
                        className={`rounded-2xl border border-white/8 bg-black/35 p-3 transition-[transform,opacity,filter,border-color] duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-white/14 ${
                          view === 'incomes'
                            ? 'translate-x-0 opacity-100 brightness-100'
                            : '-translate-x-8 opacity-35 brightness-50'
                        }`}
                        style={{ transitionDelay: `${Math.min(index * 45, 360)}ms` }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-num truncate text-base font-semibold leading-5 text-white">
                              {formatUsdc(item.amount_minor_units)} <span className="text-gray-400">USDC</span>
                            </p>
                            <p className="truncate text-xs leading-4 text-gray-500">Tournament reward</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <StatusBadge status={item.status} />
                            <button
                              type="button"
                              onClick={() => setSelected({ kind: 'income', item })}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-gray-100 transition hover:bg-white/10"
                              aria-label="Open details"
                            >
                              <VerticalDotsIcon />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="min-h-0 h-full w-1/2">
              {outcomes.length === 0 ? (
                <p className="text-sm text-gray-400">No outcomes found.</p>
              ) : (
                <div
                  ref={outcomesListRef}
                  onWheel={() => {
                    armListScroll('outcomes');
                    markListScrolling('outcomes');
                  }}
                  onTouchStart={() => armListScroll('outcomes')}
                  onTouchMove={() => armListScroll('outcomes')}
                  onScroll={() => handleListScroll('outcomes')}
                  className={`min-h-0 h-full space-y-3 transient-scrollbar ${
                    outcomesScrolling && view === 'outcomes' ? 'transient-scrollbar--visible' : ''
                  }`}
                >
                  {outcomes.map((item, index) => {
                    const destinationLabel =
                      destinations.find((dest) => dest.key === item.dest_chain)?.label ?? item.dest_chain;

                    return (
                      <div
                        key={item.id}
                        className={`rounded-2xl border border-white/8 bg-black/35 p-3 transition-[transform,opacity,filter,border-color] duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-white/14 ${
                          view === 'outcomes'
                            ? 'translate-x-0 opacity-100 brightness-100'
                            : 'translate-x-8 opacity-35 brightness-50'
                        }`}
                        style={{ transitionDelay: `${Math.min(index * 45, 360)}ms` }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-num truncate text-base font-semibold leading-5 text-white">
                              {formatUsdc(item.transfer_amount_usdc_minor)}{' '}
                              <span className="text-gray-400">USDC</span>
                            </p>
                            <p className="truncate text-xs leading-4 text-gray-500">{destinationLabel}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <WithdrawalStatusBadge status={item.status} />
                            <button
                              type="button"
                              onClick={() => setSelected({ kind: 'outcome', item })}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-gray-100 transition hover:bg-white/10"
                              aria-label="Open details"
                            >
                              <VerticalDotsIcon />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selected?.kind === 'income' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#111111] p-5 space-y-4 animate-sheet-in">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Income details</h3>
                <p className="text-sm text-gray-300">
                  {formatUsdc(selected.item.amount_minor_units)}{' '}
                  <span className="text-gray-400">USDC</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-white transition hover:bg-white/10"
                aria-label="Close details"
                title="Close"
              >
                <CloseIcon />
              </button>
            </div>

            <StatusBadge status={selected.item.status} />

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-gray-500">Source</p>
                <p className="text-gray-200">Tournament reward</p>
              </div>
              <div>
                <p className="text-gray-500">Chain</p>
                <p className="text-gray-200">{selected.item.chain}</p>
              </div>
              <div>
                <p className="text-gray-500">Recipient</p>
                <p className="text-gray-200">{selected.item.recipient_email || '—'}</p>
              </div>
              <div>
                <p className="text-gray-500">Created</p>
                <p className="text-gray-200">{formatDate(selected.item.created_at)}</p>
              </div>
              <div>
                <p className="text-gray-500">Updated</p>
                <p className="text-gray-200">{formatDate(selected.item.updated_at)}</p>
              </div>
              <div>
                <p className="text-gray-500">Paid</p>
                <p className="text-gray-200">{formatDate(selected.item.paid_at)}</p>
              </div>
            </div>

            {selected.item.tx_hash && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Transaction</p>
                <p className="text-xs text-gray-300 break-all">{truncateHash(selected.item.tx_hash)}</p>
                {openExplorerUrl(selected.item.chain, selected.item.tx_hash) && (
                  <a
                    href={openExplorerUrl(selected.item.chain, selected.item.tx_hash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs text-gray-200 hover:underline"
                  >
                    View in explorer
                  </a>
                )}
              </div>
            )}

            {selected.item.failure_reason && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3">
                <p className="text-xs text-red-300">{selected.item.failure_reason}</p>
              </div>
            )}

            {(() => {
              const payoutId = selected.item.payout_id ?? selected.item.id;
              const canClaim =
                selected.item.status === 'CREATED' &&
                (!!selected.item.claim_token || !!payoutId) &&
                !!walletAddress;
              const claimKey =
                selected.item.id ??
                selected.item.payout_id ??
                selected.item.claim_token ??
                `${selected.item.status}-${selected.item.expires_at}`;
              const isClaiming = claimingId === claimKey;

              if (!canClaim) return null;

              return (
                <button
                  type="button"
                  onClick={() => void handleClaim(selected.item)}
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

      {selected?.kind === 'outcome' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#111111] p-5 space-y-4 animate-sheet-in">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Outcome details</h3>
                <p className="font-num text-sm text-gray-300">
                  {formatUsdc(selected.item.transfer_amount_usdc_minor)}{' '}
                  <span className="text-gray-400">USDC</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-white transition hover:bg-white/10"
                aria-label="Close details"
                title="Close"
              >
                <CloseIcon />
              </button>
            </div>

            <WithdrawalStatusBadge status={selected.item.status} />

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-gray-500">Destination</p>
                <p className="text-gray-200">
                  {destinations.find((dest) => dest.key === selected.item.dest_chain)?.label ??
                    selected.item.dest_chain}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Address</p>
                <p className="text-gray-200">
                  {selected.item.dest_address ? truncateAddress(selected.item.dest_address) : '—'}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Created</p>
                <p className="text-gray-200">{formatDate(selected.item.created_at)}</p>
              </div>
              <div>
                <p className="text-gray-500">Updated</p>
                <p className="text-gray-200">{formatDate(selected.item.updated_at)}</p>
              </div>
            </div>

            {selected.item.burn_tx_hash && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Burn tx</p>
                <p className="text-xs text-gray-300 break-all">{truncateHash(selected.item.burn_tx_hash)}</p>
                <a
                  href={`${baseExplorer}${selected.item.burn_tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs text-gray-200 hover:underline"
                >
                  View in explorer
                </a>
              </div>
            )}

            {selected.item.forward_tx_hash && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Mint tx</p>
                <p className="text-xs text-gray-300 break-all">{truncateHash(selected.item.forward_tx_hash)}</p>
                {getDestinationExplorer(selected.item.dest_chain) && (
                  <a
                    href={`${getDestinationExplorer(selected.item.dest_chain)}${selected.item.forward_tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs text-gray-200 hover:underline"
                  >
                    View in explorer
                  </a>
                )}
              </div>
            )}

            {selected.item.failure_reason && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3">
                <p className="text-xs text-red-300">{selected.item.failure_reason}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
