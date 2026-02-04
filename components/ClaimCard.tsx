'use client';

import { PayoutStatus } from '@/types/payout';
import { StatusBadge } from './StatusBadge';
import { LoadingSpinner } from './LoadingSpinner';

interface ClaimCardProps {
  amount: string;
  chain: string;
  rank?: number;
  status: PayoutStatus;
  expiresAt: number;
  maskedEmail: string;
  txHash?: string;
  onConnect: () => void;
  onClaim: () => void;
  isLoading: boolean;
  walletAddress?: string;
  isAuthenticated: boolean;
  isPrivyReady: boolean;
}

function formatTimeRemaining(expiresAt: number): string {
  // Backend may return Unix seconds or milliseconds; normalize to ms.
  const expiresAtMs = expiresAt < 1_000_000_000_000 ? expiresAt * 1000 : expiresAt;
  const now = Date.now();
  const diff = expiresAtMs - now;

  if (diff <= 0) return 'Expired';

  const totalMinutes = Math.floor(diff / (1000 * 60));
  if (totalMinutes < 60) {
    const minutes = Math.max(totalMinutes, 1);
    return `Expires in ${minutes} minute${minutes > 1 ? 's' : ''}`;
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) {
    return `Expires in ${days} day${days > 1 ? 's' : ''}`;
  }
  return `Expires in ${hours} hour${hours > 1 ? 's' : ''}`;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function USDCIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <path
        d="M20.5 18.5C20.5 16.5 19 15.5 16 15C14 14.5 13.5 14 13.5 13C13.5 12 14.5 11.5 16 11.5C17.5 11.5 18.5 12 19 13L21 12C20.5 10.5 19 9.5 17 9V7H15V9C12.5 9.5 11 11 11 13C11 15 12.5 16 15.5 16.5C17.5 17 18 17.5 18 18.5C18 19.5 17 20.5 15.5 20.5C14 20.5 12.5 19.5 12 18L10 19C10.5 21 12.5 22.5 15 23V25H17V23C19.5 22.5 21 21 20.5 18.5Z"
        fill="white"
      />
    </svg>
  );
}

export function ClaimCard({
  amount,
  chain,
  rank,
  status,
  expiresAt,
  maskedEmail,
  txHash,
  onConnect,
  onClaim,
  isLoading,
  walletAddress,
  isAuthenticated,
  isPrivyReady,
}: ClaimCardProps) {
  const canClaim = status === 'CREATED' && isAuthenticated && walletAddress;
  const showConnectButton = status === 'CREATED' && !isAuthenticated;
  const showClaimButton = status === 'CREATED' && isAuthenticated && walletAddress;
  const isPaid = status === 'PAID';
  const isExpired = status === 'EXPIRED';
  const isCancelled = status === 'CANCELLED';
  const isFailed = status === 'FAILED';
  const isPending = status === 'PENDING_APPROVAL' || status === 'PAYING';

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="relative p-[1px] rounded-2xl bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500">
        <div className="bg-[#0f0f0f] rounded-2xl p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <USDCIcon />
              <div>
                <p className="text-2xl font-bold text-white">{amount}</p>
                <p className="text-sm text-gray-400 capitalize">{chain} Network</p>
              </div>
            </div>
            {rank && (
              <div className="bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-bold px-3 py-1 rounded-full text-sm">
                #{rank}
              </div>
            )}
          </div>

          {/* Status */}
          <div className="flex items-center justify-between">
            <StatusBadge status={status} />
            {!isExpired && !isCancelled && !isFailed && !isPaid && (
              <span className="text-sm text-gray-400">{formatTimeRemaining(expiresAt)}</span>
            )}
          </div>

          {/* Email info */}
          <div className="bg-gray-800/50 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1">Prize recipient</p>
            <p className="text-sm text-white">{maskedEmail}</p>
          </div>

          {/* Wallet address (if connected) */}
          {isAuthenticated && walletAddress && (
            <div className="bg-gray-800/50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Your wallet</p>
              <p className="text-sm text-white font-mono">{truncateAddress(walletAddress)}</p>
            </div>
          )}

          {/* Transaction hash (if paid) */}
          {isPaid && txHash && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
              <p className="text-xs text-green-400 mb-1">Transaction</p>
              <a
                href={`https://basescan.org/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-green-400 font-mono hover:underline"
              >
                {truncateAddress(txHash)}
              </a>
            </div>
          )}

          {/* Action buttons */}
          {!isPrivyReady ? (
            <button
              disabled
              className="w-full py-3 px-4 rounded-lg font-medium bg-gray-700 text-gray-400 cursor-not-allowed flex items-center justify-center gap-2"
            >
              <LoadingSpinner size="sm" />
              Loading...
            </button>
          ) : showConnectButton ? (
            <button
              onClick={onConnect}
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-lg font-medium bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <LoadingSpinner size="sm" />
                  Connecting...
                </>
              ) : (
                'Connect Wallet'
              )}
            </button>
          ) : showClaimButton ? (
            <button
              onClick={onClaim}
              disabled={isLoading || !canClaim}
              className="w-full py-3 px-4 rounded-lg font-medium bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <LoadingSpinner size="sm" />
                  Claiming...
                </>
              ) : (
                'Claim Prize'
              )}
            </button>
          ) : isPending ? (
            <div className="w-full py-3 px-4 rounded-lg font-medium bg-yellow-500/20 text-yellow-400 text-center">
              Claim submitted - awaiting approval
            </div>
          ) : isPaid ? (
            <div className="w-full py-3 px-4 rounded-lg font-medium bg-green-500/20 text-green-400 text-center">
              Prize claimed successfully
            </div>
          ) : isExpired ? (
            <div className="w-full py-3 px-4 rounded-lg font-medium bg-gray-500/20 text-gray-400 text-center">
              This claim has expired
            </div>
          ) : isCancelled || isFailed ? (
            <div className="w-full py-3 px-4 rounded-lg font-medium bg-red-500/20 text-red-400 text-center">
              {isCancelled ? 'This claim was cancelled' : 'Claim failed - contact support'}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
