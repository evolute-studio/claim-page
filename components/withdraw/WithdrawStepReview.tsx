import type { ComponentType } from 'react';
import { Clipboard } from 'lucide-react';
import { formatUsdc } from '@/lib/withdraw';
import { truncateAddress } from '@/lib/format';
import type { DestinationChain, WithdrawalQuoteResponse, WithdrawalStatus } from '@/types/withdrawal';

type DestinationConfig = {
  label: string;
  explorerTxBase: string;
};

type NetworkIconProps = {
  chainKey: DestinationChain;
  chainName: string;
  size?: number;
};

type WithdrawStepReviewProps = {
  destinationAddress: string;
  onDestinationAddressChange: (value: string) => void;
  onPasteAddress: () => void;
  hasDestinationAddressError: boolean;
  isDestinationAddressValid: boolean;
  destinationAddressTrimmed: string;
  lockedAmountMode: 'receive' | 'pay' | null;
  amountMode: 'receive' | 'pay';
  derivedPayMinor: number | null;
  lockedQuote: WithdrawalQuoteResponse | null;
  derivedReceiveMinor: number | null;
  isQuoteLocked: boolean;
  quoteTimeRemaining: string;
  destinationConfig?: DestinationConfig;
  destination: DestinationChain;
  NetworkIcon?: ComponentType<NetworkIconProps>;
  quoteLoading: boolean;
  displayQuote: WithdrawalQuoteResponse | null;
  quoteError: string | null;
  displayMode: 'receive' | 'pay';
  showQuoteRefreshingHint: boolean;
  formError: string | null;
  insufficientBalance: boolean;
  belowMinReceive: boolean;
  minPayMinor: number;
  withdrawalId: string | null;
  burnTxHash: string | null;
  withdrawalStatus: WithdrawalStatus | null;
  baseExplorerBase: string;
  forwardTxHash: string | null;
  onCancel: () => void;
  onResetFlow: () => void;
  cancelDisabled: boolean;
  confirmDisabled: boolean;
  confirmLabel: string;
};

export function WithdrawStepReview({
  destinationAddress,
  onDestinationAddressChange,
  onPasteAddress,
  hasDestinationAddressError,
  isDestinationAddressValid,
  destinationAddressTrimmed,
  lockedAmountMode,
  amountMode,
  derivedPayMinor,
  lockedQuote,
  derivedReceiveMinor,
  isQuoteLocked,
  quoteTimeRemaining,
  destinationConfig,
  destination,
  NetworkIcon,
  quoteLoading,
  displayQuote,
  quoteError,
  displayMode,
  showQuoteRefreshingHint,
  formError,
  insufficientBalance,
  belowMinReceive,
  minPayMinor,
  withdrawalId,
  burnTxHash,
  withdrawalStatus,
  baseExplorerBase,
  forwardTxHash,
  onCancel,
  onResetFlow,
  cancelDisabled,
  confirmDisabled,
  confirmLabel,
}: WithdrawStepReviewProps) {
  const showQuoteSkeleton = !displayQuote || quoteLoading || !!quoteError;

  return (
    <div className="flex flex-1 flex-col justify-between pb-6 pt-4 animate-slide-in">
      <div className="space-y-5">
        <div>
          <label className="font-num text-[13px] uppercase tracking-[0.12em] text-gray-500">
            Destination address
          </label>
          <div className="mt-3.5 flex items-center gap-2.5">
            <input
              type="text"
              value={destinationAddress}
              onChange={(event) => onDestinationAddressChange(event.target.value)}
              placeholder="Enter address to send to"
              className={`w-full rounded-2xl bg-white/[0.02] px-4 py-3.5 text-base text-white focus:outline-none focus:ring-2 ${
                hasDestinationAddressError
                  ? 'border border-red-500/70 focus:ring-red-500/40'
                  : 'border border-white/10 focus:ring-white/20'
              }`}
            />
            <button
              type="button"
              onClick={onPasteAddress}
              className="inline-flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white transition hover:bg-white/10"
              aria-label="Paste address"
            >
              <Clipboard size={18} strokeWidth={1.9} />
            </button>
          </div>
          <div className="mt-2 min-h-[18px]">
            {hasDestinationAddressError ? (
              <p className="text-[12px] text-red-400">Invalid address</p>
            ) : isDestinationAddressValid ? (
              <p className="text-[12px] text-emerald-300">Address looks valid</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-white/[0.14] bg-white/[0.03] p-5">
          <div className="text-center">
            <p className="font-num text-[3rem] font-semibold tracking-[0.02em] text-white">
              {(lockedAmountMode ?? amountMode) === 'pay'
                ? derivedPayMinor !== null
                  ? formatUsdc(derivedPayMinor)
                  : '0.00'
                : lockedQuote
                  ? formatUsdc(lockedQuote.transfer_amount_usdc_minor)
                  : derivedReceiveMinor !== null
                    ? formatUsdc(derivedReceiveMinor)
                    : '0.00'}{' '}
              <span className="text-gray-400">USDC</span>
            </p>
            <p className="mt-2 inline-flex h-[36px] w-[56px] items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] text-gray-400">
              {isQuoteLocked ? (
                'Locked'
              ) : showQuoteSkeleton ? (
                <span className="inline-flex h-3 w-8 animate-pulse rounded-full bg-white/14" />
              ) : (
                quoteTimeRemaining
              )}
            </p>
          </div>
          <div className="space-y-2.5 text-[17px] text-gray-300">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Network</span>
              <span className="font-num inline-flex items-center justify-end gap-2 text-right text-white">
                {NetworkIcon ? (
                  <NetworkIcon
                    chainKey={destination}
                    chainName={destinationConfig?.label ?? destination}
                    size={24}
                  />
                ) : null}
                <span>{destinationConfig?.label ?? destination}</span>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">To</span>
              {destinationAddressTrimmed && isDestinationAddressValid ? (
                <span className="font-num text-right text-white">
                  {truncateAddress(destinationAddressTrimmed)}
                </span>
              ) : (
                <span className="font-num text-right text-gray-500">
                  Not set
                </span>
              )}
            </div>
          </div>
          <div className="space-y-2.5 border-t border-white/10 pt-3.5 text-[17px] text-gray-300">
            {showQuoteSkeleton ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">You pay</span>
                  <span className="inline-flex h-[1.05em] w-[7.5ch] animate-pulse rounded bg-white/14" />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">You receive</span>
                  <span className="inline-flex h-[1.05em] w-[7.5ch] animate-pulse rounded bg-white/14" />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">Fees</span>
                  <span className="inline-flex h-[1.05em] w-[7.5ch] animate-pulse rounded bg-white/14" />
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">You pay</span>
                  <span className="font-num text-white">
                    {displayMode === 'pay'
                      ? derivedPayMinor !== null
                        ? formatUsdc(derivedPayMinor)
                        : '0.00'
                      : formatUsdc(displayQuote.total_burn_usdc_minor)}{' '}
                    <span className="text-gray-400">USDC</span>
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">You receive</span>
                  <span className="font-num text-white">
                    {displayMode === 'receive'
                      ? formatUsdc(displayQuote.transfer_amount_usdc_minor)
                      : derivedReceiveMinor !== null
                        ? formatUsdc(derivedReceiveMinor)
                        : '0.00'}{' '}
                    <span className="text-gray-400">USDC</span>
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">Fees</span>
                  <span className="font-num text-white">
                    {formatUsdc(displayQuote.max_fee_usdc_minor)}{' '}
                    <span className="text-gray-400">USDC</span>
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {showQuoteRefreshingHint && (
          <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-300">
            Quote expired. Refreshing automatically…
          </div>
        )}

        {formError && <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">{formError}</p>}
        {insufficientBalance && (
          <p className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-2.5 text-sm text-yellow-300">Insufficient USDC balance for this amount.</p>
        )}
        {belowMinReceive && (
          <p className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-2.5 text-sm text-yellow-300">
            {amountMode === 'pay' ? `Minimum amount is ${formatUsdc(minPayMinor)} USDC` : 'Minimum amount is 1.00 USDC'}
          </p>
        )}

        {(withdrawalId || burnTxHash) && (
          <div className="space-y-1.5 rounded-2xl border border-white/10 bg-[#111111] p-3.5 text-sm text-gray-300">
            <p>
              Withdrawal status: <span className="text-white">{withdrawalStatus ?? 'CREATED'}</span>
            </p>
            {burnTxHash && (
              <p className="break-all">
                {destination === 'base' ? 'Transfer tx:' : 'Burn tx:'}{' '}
                <a
                  className="text-purple-300 hover:underline"
                  href={`${baseExplorerBase}${burnTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {burnTxHash}
                </a>
              </p>
            )}
            {forwardTxHash && destinationConfig && (
              <p className="break-all">
                Mint tx:{' '}
                <a
                  className="text-purple-300 hover:underline"
                  href={`${destinationConfig.explorerTxBase}${forwardTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {forwardTxHash}
                </a>
              </p>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelDisabled}
            className="interactive-fx no-brighten w-full rounded-2xl border border-white/15 bg-white/5 py-3.5 text-base text-white transition hover:bg-white/10 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={confirmDisabled}
            className="interactive-fx no-brighten w-full rounded-2xl bg-white py-3.5 text-base font-semibold text-black disabled:bg-white/10 disabled:text-white/40"
          >
            {confirmLabel}
          </button>
        </div>

        {withdrawalId && forwardTxHash && (
          <button
            type="button"
            onClick={onResetFlow}
            className="w-full rounded-2xl border border-white/15 bg-white/5 py-3.5 text-base text-gray-100 transition hover:bg-white/10"
          >
            Start new withdrawal
          </button>
        )}
      </div>
    </div>
  );
}
