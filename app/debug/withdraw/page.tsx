'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { ComponentType } from 'react';
import { Circle } from 'lucide-react';
import { WithdrawStepAmount } from '@/components/withdraw/WithdrawStepAmount';
import { WithdrawStepNetwork } from '@/components/withdraw/WithdrawStepNetwork';
import { WithdrawStepReview } from '@/components/withdraw/WithdrawStepReview';
import type { DestinationChain, WithdrawalQuoteResponse, WithdrawalStatus } from '@/types/withdrawal';

type DestinationOption = {
  key: DestinationChain;
  label: string;
  explorerTxBase: string;
};

type NetworkIconProps = {
  chainKey: DestinationChain;
  chainName: string;
  size?: number;
};

const destinationOptions: DestinationOption[] = [
  { key: 'base', label: 'Base', explorerTxBase: 'https://basescan.org/tx/' },
  { key: 'ethereum', label: 'Ethereum', explorerTxBase: 'https://etherscan.io/tx/' },
  { key: 'arbitrum', label: 'Arbitrum', explorerTxBase: 'https://arbiscan.io/tx/' },
];

const iconFileMap: Partial<Record<DestinationChain, string>> = {
  base: '/icons/base.jpeg',
  ethereum: '/icons/ethereum.svg',
  arbitrum: '/icons/arbitrum.svg',
};

function BackspaceIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m17 9-6 6m0-6 6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NetworkIcon({ chainKey, chainName, size = 20 }: NetworkIconProps) {
  const iconUrl = iconFileMap[chainKey];

  return (
    <span
      className="relative inline-flex items-center justify-center overflow-hidden rounded-[8px]"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {iconUrl ? (
        <Image
          src={iconUrl}
          alt={chainName}
          width={size}
          height={size}
          className={chainKey === 'ethereum' ? 'h-full w-full object-contain' : 'h-full w-full object-cover'}
        />
      ) : (
        <Circle size={Math.max(10, Math.round(size * 0.66))} strokeWidth={2} className="text-white" />
      )}
    </span>
  );
}

function MobileFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold tracking-[0.06em] text-gray-200">{title}</h2>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
      <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#0a0a0a] shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
        <div className="mx-auto flex min-h-[720px] w-full max-w-md flex-col px-4 pt-5 pb-8">
          <div className="grid grid-cols-3 items-center">
            <div />
            <div className="text-center text-[18px] font-semibold text-white">Send</div>
            <div className="flex justify-end">
              <span className="inline-flex h-9 w-9 rounded-full border border-white/10 bg-white/5" />
            </div>
          </div>
          <form className="flex min-h-0 flex-1 flex-col">{children}</form>
        </div>
      </div>
    </section>
  );
}

function buildQuote(values?: Partial<WithdrawalQuoteResponse>): WithdrawalQuoteResponse {
  return {
    quote_id: 'debug-quote',
    source_chain: 'base',
    source_domain_id: 6,
    dest_chain: 'ethereum',
    dest_domain_id: 0,
    transfer_amount_usdc_minor: 2_840_000,
    finality_threshold: 1000,
    forward_fee_level: 'med',
    fee_protocol_usdc_minor: 80_000,
    fee_forward_usdc_minor: 80_000,
    max_fee_usdc_minor: 160_000,
    total_burn_usdc_minor: 3_000_000,
    expires_at: Math.floor(Date.now() / 1000) + 65,
    ...values,
  };
}

const noop = () => undefined;

export default function DebugWithdrawPage() {
  const readyQuote = buildQuote();
  const trackingQuote = buildQuote({
    dest_chain: 'arbitrum',
    dest_domain_id: 3,
    transfer_amount_usdc_minor: 4_720_000,
    max_fee_usdc_minor: 280_000,
    total_burn_usdc_minor: 5_000_000,
  });
  const statusDestination = destinationOptions.find((item) => item.key === 'arbitrum');

  return (
    <main className="min-h-screen bg-[#0a0a0a] px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-md space-y-6">
        <header className="rounded-2xl border border-white/10 bg-[#111111]/95 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium tracking-[0.14em] text-gray-400">EVOLUTE WALLET</p>
              <h1 className="mt-2 text-2xl font-semibold text-white">Withdraw Lab</h1>
              <p className="mt-2 text-sm text-gray-400">
                Full-screen QA states for the send flow: network, amount, review, loading, and failure scenarios.
              </p>
            </div>
            <Link
              href="/debug"
              className="inline-flex rounded-xl border border-white/20 bg-white/[0.03] px-3 py-2 text-sm font-medium text-white transition hover:bg-white/[0.08]"
            >
              Back
            </Link>
          </div>
        </header>

        <MobileFrame
          title="Network: Loading Fees"
          description="First step while bridge estimates are still loading."
        >
          <WithdrawStepNetwork
            destinationChains={destinationOptions}
            destination="ethereum"
            networkFeeEstimates={{}}
            networkAvailability={{ base: true, ethereum: true, arbitrum: true }}
            networkFeeLoading
            onSelectDestination={noop as (chain: DestinationChain) => void}
            onContinue={noop}
            continueDisabled={false}
            NetworkIcon={NetworkIcon as ComponentType<NetworkIconProps>}
          />
        </MobileFrame>

        <MobileFrame
          title="Network: Mixed Availability"
          description="Ready state with visible fee values and one unavailable route."
        >
          <WithdrawStepNetwork
            destinationChains={destinationOptions}
            destination="ethereum"
            networkFeeEstimates={{ base: 0, ethereum: 160_000 }}
            networkAvailability={{ base: true, ethereum: true, arbitrum: false }}
            networkFeeLoading={false}
            onSelectDestination={noop as (chain: DestinationChain) => void}
            onContinue={noop}
            continueDisabled={false}
            NetworkIcon={NetworkIcon as ComponentType<NetworkIconProps>}
          />
        </MobileFrame>

        <MobileFrame
          title="Amount: Normal"
          description="Editable amount with enough balance and active continue CTA."
        >
          <WithdrawStepAmount
            amountDisplay="3.00"
            amountDisplayWidth="4ch"
            amountFontSize="3.2rem"
            amountInput="3.00"
            formattedMaxReceivable="14.82"
            insufficientBalance={false}
            belowMinReceive={false}
            minPayMinor={1_160_000}
            amountMode="pay"
            parsedInputAmount={3_000_000n}
            balanceMinor={15_000_000n}
            quote={readyQuote}
            selectedFeeEstimateMinor={160_000n}
            onAmountChange={noop as (value: string) => void}
            appendAmountChar={noop as (char: string) => void}
            onAmountBackspace={noop}
            onContinue={noop}
            BackspaceIcon={BackspaceIcon}
          />
        </MobileFrame>

        <MobileFrame
          title="Amount: Insufficient"
          description="The value stays readable, but CTA flips to the blocking state."
        >
          <WithdrawStepAmount
            amountDisplay="18.50"
            amountDisplayWidth="5ch"
            amountFontSize="3.2rem"
            amountInput="18.50"
            formattedMaxReceivable="14.82"
            insufficientBalance
            belowMinReceive={false}
            minPayMinor={1_160_000}
            amountMode="pay"
            parsedInputAmount={18_500_000n}
            balanceMinor={15_000_000n}
            quote={readyQuote}
            selectedFeeEstimateMinor={160_000n}
            onAmountChange={noop as (value: string) => void}
            appendAmountChar={noop as (char: string) => void}
            onAmountBackspace={noop}
            onContinue={noop}
            BackspaceIcon={BackspaceIcon}
          />
        </MobileFrame>

        <MobileFrame
          title="Amount: Minimum Guard"
          description="Below-minimum messaging for very small inputs."
        >
          <WithdrawStepAmount
            amountDisplay="0.30"
            amountDisplayWidth="4ch"
            amountFontSize="3.2rem"
            amountInput="0.30"
            formattedMaxReceivable="14.82"
            insufficientBalance={false}
            belowMinReceive
            minPayMinor={1_160_000}
            amountMode="pay"
            parsedInputAmount={300_000n}
            balanceMinor={15_000_000n}
            quote={readyQuote}
            selectedFeeEstimateMinor={160_000n}
            onAmountChange={noop as (value: string) => void}
            appendAmountChar={noop as (char: string) => void}
            onAmountBackspace={noop}
            onContinue={noop}
            BackspaceIcon={BackspaceIcon}
          />
        </MobileFrame>

        <MobileFrame
          title="Review: Quote Loading"
          description="Preview panel while bridge quote values are still being resolved."
        >
          <WithdrawStepReview
            destinationAddress="0x8ba1f109551bD432803012645Ac136ddd64DBA72"
            onDestinationAddressChange={noop as (value: string) => void}
            onPasteAddress={noop}
            hasDestinationAddressError={false}
            isDestinationAddressValid
            destinationAddressTrimmed="0x8ba1f109551bD432803012645Ac136ddd64DBA72"
            amountMode="pay"
            derivedPayMinor={3_000_000}
            derivedReceiveMinor={2_840_000}
            isQuoteLocked={false}
            quoteTimeRemaining="0:59"
            quoteSecondsRemaining={59}
            destinationConfig={destinationOptions[1]}
            destination="ethereum"
            NetworkIcon={NetworkIcon as ComponentType<NetworkIconProps>}
            displayQuote={null}
            quoteError={null}
            displayMode="pay"
            showQuoteRefreshingHint={false}
            insufficientBalance={false}
            belowMinReceive={false}
            minPayMinor={1_160_000}
            withdrawalId={null}
            burnTxHash={null}
            withdrawalStatus={null}
            baseExplorerBase="https://basescan.org/tx/"
            forwardTxHash={null}
            onCancel={noop}
            onResetFlow={noop}
            cancelDisabled={false}
            confirmDisabled
            confirmLabel="Confirm"
          />
        </MobileFrame>

        <MobileFrame
          title="Review: Invalid Address"
          description="Field-level validation should stay inline right next to the destination input."
        >
          <WithdrawStepReview
            destinationAddress="0x1234"
            onDestinationAddressChange={noop as (value: string) => void}
            onPasteAddress={noop}
            hasDestinationAddressError
            isDestinationAddressValid={false}
            destinationAddressTrimmed="0x1234"
            amountMode="pay"
            derivedPayMinor={3_000_000}
            derivedReceiveMinor={2_840_000}
            isQuoteLocked={false}
            quoteTimeRemaining="0:42"
            quoteSecondsRemaining={42}
            destinationConfig={destinationOptions[1]}
            destination="ethereum"
            NetworkIcon={NetworkIcon as ComponentType<NetworkIconProps>}
            displayQuote={readyQuote}
            quoteError={null}
            displayMode="pay"
            showQuoteRefreshingHint={false}
            insufficientBalance={false}
            belowMinReceive={false}
            minPayMinor={1_160_000}
            withdrawalId={null}
            burnTxHash={null}
            withdrawalStatus={null}
            baseExplorerBase="https://basescan.org/tx/"
            forwardTxHash={null}
            onCancel={noop}
            onResetFlow={noop}
            cancelDisabled={false}
            confirmDisabled
            confirmLabel="Confirm"
          />
        </MobileFrame>

        <MobileFrame
          title="Review: Quote Error Fallback"
          description="Quote values fall back to defaults while the actual error is expected to come from a toast."
        >
          <WithdrawStepReview
            destinationAddress="0x8ba1f109551bD432803012645Ac136ddd64DBA72"
            onDestinationAddressChange={noop as (value: string) => void}
            onPasteAddress={noop}
            hasDestinationAddressError={false}
            isDestinationAddressValid
            destinationAddressTrimmed="0x8ba1f109551bD432803012645Ac136ddd64DBA72"
            amountMode="pay"
            derivedPayMinor={3_000_000}
            derivedReceiveMinor={2_840_000}
            isQuoteLocked={false}
            quoteTimeRemaining="--"
            quoteSecondsRemaining={null}
            destinationConfig={destinationOptions[1]}
            destination="ethereum"
            NetworkIcon={NetworkIcon as ComponentType<NetworkIconProps>}
            displayQuote={null}
            quoteError="Quote request timed out. Please try again."
            displayMode="pay"
            showQuoteRefreshingHint={false}
            insufficientBalance={false}
            belowMinReceive={false}
            minPayMinor={1_160_000}
            withdrawalId={null}
            burnTxHash={null}
            withdrawalStatus={null}
            baseExplorerBase="https://basescan.org/tx/"
            forwardTxHash={null}
            onCancel={noop}
            onResetFlow={noop}
            cancelDisabled={false}
            confirmDisabled={false}
            confirmLabel="Confirm"
          />
        </MobileFrame>

        <MobileFrame
          title="Review: Ready"
          description="Healthy bridge transfer with resolved fee and receive amount."
        >
          <WithdrawStepReview
            destinationAddress="0x8ba1f109551bD432803012645Ac136ddd64DBA72"
            onDestinationAddressChange={noop as (value: string) => void}
            onPasteAddress={noop}
            hasDestinationAddressError={false}
            isDestinationAddressValid
            destinationAddressTrimmed="0x8ba1f109551bD432803012645Ac136ddd64DBA72"
            amountMode="pay"
            derivedPayMinor={3_000_000}
            derivedReceiveMinor={2_840_000}
            isQuoteLocked={false}
            quoteTimeRemaining="0:41"
            quoteSecondsRemaining={41}
            destinationConfig={destinationOptions[1]}
            destination="ethereum"
            NetworkIcon={NetworkIcon as ComponentType<NetworkIconProps>}
            displayQuote={readyQuote}
            quoteError={null}
            displayMode="pay"
            showQuoteRefreshingHint={false}
            insufficientBalance={false}
            belowMinReceive={false}
            minPayMinor={1_160_000}
            withdrawalId={null}
            burnTxHash={null}
            withdrawalStatus={null}
            baseExplorerBase="https://basescan.org/tx/"
            forwardTxHash={null}
            onCancel={noop}
            onResetFlow={noop}
            cancelDisabled={false}
            confirmDisabled={false}
            confirmLabel="Confirm"
          />
        </MobileFrame>

        <MobileFrame
          title="Review: Submitted"
          description="Tracked withdrawal with status panel and reset CTA after mint hash is known."
        >
          <WithdrawStepReview
            destinationAddress="0x8ba1f109551bD432803012645Ac136ddd64DBA72"
            onDestinationAddressChange={noop as (value: string) => void}
            onPasteAddress={noop}
            hasDestinationAddressError={false}
            isDestinationAddressValid
            destinationAddressTrimmed="0x8ba1f109551bD432803012645Ac136ddd64DBA72"
            amountMode="pay"
            derivedPayMinor={5_000_000}
            derivedReceiveMinor={4_720_000}
            isQuoteLocked
            quoteTimeRemaining="Locked"
            quoteSecondsRemaining={null}
            destinationConfig={statusDestination}
            destination="arbitrum"
            NetworkIcon={NetworkIcon as ComponentType<NetworkIconProps>}
            displayQuote={trackingQuote}
            quoteError={null}
            displayMode="pay"
            showQuoteRefreshingHint={false}
            insufficientBalance={false}
            belowMinReceive={false}
            minPayMinor={1_280_000}
            withdrawalId="wd_debug_001"
            burnTxHash="0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            withdrawalStatus={'FORWARDING_PENDING' as WithdrawalStatus}
            baseExplorerBase="https://basescan.org/tx/"
            forwardTxHash="0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
            onCancel={noop}
            onResetFlow={noop}
            cancelDisabled
            confirmDisabled
            confirmLabel="Processing..."
          />
        </MobileFrame>
      </div>
    </main>
  );
}
