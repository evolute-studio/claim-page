import { useCallback, useEffect, useRef, useState } from 'react';
import type { DestinationChain } from '@/types/withdrawal';
import { withTimeout } from '@/lib/withdraw';

type DestinationChainOption = {
  key: DestinationChain;
};

type DebugLogger = (stage: string, message: string, data?: Record<string, unknown>) => void;

type UseNetworkFeeEstimatesParams = {
  withdrawOpen: boolean;
  step: number;
  destinationChains: DestinationChainOption[];
  getAuthToken: () => Promise<string>;
  fetchFeeQuote: (token: string, chain: DestinationChain) => Promise<number>;
  debugEnabled?: boolean;
  pushDebug?: DebugLogger;
};

export function useNetworkFeeEstimates({
  withdrawOpen,
  step,
  destinationChains,
  getAuthToken,
  fetchFeeQuote,
  debugEnabled = false,
  pushDebug,
}: UseNetworkFeeEstimatesParams) {
  const [networkFeeEstimates, setNetworkFeeEstimates] = useState<
    Partial<Record<DestinationChain, number>>
  >({});
  const [networkFeeLoading, setNetworkFeeLoading] = useState(false);
  const [networkFeeRetryNonce, setNetworkFeeRetryNonce] = useState(0);

  const requestIdRef = useRef(0);
  const inFlightRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);

  const resetRuntimeState = useCallback(() => {
    setNetworkFeeLoading(false);
    setNetworkFeeRetryNonce(0);
    inFlightRef.current = false;
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!withdrawOpen || step !== 1) return;
    const hasAllEstimates = destinationChains.every(
      (option) => networkFeeEstimates[option.key] !== undefined
    );
    if (hasAllEstimates) return;
    if (inFlightRef.current) return;

    let cancelled = false;
    const requestId = ++requestIdRef.current;
    inFlightRef.current = true;
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    const loadEstimates = async () => {
      setNetworkFeeLoading(true);
      if (debugEnabled && pushDebug) {
        pushDebug('estimate:request', 'Fetching network fee estimates', {
          destinations: destinationChains.map((option) => option.key),
        });
      }

      try {
        const token = await withTimeout(getAuthToken(), 8_000, 'Auth token request');
        const results = await Promise.allSettled(
          destinationChains.map(async (option) => {
            if (option.key === 'base') {
              return [option.key, 0] as const;
            }
            const fee = await withTimeout(
              fetchFeeQuote(token, option.key),
              15_000,
              `Fee quote ${option.key}`
            );
            return [option.key, fee] as const;
          })
        );

        if (cancelled || requestIdRef.current !== requestId) return;

        const estimateMap: Partial<Record<DestinationChain, number>> = {};
        const failedChains: string[] = [];
        const failedReasons: Record<string, string> = {};

        results.forEach((result, index) => {
          const optionKey = destinationChains[index]?.key;
          if (!optionKey) return;

          if (result.status === 'fulfilled') {
            const [key, fee] = result.value;
            estimateMap[key] = fee;
            return;
          }

          failedChains.push(optionKey);
          failedReasons[optionKey] =
            result.reason instanceof Error ? result.reason.message : 'Unknown error';
        });

        setNetworkFeeEstimates((current) => ({
          ...current,
          ...estimateMap,
        }));

        if (debugEnabled && pushDebug) {
          pushDebug('estimate:response', 'Network fee estimates received', {
            estimates: estimateMap,
            failed_chains: failedChains,
            failed_reasons: failedReasons,
          });
        }

        if (failedChains.length > 0) {
          retryTimerRef.current = window.setTimeout(() => {
            setNetworkFeeRetryNonce((value) => value + 1);
          }, 3_000);
        }
      } catch (error) {
        if (!cancelled && requestIdRef.current === requestId) {
          retryTimerRef.current = window.setTimeout(() => {
            setNetworkFeeRetryNonce((value) => value + 1);
          }, 3_000);
          if (debugEnabled && pushDebug) {
            const message =
              error instanceof Error ? error.message : 'Failed to fetch network fee estimates';
            pushDebug('estimate:error', 'Failed to fetch network fee estimates', { message });
          }
        }
      } finally {
        if (requestIdRef.current === requestId) {
          inFlightRef.current = false;
          setNetworkFeeLoading(false);
        }
      }
    };

    void loadEstimates();

    return () => {
      cancelled = true;
      inFlightRef.current = false;
    };
  }, [
    debugEnabled,
    destinationChains,
    fetchFeeQuote,
    getAuthToken,
    networkFeeEstimates,
    networkFeeRetryNonce,
    pushDebug,
    step,
    withdrawOpen,
  ]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  return {
    networkFeeEstimates,
    networkFeeLoading,
    resetNetworkFeeRuntimeState: resetRuntimeState,
  };
}
