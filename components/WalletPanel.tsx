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
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceMinor, setBalanceMinor] = useState<bigint | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceRefreshNonce, setBalanceRefreshNonce] = useState(0);
  const [copied, setCopied] = useState(false);
  const [destinationMenuOpen, setDestinationMenuOpen] = useState(false);
  const [withdrawalId, setWithdrawalId] = useState<string | null>(null);
  const [withdrawalStatus, setWithdrawalStatus] = useState<WithdrawalStatus | null>(null);
  const [burnTxHash, setBurnTxHash] = useState<string | null>(null);
  const [forwardTxHash, setForwardTxHash] = useState<string | null>(null);
  const [feeEstimateMinor, setFeeEstimateMinor] = useState<bigint>(0n);
  const quoteRequestId = useRef(0);

  const activeWalletAddress = wallets[0]?.address ?? null;
  const destinationChains = useMemo(
    () => getDestinationChains(config.sourceChain),
    [config.sourceChain]
  );
  const destinationConfig = getDestinationConfig(destination, config.sourceChain);
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
    if (!destinationMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDestinationMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [destinationMenuOpen]);

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
  };

  const handleCloseWithdraw = () => {
    if (sending) return;
    setFormError(null);
    setWithdrawOpen(false);
  };

  const resetFlow = () => {
    setWithdrawalId(null);
    setWithdrawalStatus(null);
    setBurnTxHash(null);
    setForwardTxHash(null);
    setFormError(null);
    setSending(false);
  };

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

  if (destinationMenuOpen) {
    return (
      <section className="w-full rounded-2xl border border-white/10 bg-[#0a0f1f] p-3 shadow-[0_12px_40px_rgba(4,7,20,0.45)] backdrop-blur animate-fade-in-up">
        <div className="mb-2 flex items-center justify-between px-1 py-1">
          <p className="text-base font-semibold text-white">Choose destination</p>
          <button
            type="button"
            onClick={() => setDestinationMenuOpen(false)}
            className="rounded-md border border-white/10 bg-[#161c33] px-2.5 py-1 text-xs text-gray-200 transition hover:bg-[#1d2542]"
          >
            Close
          </button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto pr-1">
          {destinationChains.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => {
                setDestination(option.key);
                setDestinationMenuOpen(false);
              }}
              className={`mb-1.5 flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm transition ${
                destination === option.key
                  ? 'bg-violet-500/25 text-white'
                  : 'bg-[#141a30] text-gray-200 hover:bg-[#1a223d]'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <NetworkIcon chainName={option.label} size={18} />
                <span>{option.label}</span>
              </span>
              {destination === option.key ? <span>✓</span> : null}
            </button>
          ))}
        </div>
      </section>
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
      ) : (
        <form className="space-y-3 border-t border-white/10 pt-4" onSubmit={handleWithdraw}>
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.12em] text-gray-400">Withdraw details</p>
            {quote && (
              <span className="text-[11px] text-gray-400">
                Quote {quoteTimeRemaining || '—'}
              </span>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">Amount mode</p>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => setAmountMode('receive')}
                  className={`rounded-full border px-2.5 py-1 transition ${
                    amountMode === 'receive'
                      ? 'border-violet-400 bg-violet-500/20 text-violet-200'
                      : 'border-white/15 bg-white/5 text-gray-300 hover:bg-white/10'
                  }`}
                >
                  You receive
                </button>
                <button
                  type="button"
                  onClick={() => setAmountMode('pay')}
                  className={`rounded-full border px-2.5 py-1 transition ${
                    amountMode === 'pay'
                      ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                      : 'border-white/15 bg-white/5 text-gray-300 hover:bg-white/10'
                  }`}
                >
                  You pay
                </button>
              </div>
            </div>

            <div className="mt-3 grid gap-3">
              <label className="text-[11px] uppercase tracking-[0.12em] text-gray-500">
                {amountMode === 'receive' ? 'You receive' : 'You pay'}
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={amountInput}
                onChange={(event) => setAmountInput(event.target.value)}
                placeholder={amountMode === 'receive' ? 'Amount to receive (USDC)' : 'Amount to pay (USDC)'}
                className="w-full rounded-xl bg-black/35 border border-white/10 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setDestinationMenuOpen(true)}
            className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm text-white transition hover:bg-white/5"
          >
            <span className="inline-flex items-center gap-2">
              <NetworkIcon chainName={destinationConfig?.label ?? 'Network'} size={18} />
              <span>{destinationConfig?.label ?? 'Select network'}</span>
            </span>
            <span className="text-gray-400">Select</span>
          </button>

          <input
            type="text"
            value={destinationAddress}
            onChange={(event) => setDestinationAddress(event.target.value)}
            placeholder="Destination address (0x...)"
            className="w-full rounded-xl bg-black/35 border border-white/10 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          />

          <div className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-1.5">
            <p className="text-xs text-gray-400">Fee breakdown</p>
            {quoteLoading ? (
              <p className="text-xs text-gray-300">Fetching quote...</p>
            ) : quoteError ? (
              <p className="text-xs text-red-400">{quoteError}</p>
            ) : quote ? (
              <>
                <p className="text-xs text-gray-300">
                  You pay:{' '}
                  <span className="text-white">
                    {amountMode === 'pay'
                      ? formatUsdc(toNumberSafe(parsedInputAmount ?? 0n))
                      : formatUsdc(quote.total_burn_usdc_minor)}{' '}
                    USDC
                  </span>
                </p>
                <p className="text-xs text-gray-300">
                  You receive:{' '}
                  <span className="text-white">
                    {amountMode === 'receive'
                      ? formatUsdc(quote.transfer_amount_usdc_minor)
                      : formatUsdc(
                          Math.max(
                            0,
                            toNumberSafe(parsedInputAmount ?? 0n) - quote.max_fee_usdc_minor
                          )
                        )}{' '}
                    USDC
                  </span>
                </p>
                <p className="text-xs text-gray-300">
                  Protocol fee: <span className="text-white">{formatUsdc(quote.fee_protocol_usdc_minor)} USDC</span>
                </p>
                <p className="text-xs text-gray-300">
                  Forwarding fee: <span className="text-white">{formatUsdc(quote.fee_forward_usdc_minor)} USDC</span>
                </p>
                <p className="text-xs text-gray-300">
                  Max fee: <span className="text-white">{formatUsdc(quote.max_fee_usdc_minor)} USDC</span>
                </p>
                <p className="text-xs text-gray-300">
                  Total burn: <span className="text-white">{formatUsdc(quote.total_burn_usdc_minor)} USDC</span>
                </p>
              </>
            ) : (
              <p className="text-xs text-gray-400">Enter amount to get a quote.</p>
            )}
          </div>

          {quote && quoteExpired && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-300 flex items-center justify-between gap-3">
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
            <p className="text-xs text-yellow-300">Insufficient USDC balance for this amount.</p>
          )}

          {(withdrawalId || burnTxHash) && (
            <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-gray-300 space-y-1">
              <p>Withdrawal status: <span className="text-white">{withdrawalStatus ?? 'CREATED'}</span></p>
              {burnTxHash && (
                <p className="break-all">
                  {destination === 'base' ? 'Transfer tx:' : 'Burn tx:'}{' '}
                  <a className="text-purple-300 hover:underline" href={`${baseExplorerBase}${burnTxHash}`} target="_blank" rel="noreferrer">{burnTxHash}</a>
                </p>
              )}
              {forwardTxHash && destinationConfig && (
                <p className="break-all">
                  Mint tx: <a className="text-purple-300 hover:underline" href={`${destinationConfig.explorerTxBase}${forwardTxHash}`} target="_blank" rel="noreferrer">{forwardTxHash}</a>
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCloseWithdraw}
              disabled={sending}
              className="flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm font-semibold text-gray-100 transition hover:bg-white/10 disabled:opacity-50"
            >
              Close
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
              className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-3 py-2.5 text-sm font-semibold text-white transition hover:from-indigo-400 hover:to-violet-400 disabled:opacity-50"
            >
              {sending ? 'Submitting...' : isProcessingWithdrawal ? 'Processing...' : 'Confirm withdraw'}
            </button>
          </div>

          {withdrawalId && forwardTxHash && (
            <button
              type="button"
              onClick={resetFlow}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-gray-100 transition hover:bg-white/10"
            >
              Start new withdrawal
            </button>
          )}
        </form>
      )}
    </aside>
  );
}
