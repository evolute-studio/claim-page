'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  getIdentityToken,
  useIdentityToken,
  usePrivy,
  useSendTransaction,
  useWallets,
} from '@privy-io/react-auth';
import type { SendTransactionModalUIOptions } from '@privy-io/react-auth';
import { ArrowLeft, Circle, SendHorizontal, X } from 'lucide-react';
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
  cancelWithdrawal,
  confirmClaim,
  confirmClaimByPayoutId,
  createWithdrawal,
  getMyPayouts,
  getWithdrawalQuote,
  WithdrawalApiError,
  submitBurnTx,
} from '@/lib/api';
import { getCctpConfig, getDestinationChains, getDestinationConfig } from '@/lib/cctp';
import { getExplorerTxUrl } from '@/lib/explorer';
import { authDebug, createAuthTraceId, isAuthDebugEnabled, tokenFingerprint } from '@/lib/authDebug';
import { readJwtSub, resolvePrivyIdentityToken } from '@/lib/identityToken';
import { WithdrawStepAmount } from '@/components/withdraw/WithdrawStepAmount';
import { WithdrawStepNetwork } from '@/components/withdraw/WithdrawStepNetwork';
import { WithdrawStepReview } from '@/components/withdraw/WithdrawStepReview';
import { CoinIcon } from '@/components/CoinIcon';
import { getPayoutStatusUi } from '@/lib/payoutStatusUi';
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
  CreateWithdrawalResponse,
  DestinationChain,
  WithdrawalSponsorMode,
  WithdrawalQuoteResponse,
} from '@/types/withdrawal';
import type { PayoutPreview } from '@/types/payout';

const ZERO_BYTES32 = `0x${'0'.repeat(64)}` as `0x${string}`;
const WITHDRAW_DEBUG_ENABLED =
  (process.env.NEXT_PUBLIC_WITHDRAW_DEBUG ?? '').toLowerCase() === 'true';
const SHOW_WITHDRAW_DEBUG_TOGGLE = false;

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

function mapWithdrawalCreateErrorMessage(error: WithdrawalApiError): string {
  const code = error.code.toUpperCase();

  switch (code) {
    case 'SPONSOR_LIMIT_EXCEEDED':
    case 'SPONSORED_LIMIT_EXCEEDED':
    case 'SPONSOR_BUDGET_EXCEEDED':
    case 'SPONSOR_AMOUNT_EXCEEDED':
      return 'Sponsored withdrawal limit reached. Try a smaller amount.';
    case 'SPONSOR_MIN_WITHDRAW_NOT_MET':
    case 'SPONSOR_MIN_AMOUNT_NOT_MET':
    case 'SPONSORED_MIN_WITHDRAW_NOT_MET':
    case 'SPONSORED_MIN_AMOUNT_NOT_MET':
      return 'Amount is below the minimum for sponsored withdrawals.';
    case 'SPONSOR_TX_LIMIT_REACHED':
    case 'SPONSOR_RATE_LIMIT_EXCEEDED':
    case 'SPONSORED_TX_LIMIT_REACHED':
    case 'RATE_LIMITED':
      return 'Too many sponsored withdrawal attempts. Please try again later.';
    case 'SPONSOR_REQUIRED_NOT_AVAILABLE':
    case 'SPONSOR_REQUIRED_UNAVAILABLE':
    case 'SPONSOR_REQUIRED_FAILED':
    case 'SPONSOR_UNAVAILABLE':
      return 'Sponsored withdrawals are temporarily unavailable.';
    default:
      if (code.includes('SPONSOR') && code.includes('MIN')) {
        return 'Amount is below the minimum for sponsored withdrawals.';
      }
      if (code.includes('SPONSOR') && code.includes('LIMIT')) {
        return 'Sponsored withdrawal limit reached. Try a smaller amount.';
      }
      if (code.includes('SPONSOR') && code.includes('RATE')) {
        return 'Too many sponsored withdrawal attempts. Please try again later.';
      }
      if (code.includes('SPONSOR')) {
        return 'Sponsored withdrawal is unavailable for this request.';
      }
      return error.message;
  }
}

function isSponsorUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalizedMessage = message.toLowerCase();
  if (normalizedMessage.includes('sponsor') && normalizedMessage.includes('unavailable')) {
    return true;
  }
  if (error instanceof WithdrawalApiError) {
    const code = error.code.toUpperCase();
    if (!code.includes('SPONSOR')) return false;
    return (
      code.includes('UNAVAILABLE') ||
      code.includes('NOT_AVAILABLE') ||
      code.includes('REQUIRED') ||
      code.includes('FAILED')
    );
  }
  return false;
}

function VerticalDotsIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12 6h.01M12 12h.01M12 18h.01"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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

const NETWORK_ICON_FILE_MAP: Partial<Record<DestinationChain, string>> = {
  base: '/icons/base.jpeg',
  ethereum: '/icons/ethereum.svg',
  arbitrum: '/icons/arbitrum.svg',
  optimism: '/icons/optimism.svg',
  polygon: '/icons/polygon.png',
  avalanche: '/icons/avalanche.jpeg',
  linea: '/icons/linea.svg',
};
const NETWORK_ICON_PRELOAD_URLS = Array.from(
  new Set(
    Object.values(NETWORK_ICON_FILE_MAP).filter((iconUrl): iconUrl is string => typeof iconUrl === 'string')
  )
);
const CLAIMABLE_HIGHLIGHT_DURATION_MS = 2800;
const CLAIMABLE_HIGHLIGHT_SCROLL_DELAY_MS = 90;
const WALLET_ACTIVE_PAYOUT_STATUSES: PayoutPreview['status'][] = [
  'CREATED',
  'PENDING_EMAIL',
  'PENDING_APPROVAL',
  'PAYING',
];

function isWalletActivePayoutStatus(status: PayoutPreview['status']): boolean {
  return WALLET_ACTIVE_PAYOUT_STATUSES.includes(status);
}

function getWalletPayoutSortPriority(status: PayoutPreview['status']): number {
  if (status === 'CREATED') return 0;
  return 1;
}

function getWalletPayoutSortTimestamp(item: PayoutPreview): number {
  return item.updated_at ?? item.paid_at ?? item.claimed_at ?? item.created_at ?? item.expires_at ?? 0;
}

function getWalletPayoutStatusLabel(status: PayoutPreview['status']): string {
  return getPayoutStatusUi(status).badgeLabel;
}

function getWalletPayoutSubtitle(status: PayoutPreview['status']): string {
  switch (status) {
    case 'CREATED':
      return 'Ready to claim';
    case 'PENDING_EMAIL':
      return 'Verification in progress';
    case 'PENDING_APPROVAL':
      return 'Verification in progress';
    case 'PAYING':
      return 'Transfer in progress';
    case 'PAID':
      return 'Claim completed';
    case 'FAILED':
      return 'Claim failed';
    case 'CANCELLED':
      return 'Claim cancelled';
    case 'EXPIRED':
      return 'Claim expired';
    default:
      return getWalletPayoutStatusLabel(status);
  }
}

function NetworkIcon({
  chainKey,
  chainName,
  size = 16,
}: {
  chainKey: DestinationChain;
  chainName: string;
  size?: number;
}) {
  const name = chainName.toLowerCase();
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);

  let logoUrl = NETWORK_ICON_FILE_MAP[chainKey] ?? null;
  if (!logoUrl) {
    if (name.includes('base')) logoUrl = NETWORK_ICON_FILE_MAP.base ?? null;
    else if (name.includes('ethereum')) logoUrl = NETWORK_ICON_FILE_MAP.ethereum ?? null;
    else if (name.includes('arbitrum')) logoUrl = NETWORK_ICON_FILE_MAP.arbitrum ?? null;
    else if (name.includes('optimism') || name.startsWith('op ') || name.includes(' op')) {
      logoUrl = NETWORK_ICON_FILE_MAP.optimism ?? null;
    } else if (name.includes('polygon')) logoUrl = NETWORK_ICON_FILE_MAP.polygon ?? null;
    else if (name.includes('avalanche') || name.includes('fuji')) {
      logoUrl = NETWORK_ICON_FILE_MAP.avalanche ?? null;
    } else if (name.includes('linea')) logoUrl = NETWORK_ICON_FILE_MAP.linea ?? null;
  }

  useEffect(() => {
    setLogoLoadFailed(false);
  }, [logoUrl]);

  const iconSize = Math.max(10, Math.round(size * 0.66));
  const iconRadius = Math.max(4, Math.min(12, Math.round(size * 0.27)));
  const logoClass =
    chainKey === 'ethereum'
      ? 'h-full w-full object-contain object-center'
      : 'h-full w-full object-cover object-center';

  return (
    <span
      className="relative inline-flex aspect-square flex-none items-center justify-center overflow-hidden border border-transparent bg-transparent"
      style={{
        width: size,
        minWidth: size,
        maxWidth: size,
        height: size,
        minHeight: size,
        maxHeight: size,
        borderRadius: `${iconRadius}px`,
      }}
      aria-hidden="true"
    >
      {logoUrl && !logoLoadFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          className={logoClass}
          loading="eager"
          decoding="async"
          onError={() => setLogoLoadFailed(true)}
        />
      ) : (
        <Circle size={iconSize} strokeWidth={2} className="text-white" />
      )}
    </span>
  );
}

type AmountMode = 'receive' | 'pay';
type WithdrawStep = 1 | 2 | 4;

export function WalletPanel({
  isActive = true,
  focusToken = null,
  focusPayoutRef = null,
  debugPreview = false,
  onClaimedPayoutFocus,
  onCreatedWithdrawalFocus,
}: {
  isActive?: boolean;
  focusToken?: string | null;
  focusPayoutRef?: string | null;
  debugPreview?: boolean;
  onClaimedPayoutFocus?: (next: { focusToken?: string | null; focusPayoutRef?: string | null }) => void;
  onCreatedWithdrawalFocus?: (next: { focusWithdrawalRef?: string | null }) => void;
}) {
  const { wallets } = useWallets();
  const { identityToken } = useIdentityToken();
  const { user } = usePrivy();
  const currentPrivyUserId = user?.id?.trim() ?? '';
  const { sendTransaction } = useSendTransaction();
  const config = useMemo(() => getCctpConfig(), []);
  const publicClient = useMemo(() => {
    return createPublicClient({
      chain: config.sourceChain,
      transport: http(),
    });
  }, [config.sourceChain]);
  const identityTokenRef = useRef<string | null>(identityToken ?? null);
  const privyUserIdRef = useRef<string | null>(user?.id ?? null);
  const didInitialClaimableLoadRef = useRef(false);

  useEffect(() => {
    identityTokenRef.current = identityToken ?? null;
  }, [identityToken]);

  useEffect(() => {
    privyUserIdRef.current = user?.id ?? null;
  }, [user]);

  const getAuthToken = useCallback(async () => {
    const expectedPrivyUserId = privyUserIdRef.current?.trim() ?? '';
    if (!expectedPrivyUserId) {
      throw new Error('Identity session is not ready. Please wait.');
    }
    return resolvePrivyIdentityToken({
      cachedToken: identityTokenRef.current,
      expectedPrivyUserId,
      fetchFreshToken: () => getIdentityToken(),
      source: 'WalletPanel.getAuthToken',
    });
  }, []);

  const [amountMode] = useState<AmountMode>('pay');
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
  const [highlightedClaimableId, setHighlightedClaimableId] = useState<string | null>(null);
  const [flippedClaimableId, setFlippedClaimableId] = useState<string | null>(null);
  const [claimablePayoutsScrolling, setClaimablePayoutsScrolling] = useState(false);
  const claimableScrollTimeoutRef = useRef<number | null>(null);
  const claimableScrollArmedRef = useRef(false);
  const claimableHighlightTimeoutRef = useRef<number | null>(null);
  const claimableRowRefsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const lastHandledClaimableFocusSignatureRef = useRef<string | null>(null);
  const networkIconsPreloadedRef = useRef(false);
  const submitInFlightRef = useRef(false);
  const pendingCreateRef = useRef<{
    createIdempotencyKey: string;
    withdrawalId: string;
    sponsorMode?: WithdrawalSponsorMode | null;
  } | null>(null);
  const pendingCancelRef = useRef<{
    withdrawalId: string;
    reason: string;
    idempotencyKey: string;
  } | null>(null);

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
  const {
    balance,
    balanceMinor,
    balanceMeta,
    balanceError,
    balanceLoading,
    refreshBalance,
  } = useWithdrawBalance({
    activeWalletAddress,
    getAuthToken,
    enabled: isActive,
    refreshIntervalMs: 10_000,
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
    prefetchWhenClosed: isActive && !withdrawOpen && !!activeWalletAddress,
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
    if (!isActive || withdrawOpen || networkIconsPreloadedRef.current) return;
    if (typeof window === 'undefined') return;

    for (const iconUrl of NETWORK_ICON_PRELOAD_URLS) {
      const icon = new window.Image();
      icon.decoding = 'async';
      icon.src = iconUrl;
    }

    networkIconsPreloadedRef.current = true;
  }, [isActive, withdrawOpen]);

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
    quoteExpiresAtMs,
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
  const showQuoteRefreshingHint =
    destination !== 'base' &&
    !!quote &&
    quoteExpired &&
    !isQuoteLocked &&
    !sending &&
    !!quoteExpiresAtMs &&
    Date.now() - quoteExpiresAtMs >= 5_000;
  const quoteSecondsRemaining =
    quoteExpiresAtMs === null
      ? null
      : Math.max(0, Math.floor((quoteExpiresAtMs - Date.now()) / 1000));
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
  const showBalanceSkeleton = balanceLoading && !formattedBalance && !balanceError;
  const availabilityFeeMinor = useMemo(() => {
    if (destination === 'base') return 0n;
    if (quote) return BigInt(quote.max_fee_usdc_minor ?? 0);
    return selectedFeeEstimateMinor > 0n ? selectedFeeEstimateMinor : 0n;
  }, [destination, quote, selectedFeeEstimateMinor]);
  const maxReceivableMinor = useMemo(() => {
    if (balanceMinor === null) return null;
    if (amountMode === 'pay') return balanceMinor;
    if (destination === 'base') return balanceMinor;
    return balanceMinor > availabilityFeeMinor ? balanceMinor - availabilityFeeMinor : 0n;
  }, [amountMode, availabilityFeeMinor, balanceMinor, destination]);
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
    pendingCreateRef.current = null;
    pendingCancelRef.current = null;
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

  const submitWithdraw = async () => {
    if (submitInFlightRef.current || sending) return;
    submitInFlightRef.current = true;
    setFormError(null);
    let createdWithdrawalId: string | null = null;
    let usedCreateIdempotencyKey: string | null = null;
    let burnTxHashLocal: string | null = null;
    let burnSubmittedToBackend = false;
    let cancelCleanupMessage: string | null = null;
    try {
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

      if (destination !== 'base' && (!quote || quoteExpired)) {
        setFormError('Quote expired. Please refresh.');
        return;
      }

      if (destination !== 'base' && quote && quote.dest_chain !== destination) {
        setFormError('Quote mismatch. Please refresh and confirm again.');
        return;
      }

      if (destination !== 'base' && quote && quote.dest_domain_id !== destinationConfig.domainId) {
        setFormError('Quote destination mismatch. Please refresh.');
        return;
      }

      if (destination !== 'base' && quote) {
        const expectedTotalBurnMinor = quote.transfer_amount_usdc_minor + quote.max_fee_usdc_minor;
        if (quote.total_burn_usdc_minor !== expectedTotalBurnMinor) {
          setFormError('Quote integrity check failed. Please refresh.');
          return;
        }
      }

      if (destination !== 'base' && amountMode === 'pay' && quote) {
        const payMinor = parsedInputAmount;
        const requiredPay = BigInt(quote.total_burn_usdc_minor);
        if (!payMinor || payMinor < requiredPay) {
          setFormError('Entered pay amount is below current fees. Increase the amount.');
          return;
        }
      }

      const idempotencyQuoteId = quote?.quote_id ?? 'no-quote';
      const idempotencyAmountMinor = quote?.total_burn_usdc_minor ?? toNumberSafe(parsedInputAmount ?? 0n);
      const showWalletUIs = true;
      const destinationAddressLower = destinationAddress.trim().toLowerCase();
      const idempotencyBase = [
        'withdraw',
        activeWalletAddress.toLowerCase(),
        String(config.sourceChain.id),
        destination,
        destinationAddressLower,
        idempotencyQuoteId,
        String(idempotencyAmountMinor),
      ].join(':');
      const createIdempotencyKey = `${idempotencyBase}:create`;

      setSending(true);
      const token = await getAuthToken();
      if (pendingCancelRef.current) {
        const pendingCancel = pendingCancelRef.current;
        try {
          if (WITHDRAW_DEBUG_ENABLED) {
            pushDebug('api:cancel:retry', 'Retrying pending cancellation before new submit', {
              withdrawal_id: pendingCancel.withdrawalId,
              reason: pendingCancel.reason,
            });
          }
          const cancelResponse = await cancelWithdrawal(token, {
            withdrawal_id: pendingCancel.withdrawalId,
            reason: pendingCancel.reason,
            idempotency_key: pendingCancel.idempotencyKey,
          });
          pendingCancelRef.current = null;
          if (WITHDRAW_DEBUG_ENABLED) {
            pushDebug('api:cancel:retry', 'Pending cancellation completed', {
              withdrawal_id: pendingCancel.withdrawalId,
              status: cancelResponse.status,
              reservation_released: cancelResponse.reservation_released ?? null,
            });
          }
        } catch (cancelRetryError) {
          const retryMessage =
            cancelRetryError instanceof Error ? cancelRetryError.message : 'Pending cancellation retry failed';
          if (WITHDRAW_DEBUG_ENABLED) {
            pushDebug('api:cancel:retry:error', 'Pending cancellation retry failed', {
              withdrawal_id: pendingCancel.withdrawalId,
              message: retryMessage,
            });
          }
          setFormError('Cancellation is still being finalized on server. Please retry in a moment.');
          return;
        }
      }
      if (destination === 'base') {
        setLockedQuote(quote);
        setLockedAmountInput(amountInput);
        setLockedAmountMode(amountMode);
        const transferAmount = BigInt(quote?.transfer_amount_usdc_minor ?? toNumberSafe(parsedInputAmount ?? 0n));
        if (transferAmount <= 0n) {
          setFormError('Enter a valid USDC amount');
          return;
        }

        let quoteIdForCreate = quote?.quote_id ?? null;
        const requiresServerQuote =
          !quoteIdForCreate || quoteExpired || quoteIdForCreate === 'local-base';
        if (requiresServerQuote) {
          if (WITHDRAW_DEBUG_ENABLED) {
            pushDebug('api:quote-refresh', 'Refreshing quote before Base transfer creation', {
              amount_minor: transferAmount.toString(),
              previous_quote_id: quoteIdForCreate,
            });
          }
          const freshQuote = await getWithdrawalQuote(
            token,
            {
              dest_chain: destination,
              transfer_amount_usdc_minor: toNumberSafe(transferAmount),
            }
          );
          quoteIdForCreate = freshQuote.quote_id;
        }
        if (!quoteIdForCreate) {
          setFormError('Failed to prepare withdrawal quote. Please try again.');
          return;
        }
        const baseIdempotencyBase = [
          'withdraw',
          activeWalletAddress.toLowerCase(),
          String(config.sourceChain.id),
          destination,
          destinationAddressLower,
          quoteIdForCreate,
          String(toNumberSafe(transferAmount)),
        ].join(':');
        const baseCreateIdempotencyKey = `${baseIdempotencyBase}:create`;
        const pendingCreateForKey =
          pendingCreateRef.current?.createIdempotencyKey === baseCreateIdempotencyKey
            ? pendingCreateRef.current
            : null;
        const canReusePendingCreate =
          !!pendingCreateForKey &&
          withdrawalId === pendingCreateForKey.withdrawalId &&
          withdrawalStatus === 'CREATED' &&
          !burnTxHash &&
          !forwardTxHash;

        if (WITHDRAW_DEBUG_ENABLED) {
          pushDebug('api:create', 'Creating withdrawal before Base transfer signing', {
            quote_id: quoteIdForCreate,
            dest_address: destinationAddress.trim(),
          });
        }
        const createResponse: { withdrawal_id: string; status: 'CREATED' } | CreateWithdrawalResponse =
          canReusePendingCreate
            ? {
                withdrawal_id: pendingCreateForKey.withdrawalId,
                status: 'CREATED' as const,
              }
            : await createWithdrawal(
                token,
                {
                  quote_id: quoteIdForCreate,
                  dest_address: destinationAddress.trim(),
                  sponsor_mode: 'required',
                },
                baseCreateIdempotencyKey
              );

        createdWithdrawalId = createResponse.withdrawal_id;
        usedCreateIdempotencyKey = baseCreateIdempotencyKey;
        pendingCreateRef.current = {
          createIdempotencyKey: baseCreateIdempotencyKey,
          withdrawalId: createResponse.withdrawal_id,
          sponsorMode: createResponse.sponsor_mode ?? null,
        };
        setWithdrawalId(createResponse.withdrawal_id);
        setWithdrawalStatus(createResponse.status);
        if (WITHDRAW_DEBUG_ENABLED) {
          if (canReusePendingCreate) {
            pushDebug('api:create', 'Reusing prepared withdrawal for Base transfer signing', {
              withdrawal_id: createResponse.withdrawal_id,
              status: createResponse.status,
            });
          } else {
            pushDebug('api:create', 'Withdrawal created for Base transfer', {
              withdrawal_id: createResponse.withdrawal_id,
              status: createResponse.status,
            });
          }
        }
        if (WITHDRAW_DEBUG_ENABLED) {
          pushDebug('onchain:transfer', 'Sending Base transfer', {
            to: destinationAddress.trim(),
            amount_minor: transferAmount.toString(),
            token: config.usdcAddress,
            tracked_by_backend: true,
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
            uiOptions: {
              ...buildTxUiOptions({ mode: 'transfer' }),
              showWalletUIs,
            },
          }
        );

        burnTxHashLocal = transferTx.hash;
        setBurnTxHash(transferTx.hash);
        setForwardTxHash(null);
        if (WITHDRAW_DEBUG_ENABLED) {
          pushDebug('onchain:transfer', 'Base transfer submitted', {
            tx_hash: transferTx.hash,
          });
        }

        const burnSubmitResponse = await submitBurnTx(
          token,
          createResponse.withdrawal_id,
          transferTx.hash,
          `${baseIdempotencyBase}:burn:${transferTx.hash.toLowerCase()}`
        );
        burnSubmittedToBackend = true;
        pendingCreateRef.current = null;
        setWithdrawalStatus(burnSubmitResponse.status);
        if (WITHDRAW_DEBUG_ENABLED) {
          pushDebug('api:burn-submitted', 'Base transfer tx hash submitted', {
            withdrawal_id: createResponse.withdrawal_id,
            tx_hash: transferTx.hash,
            status: burnSubmitResponse.status,
          });
        }

        onCreatedWithdrawalFocus?.({
          focusWithdrawalRef: createResponse.withdrawal_id,
        });
        setWithdrawOpen(false);
        resetFlow();
        void refreshBalance();
        return;
      }

      if (!quote) {
        setFormError('Quote expired. Please refresh.');
        return;
      }

      const expectedTotalBurnMinor = quote.transfer_amount_usdc_minor + quote.max_fee_usdc_minor;
      if (quote.total_burn_usdc_minor !== expectedTotalBurnMinor) {
        setFormError('Quote integrity check failed. Please refresh.');
        return;
      }

      if (amountMode === 'pay') {
        const payMinor = parsedInputAmount;
        const requiredPay = BigInt(quote.total_burn_usdc_minor);
        if (!payMinor || payMinor < requiredPay) {
          setFormError('Entered pay amount is below current fees. Increase the amount.');
          return;
        }
      }

      setLockedQuote(quote);
      setLockedAmountInput(amountInput);
      setLockedAmountMode(amountMode);

      if (WITHDRAW_DEBUG_ENABLED) {
        pushDebug('api:create', 'Creating withdrawal before on-chain signing', {
          quote_id: quote.quote_id,
          dest_address: destinationAddress.trim(),
        });
      }
      const noSponsorCreateIdempotencyKey = `${createIdempotencyKey}:nosponsor`;
      const pendingCreateForKey =
        pendingCreateRef.current &&
        (pendingCreateRef.current.createIdempotencyKey === createIdempotencyKey ||
          pendingCreateRef.current.createIdempotencyKey === noSponsorCreateIdempotencyKey)
          ? pendingCreateRef.current
          : null;
      const canReusePendingCreate =
        !!pendingCreateForKey &&
        withdrawalId === pendingCreateForKey.withdrawalId &&
        withdrawalStatus === 'CREATED' &&
        !burnTxHash &&
        !forwardTxHash;
      let createIdempotencyKeyForRequest = createIdempotencyKey;
      let createSponsorMode: WithdrawalSponsorMode = 'auto';
      const createResponse = canReusePendingCreate
        ? {
            withdrawal_id: pendingCreateForKey.withdrawalId,
            status: 'CREATED' as const,
            sponsor_mode: pendingCreateForKey.sponsorMode ?? undefined,
          }
        : await (async () => {
            try {
              createSponsorMode = 'auto';
              createIdempotencyKeyForRequest = createIdempotencyKey;
              return await createWithdrawal(
                token,
                {
                  quote_id: quote.quote_id,
                  dest_address: destinationAddress.trim(),
                  sponsor_mode: 'auto',
                },
                createIdempotencyKeyForRequest
              );
            } catch (createError) {
              if (!isSponsorUnavailableError(createError)) {
                throw createError;
              }
              createSponsorMode = 'none';
              createIdempotencyKeyForRequest = noSponsorCreateIdempotencyKey;
              if (WITHDRAW_DEBUG_ENABLED) {
                pushDebug('api:create:fallback', 'Retrying create without sponsorship', {
                  reason: createError instanceof Error ? createError.message : String(createError),
                });
              }
              return createWithdrawal(
                token,
                {
                  quote_id: quote.quote_id,
                  dest_address: destinationAddress.trim(),
                  sponsor_mode: 'none',
                },
                createIdempotencyKeyForRequest
              );
            }
          })();

      createdWithdrawalId = createResponse.withdrawal_id;
      usedCreateIdempotencyKey = createIdempotencyKeyForRequest;
      pendingCreateRef.current = {
        createIdempotencyKey: createIdempotencyKeyForRequest,
        withdrawalId: createResponse.withdrawal_id,
        sponsorMode:
          createResponse.sponsor_mode ?? (canReusePendingCreate ? pendingCreateForKey?.sponsorMode ?? null : createSponsorMode),
      };
      const shouldSponsorTransactions =
        (createResponse.sponsor_mode ??
          (canReusePendingCreate ? pendingCreateForKey?.sponsorMode ?? null : createSponsorMode)) !== 'none';
      setWithdrawalId(createResponse.withdrawal_id);
      setWithdrawalStatus(createResponse.status);
      if (WITHDRAW_DEBUG_ENABLED) {
        if (canReusePendingCreate) {
          pushDebug('api:create', 'Reusing prepared withdrawal before on-chain signing', {
            withdrawal_id: createResponse.withdrawal_id,
            status: createResponse.status,
            sponsor_mode: createResponse.sponsor_mode ?? pendingCreateForKey?.sponsorMode ?? null,
          });
        } else {
          pushDebug('api:create', 'Withdrawal created', {
            withdrawal_id: createResponse.withdrawal_id,
            status: createResponse.status,
            sponsor_mode: createResponse.sponsor_mode ?? createSponsorMode,
          });
        }
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
            amount: totalBurn.toString(),
          });
        }
        const approveData = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [config.tokenMessengerAddress as `0x${string}`, totalBurn],
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
            sponsor: shouldSponsorTransactions,
            uiOptions: {
              ...buildTxUiOptions({ mode: 'approve' }),
              showWalletUIs,
            },
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
          sponsor: shouldSponsorTransactions,
          uiOptions: {
            ...buildTxUiOptions({
              mode: 'burn',
              destinationLabel: destinationConfig.label,
            }),
            showWalletUIs,
          },
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
        `${idempotencyBase}:burn:${burnTx.hash.toLowerCase()}`
      );
      burnSubmittedToBackend = true;
      pendingCreateRef.current = null;
      if (WITHDRAW_DEBUG_ENABLED) {
        pushDebug('api:burn-submitted', 'Burn tx hash submitted');
      }

      setWithdrawalStatus('FORWARDING_PENDING');
      onCreatedWithdrawalFocus?.({
        focusWithdrawalRef: createResponse.withdrawal_id,
      });
      setWithdrawOpen(false);
      resetFlow();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Withdrawal failed';
      const isUserRejected = /reject|denied|cancelled|canceled/i.test(message);
      const withdrawalErrorCode =
        error instanceof WithdrawalApiError ? error.code.toUpperCase() : null;
      const isQuoteErrorCode =
        withdrawalErrorCode === 'QUOTE_EXPIRED' || withdrawalErrorCode === 'QUOTE_NOT_FOUND';
      if (isQuoteExpiredError(message) || isQuoteErrorCode) {
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
        } else if (createdWithdrawalId && !burnTxHashLocal) {
          const cancelReason = isUserRejected ? 'user_rejected' : 'client_timeout';
          const cancelIdempotencyKey = `${
            usedCreateIdempotencyKey ?? `withdrawal:${createdWithdrawalId}:prepared`
          }:cancel`;
          try {
            if (WITHDRAW_DEBUG_ENABLED) {
              pushDebug('api:cancel', 'Cancelling unsigned prepared withdrawal', {
                withdrawal_id: createdWithdrawalId,
                reason: cancelReason,
              });
            }
            const token = await getAuthToken();
            const cancelResponse = await cancelWithdrawal(token, {
              withdrawal_id: createdWithdrawalId,
              reason: cancelReason,
              idempotency_key: cancelIdempotencyKey,
            });
            pendingCreateRef.current = null;
            pendingCancelRef.current = null;
            setWithdrawalId(null);
            setWithdrawalStatus(null);
            if (WITHDRAW_DEBUG_ENABLED) {
              pushDebug('api:cancel', 'Unsigned withdrawal cancelled', {
                withdrawal_id: createdWithdrawalId,
                status: cancelResponse.status,
                reservation_released: cancelResponse.reservation_released ?? null,
                message: cancelResponse.message ?? null,
              });
            }
          } catch (cancelError) {
            if (WITHDRAW_DEBUG_ENABLED) {
              const cancelMessage =
                cancelError instanceof Error ? cancelError.message : 'Failed to cancel prepared withdrawal';
              pushDebug('api:cancel:error', 'Failed to cancel unsigned prepared withdrawal', {
                withdrawal_id: createdWithdrawalId,
                reason: cancelReason,
                message: cancelMessage,
              });
            }
            pendingCreateRef.current = null;
            pendingCancelRef.current = {
              withdrawalId: createdWithdrawalId,
              reason: cancelReason,
              idempotencyKey: cancelIdempotencyKey,
            };
            setWithdrawalId(null);
            setWithdrawalStatus(null);
            cancelCleanupMessage = isUserRejected
              ? 'Transaction cancelled in wallet. Finalizing cancellation on server, please retry in a moment.'
              : 'Failed to finalize cancellation on server. Please retry in a moment.';
          }
          setLockedQuote(null);
          setLockedAmountInput(null);
          setLockedAmountMode(null);
          if (WITHDRAW_DEBUG_ENABLED) {
            pushDebug(
              'submit:recover',
              'Withdrawal record created but signing was not completed',
              {
                withdrawal_id: createdWithdrawalId,
              }
            );
          }
        } else if (!createdWithdrawalId) {
          setLockedQuote(null);
          setLockedAmountInput(null);
          setLockedAmountMode(null);
        }
        const mappedCreateError =
          error instanceof WithdrawalApiError ? mapWithdrawalCreateErrorMessage(error) : message;
        setFormError(cancelCleanupMessage ?? (isUserRejected ? 'Transaction cancelled in wallet.' : mappedCreateError));
      }
      if (WITHDRAW_DEBUG_ENABLED) {
        pushDebug('submit:error', 'Withdrawal submit failed', {
          message,
          code: withdrawalErrorCode,
        });
      }
    } finally {
      setSending(false);
      submitInFlightRef.current = false;
    }
  };

  const handleWithdraw = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitWithdraw();
  };

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
    return getExplorerTxUrl(chain, txHash, { forceBaseSepolia: config.sourceChain.id === 84532 });
  }, [config.sourceChain.id]);

  const loadClaimablePayouts = useCallback(
    async (mode: 'initial' | 'background' = 'background') => {
      const shouldShowLoading =
        mode === 'initial' && !didInitialClaimableLoadRef.current && claimablePayouts.length === 0;
      const isNoClaimablePayoutsMessage = (message: string): boolean => {
        return message.toLowerCase().includes('no claimable');
      };
      if (shouldShowLoading) setClaimablePayoutsLoading(true);
      setClaimablePayoutsError(null);
      try {
        const token = await getAuthToken();
        const traceId = createAuthTraceId('wallet-payouts');
        const debugEnabled = isAuthDebugEnabled();
        authDebug('payouts.request', {
          source: 'WalletPanel.loadClaimablePayouts',
          mode,
          trace_id: traceId,
          expected_privy_user_id: currentPrivyUserId || null,
          token_sub: readJwtSub(token),
          token_fp: tokenFingerprint(token),
        });
        const response = await getMyPayouts(
          token,
          undefined,
          {
            statuses: WALLET_ACTIVE_PAYOUT_STATUSES,
            ...(debugEnabled
              ? {
                  debugTraceId: traceId,
                  debugSource: 'WalletPanel.loadClaimablePayouts',
                  debugExpectedSub: currentPrivyUserId || undefined,
                }
              : {}),
          }
        );
        const claimable = response.payouts
          .filter((item) => isWalletActivePayoutStatus(item.status))
          .sort((a, b) => {
            const priorityDiff =
              getWalletPayoutSortPriority(a.status) - getWalletPayoutSortPriority(b.status);
            if (priorityDiff !== 0) return priorityDiff;
            return getWalletPayoutSortTimestamp(b) - getWalletPayoutSortTimestamp(a);
          });
        setClaimablePayouts(claimable);
        didInitialClaimableLoadRef.current = true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to load claimable payouts';
        if (isNoClaimablePayoutsMessage(message)) {
          setClaimablePayouts([]);
          didInitialClaimableLoadRef.current = true;
          setClaimablePayoutsError(null);
        } else {
          setClaimablePayoutsError(message);
        }
      } finally {
        if (shouldShowLoading) setClaimablePayoutsLoading(false);
      }
    },
    [claimablePayouts.length, currentPrivyUserId, getAuthToken]
  );

  const handleClaimablePayoutClaim = useCallback(
    async (item: PayoutPreview) => {
      if (!activeWalletAddress) return;
      const itemId = item.id ?? item.payout_id ?? item.claim_token ?? null;
      const payoutId = item.payout_id ?? item.id;
      if (!item.claim_token && !payoutId) return;
      let focusPayoutRef: string | null = payoutId ?? item.id ?? item.claim_token ?? null;

      setClaimingPayoutId(itemId);
      setClaimablePayoutsError(null);
      try {
        const token = await getAuthToken();
        authDebug('claim.request', {
          source: 'WalletPanel.handleClaimablePayoutClaim',
          expected_privy_user_id: currentPrivyUserId || null,
          token_sub: readJwtSub(token),
          token_fp: tokenFingerprint(token),
          payout_id: payoutId ?? null,
          claim_token_present: Boolean(item.claim_token),
        });
        if (item.claim_token) {
          try {
            const confirmResponse = await confirmClaim(item.claim_token, activeWalletAddress, token);
            focusPayoutRef = confirmResponse.payout_id ?? focusPayoutRef;
          } catch (claimByTokenError) {
            const message =
              claimByTokenError instanceof Error ? claimByTokenError.message : 'Claim failed';
            const canRetryById = !!payoutId && message.toLowerCase().includes('missing claim_token');
            if (!canRetryById) {
              throw claimByTokenError;
            }
            const confirmResponse = await confirmClaimByPayoutId(payoutId, activeWalletAddress, token);
            focusPayoutRef = confirmResponse.payout_id ?? focusPayoutRef;
          }
        } else if (payoutId) {
          const confirmResponse = await confirmClaimByPayoutId(payoutId, activeWalletAddress, token);
          focusPayoutRef = confirmResponse.payout_id ?? focusPayoutRef;
        }
        await loadClaimablePayouts('background');
        setFlippedClaimableId(null);
        onClaimedPayoutFocus?.({
          focusToken: item.claim_token ?? null,
          focusPayoutRef,
        });
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
    [activeWalletAddress, currentPrivyUserId, getAuthToken, loadClaimablePayouts, onClaimedPayoutFocus]
  );

  useEffect(() => {
    if (!debugPreview) return;
    const now = Date.now();
    const statuses: PayoutPreview['status'][] = WALLET_ACTIVE_PAYOUT_STATUSES;
    const mock = statuses.map((status, index) => ({
      ...(status === 'CREATED'
        ? {
            payout_id: 'debug-payout-created',
            claim_token: 'debug-claim-created',
          }
        : {}),
      tournament_name: `Debug ${status}`,
      asset: 'USDC',
      chain: 'base',
      amount_minor_units: (1_500_000 + index * 175_000),
      amount_formatted: ((1_500_000 + index * 175_000) / 1_000_000).toFixed(2),
      status,
      expires_at: now + 60 * 60 * 1000,
      created_at: now - (index + 6) * 60_000,
      updated_at: now - (index + 1) * 60_000,
      recipient_email: 'player@example.com',
    }));
    setClaimablePayouts(mock);
    setClaimablePayoutsError(null);
    setClaimablePayoutsLoading(false);
    didInitialClaimableLoadRef.current = true;
  }, [debugPreview]);

  useEffect(() => {
    if (debugPreview) return;
    if (!currentPrivyUserId) return;
    if (withdrawOpen) return;
    void loadClaimablePayouts(didInitialClaimableLoadRef.current ? 'background' : 'initial');
    const timerId = window.setInterval(() => {
      void loadClaimablePayouts('background');
    }, 20_000);
    return () => window.clearInterval(timerId);
  }, [currentPrivyUserId, debugPreview, loadClaimablePayouts, withdrawOpen]);

  useEffect(() => {
    return () => {
      if (claimableScrollTimeoutRef.current) {
        window.clearTimeout(claimableScrollTimeoutRef.current);
      }
      if (claimableHighlightTimeoutRef.current) {
        window.clearTimeout(claimableHighlightTimeoutRef.current);
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

  const focusedClaimableId = useMemo(() => {
    const focused = claimablePayouts.find((item) => {
      if (focusPayoutRef) {
        if (item.id === focusPayoutRef) return true;
        if (item.payout_id === focusPayoutRef) return true;
        if (item.claim_token === focusPayoutRef) return true;
      }
      if (focusToken && item.claim_token === focusToken) return true;
      return false;
    });
    if (!focused) return null;
    return focused.id ?? focused.payout_id ?? focused.claim_token ?? `${focused.status}-${focused.expires_at}`;
  }, [claimablePayouts, focusPayoutRef, focusToken]);
  const showClaimableSection =
    claimablePayoutsLoading || !!claimablePayoutsError || claimablePayouts.length > 0;

  useEffect(() => {
    if (!focusedClaimableId || withdrawOpen) return;
    const focusSignature = `${focusToken ?? ''}|${focusPayoutRef ?? ''}|${focusedClaimableId}`;
    if (lastHandledClaimableFocusSignatureRef.current === focusSignature) return;
    lastHandledClaimableFocusSignatureRef.current = focusSignature;

    const timerId = window.setTimeout(() => {
      const row = claimableRowRefsRef.current[focusedClaimableId];
      if (row) {
        row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      setHighlightedClaimableId(focusedClaimableId);
      if (claimableHighlightTimeoutRef.current) {
        window.clearTimeout(claimableHighlightTimeoutRef.current);
      }
      claimableHighlightTimeoutRef.current = window.setTimeout(() => {
        setHighlightedClaimableId((current) => (current === focusedClaimableId ? null : current));
      }, CLAIMABLE_HIGHLIGHT_DURATION_MS);
    }, CLAIMABLE_HIGHLIGHT_SCROLL_DELAY_MS);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [focusPayoutRef, focusToken, focusedClaimableId, withdrawOpen]);

  useEffect(() => {
    if (withdrawOpen) {
      setFlippedClaimableId(null);
      return;
    }
    if (!flippedClaimableId) return;
    const exists = claimablePayouts.some((item) => {
      const itemId = item.id ?? item.payout_id ?? item.claim_token ?? `${item.status}-${item.expires_at}`;
      return itemId === flippedClaimableId;
    });
    if (!exists) {
      setFlippedClaimableId(null);
    }
  }, [claimablePayouts, flippedClaimableId, withdrawOpen]);

  if (withdrawOpen) {
    const headerTitle = 'Send';
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
    const requiresBridgeQuote = destination !== 'base';
    const reviewConfirmDisabled =
      sending ||
      isProcessingWithdrawal ||
      !activeWalletAddress ||
      !parsedInputAmount ||
      !destinationConfig ||
      !isDestinationAddressValid ||
      (requiresBridgeQuote && quoteLoading) ||
      (requiresBridgeQuote && !quote) ||
      (requiresBridgeQuote && quoteExpired) ||
      insufficientBalance ||
      belowMinReceive ||
      config.errors.length > 0;
    const reviewConfirmLabel = sending
      ? destination === 'base'
        ? 'Sending...'
        : 'Submitting...'
      : isProcessingWithdrawal
        ? destination === 'base'
          ? 'Finalizing...'
          : 'Processing...'
        : 'Confirm';
    return (
      <div className="withdraw-flow font-num fixed inset-0 z-50 bg-[#0a0a0a]">
        <div className="relative mx-auto flex h-full w-full max-w-md flex-col px-4 pt-5 pb-8">
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleWithdraw}>
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
                  <ArrowLeft size={18} strokeWidth={2} />
                </button>
              </div>
              <div className="text-center text-[18px] font-semibold text-white">{headerTitle}</div>
              <div className="flex justify-end items-center gap-2">
                {WITHDRAW_DEBUG_ENABLED && SHOW_WITHDRAW_DEBUG_TOGGLE && (
                  <button
                    type="button"
                    onClick={() => setShowDebug((current) => !current)}
                    className={`rounded-full border px-3 py-1 text-[10px] tracking-[0.08em] ${
                      showDebug
                        ? 'border-white/30 bg-white/10 text-white'
                        : 'border-white/10 text-gray-500'
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
                  <X size={18} strokeWidth={2} />
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
                amountMode={amountMode}
                derivedPayMinor={derivedPayMinor}
                derivedReceiveMinor={derivedReceiveMinor}
                isQuoteLocked={isQuoteLocked}
                quoteTimeRemaining={quoteTimeRemaining}
                quoteSecondsRemaining={quoteSecondsRemaining}
                destinationConfig={destinationConfig}
                destination={destination}
                NetworkIcon={NetworkIcon}
                displayQuote={displayQuote}
                quoteError={quoteError}
                displayMode={displayMode}
                showQuoteRefreshingHint={showQuoteRefreshingHint}
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
        {balanceError ? (
          <p className="mt-2 text-sm text-red-400">{balanceError}</p>
        ) : showBalanceSkeleton ? (
          <div className="mt-4 flex min-h-[48px] items-center justify-center">
            <span className="inline-flex h-10 w-52 animate-pulse rounded-xl bg-white/10" />
          </div>
        ) : (
          <>
            <p className="font-num mt-4 text-5xl font-semibold leading-none tracking-[0.04em] text-white">
              ~{formattedBalance ?? '0.00'} <span className="text-gray-400">USDC</span>
            </p>
            {balanceMeta && !balanceMeta.isFinalized ? (
              <p className="mt-2 text-xs uppercase tracking-[0.14em] text-gray-500">
                Pending confirmations
              </p>
            ) : null}
          </>
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
            <SendHorizontal size={16} strokeWidth={1.9} className="block" aria-hidden="true" />
            <span className="font-num tracking-[0.04em]">Send</span>
          </button>
        </div>
      ) : null}

      {!withdrawOpen && showClaimableSection && (
        <div
          className={`mt-6 flex min-h-0 flex-1 flex-col transition-[transform,opacity,filter] duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
            isActive ? 'translate-x-0 opacity-100 brightness-100' : '-translate-x-8 opacity-35 brightness-50'
          }`}
          style={{ transitionDelay: '140ms' }}
        >
          <div className="mb-2">
            <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Tournament payouts</p>
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
            className={`min-h-0 flex-1 transient-scrollbar ${
              claimablePayoutsScrolling ? 'transient-scrollbar--visible' : ''
            }`}
          >
            {claimablePayoutsLoading ? (
              <div className="space-y-3 pb-2">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={`claimable-skeleton-${index}`}
                    className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.015] p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <span className="block h-8 w-40 animate-pulse rounded-lg bg-white/10" />
                        <span className="mt-2 block h-3.5 w-24 animate-pulse rounded bg-white/8" />
                      </div>
                      <span className="block h-8 w-8 animate-pulse rounded-full bg-white/10" />
                    </div>
                    <span className="mt-4 block h-11 w-full animate-pulse rounded-xl bg-white/8" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3 pb-2">
                {claimablePayouts.map((item, index) => {
                  const key =
                    item.id ?? item.payout_id ?? item.claim_token ?? `${item.status}-${item.expires_at}`;
                  const hasClaimRef = !!item.claim_token || !!item.payout_id || !!item.id;
                  const canClaim = item.status === 'CREATED' && hasClaimRef && !!activeWalletAddress;
                  const shouldUseClaimableShimmer = canClaim;
                  const isClaiming = claimingPayoutId === key;
                  const isHighlighted = highlightedClaimableId === key;
                  const isFlipped = flippedClaimableId === key;
                  const tournamentName =
                    item.tournament_name && item.tournament_name.trim()
                      ? item.tournament_name.trim()
                      : 'Tournament';
                  const walletStatusLabel = getWalletPayoutStatusLabel(item.status);
                  const walletSubtitle = canClaim
                    ? walletStatusLabel
                    : getWalletPayoutSubtitle(item.status);
                  const payoutStatusUi = getPayoutStatusUi(item.status);
                  const [amountPart, assetPart] = formatClaimablePillAmount(item).split(' ');
                  const payoutExplorerUrl = item.tx_hash
                    ? openPayoutExplorerUrl(item.chain, item.tx_hash)
                    : '';
                  const issuedDate = formatPayoutDate(item.created_at);
                  const rowHeight = 134;

                  return (
                    <div
                      key={key}
                      ref={(node) => {
                        claimableRowRefsRef.current[key] = node;
                      }}
                      className={`group transform-gpu overflow-hidden rounded-2xl transition-[transform,opacity,filter,height] duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        isActive ? 'translate-x-0 opacity-100 brightness-100' : '-translate-x-8 opacity-35 brightness-50'
                      } ${isHighlighted ? 'history-payout-focus-flash' : ''}`}
                      style={{
                        transitionDelay: `${Math.min(index * 45, 360)}ms`,
                        height: `${rowHeight}px`,
                      }}
                    >
                      <div className="history-flip-scene h-full">
                        <div className={`history-flip-card h-full ${isFlipped ? 'is-flipped' : ''}`}>
                          <div
                            className={`history-flip-face history-flip-face--front rounded-2xl border border-white/[0.08] transition-colors duration-200 group-hover:border-white/[0.14] ${
                              shouldUseClaimableShimmer ? 'claimable-metal-pill' : 'bg-white/[0.015]'
                            } p-4`}
                          >
                            <div className="flex h-full flex-col">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p
                                    className="font-num truncate text-[1.75rem] font-semibold leading-none tracking-[0.02em] text-white"
                                  >
                                    {amountPart}
                                    {assetPart ? <span className="ml-1 text-gray-400">{assetPart}</span> : null}
                                  </p>
                                  <p
                                    className={`truncate text-[0.95rem] leading-5 ${payoutStatusUi.pillTextClassName}`}
                                  >
                                    {walletSubtitle}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setFlippedClaimableId(key)}
                                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition hover:border-white/45 hover:bg-white/15"
                                  aria-label="Show payout details"
                                >
                                  <VerticalDotsIcon />
                                </button>
                              </div>
                              {canClaim ? (
                                <button
                                  type="button"
                                  onClick={() => void handleClaimablePayoutClaim(item)}
                                  disabled={isClaiming}
                                  className="claimable-cta-button mt-4 inline-flex h-[50px] w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-all duration-200 active:translate-y-[1px] active:scale-[0.99] disabled:opacity-60"
                                >
                                  {!isClaiming ? <CoinIcon /> : null}
                                  {isClaiming ? 'Claiming...' : 'Claim'}
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <div
                            className={`history-flip-face history-flip-face--back claimable-flip-face--back rounded-2xl border border-white/[0.08] bg-white/[0.015] transition-colors duration-200 group-hover:border-white/[0.14] group-hover:bg-white/[0.04] ${
                              canClaim ? 'space-y-2 p-4' : 'space-y-1 p-3'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p
                                  className={`font-num truncate font-semibold text-white ${
                                    canClaim ? 'text-[clamp(1.42rem,3.4vw,1.58rem)] leading-7' : 'text-[1.2rem] leading-5'
                                  }`}
                                >
                                  {amountPart}
                                  {assetPart ? <span className="ml-1 text-gray-400">{assetPart}</span> : null}
                                </p>
                                <p className={`truncate text-gray-500 ${canClaim ? 'text-sm leading-5' : 'text-xs leading-4'}`}>
                                  {walletStatusLabel}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setFlippedClaimableId(null)}
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-gray-100 transition hover:bg-white/10"
                                aria-label="Hide payout details"
                              >
                                <X size={16} />
                              </button>
                            </div>
                            <div className={`space-y-1 ${canClaim ? 'text-[clamp(0.95rem,2.35vw,1.1rem)] leading-5' : 'text-xs leading-4'}`}>
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-gray-500">Tournament</p>
                                <p className="max-w-[68%] truncate text-right text-gray-200">{tournamentName}</p>
                              </div>
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-gray-500">Date issued</p>
                                <p className="max-w-[68%] truncate text-right text-gray-200">{issuedDate}</p>
                              </div>
                            </div>
                            {item.tx_hash ? (
                              <div className={`flex items-center gap-2 ${canClaim ? 'text-[clamp(0.95rem,2.35vw,1.1rem)] leading-5' : 'text-xs leading-4'}`}>
                                <p className="shrink-0 text-gray-500">Tx</p>
                                {payoutExplorerUrl ? (
                                  <a
                                    href={payoutExplorerUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-num min-w-0 flex-1 truncate text-gray-300 hover:text-white hover:underline"
                                  >
                                    {truncateHash(item.tx_hash)}
                                  </a>
                                ) : (
                                  <p className="font-num min-w-0 flex-1 truncate text-gray-300">
                                    {truncateHash(item.tx_hash)}
                                  </p>
                                )}
                              </div>
                            ) : null}
                            {item.failure_reason ? (
                              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1">
                                <p className="claimable-failure-compact text-[clamp(0.88rem,2.1vw,1rem)] leading-5 text-red-300">
                                  {item.failure_reason}
                                </p>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
