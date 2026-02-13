import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getWithdrawalQuote } from '@/lib/api';
import { isQuoteExpiredError, normalizeTimestamp, timeRemainingLabel, toNumberSafe } from '@/lib/withdraw';
import type { DestinationChain, WithdrawalQuoteResponse } from '@/types/withdrawal';

type DebugLogger = (stage: string, message: string, data?: Record<string, unknown>) => void;

type UseWithdrawalQuoteParams = {
  destination: DestinationChain;
  amountMode: 'receive' | 'pay';
  parsedInputAmount: bigint | null;
  activeWalletAddress: string | null;
  isQuoteLocked: boolean;
  sending: boolean;
  step: number;
  getAuthToken: () => Promise<string>;
  debugEnabled?: boolean;
  pushDebug?: DebugLogger;
};

export function useWithdrawalQuote({
  destination,
  amountMode,
  parsedInputAmount,
  activeWalletAddress,
  isQuoteLocked,
  sending,
  step,
  getAuthToken,
  debugEnabled = false,
  pushDebug,
}: UseWithdrawalQuoteParams) {
  const [quote, setQuote] = useState<WithdrawalQuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [feeEstimateMinor, setFeeEstimateMinor] = useState<bigint>(0n);
  const [quoteRefreshNonce, setQuoteRefreshNonce] = useState(0);
  const [quoteTick, setQuoteTick] = useState(0);

  const quoteRequestId = useRef(0);

  const quoteRequestAmount = useMemo(() => {
    if (!parsedInputAmount) return null;
    if (amountMode === 'receive') return parsedInputAmount;
    if (parsedInputAmount <= feeEstimateMinor) return 0n;
    return parsedInputAmount - feeEstimateMinor;
  }, [amountMode, feeEstimateMinor, parsedInputAmount]);

  const quoteExpiresAtMs = useMemo(() => normalizeTimestamp(quote?.expires_at), [quote?.expires_at]);
  const quoteExpired = quoteExpiresAtMs ? quoteExpiresAtMs <= Date.now() : false;
  const quoteTimeRemaining = useMemo(
    () => timeRemainingLabel(quoteExpiresAtMs, quoteTick || Date.now()),
    [quoteExpiresAtMs, quoteTick]
  );

  const refreshQuote = useCallback(() => {
    setQuoteRefreshNonce((value) => value + 1);
  }, []);

  const clearQuoteState = useCallback(() => {
    setQuote(null);
    setQuoteError(null);
    setQuoteLoading(false);
  }, []);

  const resetQuoteState = useCallback(() => {
    setQuote(null);
    setQuoteError(null);
    setQuoteLoading(false);
    setFeeEstimateMinor(0n);
    setQuoteRefreshNonce(0);
    setQuoteTick(0);
  }, []);

  useEffect(() => {
    if (!quote || !quoteExpiresAtMs || !activeWalletAddress) return;
    if (sending || isQuoteLocked) return;

    const delay = quoteExpiresAtMs - Date.now() + 250;
    if (delay <= 0) {
      if (!quoteLoading) {
        setQuoteRefreshNonce((value) => value + 1);
      }
      return;
    }

    const timerId = window.setTimeout(() => {
      if (!sending) {
        setQuoteRefreshNonce((value) => value + 1);
      }
    }, delay);

    return () => window.clearTimeout(timerId);
  }, [activeWalletAddress, isQuoteLocked, quote, quoteExpiresAtMs, quoteLoading, sending]);

  useEffect(() => {
    if (!quoteExpiresAtMs || isQuoteLocked) return;
    setQuoteTick(Date.now());
    const timerId = window.setInterval(() => {
      setQuoteTick(Date.now());
    }, 1000);
    return () => window.clearInterval(timerId);
  }, [quoteExpiresAtMs, isQuoteLocked]);

  useEffect(() => {
    if (destination === 'base') return;
    if (step !== 4) return;
    if (sending || isQuoteLocked || quoteLoading) return;
    if (quote) return;
    if (!activeWalletAddress || !quoteRequestAmount || quoteRequestAmount <= 0n) return;
    const timerId = window.setTimeout(() => {
      setQuoteRefreshNonce((value) => value + 1);
    }, 1200);
    return () => window.clearTimeout(timerId);
  }, [
    activeWalletAddress,
    destination,
    isQuoteLocked,
    quote,
    quoteLoading,
    quoteRequestAmount,
    sending,
    step,
  ]);

  useEffect(() => {
    if (destination === 'base') return;
    if (step !== 4) return;
    if (sending || isQuoteLocked || quoteLoading) return;
    if (!quote || !quoteExpired) return;
    const timerId = window.setTimeout(() => {
      setQuoteRefreshNonce((value) => value + 1);
    }, 900);
    return () => window.clearTimeout(timerId);
  }, [destination, isQuoteLocked, quote, quoteExpired, quoteLoading, sending, step]);

  useEffect(() => {
    if (destination === 'base') {
      if (!parsedInputAmount || !activeWalletAddress) {
        setQuote(null);
        setQuoteError(null);
        setQuoteLoading(false);
        return;
      }

      const transferMinor = toNumberSafe(parsedInputAmount);
      const expiresAt = Math.floor((Date.now() + 60_000) / 1000);
      setQuote({
        quote_id: 'local-base',
        source_chain: 'base',
        source_domain_id: 6,
        dest_chain: 'base',
        dest_domain_id: 6,
        transfer_amount_usdc_minor: transferMinor,
        finality_threshold: 1000,
        forward_fee_level: 'med',
        fee_protocol_usdc_minor: 0,
        fee_forward_usdc_minor: 0,
        max_fee_usdc_minor: 0,
        total_burn_usdc_minor: transferMinor,
        expires_at: expiresAt,
      });
      if (debugEnabled && pushDebug) {
        pushDebug('quote:local', 'Local Base quote', {
          transfer_amount_usdc_minor: transferMinor,
          total_burn_usdc_minor: transferMinor,
          expires_at: expiresAt,
        });
      }
      setFeeEstimateMinor(0n);
      setQuoteError(null);
      setQuoteLoading(false);
      return;
    }

    if (isQuoteLocked) {
      return;
    }

    if (!quoteRequestAmount || !destination || !activeWalletAddress) {
      setQuote(null);
      setQuoteError(null);
      setQuoteLoading(false);
      return;
    }

    if (quoteRequestAmount <= 0n) {
      setQuote(null);
      setQuoteError('Amount is below fees');
      setQuoteLoading(false);
      return;
    }

    setQuoteLoading(true);
    setQuoteError(null);

    const requestId = ++quoteRequestId.current;
    const handler = window.setTimeout(async () => {
      try {
        const token = await getAuthToken();
        if (debugEnabled && pushDebug) {
          pushDebug('quote:request', 'Requesting quote', {
            dest_chain: destination,
            amount_mode: amountMode,
            parsed_input_minor: parsedInputAmount?.toString() ?? null,
            fee_estimate_minor: feeEstimateMinor.toString(),
            quote_request_amount_minor: quoteRequestAmount?.toString() ?? null,
          });
        }
        const response = await getWithdrawalQuote(token, {
          dest_chain: destination,
          transfer_amount_usdc_minor: toNumberSafe(quoteRequestAmount),
        });
        if (quoteRequestId.current !== requestId) return;
        setQuote(response);
        setFeeEstimateMinor(BigInt(response.max_fee_usdc_minor));
        setQuoteError(null);
        if (debugEnabled && pushDebug) {
          pushDebug('quote:response', 'Quote response', {
            quote_id: response.quote_id,
            transfer_amount_usdc_minor: response.transfer_amount_usdc_minor,
            max_fee_usdc_minor: response.max_fee_usdc_minor,
            total_burn_usdc_minor: response.total_burn_usdc_minor,
            expires_at: response.expires_at,
          });
        }
      } catch (error) {
        if (quoteRequestId.current !== requestId) return;
        const message = error instanceof Error ? error.message : 'Failed to fetch quote';
        setQuote(null);
        setQuoteError(message);
        if (isQuoteExpiredError(message)) {
          window.setTimeout(() => {
            setQuoteRefreshNonce((value) => value + 1);
          }, 900);
        }
        if (debugEnabled && pushDebug) {
          pushDebug('quote:error', 'Quote request failed', { message });
        }
      } finally {
        if (quoteRequestId.current === requestId) {
          setQuoteLoading(false);
        }
      }
    }, 450);

    return () => window.clearTimeout(handler);
  }, [
    activeWalletAddress,
    amountMode,
    debugEnabled,
    destination,
    feeEstimateMinor,
    getAuthToken,
    isQuoteLocked,
    parsedInputAmount,
    pushDebug,
    quoteRefreshNonce,
    quoteRequestAmount,
  ]);

  return {
    quote,
    quoteError,
    quoteLoading,
    feeEstimateMinor,
    quoteRequestAmount,
    quoteExpiresAtMs,
    quoteExpired,
    quoteTimeRemaining,
    refreshQuote,
    clearQuoteState,
    resetQuoteState,
  };
}
