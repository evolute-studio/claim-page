'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy, useSendTransaction, useWallets } from '@privy-io/react-auth';
import { UserPill } from '@privy-io/react-auth/ui';
import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  http,
  isAddress,
  parseUnits,
} from 'viem';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { CHAIN_OPTIONS } from '@/lib/chains';

function getStoredLoginFlag(): boolean {
  try {
    return localStorage.getItem('privy_logged_in') === 'true';
  } catch {
    return false;
  }
}

export default function WalletPage() {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { sendTransaction } = useSendTransaction();

  const hasStoredLogin = useMemo(getStoredLoginFlag, []);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceRefreshNonce, setBalanceRefreshNonce] = useState(0);
  const [selectedChainId, setSelectedChainId] = useState(() => {
    const baseOption = CHAIN_OPTIONS.find((option) => option.name === 'Base');
    return baseOption?.id ?? CHAIN_OPTIONS[0]?.id ?? 1;
  });

  const activeWalletAddress = wallets[0]?.address;
  const selectedChain = CHAIN_OPTIONS.find((option) => option.id === selectedChainId);
  const usdcAddress = selectedChain?.usdcAddress ?? null;
  const canSend =
    !!activeWalletAddress && !!selectedChain?.chain && !!usdcAddress && !sending;

  useEffect(() => {
    let cancelled = false;

    const fetchBalance = async () => {
      if (!activeWalletAddress || !selectedChain?.chain || !usdcAddress) {
        setBalance(null);
        setBalanceError(null);
        return;
      }

      setBalanceLoading(true);
      setBalanceError(null);

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

        if (!cancelled) {
          setBalance(formatUnits(result, 6));
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Failed to load balance';
          setBalanceError(message);
          setBalance(null);
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

  const handleRefreshBalance = () => {
    setBalanceRefreshNonce((value) => value + 1);
  };

  useEffect(() => {
    if (!ready) return;
    if (!authenticated || !hasStoredLogin) {
      try {
        localStorage.removeItem('privy_logged_in');
      } catch {
        // Ignore storage errors
      }
      router.replace('/claim');
    }
  }, [ready, authenticated, hasStoredLogin, router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!authenticated || !hasStoredLogin) {
    return null;
  }

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

    setSending(true);
    try {
      const value = parseUnits(trimmedAmount, 6);
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [trimmedRecipient, value],
      });
      const result = await sendTransaction(
        {
          to: usdcAddress,
          data,
          value: 0n,
          chainId: selectedChain.chain.id,
        },
        { address: activeWalletAddress }
      );
      setTxHash(result.hash);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transaction failed';
      setFormError(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="mb-8 w-full max-w-md mx-auto flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Wallet</h1>
        <UserPill />
      </div>

      <div className="w-full max-w-md mx-auto bg-gray-900/40 border border-gray-800 rounded-xl p-6 space-y-4">
        <div>
          <p className="text-xs text-gray-400 mb-1">Status</p>
          <p className="text-sm text-white">Connected</p>
        </div>

        <div>
          <p className="text-xs text-gray-400 mb-2">Wallets</p>
          {wallets.length === 0 ? (
            <p className="text-sm text-gray-400">No wallets found</p>
          ) : (
            <div className="space-y-2">
              {wallets.map((wallet) => (
                <div
                  key={wallet.address}
                  className="bg-black/40 border border-gray-800 rounded-lg p-3"
                >
                  <p className="text-xs text-gray-500 mb-1">Address</p>
                  <p className="text-sm text-white font-mono break-all">{wallet.address}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-gray-800 space-y-3">
          <p className="text-xs text-gray-400 mb-2">Send USDC</p>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-gray-500 mb-1">USDC balance</p>
              {balanceLoading ? (
                <p className="text-xs text-gray-400">Loading...</p>
              ) : balanceError ? (
                <p className="text-xs text-red-400">{balanceError}</p>
              ) : (
                <p className="text-sm text-white">{formattedBalance ?? '0.00'}</p>
              )}
            </div>
            <button
              type="button"
              onClick={handleRefreshBalance}
              className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-200 transition hover:border-gray-500 disabled:opacity-50"
              disabled={balanceLoading}
            >
              Refresh
            </button>
          </div>
          <form className="space-y-3" onSubmit={handleSend}>
            <div>
              <label className="block text-xs text-gray-500 mb-1" htmlFor="network">
                Network
              </label>
              <select
                id="network"
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
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-1">USDC contract</p>
              <p className="text-xs text-gray-300 break-all">
                {usdcAddress ?? 'USDC not available on this network'}
              </p>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1" htmlFor="recipient">
                Recipient
              </label>
              <input
                id="recipient"
                type="text"
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="0x..."
                className="w-full rounded-md bg-black/40 border border-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1" htmlFor="amount">
                Amount (USDC)
              </label>
              <input
                id="amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.01"
                className="w-full rounded-md bg-black/40 border border-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              />
            </div>

            {formError && <p className="text-xs text-red-400">{formError}</p>}
            {txHash && (
              <p className="text-xs text-green-400 break-all">Tx sent: {txHash}</p>
            )}

            <button
              type="submit"
              disabled={!canSend}
              className="w-full rounded-md bg-purple-600 px-3 py-2 text-sm font-semibold text-white transition disabled:opacity-50"
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
