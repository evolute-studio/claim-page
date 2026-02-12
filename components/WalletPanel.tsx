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
import type {
  DestinationChain,
  WithdrawalQuoteResponse,
  WithdrawalStatus,
} from '@/types/withdrawal';

const ZERO_BYTES32 = `0x${'0'.repeat(64)}` as `0x${string}`;
const MAX_UINT256 = (2n ** 256n - 1n) as bigint;

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
type WithdrawStep = 1 | 2 | 3 | 4;

export function WalletPanel() {
  const { wallets } = useWallets();
  const { identityToken } = useIdentityToken();
  const { sendTransaction } = useSendTransaction();
  const config = useMemo(() => getCctpConfig(), []);

  const [amountMode, setAmountMode] = useState<AmountMode>('receive');
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
  const quoteRequestId = useRef(0);
  const networkFeeRequestId = useRef(0);

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
  const clampAmountInput = useCallback((raw: string) => {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    if (!cleaned) return '';
    const [wholeRaw = '', fractionRaw = ''] = cleaned.split('.');
    const whole = wholeRaw.replace(/^0+(?=\d)/, '');
    const fraction = fractionRaw.slice(0, 6);
    if (cleaned.includes('.')) {
      return `${whole || '0'}.${fraction}`;
    }
    return whole || '0';
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

  const quoteRequestAmount = useMemo(() => {
    if (!parsedInputAmount) return null;
    if (amountMode === 'receive') return parsedInputAmount;
    if (parsedInputAmount <= feeEstimateMinor) return 0n;
    return parsedInputAmount - feeEstimateMinor;
  }, [amountMode, feeEstimateMinor, parsedInputAmount]);

  const quoteExpiresAtMs = useMemo(() => normalizeTimestamp(quote?.expires_at), [quote?.expires_at]);
  const quoteExpired = quoteExpiresAtMs ? quoteExpiresAtMs <= Date.now() : false;
  const quoteTimeRemaining = timeRemainingLabel(quoteExpiresAtMs);
  const derivedPayMinor = useMemo(() => {
    if (!parsedInputAmount) return null;
    if (amountMode === 'pay') return toNumberSafe(parsedInputAmount);
    if (!quote) return null;
    return quote.total_burn_usdc_minor;
  }, [amountMode, parsedInputAmount, quote]);
  const derivedReceiveMinor = useMemo(() => {
    if (!parsedInputAmount) return null;
    if (amountMode === 'receive') {
      if (!quote) return null;
      return quote.transfer_amount_usdc_minor;
    }
    if (!quote) return null;
    const payMinor = toNumberSafe(parsedInputAmount);
    return Math.max(0, payMinor - quote.max_fee_usdc_minor);
  }, [amountMode, parsedInputAmount, quote]);
  const isProcessingWithdrawal =
    !!withdrawalId &&
    withdrawalStatus !== 'MINTED' &&
    withdrawalStatus !== 'FAILED' &&
    withdrawalStatus !== 'EXPIRED';

  useEffect(() => {
    if (!quote || !quoteExpiresAtMs || !activeWalletAddress) return;
    if (sending) return;

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
    quoteLoading,
    destination,
    amountMode,
    parsedInputAmount,
  ]);

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
    const token = identityToken ?? (await getIdentityToken());
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
      } catch {
        if (!cancelled && networkFeeRequestId.current === requestId) {
          setNetworkFeeEstimates({});
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
  }, [destinationChains, getAuthToken, networkFeeEstimates, step, withdrawOpen]);

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
      setFeeEstimateMinor(0n);
      setQuoteError(null);
      setQuoteLoading(false);
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
        const response = await getWithdrawalQuote(token, {
          dest_chain: destination,
          transfer_amount_usdc_minor: toNumberSafe(quoteRequestAmount),
        });
        if (quoteRequestId.current !== requestId) return;
        setQuote(response);
        setFeeEstimateMinor(BigInt(response.max_fee_usdc_minor));
        setQuoteError(null);
      } catch (error) {
        if (quoteRequestId.current !== requestId) return;
        const message = error instanceof Error ? error.message : 'Failed to fetch quote';
        setQuote(null);
        setQuoteError(message);
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
    parsedInputAmount,
    quoteRequestAmount,
    quoteRefreshNonce,
  ]);

  useEffect(() => {
    if (!withdrawalId || forwardTxHash) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const token = await getAuthToken();
        const status = await getWithdrawalStatus(token, withdrawalId);
        if (cancelled) return;
        setWithdrawalStatus(status.status);
        if (status.burn_tx_hash) setBurnTxHash(status.burn_tx_hash);
        if (status.forward_tx_hash) setForwardTxHash(status.forward_tx_hash);
        if (status.failure_reason) setFormError(status.failure_reason);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Failed to refresh status';
        setFormError(message);
      }
    };

    poll();
    const timerId = window.setInterval(poll, 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(timerId);
    };
  }, [getAuthToken, withdrawalId, forwardTxHash]);

  const formattedBalance = useMemo(() => {
    if (!balance) return null;
    const numeric = Number(balance);
    if (Number.isNaN(numeric)) return balance;
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(numeric);
  }, [balance]);

  const requiredPayMinor = useMemo(() => {
    if (!quote) return null;
    if (amountMode === 'pay') return parsedInputAmount ?? null;
    return BigInt(quote.total_burn_usdc_minor);
  }, [amountMode, parsedInputAmount, quote]);

  const selectedFeeEstimateMinor = useMemo(() => {
    if (destination === 'base') return 0n;
    const estimate = networkFeeEstimates[destination];
    if (typeof estimate === 'number' && Number.isFinite(estimate) && estimate > 0) {
      return BigInt(Math.round(estimate));
    }
    return feeEstimateMinor > 0n ? feeEstimateMinor : 0n;
  }, [destination, feeEstimateMinor, networkFeeEstimates]);

  const insufficientBalance =
    balanceMinor !== null &&
    requiredPayMinor !== null &&
    balanceMinor < requiredPayMinor;

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
    setWithdrawOpen(true);
    setStep(1);
  };

  const handleCloseWithdraw = () => {
    if (sending) return;
    setFormError(null);
    setWithdrawOpen(false);
    setStep(1);
  };

  const resetFlow = () => {
    setWithdrawalId(null);
    setWithdrawalStatus(null);
    setBurnTxHash(null);
    setForwardTxHash(null);
    setFormError(null);
    setSending(false);
    setStep(1);
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
    try {
      if (destination === 'base') {
        const transferAmount = BigInt(quote.transfer_amount_usdc_minor);
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
        return;
      }

      const token = await getAuthToken();
      const createResponse = await createWithdrawal(
        token,
        {
          quote_id: quote.quote_id,
          dest_address: destinationAddress.trim(),
        },
        crypto.randomUUID()
      );

      setWithdrawalId(createResponse.withdrawal_id);
      setWithdrawalStatus(createResponse.status);

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

      if (allowance < totalBurn) {
        const approveData = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [config.tokenMessengerAddress as `0x${string}`, MAX_UINT256],
        });

        await sendTransaction(
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

      setBurnTxHash(burnTx.hash);

      await submitBurnTx(
        token,
        createResponse.withdrawal_id,
        burnTx.hash,
        crypto.randomUUID()
      );

      setWithdrawalStatus('FORWARDING_PENDING');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Withdrawal failed';
      setFormError(message);
    } finally {
      setSending(false);
    }
  };

  if (withdrawOpen) {
    const headerTitle = step === 4 ? 'Review' : 'Send';
    const amountDisplay = amountInput || '0';
    const amountMuted =
      !amountInput || amountInput === '0' || amountInput === '0.' || amountInput === '0.0';
    return (
      <div className="fixed inset-0 z-50 bg-[#0a0a0a]">
        <div className="relative mx-auto flex h-full w-full max-w-md flex-col px-4 pt-5 pb-8">
          <form className="flex-1 flex flex-col" onSubmit={handleWithdraw}>
            <div className="grid grid-cols-3 items-center">
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={
                    step > 1
                      ? () =>
                          setStep((current) =>
                            current > 1 ? ((current - 1) as WithdrawStep) : current
                          )
                      : handleCloseWithdraw
                  }
                  disabled={sending}
                  className="h-9 w-9 rounded-full bg-white/5 text-white transition hover:bg-white/10 disabled:opacity-60"
                  aria-label={step > 1 ? 'Go back' : 'Close'}
                >
                  ←
                </button>
              </div>
              <div className="text-center text-sm font-semibold text-white">{headerTitle}</div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleCloseWithdraw}
                  disabled={sending}
                  className="h-9 w-9 rounded-full bg-white/5 text-white transition hover:bg-white/10 disabled:opacity-60"
                  aria-label="Close"
                >
                  ✕
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
                <div className="space-y-5 text-center">
                  <div className="flex items-center justify-center gap-2 text-[11px] text-gray-400">
                    <button
                      type="button"
                      onClick={() => setAmountMode('pay')}
                      className={`rounded-full border px-3 py-1 transition ${
                        amountMode === 'pay'
                          ? 'border-white/40 bg-white/10 text-white'
                          : 'border-white/10 text-gray-500'
                      }`}
                    >
                      You pay
                    </button>
                    <button
                      type="button"
                      onClick={() => setAmountMode('receive')}
                      className={`rounded-full border px-3 py-1 transition ${
                        amountMode === 'receive'
                          ? 'border-white/40 bg-white/10 text-white'
                          : 'border-white/10 text-gray-500'
                      }`}
                    >
                      You receive
                    </button>
                  </div>

                  <div className="flex items-baseline justify-center gap-2">
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
                      className={`w-56 bg-transparent text-center text-5xl font-semibold tracking-tight focus:outline-none ${
                        amountMuted ? 'text-gray-500' : 'text-white'
                      }`}
                    />
                    <span className="text-lg text-gray-500">USDC</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {formattedBalance ?? '0.00'} USDC available
                  </p>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-gray-500">You pay</span>
                      <span className={amountMode === 'receive' ? 'text-white' : 'text-gray-400'}>
                        {quoteLoading
                          ? 'Calculating…'
                          : derivedPayMinor !== null
                            ? `${formatUsdc(derivedPayMinor)} USDC`
                            : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-gray-500">You receive</span>
                      <span className={amountMode === 'pay' ? 'text-white' : 'text-gray-400'}>
                        {quoteLoading
                          ? 'Calculating…'
                          : derivedReceiveMinor !== null
                            ? `${formatUsdc(derivedReceiveMinor)} USDC`
                            : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-2">
                    {[25, 50, 75].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => {
                          if (!balanceMinor) return;
                          const available =
                            amountMode === 'receive'
                              ? balanceMinor > selectedFeeEstimateMinor
                                ? balanceMinor - selectedFeeEstimateMinor
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
                        const available =
                          amountMode === 'receive'
                            ? balanceMinor > selectedFeeEstimateMinor
                              ? balanceMinor - selectedFeeEstimateMinor
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
                  ) : (
                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      disabled={!parsedInputAmount || parsedInputAmount <= 0n}
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
                      className="rounded-2xl bg-[#121212] py-4 text-2xl text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
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
                      className="rounded-2xl bg-[#121212] py-4 text-2xl text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    >
                      ⌫
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-1 flex-col justify-between pb-6 pt-6 animate-slide-in">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-[#111111] p-3 text-xs text-gray-300 space-y-1.5">
                    <p>
                      Network:{' '}
                      <span className="text-white">{destinationConfig?.label ?? destination}</span>
                    </p>
                    {amountInput && (
                      <p>
                        {amountMode === 'receive' ? 'You receive' : 'You pay'}:{' '}
                        <span className="text-white">{amountInput} USDC</span>
                      </p>
                    )}
                  </div>
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
                        className="w-full rounded-2xl border border-white/10 bg-[#111111] px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                      />
                      <button
                        type="button"
                        onClick={handlePasteAddress}
                        className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-xs text-white transition hover:bg-white/10"
                      >
                        Paste
                      </button>
                    </div>
                    {destinationAddress.trim() && isAddress(destinationAddress.trim()) && (
                      <p className="mt-2 text-[11px] text-emerald-300">Address looks valid</p>
                    )}
                  </div>
                  {formError && <p className="text-xs text-red-400">{formError}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!isAddress(destinationAddress.trim())) {
                      setFormError('Destination address is invalid');
                      return;
                    }
                    setStep(4);
                  }}
                  disabled={!destinationAddress.trim()}
                  className="w-full rounded-2xl bg-white py-3 text-sm font-semibold text-black disabled:bg-white/10 disabled:text-white/40"
                >
                  Preview
                </button>
              </div>
            )}

            {step === 4 && (
              <div className="flex flex-1 flex-col justify-between pb-6 pt-6 animate-slide-in">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-[#111111] p-4 space-y-3">
                    <div className="text-center">
                      <p className="text-2xl font-semibold text-white">
                        {amountMode === 'pay'
                          ? formatUsdc(toNumberSafe(parsedInputAmount ?? 0n))
                          : quote
                            ? formatUsdc(quote.transfer_amount_usdc_minor)
                            : amountDisplay}{' '}
                        USDC
                      </p>
                      <p className="text-xs text-gray-500">{quoteTimeRemaining}</p>
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
                        <span className="text-white">{destinationAddress.trim() || '—'}</span>
                      </div>
                    </div>
                    <div className="border-t border-white/10 pt-3 space-y-1.5 text-xs text-gray-300">
                      {quoteLoading ? (
                        <p>Fetching quote...</p>
                      ) : quoteError ? (
                        <p className="text-red-400">{quoteError}</p>
                      ) : quote ? (
                        <>
                          <p>
                            You pay:{' '}
                            <span className="text-white">
                              {amountMode === 'pay'
                                ? formatUsdc(toNumberSafe(parsedInputAmount ?? 0n))
                                : formatUsdc(quote.total_burn_usdc_minor)}{' '}
                              USDC
                            </span>
                          </p>
                          <p>
                            You receive:{' '}
                            <span className="text-white">
                              {amountMode === 'receive'
                                ? formatUsdc(quote.transfer_amount_usdc_minor)
                                : formatUsdc(
                                    Math.max(
                                      0,
                                      toNumberSafe(parsedInputAmount ?? 0n) -
                                        quote.max_fee_usdc_minor
                                    )
                                  )}{' '}
                              USDC
                            </span>
                          </p>
                          <p>
                            Fees:{' '}
                            <span className="text-white">
                              {formatUsdc(quote.max_fee_usdc_minor)} USDC
                            </span>
                          </p>
                        </>
                      ) : (
                        <p>Enter amount to get a quote.</p>
                      )}
                    </div>
                  </div>

                  {quote && quoteExpired && (
                    <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-300 flex items-center justify-between gap-3">
                      <span>Quote expired. Refreshing automatically…</span>
                      <button
                        type="button"
                        onClick={() => setQuoteRefreshNonce((value) => value + 1)}
                        className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-2 py-1 text-[11px] text-yellow-200 transition hover:bg-yellow-500/20"
                      >
                        Refresh now
                      </button>
                    </div>
                  )}

                  {formError && <p className="text-xs text-red-400">{formError}</p>}
                  {insufficientBalance && (
                    <p className="text-xs text-yellow-300">
                      Insufficient USDC balance for this amount.
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
                      onClick={() => setStep(3)}
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
                        !destinationAddress.trim() ||
                        quoteLoading ||
                        !quote ||
                        quoteExpired ||
                        insufficientBalance ||
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
            {activeWalletAddress ?? '—'}
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
