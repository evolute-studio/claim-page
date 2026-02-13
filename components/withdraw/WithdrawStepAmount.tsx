import type { ComponentType, KeyboardEvent } from 'react';
import { formatUnits } from 'viem';
import { formatUsdc } from '@/lib/withdraw';
import type { WithdrawalQuoteResponse } from '@/types/withdrawal';

type BackspaceIconProps = {
  size?: number;
};

type WithdrawStepAmountProps = {
  amountDisplay: string;
  amountDisplayWidth: string;
  amountFontSize: string;
  amountInput: string;
  formattedMaxReceivable: string | null;
  insufficientBalance: boolean;
  belowMinReceive: boolean;
  minPayMinor: number;
  amountMode: 'receive' | 'pay';
  parsedInputAmount: bigint | null;
  balanceMinor: bigint | null;
  quote: WithdrawalQuoteResponse | null;
  selectedFeeEstimateMinor: bigint;
  onAmountChange: (value: string) => void;
  appendAmountChar: (char: string) => void;
  onAmountBackspace: () => void;
  onContinue: () => void;
  BackspaceIcon: ComponentType<BackspaceIconProps>;
};

export function WithdrawStepAmount({
  amountDisplay,
  amountDisplayWidth,
  amountFontSize,
  amountInput,
  formattedMaxReceivable,
  insufficientBalance,
  belowMinReceive,
  minPayMinor,
  amountMode,
  parsedInputAmount,
  balanceMinor,
  quote,
  selectedFeeEstimateMinor,
  onAmountChange,
  appendAmountChar,
  onAmountBackspace,
  onContinue,
  BackspaceIcon,
}: WithdrawStepAmountProps) {
  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      onAmountBackspace();
      return;
    }
    if (event.key === '.') {
      event.preventDefault();
      appendAmountChar('.');
      return;
    }
    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      appendAmountChar(event.key);
    }
  };

  const applyPercent = (pct: number) => {
    if (!balanceMinor) return;
    const feeBasis =
      amountMode === 'receive' && quote ? BigInt(quote.max_fee_usdc_minor) : selectedFeeEstimateMinor;
    const available =
      amountMode === 'receive'
        ? balanceMinor > feeBasis
          ? balanceMinor - feeBasis
          : 0n
        : balanceMinor;
    const value = (available * BigInt(pct)) / 100n;
    onAmountChange(formatUnits(value, 6));
  };

  const applyMax = () => {
    if (!balanceMinor) return;
    const feeBasis =
      amountMode === 'receive' && quote ? BigInt(quote.max_fee_usdc_minor) : selectedFeeEstimateMinor;
    const available =
      amountMode === 'receive'
        ? balanceMinor > feeBasis
          ? balanceMinor - feeBasis
          : 0n
        : balanceMinor;
    onAmountChange(formatUnits(available, 6));
  };

  return (
    <div className="flex flex-1 flex-col justify-between pb-6 pt-8 animate-slide-in">
      <div className="flex flex-1 flex-col items-center justify-center space-y-5 text-center">
        <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500">
          Enter amount to receive
        </p>

        <div className="flex h-[3.6rem] items-center justify-center">
          <div className="inline-flex items-baseline">
            <input
              type="text"
              inputMode="none"
              readOnly
              value={amountDisplay}
              onKeyDown={handleInputKeyDown}
              aria-label="USDC amount"
              style={{
                width: amountDisplayWidth,
                marginRight: '0.2em',
                fontSize: amountFontSize,
                lineHeight: '1.05',
              }}
              className={`font-num bg-transparent text-center font-semibold tracking-tight focus:outline-none ${
                insufficientBalance ? 'text-[#ff6b7a]' : amountInput.trim() ? 'text-white' : 'text-gray-500'
              }`}
            />
            <span
              style={{ fontSize: amountFontSize, lineHeight: '1.05' }}
              className={`font-semibold ${insufficientBalance ? 'text-[#ff6b7a]' : 'text-gray-500'}`}
            >
              USDC
            </span>
          </div>
        </div>
        <p className="text-xs text-gray-500">{formattedMaxReceivable ?? '0.00'} USDC available</p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-2">
          {[25, 50, 75].map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => applyPercent(pct)}
              className="rounded-2xl border border-white/10 bg-white/5 py-2 text-sm text-white hover:bg-white/15"
            >
              {pct}%
            </button>
          ))}
          <button
            type="button"
            onClick={applyMax}
            className="rounded-2xl border border-white/10 bg-white/5 py-2 text-sm text-white hover:bg-white/15"
          >
            Max
          </button>
        </div>

        {insufficientBalance ? (
          <div className="w-full rounded-2xl bg-[#ff6b7a] py-3 text-center text-sm font-semibold text-black">
            Insufficient funds
          </div>
        ) : belowMinReceive ? (
          <div className="w-full rounded-2xl bg-[#ff6b7a] py-3 text-center text-sm font-semibold text-black">
            {amountMode === 'pay' ? `Minimum amount is ${formatUsdc(minPayMinor)} USDC` : 'Minimum amount is 1.00 USDC'}
          </div>
        ) : (
          <button
            type="button"
            onClick={onContinue}
            disabled={!parsedInputAmount || parsedInputAmount <= 0n || belowMinReceive}
            className="w-full rounded-2xl bg-white py-3 text-sm font-semibold text-black disabled:bg-white/10 disabled:text-white/40"
          >
            Continue
          </button>
        )}

        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => appendAmountChar(String(value))}
              className="rounded-2xl bg-[#121212] py-4 text-2xl text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            >
              {value}
            </button>
          ))}
          <button
            type="button"
            onClick={() => appendAmountChar('.')}
            className="no-shimmer rounded-2xl py-4 text-2xl text-white"
          >
            .
          </button>
          <button
            type="button"
            onClick={() => appendAmountChar('0')}
            className="rounded-2xl bg-[#121212] py-4 text-2xl text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          >
            0
          </button>
          <button
            type="button"
            onClick={onAmountBackspace}
            className="no-shimmer inline-flex items-center justify-center rounded-2xl py-4 text-white"
            aria-label="Delete"
          >
            <BackspaceIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
