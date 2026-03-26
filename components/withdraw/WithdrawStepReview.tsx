import type { ComponentType } from 'react';
import { Clipboard } from 'lucide-react';
import { formatUnits } from 'viem';
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

function getReviewStatusLabel(
  destination: DestinationChain,
  status: WithdrawalStatus | null,
  hasTxHash: boolean
): string {
  const resolved = status ?? 'CREATED';

  if (destination !== 'base') {
    return resolved;
  }

  if (resolved === 'MINTED') return 'Transfered';
  if (resolved === 'FAILED') return 'Transfer failed';
  if (resolved === 'EXPIRED') return 'Transfer expired';
  if (resolved === 'BURN_SUBMITTED' || resolved === 'FORWARDING_PENDING') return 'Transfer submitted';
  if (hasTxHash) return 'Transfer submitted';
  return 'Preparing transfer';
}

function getAmountFontSize(displayValue: string): string {
  const length = displayValue.replace('.', '').length || 1;
  const maxSize = 3.2;
  const bucketSize = 6;
  const bucket = Math.floor((length - 1) / bucketSize);
  const size = maxSize / (1 + bucket * 0.28);
  return `${size}rem`;
}

type WithdrawStepReviewProps = {
  destinationAddress: string;
  onDestinationAddressChange: (value: string) => void;
  onPasteAddress: () => void;
  hasDestinationAddressError: boolean;
  isDestinationAddressValid: boolean;
  destinationAddressTrimmed: string;
  amountMode: 'receive' | 'pay';
  derivedPayMinor: number | null;
  derivedReceiveMinor: number | null;
  isQuoteLocked: boolean;
  quoteTimeRemaining: string;
  quoteSecondsRemaining: number | null;
  destinationConfig?: DestinationConfig;
  destination: DestinationChain;
  NetworkIcon?: ComponentType<NetworkIconProps>;
  displayQuote: WithdrawalQuoteResponse | null;
  quoteError: string | null;
  displayMode: 'receive' | 'pay';
  showQuoteRefreshingHint: boolean;
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
  amountMode,
  derivedPayMinor,
  derivedReceiveMinor,
  isQuoteLocked,
  quoteTimeRemaining,
  quoteSecondsRemaining,
  destinationConfig,
  destination,
  NetworkIcon,
  displayQuote,
  quoteError,
  displayMode,
  showQuoteRefreshingHint,
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
  const isBaseTransfer = destination === 'base';
  const reviewStatusLabel = getReviewStatusLabel(destination, withdrawalStatus, !!burnTxHash);
  const showQuoteSkeleton = !isBaseTransfer && !displayQuote && !quoteError;
  const isDestinationAddressEmpty = destinationAddressTrimmed.length === 0;
  const isQuoteDanger =
    !isBaseTransfer && !isQuoteLocked && quoteSecondsRemaining !== null && quoteSecondsRemaining <= 10;
  const youPayMinor =
    displayMode === 'pay'
      ? derivedPayMinor
      : displayQuote
        ? displayQuote.total_burn_usdc_minor
        : derivedPayMinor;
  const youPayDisplay = youPayMinor !== null ? formatUnits(BigInt(youPayMinor), 6) : '0.00';
  const youPayFontSize = getAmountFontSize(`${youPayDisplay}USDC`);
  const hasYouPayFractionPart = youPayDisplay.includes('.');
  const feeMinor = displayQuote?.max_fee_usdc_minor ?? 0;
  const receiveMinor =
    displayMode === 'receive'
      ? (displayQuote?.transfer_amount_usdc_minor ?? derivedReceiveMinor ?? 0)
      : (derivedReceiveMinor ?? displayQuote?.transfer_amount_usdc_minor ?? 0);
  const feePillLabel = isBaseTransfer
    ? 'Fixed'
    : quoteError && !displayQuote
      ? '--'
      : isQuoteLocked
        ? 'Locked'
        : displayQuote
          ? quoteTimeRemaining
          : '--';

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
              className={`w-full rounded-2xl px-4 py-3.5 text-base text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 ${
                hasDestinationAddressError
                  ? 'border border-red-500/70 bg-white/[0.02] focus:ring-red-500/40'
                  : isDestinationAddressEmpty
                    ? 'border-2 border-white bg-white/[0.03] focus:ring-white/30'
                    : 'border border-white/10 bg-white/[0.02] focus:ring-white/20'
              }`}
            />
            <button
              type="button"
              onClick={onPasteAddress}
              className={`no-brighten no-hover-frame inline-flex h-[52px] w-[52px] items-center justify-center rounded-2xl text-white transition hover:bg-white/10 ${
                isDestinationAddressEmpty
                  ? 'border border-white/25 bg-white/[0.07] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]'
                  : 'border border-white/10 bg-white/[0.04]'
              }`}
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
            ) : isDestinationAddressEmpty ? (
              <p className="text-[12px] text-gray-400">Required to continue</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-white/[0.14] bg-white/[0.03] p-5">
          <div className="text-center">
            <div className="flex w-full items-center justify-center">
              <div
                style={{
                  fontSize: youPayFontSize,
                  lineHeight: '1.05',
                  padding: '0.18em',
                }}
                className="inline-flex items-baseline justify-center whitespace-nowrap"
              >
                <span
                  style={{
                    marginRight: hasYouPayFractionPart ? '0.14em' : '0.22em',
                  }}
                  className="font-num font-semibold tracking-[0.04em] text-white"
                >
                  {youPayDisplay}
                </span>
                <span className="font-semibold text-gray-400">
                  USDC
                </span>
              </div>
            </div>
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
          {!isBaseTransfer ? (
            <div className="space-y-2.5 border-t border-white/10 pt-3.5 text-[17px] text-gray-300">
              {showQuoteSkeleton ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2 text-gray-400">
                      <span className="leading-none text-gray-200">Fees</span>
                      <span className="inline-flex h-[26px] w-[56px] shrink-0 animate-pulse rounded-full bg-white/14" />
                    </div>
                    <span className="inline-flex h-[1.05em] w-[7.5ch] shrink-0 animate-pulse rounded bg-white/14" />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-200">You receive</span>
                    <span className="inline-flex h-[1.05em] w-[7.5ch] animate-pulse rounded bg-white/14" />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2 text-gray-400">
                      <span className="leading-none text-gray-200">Fees</span>
                      <span
                        className={`font-num inline-flex h-[26px] min-w-[56px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-2.5 text-[11px] transition-[color,background-color,border-color,box-shadow] duration-300 ${
                          isQuoteDanger
                            ? 'withdraw-quote-danger-text-pulse withdraw-quote-danger-pill-pulse border-red-500/80 bg-red-500/12 text-red-100'
                            : 'border-white/25 bg-white/[0.1] text-gray-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                        }`}
                      >
                        {feePillLabel}
                      </span>
                    </div>
                    <span
                      className={`font-num shrink-0 transition-colors duration-300 ${
                        isQuoteDanger ? 'text-red-200 withdraw-quote-danger-text-pulse' : 'text-white'
                      }`}
                    >
                      {formatUsdc(feeMinor)}{' '}
                      <span className={isQuoteDanger ? 'text-red-200' : 'text-gray-400'}>USDC</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-200">You receive</span>
                    <span
                      className={`font-num shrink-0 transition-colors duration-300 ${
                        isQuoteDanger ? 'text-red-200 withdraw-quote-danger-text-pulse' : 'text-white'
                      }`}
                    >
                      {formatUsdc(receiveMinor)}{' '}
                      <span className={isQuoteDanger ? 'text-red-200' : 'text-gray-400'}>USDC</span>
                    </span>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>

        {showQuoteRefreshingHint && (
          <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-300">
            Quote expired. Refreshing automatically…
          </div>
        )}

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
              {isBaseTransfer ? 'Transfer status:' : 'Withdrawal status:'}{' '}
              <span className="text-white">{reviewStatusLabel}</span>
            </p>
            {burnTxHash && (
              <p className="break-all">
                {isBaseTransfer ? 'Transfer tx:' : 'Burn tx:'}{' '}
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
