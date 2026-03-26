import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicClient } from 'viem';
import { erc20Abi, formatUnits } from 'viem';
import {
  getWalletBalance,
  registerWalletAddress,
  WalletApiError,
  type WalletBalanceResponse,
} from '@/lib/api';

export type WithdrawBalanceSource = 'server' | 'balance_of';

type UseWithdrawBalanceParams = {
  activeWalletAddress: string | null;
  getAuthToken: () => Promise<string>;
  enabled?: boolean;
  refreshIntervalMs?: number;
  source?: WithdrawBalanceSource;
  publicClient?: PublicClient;
  tokenAddress?: `0x${string}` | null;
};

export type WalletBalanceMeta = {
  isFinalized: boolean;
  finalizedBalanceMinor: bigint;
  updatedAt: number;
  observedThroughBlock: number;
  finalizedThroughBlock: number;
  confirmationsRequired: number;
};

function mapWalletBalanceErrorMessage(error: unknown): string {
  if (error instanceof WalletApiError) {
    switch (error.code) {
      case 'IDENTITY_NOT_LINKED':
        return 'Wallet session is not linked yet. Reopen wallet from game.';
      case 'ADDRESS_INVALID':
        return 'Wallet address is invalid.';
      case 'ADDRESS_CONFLICT':
        return 'This wallet address is already linked to another account.';
      case 'PRIVY_AUTH_NOT_CONFIGURED':
        return 'Wallet sync is temporarily unavailable.';
      case 'VALIDATION_ERROR':
        return 'Wallet sync request is invalid.';
      case 'TIMEOUT':
      case 'NETWORK_ERROR':
        return error.message;
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : 'Failed to load balance';
}

function toBalanceMeta(response: WalletBalanceResponse): WalletBalanceMeta {
  return {
    isFinalized: response.is_finalized,
    finalizedBalanceMinor: BigInt(response.finalized_balance_minor),
    updatedAt: response.updated_at,
    observedThroughBlock: response.observed_through_block,
    finalizedThroughBlock: response.finalized_through_block,
    confirmationsRequired: response.confirmations_required,
  };
}

function mapOnchainBalanceErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'Failed to read onchain USDC balance';
}

export function useWithdrawBalance({
  activeWalletAddress,
  getAuthToken,
  enabled = true,
  refreshIntervalMs = 10_000,
  source = 'server',
  publicClient,
  tokenAddress = null,
}: UseWithdrawBalanceParams) {
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceMinor, setBalanceMinor] = useState<bigint | null>(null);
  const [balanceMeta, setBalanceMeta] = useState<WalletBalanceMeta | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceRefreshNonce, setBalanceRefreshNonce] = useState(0);
  const [isDocumentVisible, setIsDocumentVisible] = useState(() => {
    if (typeof document === 'undefined') return true;
    return document.visibilityState === 'visible';
  });

  const requestIdRef = useRef(0);
  const syncInFlightRef = useRef(false);
  const pendingSyncRef = useRef(false);
  const registeredAddressRef = useRef<string | null>(null);

  const applyResponse = useCallback((response: WalletBalanceResponse) => {
    const nextBalanceMinor = BigInt(response.balance_minor);
    setBalance(formatUnits(nextBalanceMinor, 6));
    setBalanceMinor(nextBalanceMinor);
    setBalanceMeta(toBalanceMeta(response));
    setBalanceError(null);
  }, []);

  const requestSync = useCallback(() => {
    if (syncInFlightRef.current) {
      pendingSyncRef.current = true;
      return;
    }
    setBalanceRefreshNonce((value) => value + 1);
  }, []);

  const refreshBalance = useCallback(() => {
    requestSync();
  }, [requestSync]);

  useEffect(() => {
    if (!activeWalletAddress) {
      registeredAddressRef.current = null;
      setBalance(null);
      setBalanceMinor(null);
      setBalanceMeta(null);
      setBalanceError(null);
      setBalanceLoading(false);
      return;
    }

    const normalizedAddress = activeWalletAddress.toLowerCase();
    const registeredAddress = registeredAddressRef.current?.toLowerCase() ?? null;
    if (registeredAddress !== normalizedAddress) {
      registeredAddressRef.current = null;
      setBalance(null);
      setBalanceMinor(null);
      setBalanceMeta(null);
      setBalanceError(null);
    }
  }, [activeWalletAddress]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      setIsDocumentVisible(visible);
      if (visible) {
        requestSync();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [requestSync]);

  useEffect(() => {
    if (!enabled || !activeWalletAddress) return;
    requestSync();
  }, [activeWalletAddress, enabled, requestSync]);

  useEffect(() => {
    if (!enabled || !activeWalletAddress || !isDocumentVisible) return;
    const timerId = window.setInterval(() => {
      requestSync();
    }, refreshIntervalMs);
    return () => window.clearInterval(timerId);
  }, [activeWalletAddress, enabled, isDocumentVisible, refreshIntervalMs, requestSync]);

  useEffect(() => {
    if (!enabled || !activeWalletAddress) return;

    let cancelled = false;
    const requestId = ++requestIdRef.current;
    syncInFlightRef.current = true;

    const syncBalance = async () => {
      setBalanceLoading(true);
      setBalanceError(null);

      if (source === 'balance_of') {
        try {
          if (!publicClient || !tokenAddress) {
            throw new Error('Onchain balance source is not configured.');
          }

          const onchainBalance = await publicClient.readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [activeWalletAddress as `0x${string}`],
          });
          if (cancelled || requestIdRef.current !== requestId) return;

          setBalance(formatUnits(onchainBalance, 6));
          setBalanceMinor(onchainBalance);
          setBalanceMeta(null);
          setBalanceError(null);
          return;
        } catch (error) {
          if (cancelled || requestIdRef.current !== requestId) return;
          setBalanceError(mapOnchainBalanceErrorMessage(error));
          return;
        }
      }

      const runBalanceFetch = async (token: string) => {
        const response = await getWalletBalance(token);
        if (cancelled || requestIdRef.current !== requestId) return;
        applyResponse(response);
      };

      try {
        const token = await getAuthToken();
        if (cancelled || requestIdRef.current !== requestId) return;

        const normalizedAddress = activeWalletAddress.toLowerCase();
        const registeredAddress = registeredAddressRef.current?.toLowerCase() ?? null;
        if (registeredAddress !== normalizedAddress) {
          const registration = await registerWalletAddress(token, {
            address: activeWalletAddress,
          });
          if (cancelled || requestIdRef.current !== requestId) return;
          registeredAddressRef.current = activeWalletAddress;
          applyResponse(registration);
        }

        await runBalanceFetch(token);
      } catch (error) {
        if (cancelled || requestIdRef.current !== requestId) return;

        if (error instanceof WalletApiError && error.code === 'BALANCE_NOT_TRACKED') {
          try {
            const token = await getAuthToken();
            if (cancelled || requestIdRef.current !== requestId) return;

            const registration = await registerWalletAddress(token, {
              address: activeWalletAddress,
            });
            if (cancelled || requestIdRef.current !== requestId) return;
            registeredAddressRef.current = activeWalletAddress;
            applyResponse(registration);

            await runBalanceFetch(token);
            return;
          } catch (recoveryError) {
            if (cancelled || requestIdRef.current !== requestId) return;
            setBalanceError(mapWalletBalanceErrorMessage(recoveryError));
            return;
          }
        }

        setBalanceError(mapWalletBalanceErrorMessage(error));
      } finally {
        if (!cancelled && requestIdRef.current === requestId) {
          syncInFlightRef.current = false;
          setBalanceLoading(false);
          if (pendingSyncRef.current) {
            pendingSyncRef.current = false;
            setBalanceRefreshNonce((value) => value + 1);
          }
        }
      }
    };

    void syncBalance();

    return () => {
      cancelled = true;
    };
  }, [
    activeWalletAddress,
    applyResponse,
    balanceRefreshNonce,
    enabled,
    getAuthToken,
    publicClient,
    source,
    tokenAddress,
  ]);

  return {
    balance,
    balanceMinor,
    balanceMeta,
    balanceError,
    balanceLoading,
    refreshBalance,
  };
}
