'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  getIdentityToken,
  useIdentityToken,
  useSendTransaction,
  useWallets,
} from '@privy-io/react-auth';
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
  createWithdrawal,
  getWithdrawalQuote,
  getWithdrawalStatus,
  submitBurnTx,
} from '@/lib/api';
import { getCctpConfig, getDestinationChains, getDestinationConfig } from '@/lib/cctp';
import { truncateAddress } from '@/lib/format';
import type {
  DestinationChain,
  WithdrawalQuoteResponse,
  WithdrawalStatus,
} from '@/types/withdrawal';

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

function toNumberSafe(value: bigint | null): number {
  if (value === null) return 0;
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) return 0;
  return asNumber;
}

function normalizeTimestamp(value?: number): number | null {
  if (!value) return null;
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

function formatUsdc(minorUnits?: number | null): string {
  if (minorUnits === null || minorUnits === undefined) return '0.00';
  return (minorUnits / 1_000_000).toFixed(2);
}

function timeRemainingLabel(expiresAtMs?: number | null): string {
  if (!expiresAtMs) return '';
  const diff = expiresAtMs - Date.now();
  if (diff <= 0) return 'Expired';
  const seconds = Math.max(1, Math.floor(diff / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m`;
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

const MAX_USDC_MINOR = 1_000_000_000_000_000 - 1; // 1 quadrillion - 1 (minor units)

function isQuoteExpiredError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('quote') &&
    (normalized.includes('expired') ||
      normalized.includes('not found') ||
      normalized.includes('invalid'))
  );
}

function UsdcIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <path
        d="M20.5 18.5C20.5 16.5 19 15.5 16 15C14 14.5 13.5 14 13.5 13C13.5 12 14.5 11.5 16 11.5C17.5 11.5 18.5 12 19 13L21 12C20.5 10.5 19 9.5 17 9V7H15V9C12.5 9.5 11 11 11 13C11 15 12.5 16 15.5 16.5C17.5 17 18 17.5 18 18.5C18 19.5 17 20.5 15.5 20.5C14 20.5 12.5 19.5 12 18L10 19C10.5 21 12.5 22.5 15 23V25H17V23C19.5 22.5 21 21 20.5 18.5Z"
        fill="white"
      />
    </svg>
  );
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

export function WalletPanel() {
  const { wallets } = useWallets();
  const { identityToken } = useIdentityToken();
  const { sendTransaction } = useSendTransaction();
  const config = useMemo(() => getCctpConfig(), []);

  const [amountMode] = useState<AmountMode>('receive');
  const [amountInput, setAmountInput] = useState('');
  const [destination, setDestination] = useState<DestinationChain>('ethereum');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quote, setQuote] = useState<WithdrawalQuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteRefreshNonce, setQuoteRefreshNonce] = useState(0);
  const [quoteTick, setQuoteTick] = useState(0);
  const [lockedQuote, setLockedQuote] = useState<WithdrawalQuoteResponse | null>(null);
  const [lockedAmountInput, setLockedAmountInput] = useState<string | null>(null);
  const [lockedAmountMode, setLockedAmountMode] = useState<AmountMode | null>(null);
  const [networkFeeEstimates, setNetworkFeeEstimates] = useState<
    Partial<Record<DestinationChain, number>>
  >({});
  const [networkFeeLoading, setNetworkFeeLoading] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceMinor, setBalanceMinor] = useState<bigint | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceRefreshNonce, setBalanceRefreshNonce] = useState(0);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<WithdrawStep>(1);
  const [withdrawalId, setWithdrawalId] = useState<string | null>(null);
  const [withdrawalStatus, setWithdrawalStatus] = useState<WithdrawalStatus | null>(null);
  const [burnTxHash, setBurnTxHash] = useState<string | null>(null);
  const [forwardTxHash, setForwardTxHash] = useState<string | null>(null);
  const [feeEstimateMinor, setFeeEstimateMinor] = useState<bigint>(0n);
  const [debugEvents, setDebugEvents] = useState<WithdrawDebugEvent[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const quoteRequestId = useRef(0);
  const networkFeeRequestId = useRef(0);
  const lastStatusRef = useRef<string | null>(null);
  const lastForwardHashRef = useRef<string | null>(null);

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

  const activeWalletAddress = wallets[0]?.address ?? null;
  const destinationChains = useMemo(
    () => getDestinationChains(config.sourceChain),
    [config.sourceChain]
  );
  const destinationConfig = getDestinationConfig(destination, config.sourceChain);
  const networkAvailability = useMemo(() => {
    const availability: Partial<Record<DestinationChain, boolean>> = {};
    destinationChains.forEach((option) => {
      if (option.key === 'base') {
        availability[option.key] = true;
        return;
      }
      const feeEstimate = networkFeeEstimates[option.key];
      if (feeEstimate === undefined || balanceMinor === null) {
        availability[option.key] = true;
        return;
      }
      availability[option.key] = balanceMinor >= BigInt(feeEstimate);
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

  useEffect(() => {
    if (!WITHDRAW_DEBUG_ENABLED || !formError) return;
    pushDebug('form:error', 'Form error', { message: formError });
  }, [formError, pushDebug]);

  useEffect(() => {
    if (!WITHDRAW_DEBUG_ENABLED || !withdrawalStatus) return;
    if (lastStatusRef.current === withdrawalStatus) return;
    lastStatusRef.current = withdrawalStatus;
    pushDebug('status', 'Withdrawal status update', {
      withdrawal_id: withdrawalId,
      status: withdrawalStatus,
    });
  }, [pushDebug, withdrawalId, withdrawalStatus]);

  useEffect(() => {
    if (!WITHDRAW_DEBUG_ENABLED || !forwardTxHash) return;
    if (lastForwardHashRef.current === forwardTxHash) return;
    lastForwardHashRef.current = forwardTxHash;
    pushDebug('status', 'Forward tx hash received', {
      withdrawal_id: withdrawalId,
      forward_tx_hash: forwardTxHash,
    });
  }, [forwardTxHash, pushDebug, withdrawalId]);
  const clampAmountInput = useCallback((raw: string) => {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    if (!cleaned) return '';
    const [wholeRaw = '', fractionRaw = ''] = cleaned.split('.');
    const whole = wholeRaw.replace(/^0+(?=\d)/, '');
    const fraction = fractionRaw.slice(0, 6);
    const normalized = cleaned.includes('.')
      ? `${whole || '0'}.${fraction}`
      : whole || '0';
    try {
      const minor = parseUnits(normalized, 6);
      if (minor > BigInt(MAX_USDC_MINOR)) {
        return '999999999999999.999999';
      }
    } catch {
      return normalized;
    }
    return normalized;
  }, []);
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

  const quoteRequestAmount = useMemo(() => {
    if (!parsedInputAmount) return null;
    if (amountMode === 'receive') return parsedInputAmount;
    if (parsedInputAmount <= feeEstimateMinor) return 0n;
    return parsedInputAmount - feeEstimateMinor;
  }, [amountMode, feeEstimateMinor, parsedInputAmount]);

  const quoteExpiresAtMs = useMemo(() => normalizeTimestamp(quote?.expires_at), [quote?.expires_at]);
  const quoteExpired = quoteExpiresAtMs ? quoteExpiresAtMs <= Date.now() : false;
  const quoteTimeRemaining = useMemo(
    () => timeRemainingLabel(quoteExpiresAtMs),
    [quoteExpiresAtMs, quoteTick]
  );
  const isProcessingWithdrawal =
    withdrawalStatus === 'BURN_SUBMITTED' || withdrawalStatus === 'FORWARDING_PENDING';
  const isQuoteLocked = lockedQuote !== null || isProcessingWithdrawal || sending;
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
  const minReceiveMinor = 1_000_000;
  const minPayMinor = feeBasisMinor + minReceiveMinor;
  const belowMinReceive =
    effectiveParsedInputAmount !== null &&
    effectiveParsedInputAmount > 0n &&
    derivedReceiveMinor !== null &&
    derivedReceiveMinor < minReceiveMinor;
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
  }, [
    quote,
    quoteExpiresAtMs,
    activeWalletAddress,
    sending,
    isQuoteLocked,
    quoteLoading,
    destination,
    amountMode,
    parsedInputAmount,
  ]);

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

  const publicClient = useMemo(() => {
    return createPublicClient({
      chain: config.sourceChain,
      transport: http(),
    });
  }, [config.sourceChain]);

  const baseExplorerBase = useMemo(() => {
    return config.sourceChain.id === 84532
      ? 'https://sepolia.basescan.org/tx/'
      : 'https://basescan.org/tx/';
  }, [config.sourceChain.id]);

  const getAuthToken = useCallback(async () => {
    let freshToken: string | null = null;
    try {
      freshToken = await getIdentityToken();
    } catch {
      freshToken = null;
    }
    const token = freshToken ?? identityToken;
    if (!token) {
      throw new Error('Missing identity token. Please re-login.');
    }
    return token;
  }, [identityToken]);

  const handlePasteAddress = async () => {
    try {
      const value = await navigator.clipboard.readText();
      if (value) {
        setDestinationAddress(value.trim());
      }
    } catch {
      setFormError('Failed to read clipboard.');
    }
  };

  useEffect(() => {
    let cancelled = false;

    const fetchBalance = async () => {
      if (!activeWalletAddress || !config.usdcAddress) {
        setBalance(null);
        setBalanceError(null);
        return;
      }

      setBalanceLoading(true);
      setBalanceError(null);

      try {
        const result = await publicClient.readContract({
          address: config.usdcAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [activeWalletAddress as `0x${string}`],
        });

        if (!cancelled) {
          setBalance(formatUnits(result, 6));
          setBalanceMinor(result);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Failed to load balance';
          setBalanceError(message);
          setBalance(null);
          setBalanceMinor(null);
        }
      } finally {
        if (!cancelled) {
          setBalanceLoading(false);
        }
      }
    };

    fetchBalance();

    return () => {
      cancelled = true;
    };
  }, [activeWalletAddress, config.usdcAddress, publicClient, balanceRefreshNonce]);

  useEffect(() => {
    if (!activeWalletAddress || !config.usdcAddress) return;
    const timerId = window.setInterval(() => {
      setBalanceRefreshNonce((value) => value + 1);
    }, 20_000);
    return () => window.clearInterval(timerId);
  }, [activeWalletAddress, config.usdcAddress]);

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

  useEffect(() => {
    if (!withdrawOpen || step !== 1) return;
    const hasAllEstimates = destinationChains.every(
      (option) => networkFeeEstimates[option.key] !== undefined
    );
    if (hasAllEstimates) return;

    let cancelled = false;
    const requestId = ++networkFeeRequestId.current;

    const loadEstimates = async () => {
      setNetworkFeeLoading(true);
      if (WITHDRAW_DEBUG_ENABLED) {
        pushDebug('estimate:request', 'Fetching network fee estimates', {
          destinations: destinationChains.map((option) => option.key),
        });
      }
      try {
        const token = await getAuthToken();
        const results = await Promise.all(
          destinationChains.map(async (option) => {
            if (option.key === 'base') {
              return [option.key, 0] as const;
            }
            const response = await getWithdrawalQuote(token, {
              dest_chain: option.key,
              transfer_amount_usdc_minor: 1_000_000,
            });
            return [option.key, response.max_fee_usdc_minor] as const;
          })
        );
        if (cancelled || networkFeeRequestId.current !== requestId) return;
        const estimateMap: Partial<Record<DestinationChain, number>> = {};
        results.forEach(([key, fee]) => {
          estimateMap[key] = fee;
        });
        setNetworkFeeEstimates(estimateMap);
        if (WITHDRAW_DEBUG_ENABLED) {
          pushDebug('estimate:response', 'Network fee estimates received', {
            estimates: estimateMap,
          });
        }
      } catch {
        if (!cancelled && networkFeeRequestId.current === requestId) {
          setNetworkFeeEstimates({});
          if (WITHDRAW_DEBUG_ENABLED) {
            pushDebug('estimate:error', 'Failed to fetch network fee estimates');
          }
        }
      } finally {
        if (!cancelled && networkFeeRequestId.current === requestId) {
          setNetworkFeeLoading(false);
        }
      }
    };

    loadEstimates();

    return () => {
      cancelled = true;
    };
  }, [destinationChains, getAuthToken, networkFeeEstimates, pushDebug, step, withdrawOpen]);

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
      if (WITHDRAW_DEBUG_ENABLED) {
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
        if (WITHDRAW_DEBUG_ENABLED) {
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
        if (WITHDRAW_DEBUG_ENABLED) {
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
        if (WITHDRAW_DEBUG_ENABLED) {
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
    destination,
    getAuthToken,
    amountMode,
    feeEstimateMinor,
    parsedInputAmount,
    quoteRequestAmount,
    quoteRefreshNonce,
    isQuoteLocked,
    pushDebug,
  ]);

  useEffect(() => {
    if (!withdrawalId || forwardTxHash) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const token = await getAuthToken();
        const status = await getWithdrawalStatus(token, withdrawalId);
        if (cancelled) return;
        if (WITHDRAW_DEBUG_ENABLED) {
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
        if (status.failure_reason) setFormError(status.failure_reason);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Failed to refresh status';
        setFormError(message);
        if (WITHDRAW_DEBUG_ENABLED) {
          pushDebug('status:error', 'Failed to refresh withdrawal status', { message });
        }
      }
    };

    poll();
    const timerId = window.setInterval(poll, 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(timerId);
    };
  }, [getAuthToken, withdrawalId, forwardTxHash, pushDebug]);

  const formattedBalance = useMemo(() => {
    if (!balance) return null;
    const numeric = Number(balance);
    if (Number.isNaN(numeric)) return balance;
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
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
    if (!quote) return null;
    if (amountMode === 'pay') return parsedInputAmount ?? null;
    return BigInt(quote.total_burn_usdc_minor);
  }, [amountMode, parsedInputAmount, quote]);
  const shouldValidateBalance = !isQuoteLocked && !isProcessingWithdrawal && !sending;

  const insufficientBalance =
    shouldValidateBalance &&
    balanceMinor !== null &&
    requiredPayMinor !== null &&
    balanceMinor < requiredPayMinor;

  useEffect(() => {
    if (isQuoteLocked) return;
    if (amountMode !== 'receive') return;
    if (!quote || balanceMinor === null) return;
    if (!parsedInputAmount) return;
    const maxFeeMinor = BigInt(quote.max_fee_usdc_minor ?? 0);
    const maxReceivable = balanceMinor > maxFeeMinor ? balanceMinor - maxFeeMinor : 0n;
    if (parsedInputAmount > maxReceivable) {
      const nextValue = maxReceivable === 0n ? '0.00' : formatUnits(maxReceivable, 6);
      handleAmountChange(nextValue);
    }
  }, [amountMode, balanceMinor, handleAmountChange, isQuoteLocked, parsedInputAmount, quote]);

  const handleCopyAddress = async () => {
    if (!activeWalletAddress) return;
    try {
      await navigator.clipboard.writeText(activeWalletAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setFormError('Failed to copy address');
    }
  };

  const handleOpenWithdraw = () => {
    setFormError(null);
    setAmountInput('');
    setQuote(null);
    setQuoteError(null);
    setQuoteLoading(false);
    setFeeEstimateMinor(0n);
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
    setWithdrawalId(null);
    setWithdrawalStatus(null);
    setBurnTxHash(null);
    setForwardTxHash(null);
    setFormError(null);
    setSending(false);
    setAmountInput('');
    setQuote(null);
    setQuoteError(null);
    setQuoteLoading(false);
    setFeeEstimateMinor(0n);
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

      const token = await getAuthToken();
      if (WITHDRAW_DEBUG_ENABLED) {
        pushDebug('api:create', 'Creating withdrawal', {
          quote_id: quote.quote_id,
          dest_address: destinationAddress.trim(),
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
      setLockedQuote(quote);
      setLockedAmountInput(amountInput);
      setLockedAmountMode(amountMode);
      setWithdrawalId(createResponse.withdrawal_id);
      setWithdrawalStatus(createResponse.status);
      if (WITHDRAW_DEBUG_ENABLED) {
        pushDebug('api:create', 'Withdrawal created', {
          withdrawal_id: createResponse.withdrawal_id,
          status: createResponse.status,
        });
      }

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
          }
      );

      burnTxHashLocal = burnTx.hash;
      setBurnTxHash(burnTx.hash);
      if (WITHDRAW_DEBUG_ENABLED) {
        pushDebug('onchain:burn', 'Burn tx submitted', { tx_hash: burnTx.hash });
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
        setQuote(null);
        setQuoteError(null);
        setQuoteRefreshNonce((value) => value + 1);
        setFormError('Quote expired. Refreshing quote, please confirm again.');
        if (WITHDRAW_DEBUG_ENABLED) {
          pushDebug('quote:recover', 'Quote expired/not found, forcing quote refresh', {
            previous_quote_id: quote?.quote_id ?? null,
          });
        }
      } else {
        if (createdWithdrawalId && !burnTxHashLocal) {
          setWithdrawalId(null);
          setWithdrawalStatus(null);
          setLockedQuote(null);
          setLockedAmountInput(null);
          setLockedAmountMode(null);
          if (WITHDRAW_DEBUG_ENABLED) {
            pushDebug('submit:recover', 'Create succeeded but tx was not sent, rolling back local state', {
              withdrawal_id: createdWithdrawalId,
            });
          }
        } else if (createdWithdrawalId && burnTxHashLocal && !burnSubmittedToBackend) {
          setWithdrawalStatus('BURN_SUBMITTED');
          setBurnTxHash(burnTxHashLocal);
          if (WITHDRAW_DEBUG_ENABLED) {
            pushDebug('submit:recover', 'Burn tx sent but submit endpoint failed; keeping polling state', {
              withdrawal_id: createdWithdrawalId,
              burn_tx_hash: burnTxHashLocal,
            });
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

  if (withdrawOpen) {
    const headerTitle = step === 4 ? 'Review' : 'Send';
    const amountDisplay = effectiveAmountInput || '0.00';
    const amountDisplayWidth = `${Math.max(amountDisplay.length, 1)}ch`;
    const amountFontSize = getAmountFontSize(amountDisplay);
    const amountMuted =
      !amountInput || amountInput === '0' || amountInput === '0.' || amountInput === '0.0';
    const displayQuote = lockedQuote ?? quote;
    const displayMode = lockedAmountMode ?? amountMode;
    const destinationAddressTrimmed = destinationAddress.trim();
    const isDestinationAddressValid =
      destinationAddressTrimmed.length > 0 && isAddress(destinationAddressTrimmed);
    const hasDestinationAddressError =
      destinationAddressTrimmed.length > 0 && !isDestinationAddressValid;
    return (
      <div className="fixed inset-0 z-50 bg-[#0a0a0a]">
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
              <div className="flex flex-1 flex-col justify-between pb-6 pt-6 animate-slide-in">
                <div className="space-y-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500">
                    Choose network
                  </p>
                  <div className="space-y-2">
                    {destinationChains.map((option) => {
                      const feeEstimate = networkFeeEstimates[option.key];
                      const feeAffordable = networkAvailability[option.key] !== false;
                      const feeLabel =
                        option.key === 'base'
                          ? 'No bridge fee'
                          : !feeAffordable
                            ? `Insufficient balance for network fee${
                                feeEstimate !== undefined
                                  ? ` (≈ ${formatUsdc(feeEstimate)} USDC)`
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
                          onClick={() => setDestination(option.key)}
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
                  onClick={() => setStep(2)}
                  disabled={!destinationConfig}
                  className="w-full rounded-2xl bg-white py-3 text-sm font-semibold text-black disabled:bg-white/10 disabled:text-white/40"
                >
                  Continue
                </button>
              </div>
            )}

            {step === 2 && (
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
                        onKeyDown={(event) => {
                          if (event.key === 'Backspace') {
                            event.preventDefault();
                            handleAmountBackspace();
                            return;
                          }
                          if (event.key === '.') {
                            event.preventDefault();
                            appendAmountChar('.');
                            return;
                          }
                          if (/^\\d$/.test(event.key)) {
                            event.preventDefault();
                            appendAmountChar(event.key);
                          }
                        }}
                        aria-label="USDC amount"
                        style={{
                          width: amountDisplayWidth,
                          marginRight: '0.2em',
                          fontSize: amountFontSize,
                          lineHeight: '1.05',
                        }}
                        className={`bg-transparent text-center font-semibold tracking-tight focus:outline-none ${
                          insufficientBalance
                            ? 'text-[#ff6b7a]'
                            : amountInput.trim()
                              ? 'text-white'
                              : 'text-gray-500'
                        }`}
                      />
                      <span
                        style={{ fontSize: amountFontSize, lineHeight: '1.05' }}
                        className={`font-semibold ${
                          insufficientBalance ? 'text-[#ff6b7a]' : 'text-gray-500'
                        }`}
                      >
                        USDC
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    {formattedMaxReceivable ?? '0.00'} USDC available to receive
                    {destination !== 'base' && availabilityFeeMinor > 0n
                      ? ` (fee ${formatUsdc(toNumberSafe(availabilityFeeMinor))} USDC)`
                      : ''}
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-2">
                    {[25, 50, 75].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => {
                          if (!balanceMinor) return;
                          const feeBasis =
                            amountMode === 'receive' && quote
                              ? BigInt(quote.max_fee_usdc_minor)
                              : selectedFeeEstimateMinor;
                          const available =
                            amountMode === 'receive'
                              ? balanceMinor > feeBasis
                                ? balanceMinor - feeBasis
                                : 0n
                              : balanceMinor;
                          const value = (available * BigInt(pct)) / 100n;
                          handleAmountChange(formatUnits(value, 6));
                        }}
                        className="rounded-2xl border border-white/10 bg-white/5 py-2 text-sm text-white"
                      >
                        {pct}%
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        if (!balanceMinor) return;
                        const feeBasis =
                          amountMode === 'receive' && quote
                            ? BigInt(quote.max_fee_usdc_minor)
                            : selectedFeeEstimateMinor;
                        const available =
                          amountMode === 'receive'
                            ? balanceMinor > feeBasis
                              ? balanceMinor - feeBasis
                              : 0n
                            : balanceMinor;
                        handleAmountChange(formatUnits(available, 6));
                      }}
                      className="rounded-2xl border border-white/10 bg-white/5 py-2 text-sm text-white"
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
                      {amountMode === 'pay' && minPayMinor !== null
                        ? `Minimum amount is ${formatUsdc(minPayMinor)} USDC`
                        : 'Minimum amount is 1.00 USDC'}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setStep(4)}
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
                      className="rounded-2xl py-4 text-2xl text-white"
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
                      onClick={handleAmountBackspace}
                      className="inline-flex items-center justify-center rounded-2xl py-4 text-white"
                      aria-label="Delete"
                    >
                      <BackspaceIcon />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
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
                        onChange={(event) => setDestinationAddress(event.target.value)}
                        placeholder="Enter address to send to"
                        className={`w-full rounded-2xl bg-[#111111] px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 ${
                          hasDestinationAddressError
                            ? 'border border-red-500/70 focus:ring-red-500/40'
                            : 'border border-white/10 focus:ring-white/20'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={handlePasteAddress}
                        className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-xs text-white transition hover:bg-white/10"
                      >
                        Paste
                      </button>
                    </div>
                    {hasDestinationAddressError && (
                      <p className="mt-2 text-[11px] text-red-400">Invalid address</p>
                    )}
                    {isDestinationAddressValid && (
                      <p className="mt-2 text-[11px] text-emerald-300">Address looks valid</p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-[#111111] p-4 space-y-3">
                    <div className="text-center">
                      <p className="text-2xl font-semibold text-white">
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
                      <p className="text-xs text-gray-500">
                        {isQuoteLocked ? 'Locked' : quoteTimeRemaining}
                      </p>
                    </div>
                    <div className="space-y-2 text-sm text-gray-300">
                      <div className="flex items-center justify-between">
                        <span>Network</span>
                        <span className="text-white">
                          {destinationConfig?.label ?? destination}
                        </span>
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
                            <span className="text-white">
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
                            <span className="text-white">
                              {displayMode === 'receive'
                                ? formatUsdc(displayQuote.transfer_amount_usdc_minor)
                                : derivedReceiveMinor !== null
                                  ? formatUsdc(derivedReceiveMinor)
                                  : '0.00'}{' '}
                              USDC
                            </span>
                          </p>
                          <p>
                            Fees:{' '}
                            <span className="text-white">
                              {formatUsdc(displayQuote.max_fee_usdc_minor)} USDC
                            </span>
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
                  <p className="text-xs text-yellow-300">
                    Insufficient USDC balance for this amount.
                  </p>
                )}
                {belowMinReceive && (
                  <p className="text-xs text-yellow-300">
                    {amountMode === 'pay'
                      ? `Minimum amount is ${formatUsdc(minPayMinor)} USDC`
                      : 'Minimum amount is 1.00 USDC'}
                  </p>
                )}

                  {(withdrawalId || burnTxHash) && (
                    <div className="rounded-2xl border border-white/10 bg-[#111111] p-3 text-xs text-gray-300 space-y-1">
                      <p>
                        Withdrawal status:{' '}
                        <span className="text-white">{withdrawalStatus ?? 'CREATED'}</span>
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
                      onClick={() => setStep(2)}
                      disabled={sending || isProcessingWithdrawal}
                      className="w-full rounded-2xl border border-white/15 bg-white/5 py-3 text-sm text-white transition hover:bg-white/10 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={
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
                        config.errors.length > 0
                      }
                      className="w-full rounded-2xl bg-white py-3 text-sm font-semibold text-black disabled:bg-white/10 disabled:text-white/40"
                    >
                      {sending
                        ? 'Submitting...'
                        : isProcessingWithdrawal
                          ? 'Processing...'
                          : 'Confirm'}
                    </button>
                  </div>

                  {withdrawalId && forwardTxHash && (
                    <button
                      type="button"
                      onClick={resetFlow}
                      className="w-full rounded-2xl border border-white/15 bg-white/5 py-3 text-sm text-gray-100 transition hover:bg-white/10"
                    >
                      Start new withdrawal
                    </button>
                  )}
                </div>
              </div>
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
    <aside className="w-full rounded-2xl border border-white/10 bg-[#11152a]/75 p-5 shadow-[0_12px_40px_rgba(4,7,20,0.45)] backdrop-blur animate-fade-in-up space-y-4">
      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400">Your wallet</p>
        <div className="-mx-1 mt-2 flex w-auto items-center gap-2 rounded-2xl border border-white/10 bg-black/35 px-3 py-2">
          <p className="min-w-0 flex-1 break-all text-[11px] leading-4 text-white font-mono select-all">
            {activeWalletAddress ? truncateAddress(activeWalletAddress) : '—'}
          </p>
          {activeWalletAddress && (
            <button
              type="button"
              onClick={handleCopyAddress}
              className="shrink-0 rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-gray-200 transition hover:bg-white/10"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[11px] uppercase tracking-[0.12em] text-gray-500">Source network</p>
          <div className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/35 px-2.5 py-1.5 text-xs text-white">
            <NetworkIcon chainName={config.sourceChain.name} />
            <span>{config.sourceChain.name}</span>
          </div>
        </div>
        <div className="mb-1 inline-flex items-center gap-1.5">
          <UsdcIcon size={15} />
          <p className="text-[11px] uppercase tracking-[0.12em] text-gray-500">USDC balance</p>
        </div>
        {balanceLoading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : balanceError ? (
          <p className="text-sm text-red-400">{balanceError}</p>
        ) : (
          <p className="inline-flex items-center gap-2 text-2xl font-semibold text-white">
            <UsdcIcon size={22} />
            {formattedBalance ?? '0.00'}
          </p>
        )}
      </div>

      {config.errors.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          Missing config: {config.errors.join(', ')}
        </div>
      )}

      {!withdrawOpen ? (
        <button
          type="button"
          onClick={handleOpenWithdraw}
          disabled={!activeWalletAddress || config.errors.length > 0}
          className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-3 py-2.5 text-sm font-semibold text-white transition hover:from-indigo-400 hover:to-violet-400 disabled:opacity-50"
        >
          Withdraw USDC
        </button>
      ) : null}
    </aside>
  );
}
