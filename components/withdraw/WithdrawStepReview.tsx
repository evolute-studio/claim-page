import { formatUsdc } from '@/lib/withdraw';
import { truncateAddress } from '@/lib/format';
import type { DestinationChain, WithdrawalQuoteResponse, WithdrawalStatus } from '@/types/withdrawal';

type DestinationConfig = {
  label: string;
  explorerTxBase: string;
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
  quoteLoading: boolean;
  displayQuote: WithdrawalQuoteResponse | null;
  quoteError: string | null;
  displayMode: 'receive' | 'pay';
  quote: WithdrawalQuoteResponse | null;
  quoteExpired: boolean;
  sending: boolean;
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
  quoteLoading,
  displayQuote,
  quoteError,
  displayMode,
  quote,
  quoteExpired,
  sending,
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
  return (
    <div className="flex flex-1 flex-col justify-between pb-6 pt-6 animate-slide-in">
      <div className="space-y-4">
        <div>
          <label className="text-[11px] uppercase tracking-[0.2em] text-gray-500">
            Destination address
          </label>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="text"
              value={destinationAddress}
              onChange={(event) => onDestinationAddressChange(event.target.value)}
              placeholder="Enter address to send to"
              className={`w-full rounded-2xl bg-[#111111] px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 ${
                hasDestinationAddressError
                  ? 'border border-red-500/70 focus:ring-red-500/40'
                  : 'border border-white/10 focus:ring-white/20'
              }`}
            />
            <button
              type="button"
              onClick={onPasteAddress}
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-xs text-white transition hover:bg-white/10"
            >
              Paste
            </button>
          </div>
          {hasDestinationAddressError && <p className="mt-2 text-[11px] text-red-400">Invalid address</p>}
          {isDestinationAddressValid && (
            <p className="mt-2 text-[11px] text-emerald-300">Address looks valid</p>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#111111] p-4 space-y-3">
          <div className="text-center">
            <p className="font-num text-2xl font-semibold text-white">
              {(lockedAmountMode ?? amountMode) === 'pay'
                ? derivedPayMinor !== null
                  ? formatUsdc(derivedPayMinor)
                  : '0.00'
                : lockedQuote
                  ? formatUsdc(lockedQuote.transfer_amount_usdc_minor)
                  : derivedReceiveMinor !== null
                    ? formatUsdc(derivedReceiveMinor)
                    : '0.00'}{' '}
              USDC
            </p>
            <p className="text-xs text-gray-500">{isQuoteLocked ? 'Locked' : quoteTimeRemaining}</p>
          </div>
          <div className="space-y-2 text-sm text-gray-300">
            <div className="flex items-center justify-between">
              <span>Network</span>
              <span className="text-white">{destinationConfig?.label ?? destination}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>To</span>
              <span className={hasDestinationAddressError ? 'text-red-400' : 'text-white'}>
                {destinationAddressTrimmed
                  ? isDestinationAddressValid
                    ? truncateAddress(destinationAddressTrimmed)
                    : destinationAddressTrimmed
                  : '—'}
              </span>
            </div>
          </div>
          <div className="border-t border-white/10 pt-3 space-y-1.5 text-xs text-gray-300">
            {quoteLoading && !displayQuote ? (
              <p>Fetching quote...</p>
            ) : quoteError ? (
              <p className="text-red-400">{quoteError}</p>
            ) : displayQuote ? (
              <>
                <p>
                  You pay:{' '}
                  <span className="font-num text-white">
                    {displayMode === 'pay'
                      ? derivedPayMinor !== null
                        ? formatUsdc(derivedPayMinor)
                        : '0.00'
                      : formatUsdc(displayQuote.total_burn_usdc_minor)}{' '}
                    USDC
                  </span>
                </p>
                <p>
                  You receive:{' '}
                  <span className="font-num text-white">
                    {displayMode === 'receive'
                      ? formatUsdc(displayQuote.transfer_amount_usdc_minor)
                      : derivedReceiveMinor !== null
                        ? formatUsdc(derivedReceiveMinor)
                        : '0.00'}{' '}
                    USDC
                  </span>
                </p>
                <p>
                  Fees: <span className="font-num text-white">{formatUsdc(displayQuote.max_fee_usdc_minor)} USDC</span>
                </p>
              </>
            ) : (
              <p>Enter amount to get a quote.</p>
            )}
          </div>
        </div>

        {quote && quoteExpired && !isQuoteLocked && !sending && (
          <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-300">
            Quote expired. Refreshing automatically…
          </div>
        )}

        {formError && <p className="text-xs text-red-400">{formError}</p>}
        {insufficientBalance && (
          <p className="text-xs text-yellow-300">Insufficient USDC balance for this amount.</p>
        )}
        {belowMinReceive && (
          <p className="text-xs text-yellow-300">
            {amountMode === 'pay' ? `Minimum amount is ${formatUsdc(minPayMinor)} USDC` : 'Minimum amount is 1.00 USDC'}
          </p>
        )}

        {(withdrawalId || burnTxHash) && (
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-3 text-xs text-gray-300 space-y-1">
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
            className="w-full rounded-2xl border border-white/15 bg-white/5 py-3 text-sm text-white transition hover:bg-white/10 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={confirmDisabled}
            className="w-full rounded-2xl bg-white py-3 text-sm font-semibold text-black disabled:bg-white/10 disabled:text-white/40"
          >
            {confirmLabel}
          </button>
        </div>

        {withdrawalId && forwardTxHash && (
          <button
            type="button"
            onClick={onResetFlow}
            className="w-full rounded-2xl border border-white/15 bg-white/5 py-3 text-sm text-gray-100 transition hover:bg-white/10"
          >
            Start new withdrawal
          </button>
        )}
      </div>
    </div>
  );
}
