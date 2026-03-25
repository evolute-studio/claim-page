import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getWalletBalance,
  registerWalletAddress,
  WalletApiError,
  type WalletBalanceResponse,
} from '@/lib/api';

type UseWithdrawBalanceParams = {
  activeWalletAddress: string | null;
  getAuthToken: () => Promise<string>;
  enabled?: boolean;
  refreshIntervalMs?: number;
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

export function useWithdrawBalance({
  activeWalletAddress,
  getAuthToken,
  enabled = true,
  refreshIntervalMs = 10_000,
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
    setBalance(response.balance_formatted);
    setBalanceMinor(BigInt(response.balance_minor));
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
  }, [activeWalletAddress, applyResponse, balanceRefreshNonce, enabled, getAuthToken]);

  return {
    balance,
    balanceMinor,
    balanceMeta,
    balanceError,
    balanceLoading,
    refreshBalance,
  };
}
