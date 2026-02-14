import type { ComponentType } from 'react';
import { formatUsdc, MIN_WITHDRAW_RECEIVE_MINOR } from '@/lib/withdraw';
import type { DestinationChain } from '@/types/withdrawal';

type DestinationOption = {
  key: DestinationChain;
  label: string;
};

type NetworkIconProps = {
  chainKey: DestinationChain;
  chainName: string;
  size?: number;
};

type WithdrawStepNetworkProps = {
  destinationChains: DestinationOption[];
  destination: DestinationChain;
  networkFeeEstimates: Partial<Record<DestinationChain, number>>;
  networkAvailability: Partial<Record<DestinationChain, boolean>>;
  networkFeeLoading: boolean;
  onSelectDestination: (chain: DestinationChain) => void;
  onContinue: () => void;
  continueDisabled: boolean;
  NetworkIcon: ComponentType<NetworkIconProps>;
};

export function WithdrawStepNetwork({
  destinationChains,
  destination,
  networkFeeEstimates,
  networkAvailability,
  networkFeeLoading,
  onSelectDestination,
  onContinue,
  continueDisabled,
  NetworkIcon,
}: WithdrawStepNetworkProps) {
  const optionsCountLabel = `${destinationChains.length} ${
    destinationChains.length === 1 ? 'option' : 'options'
  }`;
  const metaChipClass =
    'inline-flex h-8 min-w-[88px] items-center justify-center rounded-full px-3 text-[11px] font-medium tracking-[0.02em]';

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-4 animate-slide-in">
      <div className="shrink-0 px-4">
        <div className="flex items-center justify-between gap-3 px-4">
        <div className="space-y-1.5">
          <p className="font-num text-base font-semibold tracking-[0.01em] text-white">
            Choose network
          </p>
          <p className="text-[14px] text-gray-400">Pick destination network</p>
        </div>
        <span className={`shrink-0 border border-white/14 bg-white/[0.05] text-gray-300 ${metaChipClass}`}>
          {optionsCountLabel}
        </span>
      </div>
      </div>

      <div className="transient-scrollbar mt-3 mb-3 min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        <div className="space-y-2.5">
        {destinationChains.map((option) => {
          const feeEstimate = networkFeeEstimates[option.key];
          const feeAffordable = networkAvailability[option.key] !== false;
          const minRequiredMinor =
            option.key === 'base'
              ? MIN_WITHDRAW_RECEIVE_MINOR
              : feeEstimate !== undefined
                ? feeEstimate + MIN_WITHDRAW_RECEIVE_MINOR
                : null;
          const feeLabel =
            option.key === 'base'
              ? feeAffordable
                ? 'No bridge fee'
                : 'Minimum required: 1.00 USDC'
              : !feeAffordable
                ? minRequiredMinor !== null
                  ? `Minimum required: ${formatUsdc(minRequiredMinor)} USDC`
                  : 'Insufficient USDC balance'
                : feeEstimate !== undefined
                  ? `Fee: ~${formatUsdc(feeEstimate)} USDC`
                  : networkFeeLoading
                    ? 'Fee: loading...'
                    : 'Fee unavailable';

          const isSelected = destination === option.key;
          const isFeeLoading = option.key !== 'base' && feeEstimate === undefined && networkFeeLoading;

          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onSelectDestination(option.key)}
              disabled={!feeAffordable}
              className={`no-brighten flex min-h-[76px] w-full items-stretch justify-between rounded-2xl border px-4 py-2 text-left text-[15px] transition ${
                isSelected
                  ? 'border-white bg-white/[0.09] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06),0_10px_28px_rgba(255,255,255,0.04)]'
                  : 'border-white/[0.08] bg-white/[0.015] text-gray-300 hover:border-white/[0.14] hover:bg-white/[0.04]'
              } ${!feeAffordable ? 'cursor-not-allowed opacity-55' : ''}`}
            >
              <div className="flex min-w-0 flex-1 items-stretch gap-3.5">
                <div className="flex shrink-0 items-center">
                  <NetworkIcon chainKey={option.key} chainName={option.label} size={44} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-0 pr-2">
                  <span className="font-num truncate pb-[1px] text-[16px] font-medium leading-6 tracking-[0.02em]">
                    {option.label}
                  </span>
                  {isFeeLoading ? (
                    <span className="inline-flex h-3.5 w-24 animate-pulse rounded bg-white/10" />
                  ) : (
                    <span
                      title={feeLabel}
                      className={`block truncate pb-0 text-[16px] leading-5 ${
                        !feeAffordable ? 'text-[#ff6b7a]' : 'text-gray-400'
                      }`}
                    >
                      {feeLabel}
                    </span>
                  )}
                </div>
              </div>
              {isSelected ? (
                <span className={`self-center border border-white/25 bg-[#0a0a0a] text-white ${metaChipClass}`}>
                  Selected
                </span>
              ) : null}
            </button>
          );
        })}
        </div>
      </div>

      <div className="shrink-0 px-4 pb-4 pt-0">
        <button
          type="button"
          onClick={onContinue}
          disabled={continueDisabled}
          className="interactive-fx no-brighten inline-flex w-full items-center justify-center rounded-2xl border border-transparent bg-white py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:border-white/12 disabled:bg-white/10 disabled:text-white/40"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
