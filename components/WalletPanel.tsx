'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  getIdentityToken,
  useIdentityToken,
  useSendTransaction,
  useWallets,
} from '@privy-io/react-auth';
import type { SendTransactionModalUIOptions } from '@privy-io/react-auth';
import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  http,
  isAddress,
  parseUnits,
} from 'viem';
import {
  confirmClaim,
  confirmClaimByPayoutId,
  createWithdrawal,
  getMyPayouts,
  getWithdrawalQuote,
  submitBurnTx,
} from '@/lib/api';
import { getCctpConfig, getDestinationChains, getDestinationConfig } from '@/lib/cctp';
import { WithdrawStepAmount } from '@/components/withdraw/WithdrawStepAmount';
import { WithdrawStepNetwork } from '@/components/withdraw/WithdrawStepNetwork';
import { WithdrawStepReview } from '@/components/withdraw/WithdrawStepReview';
import { CoinIcon } from '@/components/CoinIcon';
import { PayoutListCard } from '@/components/PayoutListCard';
import { StatusBadge } from '@/components/StatusBadge';
import { useNetworkFeeEstimates } from '@/lib/useNetworkFeeEstimates';
import { useWithdrawalQuote } from '@/lib/useWithdrawalQuote';
import { useWithdrawalStatus } from '@/lib/useWithdrawalStatus';
import { useWithdrawBalance } from '@/lib/useWithdrawBalance';
import {
  clampUsdcInput,
  formatUsdc,
  isQuoteExpiredError,
  MIN_WITHDRAW_RECEIVE_MINOR,
  toNumberSafe,
} from '@/lib/withdraw';
import type {
  DestinationChain,
  WithdrawalQuoteResponse,
} from '@/types/withdrawal';
import type { PayoutPreview } from '@/types/payout';

const ZERO_BYTES32 = `0x${'0'.repeat(64)}` as `0x${string}`;
const MAX_UINT256 = (2n ** 256n - 1n) as bigint;
const WITHDRAW_DEBUG_ENABLED =
  (process.env.NEXT_PUBLIC_WITHDRAW_DEBUG ?? '').toLowerCase() === 'true';

type WithdrawDebugEvent = {
  ts: number;
  stage: string;
  message: string;
  data?: Record<string, unknown>;
};

const TOKEN_MESSENGER_ABI = [
  {
    type: 'function',
    name: 'depositForBurnWithHook',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'destinationDomain', type: 'uint32' },
      { name: 'mintRecipient', type: 'bytes32' },
      { name: 'burnToken', type: 'address' },
      { name: 'destinationCaller', type: 'bytes32' },
      { name: 'maxFee', type: 'uint256' },
      { name: 'minFinalityThreshold', type: 'uint32' },
      { name: 'hookData', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;

function addressToBytes32(address: string): `0x${string}` {
  const stripped = address.toLowerCase().replace(/^0x/, '');
  return `0x${stripped.padStart(64, '0')}` as `0x${string}`;
}

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(
    value,
    (_key, val) => {
      if (typeof val === 'bigint') return val.toString();
      if (val && typeof val === 'object') {
        if (seen.has(val as object)) return '[Circular]';
        seen.add(val as object);
      }
      return val;
    },
    2
  );
}

function getAmountFontSize(displayValue: string): string {
  const length = displayValue.replace('.', '').length || 1;
  const maxSize = 3.2;
  const bucketSize = 6;
  const bucket = Math.floor((length - 1) / bucketSize);
  const size = maxSize / (1 + bucket * 0.28);
  return `${size}rem`;
}

function buildTxUiOptions(params: {
  mode: 'transfer' | 'approve' | 'burn';
  destinationLabel?: string;
}): SendTransactionModalUIOptions {
  if (params.mode === 'transfer') {
    return {
      description: 'Confirm sending USDC on Base.',
      buttonText: 'Confirm',
      transactionInfo: {
        title: 'Transfer details',
        action: 'Send USDC',
        contractInfo: {
          name: 'USD Coin (USDC)',
        },
      },
      successHeader: 'Transfer submitted',
      successDescription: 'Transaction has been sent.',
      isCancellable: true,
    };
  }

  if (params.mode === 'approve') {
    return {
      description: 'Approve USDC allowance for this bridge transfer.',
      buttonText: 'Approve',
      transactionInfo: {
        title: 'Approval details',
        action: 'Approve USDC',
        contractInfo: {
          name: 'USD Coin (USDC)',
        },
      },
      successHeader: 'Approval submitted',
      successDescription: 'Allowance transaction has been sent.',
      isCancellable: true,
    };
  }

  return {
    description: `Confirm bridge transfer to ${params.destinationLabel ?? 'destination network'}.`,
    buttonText: 'Confirm',
    transactionInfo: {
      title: 'Bridge details',
      action: 'Bridge USDC',
      contractInfo: {
        name: 'CCTP TokenMessengerV2',
      },
    },
    successHeader: 'Bridge transaction submitted',
    successDescription: 'USDC transfer is in progress.',
    isCancellable: true,
  };
}

// Backspace icon shape from Lucide (ISC License), embedded as inline SVG.
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

// ArrowLeft and X icon shapes from Lucide (ISC License), embedded as inline SVG.
function ArrowLeftIcon({ size = 18 }: { size?: number }) {
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
        d="m12 19-7-7 7-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 12H5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon({ size = 18 }: { size?: number }) {
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
        d="M18 6 6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m6 6 12 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Send icon shape from Lucide (ISC License), embedded as inline SVG.
function SendIcon({ size = 16 }: { size?: number }) {
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
        d="m3 3 3 9-3 9 19-9Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 12h16"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NetworkIcon({ chainName, size = 16 }: { chainName: string; size?: number }) {
  const name = chainName.toLowerCase();

  if (name.includes('base')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="12" fill="#0052FF" />
        <path
          d="M6 12C6 8.686 8.686 6 12 6H18V10H12C10.895 10 10 10.895 10 12C10 13.105 10.895 14 12 14H18V18H12C8.686 18 6 15.314 6 12Z"
          fill="white"
        />
      </svg>
    );
  }

  if (name.includes('ethereum')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="12" fill="#627EEA" />
        <path d="M12 4L7.5 12L12 9.5L16.5 12L12 4Z" fill="white" />
        <path d="M12 10.5L7.5 13L12 20L16.5 13L12 10.5Z" fill="#DCE6FF" />
      </svg>
    );
  }

  if (name.includes('arbitrum')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="12" fill="#2D374B" />
        <path d="M7 15.5L10.5 7H13L9.5 15.5H7Z" fill="#28A0F0" />
        <path d="M10.5 15.5L14 7H16.5L13 15.5H10.5Z" fill="#9DCCED" />
      </svg>
    );
  }

  if (name.includes('optimism')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="12" fill="#FF0420" />
        <text x="12" y="15" textAnchor="middle" fontSize="7" fontWeight="700" fill="white">
          OP
        </text>
      </svg>
    );
  }

  if (name.includes('polygon')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="12" fill="#8247E5" />
        <path
          d="M8.5 10L11 8.5L13.5 10V13L11 14.5L8.5 13V10Z"
          stroke="white"
          strokeWidth="1.4"
        />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="12" fill="#475569" />
      <circle cx="12" cy="12" r="5" stroke="white" strokeWidth="1.4" />
    </svg>
  );
}

type AmountMode = 'receive' | 'pay';
type WithdrawStep = 1 | 2 | 4;

export function WalletPanel({ isActive = true }: { isActive?: boolean }) {
  const { wallets } = useWallets();
  const { identityToken } = useIdentityToken();
  const { sendTransaction } = useSendTransaction();
  const config = useMemo(() => getCctpConfig(), []);
  const publicClient = useMemo(() => {
    return createPublicClient({
      chain: config.sourceChain,
      transport: http(),
    });
  }, [config.sourceChain]);
  const identityTokenRef = useRef<string | null>(identityToken ?? null);
  const didInitialClaimableLoadRef = useRef(false);

  useEffect(() => {
    identityTokenRef.current = identityToken ?? null;
  }, [identityToken]);

  const getAuthToken = useCallback(async () => {
    let freshToken: string | null = null;
    try {
      freshToken = await getIdentityToken();
    } catch {
      freshToken = null;
    }
    const token = freshToken ?? identityTokenRef.current;
    if (!token) {
      throw new Error('Missing identity token. Please re-login.');
    }
    return token;
  }, []);

  const [amountMode] = useState<AmountMode>('receive');
  const [amountInput, setAmountInput] = useState('');
  const [destination, setDestination] = useState<DestinationChain>('base');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [lockedQuote, setLockedQuote] = useState<WithdrawalQuoteResponse | null>(null);
  const [lockedAmountInput, setLockedAmountInput] = useState<string | null>(null);
  const [lockedAmountMode, setLockedAmountMode] = useState<AmountMode | null>(null);
  const [step, setStep] = useState<WithdrawStep>(1);
  const [debugEvents, setDebugEvents] = useState<WithdrawDebugEvent[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [claimablePayouts, setClaimablePayouts] = useState<PayoutPreview[]>([]);
  const [claimablePayoutsLoading, setClaimablePayoutsLoading] = useState(false);
  const [claimablePayoutsError, setClaimablePayoutsError] = useState<string | null>(null);
  const [claimingPayoutId, setClaimingPayoutId] = useState<string | null>(null);
  const [selectedPayout, setSelectedPayout] = useState<PayoutPreview | null>(null);
  const [claimablePayoutsScrolling, setClaimablePayoutsScrolling] = useState(false);
  const claimableScrollTimeoutRef = useRef<number | null>(null);
  const claimableScrollArmedRef = useRef(false);

  const pushDebug = useCallback(
    (stage: string, message: string, data?: Record<string, unknown>) => {
      if (!WITHDRAW_DEBUG_ENABLED) return;
      const entry: WithdrawDebugEvent = {
        ts: Date.now(),
        stage,
        message,
        data,
      };
      setDebugEvents((current) => [...current, entry].slice(-200));
      if (typeof window !== 'undefined') {
        console.debug('[withdraw]', stage, message, data ?? {});
      }
    },
    []
  );
  const {
    withdrawalId,
    setWithdrawalId,
    withdrawalStatus,
    setWithdrawalStatus,
    burnTxHash,
    setBurnTxHash,
    forwardTxHash,
    setForwardTxHash,
    resetWithdrawalTracking,
  } = useWithdrawalStatus({
    getAuthToken,
    debugEnabled: WITHDRAW_DEBUG_ENABLED,
    pushDebug,
    onFailureReason: setFormError,
    onPollingError: setFormError,
  });

  const activeWalletAddress = wallets[0]?.address ?? null;
  const readUsdcBalance = useCallback(async () => {
    if (!activeWalletAddress || !config.usdcAddress) {
      throw new Error('Missing wallet or USDC address');
    }
    return publicClient.readContract({
      address: config.usdcAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [activeWalletAddress as `0x${string}`],
    });
  }, [activeWalletAddress, config.usdcAddress, publicClient]);
  const { balance, balanceMinor, balanceError, balanceLoading, refreshBalance } = useWithdrawBalance({
    activeWalletAddress,
    usdcAddress: config.usdcAddress,
    readBalance: activeWalletAddress && config.usdcAddress ? readUsdcBalance : null,
  });
  const destinationChains = useMemo(
    () => getDestinationChains(config.sourceChain),
    [config.sourceChain]
  );
  const fetchNetworkFeeQuote = useCallback(
    async (token: string, chain: DestinationChain) => {
      const response = await getWithdrawalQuote(token, {
        dest_chain: chain,
        transfer_amount_usdc_minor: 1_000_000,
      });
      return response.max_fee_usdc_minor;
    },
    []
  );
  const {
    networkFeeEstimates,
    networkFeeLoading,
    resetNetworkFeeRuntimeState,
  } = useNetworkFeeEstimates({
    withdrawOpen,
    step,
    destinationChains,
    getAuthToken,
    fetchFeeQuote: fetchNetworkFeeQuote,
    debugEnabled: WITHDRAW_DEBUG_ENABLED,
    pushDebug,
  });
  const destinationConfig = getDestinationConfig(destination, config.sourceChain);
  const networkAvailability = useMemo(() => {
    const availability: Partial<Record<DestinationChain, boolean>> = {};
    const minRequiredReceive = BigInt(MIN_WITHDRAW_RECEIVE_MINOR);
    destinationChains.forEach((option) => {
      if (balanceMinor === null) {
        availability[option.key] = true;
        return;
      }
      if (option.key === 'base') {
        availability[option.key] = balanceMinor >= minRequiredReceive;
        return;
      }
      const feeEstimate = networkFeeEstimates[option.key];
      if (feeEstimate === undefined) {
        availability[option.key] = true;
        return;
      }
      const minRequiredWithFee = BigInt(feeEstimate) + minRequiredReceive;
      availability[option.key] = balanceMinor >= minRequiredWithFee;
    });
    return availability;
  }, [balanceMinor, destinationChains, networkFeeEstimates]);
  useEffect(() => {
    if (!withdrawOpen || !WITHDRAW_DEBUG_ENABLED) return;
    pushDebug('flow', 'Withdrawal flow opened', {
      env: process.env.NEXT_PUBLIC_CCTP_ENV ?? 'mainnet',
      source_chain: config.sourceChain.name,
      source_chain_id: config.sourceChain.id,
      usdc_address: config.usdcAddress,
      token_messenger: config.tokenMessengerAddress,
    });
  }, [config, destinationChains, pushDebug, withdrawOpen]);

  useEffect(() => {
    if (!withdrawOpen || !WITHDRAW_DEBUG_ENABLED) return;
    pushDebug('ui', 'Destination selected', { destination });
  }, [destination, pushDebug, withdrawOpen]);

  useEffect(() => {
    if (!WITHDRAW_DEBUG_ENABLED || !formError) return;
    pushDebug('form:error', 'Form error', { message: formError });
  }, [formError, pushDebug]);
  const clampAmountInput = useCallback((raw: string) => clampUsdcInput(raw), []);
  const handleAmountChange = useCallback(
    (value: string) => {
      setAmountInput(clampAmountInput(value));
    },
    [clampAmountInput]
  );
  const appendAmountChar = useCallback(
    (char: string) => {
      setAmountInput((current) => {
        if (char === '.') {
          if (current.includes('.')) return current;
          return clampAmountInput(`${current || '0'}.`);
        }
        return clampAmountInput(`${current}${char}`);
      });
    },
    [clampAmountInput]
  );
  const handleAmountBackspace = useCallback(() => {
    setAmountInput((current) => {
      if (!current) return current;
      if (current.length <= 1) return '';
      return current.slice(0, -1);
    });
  }, []);
  const parsedInputAmount = useMemo(() => {
    const trimmed = amountInput.trim();
    if (!trimmed) return null;
    try {
      return parseUnits(trimmed, 6);
    } catch {
      return null;
    }
  }, [amountInput]);
  const effectiveAmountInput = lockedAmountInput ?? amountInput;
  const effectiveParsedInputAmount = useMemo(() => {
    const trimmed = effectiveAmountInput.trim();
    if (!trimmed) return null;
    try {
      return parseUnits(trimmed, 6);
    } catch {
      return null;
    }
  }, [effectiveAmountInput]);
  const isProcessingWithdrawal =
    withdrawalStatus === 'BURN_SUBMITTED' || withdrawalStatus === 'FORWARDING_PENDING';
  const isQuoteLocked = lockedQuote !== null || isProcessingWithdrawal || sending;
  const {
    quote,
    quoteError,
    quoteLoading,
    feeEstimateMinor,
    quoteRequestAmount,
    quoteExpired,
    quoteTimeRemaining,
    refreshQuote,
    clearQuoteState,
    resetQuoteState,
  } = useWithdrawalQuote({
    destination,
    amountMode,
    parsedInputAmount,
    activeWalletAddress,
    isQuoteLocked,
    sending,
    step,
    getAuthToken,
    debugEnabled: WITHDRAW_DEBUG_ENABLED,
    pushDebug,
  });
  const selectedFeeEstimateMinor = useMemo(() => {
    if (destination === 'base') return 0n;
    const estimate = networkFeeEstimates[destination];
    if (typeof estimate === 'number' && Number.isFinite(estimate) && estimate > 0) {
      return BigInt(Math.round(estimate));
    }
    return feeEstimateMinor > 0n ? feeEstimateMinor : 0n;
  }, [destination, feeEstimateMinor, networkFeeEstimates]);
  const feeBasisMinor = useMemo(() => {
    if (quote) return quote.max_fee_usdc_minor;
    const estimate = toNumberSafe(selectedFeeEstimateMinor);
    return estimate > 0 ? estimate : 0;
  }, [quote, selectedFeeEstimateMinor]);
  const derivedPayMinor = useMemo(() => {
    if (!effectiveParsedInputAmount) return null;
    const mode = lockedAmountMode ?? amountMode;
    if (mode === 'pay') return toNumberSafe(effectiveParsedInputAmount);
    if (quote) return quote.total_burn_usdc_minor;
    return Math.max(0, toNumberSafe(effectiveParsedInputAmount) + feeBasisMinor);
  }, [amountMode, effectiveParsedInputAmount, feeBasisMinor, lockedAmountMode, quote]);
  const derivedReceiveMinor = useMemo(() => {
    if (!effectiveParsedInputAmount) return null;
    const mode = lockedAmountMode ?? amountMode;
    if (mode === 'receive') {
      if (quote) return quote.transfer_amount_usdc_minor;
      return toNumberSafe(effectiveParsedInputAmount);
    }
    const payMinor = toNumberSafe(effectiveParsedInputAmount);
    return Math.max(0, payMinor - feeBasisMinor);
  }, [amountMode, effectiveParsedInputAmount, feeBasisMinor, lockedAmountMode, quote]);
  const minReceiveMinor = MIN_WITHDRAW_RECEIVE_MINOR;
  const minPayMinor = feeBasisMinor + minReceiveMinor;
  const belowMinReceive =
    effectiveParsedInputAmount !== null &&
    effectiveParsedInputAmount > 0n &&
    derivedReceiveMinor !== null &&
    derivedReceiveMinor < minReceiveMinor;

  useEffect(() => {
    if (!WITHDRAW_DEBUG_ENABLED || !quote) return;
    pushDebug('quote:normalized', 'Quote stored', {
      quote_id: quote.quote_id,
      dest_chain: quote.dest_chain,
      transfer_amount_usdc_minor: quote.transfer_amount_usdc_minor,
      max_fee_usdc_minor: quote.max_fee_usdc_minor,
      total_burn_usdc_minor: quote.total_burn_usdc_minor,
      fee_protocol_usdc_minor: quote.fee_protocol_usdc_minor,
      fee_forward_usdc_minor: quote.fee_forward_usdc_minor,
      expires_at: quote.expires_at,
      finality_threshold: quote.finality_threshold,
      forward_fee_level: quote.forward_fee_level,
    });
  }, [quote, pushDebug]);

  useEffect(() => {
    if (!WITHDRAW_DEBUG_ENABLED || !quoteError) return;
    pushDebug('quote:error', 'Quote error', { message: quoteError });
  }, [quoteError, pushDebug]);

  const baseExplorerBase = useMemo(() => {
    return config.sourceChain.id === 84532
      ? 'https://sepolia.basescan.org/tx/'
      : 'https://basescan.org/tx/';
  }, [config.sourceChain.id]);

  const handlePasteAddress = async () => {
    try {
      const value = await navigator.clipboard.readText();
      if (value) {
        setDestinationAddress(value.trim());
        setFormError(null);
      }
    } catch {
      setFormError('Failed to read clipboard.');
    }
  };

  useEffect(() => {
    if (!destinationChains.find((item) => item.key === destination)) {
      setDestination(destinationChains[0]?.key ?? 'ethereum');
    }
  }, [destination, destinationChains]);

  useEffect(() => {
    if (!destinationChains.length) return;
    if (networkAvailability[destination] !== false) return;
    const fallback = destinationChains.find(
      (option) => networkAvailability[option.key] !== false
    );
    if (fallback) {
      setDestination(fallback.key);
    }
  }, [destination, destinationChains, networkAvailability]);

  useEffect(() => {
    setFormError(null);
  }, [step]);

  const formattedBalance = useMemo(() => {
    if (!balance) return null;
    const numeric = Number(balance);
    if (Number.isNaN(numeric)) return balance;
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric);
  }, [balance]);
  const availabilityFeeMinor = useMemo(() => {
    if (destination === 'base') return 0n;
    if (quote) return BigInt(quote.max_fee_usdc_minor ?? 0);
    return selectedFeeEstimateMinor > 0n ? selectedFeeEstimateMinor : 0n;
  }, [destination, quote, selectedFeeEstimateMinor]);
  const maxReceivableMinor = useMemo(() => {
    if (balanceMinor === null) return null;
    if (destination === 'base') return balanceMinor;
    return balanceMinor > availabilityFeeMinor ? balanceMinor - availabilityFeeMinor : 0n;
  }, [availabilityFeeMinor, balanceMinor, destination]);
  const formattedMaxReceivable = useMemo(() => {
    if (maxReceivableMinor === null) return null;
    const numeric = Number(formatUnits(maxReceivableMinor, 6));
    if (Number.isNaN(numeric)) return '0.00';
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(numeric);
  }, [maxReceivableMinor]);

  const requiredPayMinor = useMemo(() => {
    if (amountMode === 'pay') return parsedInputAmount ?? null;
    if (!parsedInputAmount) return null;
    if (quote) return BigInt(quote.total_burn_usdc_minor);
    // Before quote arrives, use fee estimate so balance checks are immediate.
    return parsedInputAmount + availabilityFeeMinor;
  }, [amountMode, availabilityFeeMinor, parsedInputAmount, quote]);
  const shouldValidateBalance =
    !isQuoteLocked && !isProcessingWithdrawal && !sending && !balanceLoading;
  const shouldPersistFormError = useMemo(() => {
    if (!formError) return false;
    if (!withdrawalId) return false;
    return (
      withdrawalStatus === 'FAILED' ||
      withdrawalStatus === 'EXPIRED' ||
      withdrawalStatus === 'BURN_SUBMITTED' ||
      withdrawalStatus === 'FORWARDING_PENDING'
    );
  }, [formError, withdrawalId, withdrawalStatus]);

  const insufficientBalance =
    shouldValidateBalance &&
    balanceMinor !== null &&
    requiredPayMinor !== null &&
    balanceMinor < requiredPayMinor;

  useEffect(() => {
    if (!withdrawOpen || step !== 4) return;
    refreshBalance();
  }, [refreshBalance, step, withdrawOpen]);

  useEffect(() => {
    if (!formError || shouldPersistFormError) return;
    const timerId = window.setTimeout(() => {
      setFormError((current) => (current === formError ? null : current));
    }, 4200);
    return () => window.clearTimeout(timerId);
  }, [formError, shouldPersistFormError]);

  const handleOpenWithdraw = () => {
    setFormError(null);
    setAmountInput('');
    setDestination('base');
    resetQuoteState();
    resetNetworkFeeRuntimeState();
    setLockedQuote(null);
    setLockedAmountInput(null);
    setLockedAmountMode(null);
    if (WITHDRAW_DEBUG_ENABLED) {
      setDebugEvents([]);
      setShowDebug(false);
      pushDebug('flow', 'Starting new withdrawal session');
    }
    setWithdrawOpen(true);
    setStep(1);
  };

  const handleCloseWithdraw = () => {
    if (sending) return;
    resetFlow();
    setWithdrawOpen(false);
  };

  const resetFlow = () => {
    resetWithdrawalTracking();
    setFormError(null);
    setSending(false);
    setAmountInput('');
    setDestination('base');
    resetQuoteState();
    resetNetworkFeeRuntimeState();
    setLockedQuote(null);
    setLockedAmountInput(null);
    setLockedAmountMode(null);
    setShowDebug(false);
    setStep(1);
    if (WITHDRAW_DEBUG_ENABLED) {
      pushDebug('flow', 'Reset withdrawal flow');
    }
  };

  useEffect(() => {
    if (!withdrawOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [withdrawOpen]);

  const handleWithdraw = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    if (WITHDRAW_DEBUG_ENABLED) {
      pushDebug('submit', 'Submitting withdrawal', {
        destination,
        amount_mode: amountMode,
        amount_input: amountInput,
        parsed_input_minor: parsedInputAmount?.toString() ?? null,
        quote_id: quote?.quote_id ?? null,
        quote_expired: quoteExpired,
        balance_minor: balanceMinor?.toString() ?? null,
        fee_basis_minor: feeBasisMinor,
        selected_fee_estimate_minor: selectedFeeEstimateMinor.toString(),
        quote_request_amount_minor: quoteRequestAmount?.toString() ?? null,
        derived_pay_minor: derivedPayMinor ?? null,
        derived_receive_minor: derivedReceiveMinor ?? null,
      });
    }

    if (config.errors.length) {
      setFormError(`Missing config: ${config.errors.join(', ')}`);
      return;
    }

    if (!activeWalletAddress) {
      setFormError('No wallet connected');
      return;
    }

    if (!destinationConfig) {
      setFormError('Destination network is not configured');
      return;
    }

    if (!isAddress(destinationAddress.trim())) {
      setFormError('Destination address is invalid');
      return;
    }

    if (!parsedInputAmount || parsedInputAmount <= 0n) {
      setFormError('Enter a valid USDC amount');
      return;
    }

    if (belowMinReceive) {
      setFormError(
        amountMode === 'pay'
          ? `Minimum amount is ${formatUsdc(minPayMinor)} USDC`
          : 'Minimum amount is 1.00 USDC'
      );
      return;
    }

    if (!quote || quoteExpired) {
      setFormError('Quote expired. Please refresh.');
      return;
    }

    if (amountMode === 'pay') {
      const payMinor = parsedInputAmount;
      const requiredPay = BigInt(quote.total_burn_usdc_minor);
      if (payMinor < requiredPay) {
        setFormError('Entered pay amount is ниже текущих комиссий. Увеличьте сумму.');
        return;
      }
    }

    setSending(true);
    let createdWithdrawalId: string | null = null;
    let burnTxHashLocal: string | null = null;
    let burnSubmittedToBackend = false;
    try {
      if (destination === 'base') {
        setLockedQuote(quote);
        setLockedAmountInput(amountInput);
        setLockedAmountMode(amountMode);
        const transferAmount = BigInt(quote.transfer_amount_usdc_minor);
        if (WITHDRAW_DEBUG_ENABLED) {
          pushDebug('onchain:transfer', 'Sending Base transfer', {
            to: destinationAddress.trim(),
            amount_minor: transferAmount.toString(),
            token: config.usdcAddress,
          });
        }
        const transferData = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'transfer',
          args: [destinationAddress.trim() as `0x${string}`, transferAmount],
        });

        const transferTx = await sendTransaction(
          {
            to: config.usdcAddress as `0x${string}`,
            data: transferData,
            value: 0n,
            chainId: config.sourceChain.id,
          },
          {
            address: activeWalletAddress as `0x${string}`,
            sponsor: true,
            uiOptions: buildTxUiOptions({ mode: 'transfer' }),
          }
        );

        setBurnTxHash(transferTx.hash);
        setWithdrawalStatus('MINTED');
        setForwardTxHash(null);
        if (WITHDRAW_DEBUG_ENABLED) {
          pushDebug('onchain:transfer', 'Base transfer submitted', {
            tx_hash: transferTx.hash,
          });
        }
        return;
      }

      setLockedQuote(quote);
      setLockedAmountInput(amountInput);
      setLockedAmountMode(amountMode);

      const totalBurn = BigInt(quote.total_burn_usdc_minor);
      const maxFee = BigInt(quote.max_fee_usdc_minor);

      const allowance = await publicClient.readContract({
        address: config.usdcAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [
          activeWalletAddress as `0x${string}`,
          config.tokenMessengerAddress as `0x${string}`,
        ],
      });
      if (WITHDRAW_DEBUG_ENABLED) {
        pushDebug('onchain:allowance', 'USDC allowance read', {
          allowance: allowance.toString(),
          required: totalBurn.toString(),
        });
      }

      if (allowance < totalBurn) {
        if (WITHDRAW_DEBUG_ENABLED) {
          pushDebug('onchain:approve', 'Sending approve', {
            spender: config.tokenMessengerAddress,
            amount: MAX_UINT256.toString(),
          });
        }
        const approveData = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [config.tokenMessengerAddress as `0x${string}`, MAX_UINT256],
        });

        const approveTx = await sendTransaction(
          {
            to: config.usdcAddress as `0x${string}`,
            data: approveData,
            value: 0n,
            chainId: config.sourceChain.id,
          },
          {
            address: activeWalletAddress as `0x${string}`,
            sponsor: true,
            uiOptions: buildTxUiOptions({ mode: 'approve' }),
          }
        );
        if (WITHDRAW_DEBUG_ENABLED) {
          pushDebug('onchain:approve', 'Approve submitted', {
            tx_hash: approveTx.hash,
          });
        }
      }

      if (WITHDRAW_DEBUG_ENABLED) {
        pushDebug('onchain:burn', 'Sending burn transaction', {
          total_burn_minor: totalBurn.toString(),
          max_fee_minor: maxFee.toString(),
          destination_domain: destinationConfig.domainId,
          mint_recipient: destinationAddress.trim(),
          token_messenger: config.tokenMessengerAddress,
        });
      }
      const burnData = encodeFunctionData({
        abi: TOKEN_MESSENGER_ABI,
        functionName: 'depositForBurnWithHook',
        args: [
          totalBurn,
          destinationConfig.domainId,
          addressToBytes32(destinationAddress.trim()),
          config.usdcAddress as `0x${string}`,
          ZERO_BYTES32,
          maxFee,
          quote.finality_threshold,
          config.forwardingHookData as `0x${string}`,
        ],
      });

      const burnTx = await sendTransaction(
        {
          to: config.tokenMessengerAddress as `0x${string}`,
          data: burnData,
          value: 0n,
          chainId: config.sourceChain.id,
        },
        {
          address: activeWalletAddress as `0x${string}`,
          sponsor: true,
          uiOptions: buildTxUiOptions({
            mode: 'burn',
            destinationLabel: destinationConfig.label,
          }),
        }
      );

      burnTxHashLocal = burnTx.hash;
      setBurnTxHash(burnTx.hash);
      if (WITHDRAW_DEBUG_ENABLED) {
        pushDebug('onchain:burn', 'Burn tx submitted', { tx_hash: burnTx.hash });
      }

      const token = await getAuthToken();
      if (WITHDRAW_DEBUG_ENABLED) {
        pushDebug('api:create', 'Creating withdrawal after burn confirmation', {
          quote_id: quote.quote_id,
          dest_address: destinationAddress.trim(),
          burn_tx_hash: burnTx.hash,
        });
      }
      const createResponse = await createWithdrawal(
        token,
        {
          quote_id: quote.quote_id,
          dest_address: destinationAddress.trim(),
        },
        crypto.randomUUID()
      );

      createdWithdrawalId = createResponse.withdrawal_id;
      setWithdrawalId(createResponse.withdrawal_id);
      setWithdrawalStatus(createResponse.status);
      if (WITHDRAW_DEBUG_ENABLED) {
        pushDebug('api:create', 'Withdrawal created', {
          withdrawal_id: createResponse.withdrawal_id,
          status: createResponse.status,
        });
      }

      if (WITHDRAW_DEBUG_ENABLED) {
        pushDebug('api:burn-submitted', 'Submitting burn tx hash', {
          withdrawal_id: createResponse.withdrawal_id,
          burn_tx_hash: burnTx.hash,
        });
      }
      await submitBurnTx(
        token,
        createResponse.withdrawal_id,
        burnTx.hash,
        crypto.randomUUID()
      );
      burnSubmittedToBackend = true;
      if (WITHDRAW_DEBUG_ENABLED) {
        pushDebug('api:burn-submitted', 'Burn tx hash submitted');
      }

      setWithdrawalStatus('FORWARDING_PENDING');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Withdrawal failed';
      const isUserRejected = /reject|denied|cancelled|canceled/i.test(message);
      if (isQuoteExpiredError(message)) {
        setLockedQuote(null);
        setLockedAmountInput(null);
        setLockedAmountMode(null);
        clearQuoteState();
        refreshQuote();
        setFormError('Quote expired. Refreshing quote, please confirm again.');
        if (WITHDRAW_DEBUG_ENABLED) {
          pushDebug('quote:recover', 'Quote expired/not found, forcing quote refresh', {
            previous_quote_id: quote?.quote_id ?? null,
          });
        }
      } else {
        if (createdWithdrawalId && burnTxHashLocal && !burnSubmittedToBackend) {
          setWithdrawalStatus('BURN_SUBMITTED');
          setBurnTxHash(burnTxHashLocal);
          if (WITHDRAW_DEBUG_ENABLED) {
            pushDebug(
              'submit:recover',
              'Burn tx sent but submit endpoint failed; keeping polling state',
              {
                withdrawal_id: createdWithdrawalId,
                burn_tx_hash: burnTxHashLocal,
              }
            );
          }
        } else if (!createdWithdrawalId && burnTxHashLocal) {
          setLockedQuote(null);
          setLockedAmountInput(null);
          setLockedAmountMode(null);
          setWithdrawalStatus('FAILED');
          if (WITHDRAW_DEBUG_ENABLED) {
            pushDebug(
              'submit:recover',
              'Burn tx sent but create endpoint failed; no server record',
              {
                burn_tx_hash: burnTxHashLocal,
              }
            );
          }
        } else if (!createdWithdrawalId) {
          setLockedQuote(null);
          setLockedAmountInput(null);
          setLockedAmountMode(null);
        }
        setFormError(isUserRejected ? 'Transaction cancelled in wallet.' : message);
      }
      if (WITHDRAW_DEBUG_ENABLED) {
        pushDebug('submit:error', 'Withdrawal submit failed', { message });
      }
    } finally {
      setSending(false);
    }
  };

  const formatClaimableAmount = useCallback((item: PayoutPreview): string => {
    if (item.amount_formatted) return item.amount_formatted;
    const amount = item.amount_minor_units / 1_000_000;
    return `${amount.toFixed(2)} ${item.asset}`;
  }, []);

  const formatClaimablePillAmount = useCallback((item: PayoutPreview): string => {
    const amount = item.amount_minor_units / 1_000_000;
    return `${amount.toFixed(2)} ${item.asset}`;
  }, []);

  const formatPayoutDate = useCallback((timestamp?: number): string => {
    if (!timestamp) return '—';
    const ms = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
    return new Date(ms).toLocaleString();
  }, []);

  const truncateHash = useCallback((value: string): string => {
    return `${value.slice(0, 8)}...${value.slice(-6)}`;
  }, []);

  const openPayoutExplorerUrl = useCallback((chain: string, txHash: string): string => {
    const normalized = chain.toLowerCase();
    if (normalized.includes('base')) {
      return `https://basescan.org/tx/${txHash}`;
    }
    if (normalized.includes('arbitrum')) {
      return `https://arbiscan.io/tx/${txHash}`;
    }
    if (normalized.includes('optimism')) {
      return `https://optimistic.etherscan.io/tx/${txHash}`;
    }
    if (normalized.includes('polygon')) {
      return `https://polygonscan.com/tx/${txHash}`;
    }
    if (normalized.includes('ethereum')) {
      return `https://etherscan.io/tx/${txHash}`;
    }
    return '';
  }, []);

  const loadClaimablePayouts = useCallback(
    async (mode: 'initial' | 'background' = 'background') => {
      const shouldShowLoading =
        mode === 'initial' && !didInitialClaimableLoadRef.current && claimablePayouts.length === 0;
      if (shouldShowLoading) setClaimablePayoutsLoading(true);
      setClaimablePayoutsError(null);
      try {
        const token = await getAuthToken();
        const response = await getMyPayouts(token);
        const claimable = response.payouts
          .filter((item) => item.status === 'CREATED')
          .sort((a, b) => a.expires_at - b.expires_at);
        setClaimablePayouts(claimable);
        didInitialClaimableLoadRef.current = true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to load claimable payouts';
        setClaimablePayoutsError(message);
      } finally {
        if (shouldShowLoading) setClaimablePayoutsLoading(false);
      }
    },
    [claimablePayouts.length, getAuthToken]
  );

  const handleClaimablePayoutClaim = useCallback(
    async (item: PayoutPreview) => {
      if (!activeWalletAddress) return;
      const itemId = item.id ?? item.payout_id ?? item.claim_token ?? null;
      const payoutId = item.payout_id ?? item.id;
      if (!item.claim_token && !payoutId) return;

      setClaimingPayoutId(itemId);
      setClaimablePayoutsError(null);
      try {
        const token = await getAuthToken();
        if (item.claim_token) {
          try {
            await confirmClaim(item.claim_token, activeWalletAddress, token);
          } catch (claimByTokenError) {
            const message =
              claimByTokenError instanceof Error ? claimByTokenError.message : 'Claim failed';
            const canRetryById = !!payoutId && message.toLowerCase().includes('missing claim_token');
            if (!canRetryById) {
              throw claimByTokenError;
            }
            await confirmClaimByPayoutId(payoutId, activeWalletAddress, token);
          }
        } else if (payoutId) {
          await confirmClaimByPayoutId(payoutId, activeWalletAddress, token);
        }
        await loadClaimablePayouts('background');
      } catch (claimError) {
        const message = claimError instanceof Error ? claimError.message : 'Claim failed';
        setClaimablePayoutsError(
          message === 'Missing claim token'
            ? 'Server expects claim token for this payout. Check `/payouts/me` response fields.'
            : message
        );
      } finally {
        setClaimingPayoutId(null);
      }
    },
    [activeWalletAddress, getAuthToken, loadClaimablePayouts]
  );

  useEffect(() => {
    if (withdrawOpen) return;
    void loadClaimablePayouts(didInitialClaimableLoadRef.current ? 'background' : 'initial');
    const timerId = window.setInterval(() => {
      void loadClaimablePayouts('background');
    }, 20_000);
    return () => window.clearInterval(timerId);
  }, [loadClaimablePayouts, withdrawOpen]);

  useEffect(() => {
    return () => {
      if (claimableScrollTimeoutRef.current) {
        window.clearTimeout(claimableScrollTimeoutRef.current);
      }
      claimableScrollArmedRef.current = false;
    };
  }, []);

  const markClaimablePayoutsScrolling = useCallback(() => {
    setClaimablePayoutsScrolling(true);
    if (claimableScrollTimeoutRef.current) {
      window.clearTimeout(claimableScrollTimeoutRef.current);
    }
    claimableScrollTimeoutRef.current = window.setTimeout(() => {
      setClaimablePayoutsScrolling(false);
      claimableScrollArmedRef.current = false;
    }, 1100);
  }, []);

  const armClaimablePayoutsScroll = useCallback(() => {
    claimableScrollArmedRef.current = true;
  }, []);

  const handleClaimablePayoutsScroll = useCallback(() => {
    if (!claimableScrollArmedRef.current) return;
    markClaimablePayoutsScrolling();
  }, [markClaimablePayoutsScrolling]);

  if (withdrawOpen) {
    const headerTitle = step === 4 ? 'Review' : 'Send';
    const amountDisplay = effectiveAmountInput || '0.00';
    const amountDisplayWidth = `${Math.max(amountDisplay.length, 1)}ch`;
    const amountFontSize = getAmountFontSize(amountDisplay);
    const displayQuote = lockedQuote ?? quote;
    const displayMode = lockedAmountMode ?? amountMode;
    const destinationAddressTrimmed = destinationAddress.trim();
    const isDestinationAddressValid =
      destinationAddressTrimmed.length > 0 && isAddress(destinationAddressTrimmed);
    const hasDestinationAddressError =
      destinationAddressTrimmed.length > 0 && !isDestinationAddressValid;
    const reviewConfirmDisabled =
      sending ||
      isProcessingWithdrawal ||
      !activeWalletAddress ||
      !parsedInputAmount ||
      !destinationConfig ||
      !isDestinationAddressValid ||
      quoteLoading ||
      !quote ||
      quoteExpired ||
      insufficientBalance ||
      belowMinReceive ||
      config.errors.length > 0;
    const reviewConfirmLabel = sending
      ? 'Submitting...'
      : isProcessingWithdrawal
        ? 'Processing...'
        : 'Confirm';
    return (
      <div className="withdraw-flow fixed inset-0 z-50 bg-[#0a0a0a]">
        <div className="relative mx-auto flex h-full w-full max-w-md flex-col px-4 pt-5 pb-8">
          <form className="flex-1 flex flex-col" onSubmit={handleWithdraw}>
            <div className="grid grid-cols-3 items-center">
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={
                    step === 4
                      ? () => setStep(2)
                      : step === 2
                        ? () => setStep(1)
                        : handleCloseWithdraw
                  }
                  disabled={sending}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-white transition hover:bg-white/10 disabled:opacity-60"
                  aria-label={step > 1 ? 'Go back' : 'Close'}
                >
                  <ArrowLeftIcon />
                </button>
              </div>
              <div className="text-center text-sm font-semibold text-white">{headerTitle}</div>
              <div className="flex justify-end items-center gap-2">
                {WITHDRAW_DEBUG_ENABLED && (
                  <button
                    type="button"
                    onClick={() => setShowDebug((current) => !current)}
                    className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${
                      showDebug
                        ? 'border-white/40 bg-white/10 text-white'
                        : 'border-white/10 text-gray-400'
                    }`}
                  >
                    Debug
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCloseWithdraw}
                  disabled={sending}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-white transition hover:bg-white/10 disabled:opacity-60"
                  aria-label="Close"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>

            {step === 1 && (
              <WithdrawStepNetwork
                destinationChains={destinationChains}
                destination={destination}
                networkFeeEstimates={networkFeeEstimates}
                networkAvailability={networkAvailability}
                networkFeeLoading={networkFeeLoading}
                onSelectDestination={setDestination}
                onContinue={() => setStep(2)}
                continueDisabled={!destinationConfig || networkAvailability[destination] === false}
                NetworkIcon={NetworkIcon}
              />
            )}

            {step === 2 && (
              <WithdrawStepAmount
                amountDisplay={amountDisplay}
                amountDisplayWidth={amountDisplayWidth}
                amountFontSize={amountFontSize}
                amountInput={amountInput}
                formattedMaxReceivable={formattedMaxReceivable}
                insufficientBalance={insufficientBalance}
                belowMinReceive={belowMinReceive}
                minPayMinor={minPayMinor}
                amountMode={amountMode}
                parsedInputAmount={parsedInputAmount}
                balanceMinor={balanceMinor}
                quote={quote}
                selectedFeeEstimateMinor={selectedFeeEstimateMinor}
                onAmountChange={handleAmountChange}
                appendAmountChar={appendAmountChar}
                onAmountBackspace={handleAmountBackspace}
                onContinue={() => setStep(4)}
                BackspaceIcon={BackspaceIcon}
              />
            )}

            {step === 4 && (
              <WithdrawStepReview
                destinationAddress={destinationAddress}
                onDestinationAddressChange={setDestinationAddress}
                onPasteAddress={handlePasteAddress}
                hasDestinationAddressError={hasDestinationAddressError}
                isDestinationAddressValid={isDestinationAddressValid}
                destinationAddressTrimmed={destinationAddressTrimmed}
                lockedAmountMode={lockedAmountMode}
                amountMode={amountMode}
                derivedPayMinor={derivedPayMinor}
                lockedQuote={lockedQuote}
                derivedReceiveMinor={derivedReceiveMinor}
                isQuoteLocked={isQuoteLocked}
                quoteTimeRemaining={quoteTimeRemaining}
                destinationConfig={destinationConfig}
                destination={destination}
                quoteLoading={quoteLoading}
                displayQuote={displayQuote}
                quoteError={quoteError}
                displayMode={displayMode}
                quote={quote}
                quoteExpired={quoteExpired}
                sending={sending}
                formError={formError}
                insufficientBalance={insufficientBalance}
                belowMinReceive={belowMinReceive}
                minPayMinor={minPayMinor}
                withdrawalId={withdrawalId}
                burnTxHash={burnTxHash}
                withdrawalStatus={withdrawalStatus}
                baseExplorerBase={baseExplorerBase}
                forwardTxHash={forwardTxHash}
                onCancel={() => setStep(2)}
                onResetFlow={resetFlow}
                cancelDisabled={sending || isProcessingWithdrawal}
                confirmDisabled={reviewConfirmDisabled}
                confirmLabel={reviewConfirmLabel}
              />
            )}

            {WITHDRAW_DEBUG_ENABLED && showDebug && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-[#111111] p-3 text-[11px] text-gray-300 max-h-48 overflow-auto">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-gray-500">
                    Debug log
                  </span>
                  <button
                    type="button"
                    onClick={() => setDebugEvents([])}
                    className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-gray-300"
                  >
                    Clear
                  </button>
                </div>
                {debugEvents.length === 0 ? (
                  <p className="text-gray-500">No debug events yet.</p>
                ) : (
                  <div className="space-y-2">
                    {debugEvents.map((entry, index) => (
                      <div key={`${entry.ts}-${index}`} className="border-b border-white/5 pb-2">
                        <div className="flex items-center justify-between text-[10px] text-gray-500">
                          <span>{new Date(entry.ts).toLocaleTimeString()}</span>
                          <span className="text-gray-400">{entry.stage}</span>
                        </div>
                        <div className="text-gray-200">{entry.message}</div>
                        {entry.data ? (
                          <pre className="mt-1 whitespace-pre-wrap break-words text-[10px] text-gray-400">
                            {safeStringify(entry.data)}
                          </pre>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </form>
        </div>
      </div>
    );
  }

  return (
    <aside className="flex h-full min-h-0 w-full flex-col animate-fade-in-up pt-8">
      <div
        className={`px-1 text-center transition-[transform,opacity,filter] duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isActive ? 'translate-x-0 opacity-100 brightness-100' : '-translate-x-8 opacity-35 brightness-50'
        }`}
        style={{ transitionDelay: '0ms' }}
      >
        <p className="font-num text-base uppercase tracking-[0.14em] text-gray-500">Your balance</p>
        {formattedBalance ? (
          <p className="font-num mt-4 text-5xl font-semibold leading-none tracking-[0.04em] text-white">
            ~{formattedBalance} <span className="text-gray-400">USDC</span>
          </p>
        ) : balanceError ? (
          <p className="mt-2 text-sm text-red-400">{balanceError}</p>
        ) : balanceLoading ? (
          <p className="mt-2 text-sm text-gray-400">Loading...</p>
        ) : (
          <p className="font-num mt-4 text-5xl font-semibold leading-none tracking-[0.04em] text-white">
            ~0.00 <span className="text-gray-400">USDC</span>
          </p>
        )}
      </div>

      {config.errors.length > 0 && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          Missing config: {config.errors.join(', ')}
        </div>
      )}

      {!withdrawOpen ? (
        <div
          className={`mt-14 transition-[transform,opacity,filter] duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
            isActive ? 'translate-x-0 opacity-100 brightness-100' : '-translate-x-8 opacity-35 brightness-50'
          }`}
          style={{ transitionDelay: '80ms' }}
        >
          <button
            type="button"
            onClick={handleOpenWithdraw}
            disabled={!activeWalletAddress || config.errors.length > 0}
            className="interactive-fx no-shimmer inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-3 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:bg-white/10 disabled:text-white/40"
          >
            <SendIcon />
            <span className="font-num tracking-[0.04em]">Send</span>
          </button>
        </div>
      ) : null}

      {!withdrawOpen && (
        <div
          className={`mt-6 flex min-h-0 flex-1 flex-col transition-[transform,opacity,filter] duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
            isActive ? 'translate-x-0 opacity-100 brightness-100' : '-translate-x-8 opacity-35 brightness-50'
          }`}
          style={{ transitionDelay: '140ms' }}
        >
          <div className="mb-2">
            <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Claimable payouts</p>
          </div>

          {claimablePayoutsError && (
            <p className="mb-2 text-xs text-red-400">{claimablePayoutsError}</p>
          )}

          <div
            onWheel={() => {
              armClaimablePayoutsScroll();
              markClaimablePayoutsScrolling();
            }}
            onTouchStart={armClaimablePayoutsScroll}
            onTouchMove={armClaimablePayoutsScroll}
            onScroll={handleClaimablePayoutsScroll}
            className={`min-h-0 flex-1 pr-1 transient-scrollbar ${
              claimablePayoutsScrolling ? 'transient-scrollbar--visible' : ''
            }`}
          >
            {claimablePayoutsLoading ? (
              <p className="text-sm text-gray-400">Loading payouts...</p>
            ) : claimablePayouts.length === 0 ? (
              <p className="text-sm text-gray-500">No claimable payouts.</p>
            ) : (
              <div className="space-y-3 pb-2">
                {claimablePayouts.map((item, index) => {
                  const key =
                    item.id ?? item.payout_id ?? item.claim_token ?? `${item.status}-${item.expires_at}`;
                  const hasClaimRef = !!item.claim_token || !!item.payout_id || !!item.id;
                  const canClaim = item.status === 'CREATED' && hasClaimRef && !!activeWalletAddress;
                  const isClaiming = claimingPayoutId === key;
                  return (
                    <div
                      key={key}
                      className={`transition-[transform,opacity,filter] duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        isActive ? 'translate-x-0 opacity-100 brightness-100' : '-translate-x-8 opacity-35 brightness-50'
                      }`}
                      style={{ transitionDelay: `${Math.min(index * 45, 360)}ms` }}
                    >
                      <PayoutListCard
                        item={item}
                        amountLabel={formatClaimablePillAmount(item)}
                        sourceLabel="Tournament reward"
                        showStatus={false}
                        variant="wallet"
                        onDetails={() => setSelectedPayout(item)}
                        canClaim={canClaim}
                        isClaiming={isClaiming}
                        onClaim={() => void handleClaimablePayoutClaim(item)}
                      />
                    </div>
                  );
                })}
              </div>
          )}
          </div>
        </div>
      )}

      {selectedPayout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#111111] p-5 space-y-4 animate-sheet-in">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Payout details</h3>
                <p className="text-sm text-gray-300">
                  {(() => {
                    const [amountPart, assetPart] = formatClaimableAmount(selectedPayout).split(' ');
                    return (
                      <>
                        {amountPart}
                        {assetPart ? <span className="ml-1 text-gray-400">{assetPart}</span> : null}
                      </>
                    );
                  })()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPayout(null)}
                className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-gray-100 transition hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <StatusBadge status={selectedPayout.status} />

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-gray-500">Source</p>
                <p className="text-gray-200">Tournament reward</p>
              </div>
              <div>
                <p className="text-gray-500">Chain</p>
                <p className="text-gray-200">{selectedPayout.chain}</p>
              </div>
              <div>
                <p className="text-gray-500">Recipient</p>
                <p className="text-gray-200">{selectedPayout.recipient_email || '—'}</p>
              </div>
              <div>
                <p className="text-gray-500">Created</p>
                <p className="text-gray-200">{formatPayoutDate(selectedPayout.created_at)}</p>
              </div>
              <div>
                <p className="text-gray-500">Updated</p>
                <p className="text-gray-200">{formatPayoutDate(selectedPayout.updated_at)}</p>
              </div>
              <div>
                <p className="text-gray-500">Claimed</p>
                <p className="text-gray-200">{formatPayoutDate(selectedPayout.claimed_at)}</p>
              </div>
              <div>
                <p className="text-gray-500">Paid</p>
                <p className="text-gray-200">{formatPayoutDate(selectedPayout.paid_at)}</p>
              </div>
            </div>

            {selectedPayout.tx_hash && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Transaction</p>
                <p className="text-xs text-gray-300 break-all">{truncateHash(selectedPayout.tx_hash)}</p>
                {openPayoutExplorerUrl(selectedPayout.chain, selectedPayout.tx_hash) && (
                  <a
                    href={openPayoutExplorerUrl(selectedPayout.chain, selectedPayout.tx_hash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs text-gray-200 hover:underline"
                  >
                    View in explorer
                  </a>
                )}
              </div>
            )}

            {selectedPayout.failure_reason && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3">
                <p className="text-xs text-red-300">{selectedPayout.failure_reason}</p>
              </div>
            )}

            {(() => {
              const selectedId =
                selectedPayout.id ??
                selectedPayout.payout_id ??
                selectedPayout.claim_token ??
                `${selectedPayout.status}-${selectedPayout.expires_at}`;
              const hasClaimRef =
                !!selectedPayout.claim_token || !!selectedPayout.payout_id || !!selectedPayout.id;
              const canClaim =
                selectedPayout.status === 'CREATED' && hasClaimRef && !!activeWalletAddress;
              const isClaiming = claimingPayoutId === selectedId;

              if (!canClaim) return null;

              return (
                <button
                  type="button"
                  onClick={() => void handleClaimablePayoutClaim(selectedPayout)}
                  disabled={isClaiming}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-300/30 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-100 transition-all duration-200 hover:border-emerald-200/50 hover:bg-emerald-500/22 active:translate-y-[1px] active:scale-[0.99] active:bg-emerald-500/18 disabled:opacity-60"
                >
                  {!isClaiming ? <CoinIcon /> : null}
                  {isClaiming ? 'Claiming...' : 'Claim payout'}
                </button>
              );
            })()}
          </div>
        </div>
      )}
    </aside>
  );
}
