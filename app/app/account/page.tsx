'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useExportWallet, useModalStatus, usePrivy, useWallets } from '@privy-io/react-auth';
import { ArrowLeft, Check, Copy, KeyRound, LogOut, Mail } from 'lucide-react';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { truncateAddress } from '@/lib/format';

export default function AccountPage() {
  const router = useRouter();
  const { wallets } = useWallets();
  const { ready, authenticated, user, logout } = usePrivy();
  const { exportWallet } = useExportWallet();
  const { isOpen: isPrivyModalOpen } = useModalStatus();
  const [copied, setCopied] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isExportingKey, setIsExportingKey] = useState(false);

  const walletAddress = wallets[0]?.address ?? null;
  const emailAddress = useMemo(() => {
    if (user?.email?.address) return user.email.address;
    const linkedEmail = user?.linkedAccounts.find((account) => {
      const raw = account as Record<string, unknown>;
      return raw.type === 'email' && typeof raw.address === 'string';
    }) as { address?: string } | undefined;
    return linkedEmail?.address ?? 'No email linked';
  }, [user?.email?.address, user?.linkedAccounts]);
  const embeddedWalletAddress = useMemo(() => {
    const embedded = wallets.find(
      (wallet) => wallet.walletClientType === 'privy' || wallet.walletClientType === 'privy-v2'
    );
    return embedded?.address ?? null;
  }, [wallets]);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      router.replace('/');
    }
  }, [authenticated, ready, router]);

  useEffect(() => {
    if (isPrivyModalOpen) return;
    setIsExportingKey(false);
  }, [isPrivyModalOpen]);

  const copyText = useCallback(async (value: string): Promise<boolean> => {
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        return true;
      }
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (!ok) {
        throw new Error('copy failed');
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  const handleCopyWalletAddress = useCallback(async () => {
    if (!walletAddress) return;
    const ok = await copyText(walletAddress);
    setCopied(ok);
    if (ok) {
      window.setTimeout(() => setCopied(false), 1800);
    }
  }, [copyText, walletAddress]);

  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.replace('/app?tab=wallet');
  }, [router]);

  const handleLogout = useCallback(async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
      router.replace('/');
    } finally {
      setIsLoggingOut(false);
    }
  }, [isLoggingOut, logout, router]);

  const handleExportPrivateKey = useCallback(async () => {
    if (!embeddedWalletAddress || isExportingKey) return;
    setIsExportingKey(true);
    try {
      await exportWallet({ address: embeddedWalletAddress });
    } finally {
      setIsExportingKey(false);
    }
  }, [embeddedWalletAddress, exportWallet, isExportingKey]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!authenticated) {
    return null;
  }

  return (
    <main className="h-[100dvh] overflow-hidden bg-[#0a0a0a]">
      <div className="mx-auto flex h-full w-full max-w-md flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        <header className="px-1">
          <div className="relative flex h-10 items-center justify-center">
            <button
              type="button"
              onClick={handleBack}
              className="absolute left-0 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-gray-200 transition hover:border-white/25 hover:bg-white/10 hover:text-white"
              aria-label="Back to app"
            >
              <ArrowLeft size={18} />
            </button>
            <h1 className="font-num text-base font-semibold tracking-[0.01em] text-white">Account</h1>
          </div>
        </header>

        <div className="transient-scrollbar mt-4 min-h-0 flex-1 space-y-2.5 overflow-y-auto pb-3">
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="font-num text-base font-semibold tracking-[0.01em] text-white">Account details</p>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
                <span className="inline-flex items-center gap-2 text-sm text-gray-300">
                  <Mail size={15} />
                  Email
                </span>
                <span className="font-num max-w-[65%] truncate text-right text-sm text-white">
                  {emailAddress}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-num truncate text-base font-semibold leading-6 text-white">
                    {walletAddress ? truncateAddress(walletAddress) : 'Not connected'}
                  </p>
                  <p className="text-[13px] text-gray-500">
                    {wallets[0]?.walletClientType === 'privy' || wallets[0]?.walletClientType === 'privy-v2'
                      ? 'Embedded wallet'
                      : 'External wallet'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopyWalletAddress()}
                  disabled={!walletAddress}
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition ${
                    copied
                      ? 'border-emerald-300/45 bg-emerald-400/10 text-emerald-200'
                      : 'border-white/15 bg-white/5 text-gray-200 hover:border-white/25 hover:bg-white/10 hover:text-white'
                  } disabled:opacity-60`}
                  aria-label={copied ? 'Address copied' : 'Copy wallet address'}
                  title={copied ? 'Copied' : 'Copy address'}
                >
                  {copied ? <Check size={16} strokeWidth={2.1} /> : <Copy size={15} strokeWidth={1.9} />}
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="font-num text-base font-semibold tracking-[0.01em] text-white">Actions</p>
            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={() => void handleExportPrivateKey()}
                disabled={!embeddedWalletAddress || isExportingKey}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-amber-400/45 bg-amber-500/10 px-3 text-sm font-medium text-amber-100 transition hover:border-amber-300/60 hover:bg-amber-500/16 disabled:cursor-not-allowed disabled:opacity-50"
                title={
                  embeddedWalletAddress
                    ? 'Export embedded wallet private key'
                    : 'Private key export is available only for embedded wallets'
                }
              >
                <KeyRound size={14} strokeWidth={2} />
                <span>{isExportingKey ? 'Opening export...' : 'Export private key'}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={isLoggingOut}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-red-500/45 bg-red-500/10 px-3 text-sm font-medium text-red-200 transition hover:border-red-400/60 hover:bg-red-500/16 disabled:opacity-60"
              >
                <LogOut size={14} />
                <span>{isLoggingOut ? 'Logging out...' : 'Log out'}</span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
