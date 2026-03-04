import { useCallback, useEffect, useState } from 'react';
import { formatUnits } from 'viem';

type UseWithdrawBalanceParams = {
  activeWalletAddress: string | null;
  usdcAddress: string;
  readBalance: (() => Promise<bigint>) | null;
  refreshIntervalMs?: number;
};

export function useWithdrawBalance({
  activeWalletAddress,
  usdcAddress,
  readBalance,
  refreshIntervalMs = 20_000,
}: UseWithdrawBalanceParams) {
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceMinor, setBalanceMinor] = useState<bigint | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceRefreshNonce, setBalanceRefreshNonce] = useState(0);

  const refreshBalance = useCallback(() => {
    setBalanceRefreshNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchBalance = async () => {
      if (!activeWalletAddress || !usdcAddress || !readBalance) {
        setBalance(null);
        setBalanceMinor(null);
        setBalanceError(null);
        setBalanceLoading(false);
        return;
      }

      setBalanceLoading(true);
      setBalanceError(null);

      try {
        const result = await readBalance();
        if (!cancelled) {
          setBalance(formatUnits(result, 6));
          setBalanceMinor(result);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Failed to load balance';
          setBalance(null);
          setBalanceMinor(null);
          setBalanceError(message);
        }
      } finally {
        if (!cancelled) {
          setBalanceLoading(false);
        }
      }
    };

    void fetchBalance();

    return () => {
      cancelled = true;
    };
  }, [activeWalletAddress, balanceRefreshNonce, readBalance, usdcAddress]);

  useEffect(() => {
    if (!activeWalletAddress || !usdcAddress) return;
    const timerId = window.setInterval(() => {
      setBalanceRefreshNonce((value) => value + 1);
    }, refreshIntervalMs);
    return () => window.clearInterval(timerId);
  }, [activeWalletAddress, refreshIntervalMs, usdcAddress]);

  return {
    balance,
    balanceMinor,
    balanceError,
    balanceLoading,
    refreshBalance,
  };
}
