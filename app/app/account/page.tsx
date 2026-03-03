'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useExportWallet, useModalStatus, usePrivy, useWallets } from '@privy-io/react-auth';
import { ArrowLeft, Check, Copy, KeyRound, LogOut, Mail } from 'lucide-react';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { truncateAddress } from '@/lib/format';

type LinkedAccountView = {
  type?: string;
  address?: string;
  email?: string;
};

function readLinkedAccount(account: unknown): LinkedAccountView {
  return (account ?? {}) as LinkedAccountView;
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z" />
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </svg>
  );
}

function SignInMethodIcon({ provider }: { provider: string }) {
  if (provider === 'Google') return <GoogleMark />;
  if (provider === 'Email') return null;

  return (
    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/20">
      <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
    </span>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { wallets } = useWallets();
  const { ready, authenticated, user, logout } = usePrivy();
  const { exportWallet } = useExportWallet();
  const { isOpen: isPrivyModalOpen } = useModalStatus();
  const debugRaw = searchParams.get('debug')?.trim().toLowerCase() ?? '';
  const isDebugPreview = process.env.NODE_ENV !== 'production' && (debugRaw === '1' || debugRaw === 'true');
  const [copied, setCopied] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isExportingKey, setIsExportingKey] = useState(false);

  const embeddedWalletAddress = useMemo(() => {
    const embedded = wallets.find(
      (wallet) => wallet.walletClientType === 'privy' || wallet.walletClientType === 'privy-v2'
    );
    return embedded?.address ?? null;
  }, [wallets]);
  const walletAddress = embeddedWalletAddress ?? wallets[0]?.address ?? null;
  const emailAddress = useMemo(() => {
    if (user?.email?.address) return user.email.address;
    const linkedEmail = user?.linkedAccounts.find((account) => {
      const raw = readLinkedAccount(account);
      if (raw.type === 'email' && typeof raw.address === 'string') return true;
      if (raw.type === 'google_oauth' && typeof raw.email === 'string') return true;
      return false;
    });
    const linkedEmailRaw = linkedEmail ? readLinkedAccount(linkedEmail) : null;
    return linkedEmailRaw?.address ?? linkedEmailRaw?.email ?? 'No email linked';
  }, [user?.email?.address, user?.linkedAccounts]);
  const authProvider = useMemo(() => {
    const linkedAccounts = user?.linkedAccounts ?? [];
    const hasGoogle = linkedAccounts.some((account) => {
      const raw = readLinkedAccount(account);
      return raw.type === 'google_oauth';
    });
    if (hasGoogle) return 'Google';
    const hasEmail = linkedAccounts.some((account) => {
      const raw = readLinkedAccount(account);
      return raw.type === 'email';
    });
    if (hasEmail) return 'Email';
    return 'Other';
  }, [user?.linkedAccounts]);
  const effectiveWalletAddress = walletAddress ?? (isDebugPreview ? '0xdebug000000000000000000000000000000000000' : null);
  const effectiveEmailAddress = isDebugPreview && !authenticated ? 'player@example.com' : emailAddress;
  const effectiveAuthProvider = isDebugPreview && !authenticated ? 'Debug preview' : authProvider;

  useEffect(() => {
    if (isDebugPreview) return;
    if (!ready) return;
    if (!authenticated) {
      router.replace('/');
    }
  }, [authenticated, isDebugPreview, ready, router]);

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
    if (!effectiveWalletAddress) return;
    const ok = await copyText(effectiveWalletAddress);
    setCopied(ok);
    if (ok) {
      window.setTimeout(() => setCopied(false), 1800);
    }
  }, [copyText, effectiveWalletAddress]);

  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.replace(isDebugPreview ? '/app?debug=1&tab=wallet' : '/app?tab=wallet');
  }, [isDebugPreview, router]);

  const handleLogout = useCallback(async () => {
    if (isLoggingOut) return;
    if (isDebugPreview && !authenticated) {
      router.replace('/debug');
      return;
    }
    setIsLoggingOut(true);
    try {
      await logout();
      router.replace('/');
    } finally {
      setIsLoggingOut(false);
    }
  }, [authenticated, isDebugPreview, isLoggingOut, logout, router]);

  const handleExportPrivateKey = useCallback(async () => {
    if (!authenticated) return;
    if (!embeddedWalletAddress || isExportingKey) return;
    setIsExportingKey(true);
    try {
      await exportWallet({ address: embeddedWalletAddress });
    } finally {
      setIsExportingKey(false);
    }
  }, [authenticated, embeddedWalletAddress, exportWallet, isExportingKey]);

  if (!ready && !isDebugPreview) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!authenticated && !isDebugPreview) {
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
                <span
                  className={`inline-flex items-center text-sm text-gray-300 ${
                    effectiveAuthProvider === 'Email' ? '' : 'gap-2'
                  }`}
                >
                  {effectiveAuthProvider === 'Email' ? null : <SignInMethodIcon provider={effectiveAuthProvider} />}
                  Sign-in method
                </span>
                <span className="font-num text-right text-sm text-white">{effectiveAuthProvider}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
                <span className="inline-flex items-center gap-2 text-sm text-gray-300">
                  <Mail size={15} />
                  Email
                </span>
                <span className="font-num max-w-[65%] truncate text-right text-sm text-white">
                  {effectiveEmailAddress}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-num truncate text-base font-semibold leading-6 text-white">
                    {effectiveWalletAddress ? truncateAddress(effectiveWalletAddress) : 'Not connected'}
                  </p>
                  <p className="text-[13px] text-gray-500">
                    {embeddedWalletAddress
                      ? 'Embedded wallet'
                      : 'External wallet'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopyWalletAddress()}
                  disabled={!effectiveWalletAddress}
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
