'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getIdentityToken, useIdentityToken } from '@privy-io/react-auth';
import { getMyWithdrawals } from '@/lib/api';
import { getCctpConfig, getDestinationChains } from '@/lib/cctp';
import { truncateAddress } from '@/lib/format';
import type { DestinationChain, WithdrawalListItem, WithdrawalStatus } from '@/types/withdrawal';
import { WithdrawalStatusBadge } from '@/components/WithdrawalStatusBadge';

const FILTERS: Array<{ label: string; value: 'ALL' | WithdrawalStatus }> = [
  { label: 'All', value: 'ALL' },
  { label: 'Pending', value: 'FORWARDING_PENDING' },
  { label: 'Completed', value: 'MINTED' },
  { label: 'Failed', value: 'FAILED' },
  { label: 'Expired', value: 'EXPIRED' },
];

function formatUsdc(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return '0.00';
  return (minor / 1_000_000).toFixed(2);
}

function formatPillUsdc(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return '0.00';
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

export function WithdrawalsPanel() {
  const { identityToken } = useIdentityToken();
  const config = useMemo(() => getCctpConfig(), []);
  const destinations = useMemo(() => getDestinationChains(config.sourceChain), [config.sourceChain]);

  const [withdrawals, setWithdrawals] = useState<WithdrawalListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<WithdrawalListItem | null>(null);
  const [activeFilter, setActiveFilter] = useState<'ALL' | WithdrawalStatus>('ALL');

  const getAuthToken = useCallback(async () => {
    let freshToken: string | null = null;
    try {
      freshToken = await getIdentityToken();
    } catch {
      freshToken = null;
    }
    const token = freshToken ?? identityToken;
    if (!token) {
      throw new Error('Missing identity token. Please re-login.');
    }
    return token;
  }, [identityToken]);

  const loadWithdrawals = useCallback(async (mode: 'initial' | 'background' = 'background') => {
    if (mode === 'initial') {
      setLoading(true);
      setError(null);
    } else {
      setRefreshing(true);
    }
    try {
      const token = await getAuthToken();
      const data = await getMyWithdrawals(token);
      setWithdrawals(data.withdrawals);
      setError(null);
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : 'Failed to load withdrawals';
      setError(message);
    } finally {
      if (mode === 'initial') {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }, [getAuthToken]);

  useEffect(() => {
    loadWithdrawals('initial');
  }, [loadWithdrawals]);

  const visibleWithdrawals = useMemo(() => {
    if (activeFilter === 'ALL') return withdrawals;
    return withdrawals.filter((item) => item.status === activeFilter);
  }, [activeFilter, withdrawals]);

  const baseExplorer =
    config.sourceChain.id === 84532
      ? 'https://sepolia.basescan.org/tx/'
      : 'https://basescan.org/tx/';

  const getExplorer = (chain: DestinationChain): string | null => {
    const match = destinations.find((item) => item.key === chain);
    return match?.explorerTxBase ?? null;
  };

  return (
    <section className="flex h-full min-h-0 w-full flex-col gap-4 rounded-2xl border border-white/10 bg-[#111111] p-5 animate-fade-in-up">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Your withdrawals</h2>
        <button
          type="button"
          onClick={() => loadWithdrawals('background')}
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
        <p className="text-sm text-gray-400">Loading withdrawals...</p>
      ) : visibleWithdrawals.length === 0 ? (
        <p className="text-sm text-gray-400">No withdrawals found.</p>
      ) : (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {visibleWithdrawals.map((item) => {
            const destinationLabel =
              destinations.find((dest) => dest.key === item.dest_chain)?.label ?? item.dest_chain;

            return (
              <div
                key={item.id}
                className="rounded-2xl border border-white/8 bg-black/35 p-3 transition hover:border-white/14"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-num truncate text-base font-semibold leading-5 text-white">
                      {formatPillUsdc(item.transfer_amount_usdc_minor)}{' '}
                      <span className="text-gray-400">USDC</span>
                    </p>
                    <p className="truncate text-xs leading-4 text-gray-400">{destinationLabel}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <WithdrawalStatusBadge status={item.status} />
                    <button
                      type="button"
                      onClick={() => setSelected(item)}
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

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#111111] p-5 space-y-4 animate-sheet-in">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Withdrawal details</h3>
                <p className="font-num text-sm text-gray-400">
                  {formatUsdc(selected.transfer_amount_usdc_minor)}{' '}
                  <span className="text-gray-400">USDC</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-gray-100 transition hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <WithdrawalStatusBadge status={selected.status} />

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-gray-500">Destination</p>
                <p className="text-gray-200">
                  {destinations.find((dest) => dest.key === selected.dest_chain)?.label ??
                    selected.dest_chain}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Address</p>
                <p className="text-gray-200">
                  {selected.dest_address ? truncateAddress(selected.dest_address) : '—'}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Created</p>
                <p className="text-gray-200">{formatDate(selected.created_at)}</p>
              </div>
              <div>
                <p className="text-gray-500">Updated</p>
                <p className="text-gray-200">{formatDate(selected.updated_at)}</p>
              </div>
              <div>
                <p className="text-gray-500">Burned</p>
                <p className="text-gray-200">{formatDate(selected.burn_tx_at)}</p>
              </div>
              <div>
                <p className="text-gray-500">Forwarded</p>
                <p className="text-gray-200">{formatDate(selected.forward_tx_at)}</p>
              </div>
            </div>

            {selected.burn_tx_hash && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Burn tx</p>
                <p className="text-xs text-gray-300 break-all">{truncateHash(selected.burn_tx_hash)}</p>
                <a
                  href={`${baseExplorer}${selected.burn_tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs text-gray-200 hover:underline"
                >
                  View in explorer
                </a>
              </div>
            )}

            {selected.forward_tx_hash && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Mint tx</p>
                <p className="text-xs text-gray-300 break-all">{truncateHash(selected.forward_tx_hash)}</p>
                {getExplorer(selected.dest_chain) && (
                  <a
                    href={`${getExplorer(selected.dest_chain)}${selected.forward_tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs text-gray-200 hover:underline"
                  >
                    View in explorer
                  </a>
                )}
              </div>
            )}

            {selected.failure_reason && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3">
                <p className="text-xs text-red-300">{selected.failure_reason}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
