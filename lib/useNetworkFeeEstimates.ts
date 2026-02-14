import { useCallback, useEffect, useRef, useState } from 'react';
import type { DestinationChain } from '@/types/withdrawal';
import { withTimeout } from '@/lib/withdraw';

const BASE_RETRY_DELAY_MS = 3_000;
const RATE_LIMIT_RETRY_DELAY_MS = 10_000;
const MAX_RETRY_DELAY_MS = 60_000;

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
  const retryAllowedAtRef = useRef(0);
  const retryDelayMsRef = useRef(BASE_RETRY_DELAY_MS);

  const resetRuntimeState = useCallback(() => {
    setNetworkFeeLoading(false);
    setNetworkFeeRetryNonce(0);
    inFlightRef.current = false;
    retryAllowedAtRef.current = 0;
    retryDelayMsRef.current = BASE_RETRY_DELAY_MS;
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!withdrawOpen || step !== 1) return;
    const missingOptions = destinationChains.filter(
      (option) => networkFeeEstimates[option.key] === undefined
    );
    if (missingOptions.length === 0) return;
    if (inFlightRef.current) return;

    const now = Date.now();
    if (retryAllowedAtRef.current > now) {
      if (!retryTimerRef.current) {
        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = null;
          setNetworkFeeRetryNonce((value) => value + 1);
        }, retryAllowedAtRef.current - now);
      }
      return;
    }

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
          destinations: missingOptions.map((option) => option.key),
        });
      }

      try {
        const token = await withTimeout(getAuthToken(), 8_000, 'Auth token request');

        const estimateMap: Partial<Record<DestinationChain, number>> = {};
        const failedChains: string[] = [];
        const failedReasons: Record<string, string> = {};

        for (const option of missingOptions) {
          if (option.key === 'base') {
            estimateMap[option.key] = 0;
            continue;
          }
          try {
            const fee = await withTimeout(
              fetchFeeQuote(token, option.key),
              15_000,
              `Fee quote ${option.key}`
            );
            estimateMap[option.key] = fee;
          } catch (error) {
            failedChains.push(option.key);
            failedReasons[option.key] =
              error instanceof Error ? error.message : 'Unknown error';
          }
          if (cancelled || requestIdRef.current !== requestId) return;
        }

        if (Object.keys(estimateMap).length > 0) {
          setNetworkFeeEstimates((current) => ({
            ...current,
            ...estimateMap,
          }));
        }

        if (debugEnabled && pushDebug) {
          pushDebug('estimate:response', 'Network fee estimates received', {
            estimates: estimateMap,
            failed_chains: failedChains,
            failed_reasons: failedReasons,
          });
        }

        if (failedChains.length > 0) {
          const hasRateLimit = failedChains.some((chain) =>
            /429|too many requests/i.test(failedReasons[chain] ?? '')
          );
          const nextDelay = hasRateLimit
            ? Math.min(
                Math.max(retryDelayMsRef.current * 2, RATE_LIMIT_RETRY_DELAY_MS),
                MAX_RETRY_DELAY_MS
              )
            : BASE_RETRY_DELAY_MS;
          retryDelayMsRef.current = nextDelay;
          retryAllowedAtRef.current = Date.now() + nextDelay;
          retryTimerRef.current = window.setTimeout(() => {
            retryTimerRef.current = null;
            setNetworkFeeRetryNonce((value) => value + 1);
          }, nextDelay);
        } else {
          retryDelayMsRef.current = BASE_RETRY_DELAY_MS;
          retryAllowedAtRef.current = 0;
          if (retryTimerRef.current) {
            window.clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
          }
        }
      } catch (error) {
        if (!cancelled && requestIdRef.current === requestId) {
          const message =
            error instanceof Error ? error.message : 'Failed to fetch network fee estimates';
          const hasRateLimit = /429|too many requests/i.test(message);
          const nextDelay = hasRateLimit
            ? Math.min(
                Math.max(retryDelayMsRef.current * 2, RATE_LIMIT_RETRY_DELAY_MS),
                MAX_RETRY_DELAY_MS
              )
            : BASE_RETRY_DELAY_MS;
          retryDelayMsRef.current = nextDelay;
          retryAllowedAtRef.current = Date.now() + nextDelay;
          retryTimerRef.current = window.setTimeout(() => {
            retryTimerRef.current = null;
            setNetworkFeeRetryNonce((value) => value + 1);
          }, nextDelay);
          if (debugEnabled && pushDebug) {
            pushDebug('estimate:error', 'Failed to fetch network fee estimates', {
              message,
              retry_in_ms: nextDelay,
            });
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
