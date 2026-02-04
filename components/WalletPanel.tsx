'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { usePrivy, useSendTransaction, useWallets } from '@privy-io/react-auth';
import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  getAddress,
  http,
  isAddress,
  parseUnits,
} from 'viem';
import { CHAIN_OPTIONS } from '@/lib/chains';

export function WalletPanel() {
  const { wallets } = useWallets();
  const { sendTransaction } = useSendTransaction();
  const { logout } = usePrivy();

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [nativeBalance, setNativeBalance] = useState<string | null>(null);
  const [nativeBalanceError, setNativeBalanceError] = useState<string | null>(null);
  const [balanceRefreshNonce, setBalanceRefreshNonce] = useState(0);
  const [copied, setCopied] = useState(false);
  const [selectedChainId, setSelectedChainId] = useState(() => {
    const baseOption = CHAIN_OPTIONS.find((option) => option.name === 'Base');
    return baseOption?.id ?? CHAIN_OPTIONS[0]?.id ?? 1;
  });

  const activeWalletAddress = wallets[0]?.address;
  const selectedChain = CHAIN_OPTIONS.find((option) => option.id === selectedChainId);
  const usdcAddress = selectedChain?.usdcAddress ?? null;
  const isSponsorshipChain =
    selectedChain?.chain.id === 8453 || selectedChain?.chain.id === 84532;
  const canSend = !!activeWalletAddress && !!selectedChain?.chain && !!usdcAddress && !sending;

  useEffect(() => {
    let cancelled = false;

    const fetchBalance = async () => {
      if (!activeWalletAddress || !selectedChain?.chain || !usdcAddress) {
        setBalance(null);
        setBalanceError(null);
        setNativeBalance(null);
        setNativeBalanceError(null);
        return;
      }

      setBalanceLoading(true);
      setBalanceError(null);
      setNativeBalanceError(null);

      try {
        const client = createPublicClient({
          chain: selectedChain.chain,
          transport: http(),
        });

        const result = await client.readContract({
          address: usdcAddress,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [activeWalletAddress],
        });
        const gas = await client.getBalance({
          address: getAddress(activeWalletAddress),
        });

        if (!cancelled) {
          setBalance(formatUnits(result, 6));
          setNativeBalance(formatUnits(gas, 18));
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Failed to load balance';
          setBalanceError(message);
          setBalance(null);
          setNativeBalance(null);
          setNativeBalanceError('Failed to load gas balance');
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
  }, [activeWalletAddress, selectedChain?.chain, usdcAddress, txHash, balanceRefreshNonce]);

  useEffect(() => {
    if (!activeWalletAddress || !selectedChain?.chain || !usdcAddress) return;
    const timerId = window.setInterval(() => {
      setBalanceRefreshNonce((value) => value + 1);
    }, 20_000);
    return () => window.clearInterval(timerId);
  }, [activeWalletAddress, selectedChain?.chain, usdcAddress]);

  const formattedBalance = useMemo(() => {
    if (!balance) return null;
    const numeric = Number(balance);
    if (Number.isNaN(numeric)) return balance;
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(numeric);
  }, [balance]);

  const parsedAmount = useMemo(() => {
    const trimmed = amount.trim();
    if (!trimmed) return null;
    try {
      return parseUnits(trimmed, 6);
    } catch {
      return null;
    }
  }, [amount]);

  const amountPreview = useMemo(() => {
    if (!parsedAmount) return null;
    return formatUnits(parsedAmount, 6);
  }, [parsedAmount]);

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setTxHash(null);

    if (!activeWalletAddress) {
      setFormError('No wallet connected');
      return;
    }

    const trimmedRecipient = recipient.trim();
    const trimmedAmount = amount.trim();

    if (!selectedChain?.chain) {
      setFormError('Selected network is not configured');
      return;
    }

    if (!usdcAddress) {
      setFormError('USDC is not available on this network');
      return;
    }

    if (!isAddress(trimmedRecipient)) {
      setFormError('Recipient address is invalid');
      return;
    }

    if (!trimmedAmount || Number.isNaN(Number(trimmedAmount)) || Number(trimmedAmount) <= 0) {
      setFormError('Enter a valid amount');
      return;
    }

    if (!parsedAmount || parsedAmount <= 0n) {
      setFormError('Enter a valid USDC amount with up to 6 decimals');
      return;
    }

    setSending(true);
    try {
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [trimmedRecipient, parsedAmount],
      });
      const result = await sendTransaction(
        {
          to: usdcAddress,
          data,
          value: 0n,
          chainId: selectedChain.chain.id,
        },
        {
          address: activeWalletAddress,
          sponsor: isSponsorshipChain,
        }
      );
      setTxHash(result.hash);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transaction failed';
      setFormError(message);
    } finally {
      setSending(false);
    }
  };

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

  return (
    <aside className="w-full rounded-xl border border-gray-800 bg-gray-900/40 p-5 space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400">Your wallet</p>
          <button
            type="button"
            onClick={logout}
            className="shrink-0 rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-200 transition hover:border-gray-500"
          >
            Logout
          </button>
        </div>
        <div className="-mx-1 mt-2 flex w-auto items-center gap-2 rounded-2xl border border-gray-700 bg-black/40 px-3 py-2">
          <p className="min-w-0 flex-1 break-all text-[11px] leading-4 text-white font-mono select-all">
            {activeWalletAddress ?? '—'}
          </p>
          {activeWalletAddress && (
            <button
              type="button"
              onClick={handleCopyAddress}
              className="shrink-0 rounded-md border border-gray-700 px-2 py-0.5 text-[11px] text-gray-200 transition hover:border-gray-500"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-1">USDC balance</p>
        {balanceLoading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : balanceError ? (
          <p className="text-sm text-red-400">{balanceError}</p>
        ) : (
          <p className="text-lg text-white">{formattedBalance ?? '0.00'}</p>
        )}
        <p className="text-xs text-gray-500 mt-2 mb-1">Gas balance ({selectedChain?.chain.nativeCurrency.symbol ?? 'ETH'})</p>
        {balanceLoading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : nativeBalanceError ? (
          <p className="text-sm text-red-400">{nativeBalanceError}</p>
        ) : (
          <p className="text-sm text-white">
            {nativeBalance
              ? Number(nativeBalance).toFixed(6)
              : '0.000000'}{' '}
            {selectedChain?.chain.nativeCurrency.symbol ?? 'ETH'}
          </p>
        )}
      </div>

      <form className="space-y-3 border-t border-gray-800 pt-4" onSubmit={handleSend}>
        <p className="text-xs text-gray-400">Send USDC</p>
        <select
          value={selectedChainId}
          onChange={(event) => setSelectedChainId(Number(event.target.value))}
          className="w-full rounded-md bg-black/40 border border-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        >
          {CHAIN_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
          placeholder="Recipient address (0x...)"
          className="w-full rounded-md bg-black/40 border border-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        />
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="Amount (USDC)"
          className="w-full rounded-md bg-black/40 border border-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        />

        <div className="rounded-md border border-gray-800 bg-black/30 p-3 space-y-1.5">
          <p className="text-xs text-gray-400">Transfer preview</p>
          <p className="text-xs text-gray-300">
            Amount:{' '}
            <span className="text-white font-medium">{amountPreview ?? '—'} USDC</span>
          </p>
          <p className="text-xs text-gray-300">
            Network: <span className="text-white font-medium">{selectedChain?.name ?? '—'}</span>
          </p>
          <p className="text-xs text-gray-300 break-all">
            To:{' '}
            <span className="text-white font-medium">{recipient.trim() || '—'}</span>
          </p>
          <p className="text-xs text-gray-300 break-all">
            Token: <span className="text-white font-medium">{usdcAddress ?? '—'}</span>
          </p>
        </div>

        {formError && <p className="text-xs text-red-400">{formError}</p>}
        {txHash && <p className="text-xs text-green-400 break-all">Tx sent: {txHash}</p>}
        <button
          type="submit"
          disabled={!canSend}
          className="w-full rounded-md bg-purple-600 px-3 py-2 text-sm font-semibold text-white transition disabled:opacity-50"
        >
          {sending ? 'Sending...' : 'Send USDC'}
        </button>
      </form>
    </aside>
  );
}
