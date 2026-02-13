import { useEffect, useRef, useState } from 'react';
import { getWithdrawalStatus } from '@/lib/api';
import type { WithdrawalStatus } from '@/types/withdrawal';

type DebugLogger = (stage: string, message: string, data?: Record<string, unknown>) => void;

type UseWithdrawalStatusParams = {
  getAuthToken: () => Promise<string>;
  debugEnabled?: boolean;
  pushDebug?: DebugLogger;
  onFailureReason?: (message: string) => void;
  onPollingError?: (message: string) => void;
};

export function useWithdrawalStatus({
  getAuthToken,
  debugEnabled = false,
  pushDebug,
  onFailureReason,
  onPollingError,
}: UseWithdrawalStatusParams) {
  const [withdrawalId, setWithdrawalId] = useState<string | null>(null);
  const [withdrawalStatus, setWithdrawalStatus] = useState<WithdrawalStatus | null>(null);
  const [burnTxHash, setBurnTxHash] = useState<string | null>(null);
  const [forwardTxHash, setForwardTxHash] = useState<string | null>(null);

  const lastStatusRef = useRef<string | null>(null);
  const lastForwardHashRef = useRef<string | null>(null);

  useEffect(() => {
    if (!debugEnabled || !withdrawalStatus || !pushDebug) return;
    if (lastStatusRef.current === withdrawalStatus) return;
    lastStatusRef.current = withdrawalStatus;
    pushDebug('status', 'Withdrawal status update', {
      withdrawal_id: withdrawalId,
      status: withdrawalStatus,
    });
  }, [debugEnabled, pushDebug, withdrawalId, withdrawalStatus]);

  useEffect(() => {
    if (!debugEnabled || !forwardTxHash || !pushDebug) return;
    if (lastForwardHashRef.current === forwardTxHash) return;
    lastForwardHashRef.current = forwardTxHash;
    pushDebug('status', 'Forward tx hash received', {
      withdrawal_id: withdrawalId,
      forward_tx_hash: forwardTxHash,
    });
  }, [debugEnabled, forwardTxHash, pushDebug, withdrawalId]);

  useEffect(() => {
    if (!withdrawalId || forwardTxHash) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const token = await getAuthToken();
        const status = await getWithdrawalStatus(token, withdrawalId);
        if (cancelled) return;
        if (debugEnabled && pushDebug) {
          const shouldLog =
            status.status !== lastStatusRef.current ||
            status.forward_tx_hash !== lastForwardHashRef.current ||
            !!status.failure_reason;
          if (shouldLog) {
            pushDebug('status:poll', 'Withdrawal status response', {
              withdrawal_id: withdrawalId,
              status: status.status,
              burn_tx_hash: status.burn_tx_hash,
              forward_tx_hash: status.forward_tx_hash,
              failure_reason: status.failure_reason ?? null,
            });
          }
        }
        setWithdrawalStatus(status.status);
        if (status.burn_tx_hash) setBurnTxHash(status.burn_tx_hash);
        if (status.forward_tx_hash) setForwardTxHash(status.forward_tx_hash);
        if (status.failure_reason && onFailureReason) onFailureReason(status.failure_reason);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Failed to refresh status';
        if (onPollingError) onPollingError(message);
        if (debugEnabled && pushDebug) {
          pushDebug('status:error', 'Failed to refresh withdrawal status', { message });
        }
      }
    };

    void poll();
    const timerId = window.setInterval(() => {
      void poll();
    }, 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(timerId);
    };
  }, [debugEnabled, forwardTxHash, getAuthToken, onFailureReason, onPollingError, pushDebug, withdrawalId]);

  const resetWithdrawalTracking = () => {
    setWithdrawalId(null);
    setWithdrawalStatus(null);
    setBurnTxHash(null);
    setForwardTxHash(null);
    lastStatusRef.current = null;
    lastForwardHashRef.current = null;
  };

  return {
    withdrawalId,
    setWithdrawalId,
    withdrawalStatus,
    setWithdrawalStatus,
    burnTxHash,
    setBurnTxHash,
    forwardTxHash,
    setForwardTxHash,
    resetWithdrawalTracking,
  };
}
