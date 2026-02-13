import type { ComponentType } from 'react';
import { formatUsdc, MIN_WITHDRAW_RECEIVE_MINOR } from '@/lib/withdraw';
import type { DestinationChain } from '@/types/withdrawal';

type DestinationOption = {
  key: DestinationChain;
  label: string;
};

type NetworkIconProps = {
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
  return (
    <div className="flex flex-1 flex-col justify-between pb-6 pt-6 animate-slide-in">
      <div className="space-y-3">
        <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500">Choose network</p>
        <div className="space-y-2">
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
                  : 'Insufficient balance for minimum transfer (1.00 USDC)'
                : !feeAffordable
                  ? `Insufficient balance for minimum transfer${
                      minRequiredMinor !== null
                        ? ` (≈ ${formatUsdc(minRequiredMinor)} USDC required)`
                        : ''
                    }`
                  : feeEstimate !== undefined
                    ? `≈ ${formatUsdc(feeEstimate)} USDC fee`
                    : networkFeeLoading
                      ? 'Loading fee…'
                      : 'Fee unavailable';

            return (
              <button
                key={option.key}
                type="button"
                onClick={() => onSelectDestination(option.key)}
                disabled={!feeAffordable}
                className={`flex w-full items-start justify-between rounded-2xl border px-4 py-3 text-left text-sm transition ${
                  destination === option.key
                    ? 'border-white/40 bg-white/10 text-white'
                    : 'border-white/10 bg-[#111111] text-gray-300 hover:bg-white/5'
                } ${!feeAffordable ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex flex-col gap-1">
                  <span className="inline-flex items-center gap-2">
                    <NetworkIcon chainName={option.label} size={18} />
                    <span>{option.label}</span>
                  </span>
                  <span
                    className={`text-[11px] ${
                      !feeAffordable ? 'text-[#ff6b7a]' : 'text-gray-500'
                    }`}
                  >
                    {feeLabel}
                  </span>
                </div>
                {destination === option.key ? <span>✓</span> : null}
              </button>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        onClick={onContinue}
        disabled={continueDisabled}
        className="w-full rounded-2xl bg-white py-3 text-sm font-semibold text-black disabled:bg-white/10 disabled:text-white/40"
      >
        Continue
      </button>
    </div>
  );
}
