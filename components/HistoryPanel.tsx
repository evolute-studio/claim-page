'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getIdentityToken, useIdentityToken } from '@privy-io/react-auth';
import { ChevronDown, Inbox, RotateCw } from 'lucide-react';
import { getMyPayouts, getMyWithdrawals } from '@/lib/api';
import { getCctpConfig, getDestinationChains } from '@/lib/cctp';
import { getExplorerTxUrl } from '@/lib/explorer';
import { StatusBadge } from '@/components/StatusBadge';
import { WithdrawalStatusBadge } from '@/components/WithdrawalStatusBadge';
import { truncateAddress } from '@/lib/format';
import type { PayoutPreview } from '@/types/payout';
import type { DestinationChain, WithdrawalListItem } from '@/types/withdrawal';

type HistoryView = 'incomes' | 'outcomes';
type LoadHistoryOptions = {
  showRefreshIndicator?: boolean;
};

const VIEW_STAGGER_STEP_MS = 45;
const VIEW_STAGGER_MAX_MS = 360;
const VIEW_STAGGER_ROW_PX = 92;
const PAYOUT_HIGHLIGHT_DURATION_MS = 2800;
const PAYOUT_HIGHLIGHT_SCROLL_DELAY_MS = 90;

function scrollRowToListCenter(row: HTMLDivElement, list: HTMLDivElement) {
  const rowRect = row.getBoundingClientRect();
  const listRect = list.getBoundingClientRect();
  const currentTop = list.scrollTop;
  const rowOffsetWithinList = rowRect.top - listRect.top;
  const targetTop = Math.max(
    0,
    currentTop + rowOffsetWithinList - list.clientHeight / 2 + rowRect.height / 2
  );

  list.scrollTo({ top: targetTop, behavior: 'smooth' });
}

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

function openExplorerUrl(chain: string, txHash: string, forceBaseSepolia = false) {
  return getExplorerTxUrl(chain, txHash, { forceBaseSepolia });
}

function EmptyHistoryState({ view }: { view: HistoryView }) {
  const title = view === 'incomes' ? 'No incomes yet' : 'No outcomes yet';
  const description =
    view === 'incomes'
      ? 'Once you receive payouts, they will appear here.'
      : 'Once you send funds, they will appear here.';

  return (
    <div className="flex h-full min-h-0 items-center justify-center px-4">
      <div className="mx-auto flex h-[188px] w-full max-w-[300px] flex-col items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-5 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-gray-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
          <Inbox className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="font-num mt-2.5 text-[15px] font-medium tracking-[0.02em] text-white">{title}</p>
        <p className="mt-1 min-h-[44px] text-sm leading-5 text-gray-400">{description}</p>
      </div>
    </div>
  );
}

export function HistoryPanel({
  focusToken,
  focusPayoutRef,
  focusWithdrawalRef,
  isActive = true,
}: {
  focusToken?: string | null;
  focusPayoutRef?: string | null;
  focusWithdrawalRef?: string | null;
  isActive?: boolean;
}) {
  const { identityToken } = useIdentityToken();
  const config = useMemo(() => getCctpConfig(), []);
  const destinations = useMemo(() => getDestinationChains(config.sourceChain), [config.sourceChain]);
  const [view, setView] = useState<HistoryView>('incomes');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshIconSpinning, setRefreshIconSpinning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payouts, setPayouts] = useState<PayoutPreview[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalListItem[]>([]);
  const [expandedIncomeId, setExpandedIncomeId] = useState<string | null>(null);
  const [expandedOutcomeId, setExpandedOutcomeId] = useState<string | null>(null);
  const [highlightedIncomeId, setHighlightedIncomeId] = useState<string | null>(null);
  const [highlightedOutcomeId, setHighlightedOutcomeId] = useState<string | null>(null);
  const [incomesScrolling, setIncomesScrolling] = useState(false);
  const [outcomesScrolling, setOutcomesScrolling] = useState(false);
  const incomesScrollTimeoutRef = useRef<number | null>(null);
  const outcomesScrollTimeoutRef = useRef<number | null>(null);
  const highlightIncomeTimeoutRef = useRef<number | null>(null);
  const highlightOutcomeTimeoutRef = useRef<number | null>(null);
  const incomesScrollArmedRef = useRef(false);
  const outcomesScrollArmedRef = useRef(false);
  const identityTokenRef = useRef<string | null>(identityToken ?? null);
  const didInitialLoadRef = useRef(false);
  const incomesListRef = useRef<HTMLDivElement | null>(null);
  const outcomesListRef = useRef<HTMLDivElement | null>(null);
  const incomeRowRefsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const outcomeRowRefsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingScrollRestoreRef = useRef<{ incomes: number; outcomes: number } | null>(null);
  const lastHandledIncomeFocusSignatureRef = useRef<string | null>(null);
  const lastHandledOutcomeFocusSignatureRef = useRef<string | null>(null);
  const lastFocusRefreshSignatureRef = useRef<string | null>(null);
  const refreshSpinHasFullTurnRef = useRef(false);
  const refreshSpinStopRequestedRef = useRef(false);

  useEffect(() => {
    identityTokenRef.current = identityToken ?? null;
  }, [identityToken]);

  const getAuthToken = useCallback(async () => {
    const cachedToken = identityTokenRef.current?.trim() ?? '';
    if (cachedToken) return cachedToken;

    try {
      const freshToken = await getIdentityToken();
      const normalizedFreshToken = freshToken?.trim() ?? '';
      if (normalizedFreshToken) return normalizedFreshToken;
    } catch {
      // Fall through to unified error message.
    }

    throw new Error('Missing identity token. Please re-login.');
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
    [getAuthToken]
  );

  useEffect(() => {
    if (didInitialLoadRef.current) return;
    didInitialLoadRef.current = true;
    void loadHistory('initial');
  }, [loadHistory]);

  useEffect(() => {
    if (!focusToken && !focusPayoutRef && !focusWithdrawalRef) return;
    if (loading) return;
    const signature = `${focusToken ?? ''}|${focusPayoutRef ?? ''}|${focusWithdrawalRef ?? ''}`;
    if (lastFocusRefreshSignatureRef.current === signature) return;
    lastFocusRefreshSignatureRef.current = signature;
    void loadHistory('background');
  }, [focusPayoutRef, focusToken, focusWithdrawalRef, loadHistory, loading]);

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
  const focusedIncomeId = useMemo(() => {
    const focused = incomes.find((item) => {
      if (focusPayoutRef) {
        if (item.id === focusPayoutRef) return true;
        if (item.payout_id === focusPayoutRef) return true;
        if (item.claim_token === focusPayoutRef) return true;
      }
      if (focusToken && item.claim_token === focusToken) return true;
      return false;
    });
    if (!focused) return null;
    return focused.id ?? focused.payout_id ?? focused.claim_token ?? `${focused.status}-${focused.expires_at}`;
  }, [focusPayoutRef, focusToken, incomes]);
  const focusedOutcomeId = useMemo(() => {
    if (!focusWithdrawalRef) return null;
    const focused = outcomes.find((item) => item.id === focusWithdrawalRef);
    return focused?.id ?? null;
  }, [focusWithdrawalRef, outcomes]);

  useEffect(() => {
    if (!focusedIncomeId) return;
    const focusSignature = `${focusToken ?? ''}|${focusPayoutRef ?? ''}|${focusedIncomeId}`;
    if (lastHandledIncomeFocusSignatureRef.current === focusSignature) return;
    lastHandledIncomeFocusSignatureRef.current = focusSignature;

    setView('incomes');
    setExpandedIncomeId(null);
    setExpandedOutcomeId(null);

    const timerId = window.setTimeout(() => {
      const row = incomeRowRefsRef.current[focusedIncomeId];
      const list = incomesListRef.current;
      if (row && list) {
        scrollRowToListCenter(row, list);
      }
      setHighlightedIncomeId(focusedIncomeId);
      if (highlightIncomeTimeoutRef.current) {
        window.clearTimeout(highlightIncomeTimeoutRef.current);
      }
      highlightIncomeTimeoutRef.current = window.setTimeout(() => {
        setHighlightedIncomeId((current) => (current === focusedIncomeId ? null : current));
      }, PAYOUT_HIGHLIGHT_DURATION_MS);
    }, PAYOUT_HIGHLIGHT_SCROLL_DELAY_MS);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [focusPayoutRef, focusToken, focusedIncomeId]);

  useEffect(() => {
    if (!focusedOutcomeId) return;
    const focusSignature = `${focusWithdrawalRef ?? ''}|${focusedOutcomeId}`;
    if (lastHandledOutcomeFocusSignatureRef.current === focusSignature) return;
    lastHandledOutcomeFocusSignatureRef.current = focusSignature;

    setView('outcomes');
    setExpandedIncomeId(null);
    setExpandedOutcomeId(null);

    const timerId = window.setTimeout(() => {
      const row = outcomeRowRefsRef.current[focusedOutcomeId];
      const list = outcomesListRef.current;
      if (row && list) {
        scrollRowToListCenter(row, list);
      }
      setHighlightedOutcomeId(focusedOutcomeId);
      if (highlightOutcomeTimeoutRef.current) {
        window.clearTimeout(highlightOutcomeTimeoutRef.current);
      }
      highlightOutcomeTimeoutRef.current = window.setTimeout(() => {
        setHighlightedOutcomeId((current) => (current === focusedOutcomeId ? null : current));
      }, PAYOUT_HIGHLIGHT_DURATION_MS);
    }, PAYOUT_HIGHLIGHT_SCROLL_DELAY_MS);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [focusWithdrawalRef, focusedOutcomeId]);

  const baseExplorer =
    config.sourceChain.id === 84532 ? 'https://sepolia.basescan.org/tx/' : 'https://basescan.org/tx/';
  const getDestinationExplorer = (chain: DestinationChain): string | null => {
    const match = destinations.find((item) => item.key === chain);
    return match?.explorerTxBase ?? null;
  };
  const handleViewChange = useCallback(
    (nextView: HistoryView) => {
      if (nextView === view) return;
      setExpandedIncomeId(null);
      setExpandedOutcomeId(null);
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

  const getVisibleStaggerDelay = useCallback(
    (index: number, kind: HistoryView) => {
      const listEl = kind === 'incomes' ? incomesListRef.current : outcomesListRef.current;
      const firstVisibleIndex = Math.max(0, Math.floor((listEl?.scrollTop ?? 0) / VIEW_STAGGER_ROW_PX));
      const relativeIndex = Math.max(0, index - firstVisibleIndex);
      return Math.min(relativeIndex * VIEW_STAGGER_STEP_MS, VIEW_STAGGER_MAX_MS);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (incomesScrollTimeoutRef.current) {
        window.clearTimeout(incomesScrollTimeoutRef.current);
      }
      if (outcomesScrollTimeoutRef.current) {
        window.clearTimeout(outcomesScrollTimeoutRef.current);
      }
      if (highlightIncomeTimeoutRef.current) {
        window.clearTimeout(highlightIncomeTimeoutRef.current);
      }
      if (highlightOutcomeTimeoutRef.current) {
        window.clearTimeout(highlightOutcomeTimeoutRef.current);
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
                className="rounded-2xl border border-white/[0.08] bg-white/[0.015] p-3"
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
            className={`flex h-full w-[200%] will-change-transform transition-transform duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
              view === 'outcomes' ? '-translate-x-1/2' : 'translate-x-0'
            }`}
          >
            <div className="min-h-0 h-full w-1/2 pr-1">
              {incomes.length === 0 ? (
                <EmptyHistoryState view="incomes" />
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
                  className={`min-h-0 h-full space-y-3 pr-1 transient-scrollbar ${
                    incomesScrolling && view === 'incomes' ? 'transient-scrollbar--visible' : ''
                  }`}
                >
                  {incomes.map((item, index) => {
                    const itemId =
                      item.id ?? item.payout_id ?? item.claim_token ?? `${item.status}-${item.expires_at}`;
                    const isHighlighted = highlightedIncomeId === itemId;
                    const isExpanded = expandedIncomeId === itemId;
                    const toggleIncomeExpanded = () => {
                      setExpandedIncomeId((current) => (current === itemId ? null : itemId));
                    };
                    const tournamentName =
                      item.tournament_name && item.tournament_name.trim()
                        ? item.tournament_name.trim()
                        : 'Tournament';
                    const incomeExplorerUrl = item.tx_hash
                      ? openExplorerUrl(item.chain, item.tx_hash, config.sourceChain.id === 84532)
                      : '';
                    const incomeDate = formatDate(item.paid_at ?? item.created_at);

                    return (
                      <div
                        key={itemId}
                        ref={(node) => {
                          incomeRowRefsRef.current[itemId] = node;
                        }}
                        className={`w-full transform-gpu overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.015] transition-[transform,opacity,filter,border-color] duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-white/[0.14] hover:bg-white/[0.04] ${
                          view === 'incomes'
                            ? 'translate-x-0 opacity-100 brightness-100'
                            : '-translate-x-8 opacity-35 brightness-50'
                        } ${isHighlighted ? 'history-payout-focus-flash' : ''}`}
                        style={{
                          transitionDelay: `${getVisibleStaggerDelay(index, 'incomes')}ms`,
                        }}
                      >
                        <div className="flex flex-col">
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={toggleIncomeExpanded}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                toggleIncomeExpanded();
                              }
                            }}
                            className="flex h-[68px] shrink-0 cursor-pointer items-center justify-between gap-3 p-3"
                            aria-label={isExpanded ? 'Collapse payout details' : 'Expand payout details'}
                            aria-expanded={isExpanded}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-num truncate text-base font-semibold leading-5 text-white">
                                {formatUsdc(item.amount_minor_units)} <span className="text-gray-400">USDC</span>
                              </p>
                              <p className="truncate text-xs leading-4 text-gray-500">{tournamentName}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <StatusBadge status={item.status} />
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleIncomeExpanded();
                                }}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-gray-100 transition hover:bg-white/10"
                                aria-label={isExpanded ? 'Collapse payout details' : 'Expand payout details'}
                                aria-expanded={isExpanded}
                              >
                                <ChevronDown
                                  className={`h-4 w-4 transition-transform duration-300 ${
                                    isExpanded ? 'rotate-180' : 'rotate-0'
                                  }`}
                                />
                              </button>
                            </div>
                          </div>
                          <div
                            className={`grid transition-[grid-template-rows] duration-[380ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
                              isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                            }`}
                          >
                            <div className="min-h-0 overflow-hidden">
                              <div
                                className={`space-y-3 border-t border-white/[0.08] px-3 py-3 text-xs transition-[opacity,transform] duration-[380ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
                                  isExpanded
                                    ? 'translate-y-0 opacity-100'
                                    : 'pointer-events-none -translate-y-1 opacity-0'
                                }`}
                                aria-hidden={!isExpanded}
                              >
                                <div className="space-y-2">
                                  <div className="flex items-start justify-between gap-3">
                                    <p className="text-gray-500">Tournament</p>
                                    <p className="truncate text-right text-gray-200">{tournamentName}</p>
                                  </div>
                                  <div className="flex items-start justify-between gap-3">
                                    <p className="text-gray-500">Date</p>
                                    <p className="text-right text-gray-200">{incomeDate}</p>
                                  </div>
                                </div>
                                {item.tx_hash ? (
                                  <div className="space-y-1">
                                    <p className="text-gray-500">Tx</p>
                                    {incomeExplorerUrl ? (
                                      <a
                                        href={incomeExplorerUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="break-all text-gray-300 hover:text-white hover:underline"
                                      >
                                        {truncateHash(item.tx_hash)}
                                      </a>
                                    ) : (
                                      <p className="break-all text-gray-300">{truncateHash(item.tx_hash)}</p>
                                    )}
                                  </div>
                                ) : null}
                                {item.failure_reason ? (
                                  <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2">
                                    <p className="text-xs text-red-300">{item.failure_reason}</p>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="min-h-0 h-full w-1/2 pl-1">
              {outcomes.length === 0 ? (
                <EmptyHistoryState view="outcomes" />
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
                  className={`min-h-0 h-full space-y-3 pr-1 transient-scrollbar ${
                    outcomesScrolling && view === 'outcomes' ? 'transient-scrollbar--visible' : ''
                  }`}
                >
                  {outcomes.map((item, index) => {
                    const destinationLabel =
                      destinations.find((dest) => dest.key === item.dest_chain)?.label ?? item.dest_chain;
                    const isExpanded = expandedOutcomeId === item.id;
                    const toggleOutcomeExpanded = () => {
                      setExpandedOutcomeId((current) => (current === item.id ? null : item.id));
                    };
                    const destinationExplorerBase = getDestinationExplorer(item.dest_chain);
                    const destinationValue = item.dest_address
                      ? `${destinationLabel} • ${truncateAddress(item.dest_address)}`
                      : destinationLabel;

                    return (
                      <div
                        key={item.id}
                        ref={(node) => {
                          outcomeRowRefsRef.current[item.id] = node;
                        }}
                        className={`w-full transform-gpu overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.015] transition-[transform,opacity,filter,border-color] duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-white/[0.14] hover:bg-white/[0.04] ${
                          view === 'outcomes'
                            ? 'translate-x-0 opacity-100 brightness-100'
                            : 'translate-x-8 opacity-35 brightness-50'
                        } ${highlightedOutcomeId === item.id ? 'history-payout-focus-flash' : ''}`}
                        style={{
                          transitionDelay: `${getVisibleStaggerDelay(index, 'outcomes')}ms`,
                        }}
                      >
                        <div className="flex flex-col">
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={toggleOutcomeExpanded}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                toggleOutcomeExpanded();
                              }
                            }}
                            className="flex h-[68px] shrink-0 cursor-pointer items-center justify-between gap-3 p-3"
                            aria-label={isExpanded ? 'Collapse withdrawal details' : 'Expand withdrawal details'}
                            aria-expanded={isExpanded}
                          >
                            <div className="min-w-0 flex-1">
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
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleOutcomeExpanded();
                                }}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-gray-100 transition hover:bg-white/10"
                                aria-label={isExpanded ? 'Collapse withdrawal details' : 'Expand withdrawal details'}
                                aria-expanded={isExpanded}
                              >
                                <ChevronDown
                                  className={`h-4 w-4 transition-transform duration-300 ${
                                    isExpanded ? 'rotate-180' : 'rotate-0'
                                  }`}
                                />
                              </button>
                            </div>
                          </div>
                          <div
                            className={`grid transition-[grid-template-rows] duration-[380ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
                              isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                            }`}
                          >
                            <div className="min-h-0 overflow-hidden">
                              <div
                                className={`space-y-3 border-t border-white/[0.08] px-3 py-3 text-xs transition-[opacity,transform] duration-[380ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
                                  isExpanded
                                    ? 'translate-y-0 opacity-100'
                                    : 'pointer-events-none -translate-y-1 opacity-0'
                                }`}
                                aria-hidden={!isExpanded}
                              >
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="col-span-2">
                                    <p className="text-gray-500">To</p>
                                    <p className="truncate text-gray-200">{destinationValue}</p>
                                  </div>
                                </div>
                                {item.burn_tx_hash ? (
                                  <div className="space-y-1">
                                    <p className="text-gray-500">Burn tx</p>
                                    <a
                                      href={`${baseExplorer}${item.burn_tx_hash}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="break-all text-gray-300 hover:text-white hover:underline"
                                    >
                                      {truncateHash(item.burn_tx_hash)}
                                    </a>
                                  </div>
                                ) : null}
                                {item.forward_tx_hash ? (
                                  <div className="space-y-1">
                                    <p className="text-gray-500">Mint tx</p>
                                    {destinationExplorerBase ? (
                                      <a
                                        href={`${destinationExplorerBase}${item.forward_tx_hash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="break-all text-gray-300 hover:text-white hover:underline"
                                      >
                                        {truncateHash(item.forward_tx_hash)}
                                      </a>
                                    ) : (
                                      <p className="break-all text-gray-300">{truncateHash(item.forward_tx_hash)}</p>
                                    )}
                                  </div>
                                ) : null}
                                {item.failure_reason ? (
                                  <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2">
                                    <p className="text-xs text-red-300">{item.failure_reason}</p>
                                  </div>
                                ) : null}
                              </div>
                            </div>
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

    </section>
  );
}
