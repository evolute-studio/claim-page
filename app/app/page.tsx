'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useCreateWallet, usePrivy, useWallets } from '@privy-io/react-auth';
import { Check, Copy } from 'lucide-react';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { WalletPanel } from '@/components/WalletPanel';
import { HistoryPanel } from '@/components/HistoryPanel';
import { truncateAddress } from '@/lib/format';

type AppTab = 'wallet' | 'history';

function AccountIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[21px] w-[21px] shrink-0 text-gray-300"
      fill="none"
      aria-hidden="false"
    >
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="2.1" />
      <path
        d="M5.5 18a6.5 6.5 0 0 1 13 0"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WalletIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-5 w-5 ${active ? 'text-white' : 'text-gray-400'}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M3 8a2 2 0 0 1 2-2h13a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H5a2 2 0 0 1-2-2V8Z" />
      <path d="M16 12h5" />
      <circle cx="16" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function HistoryIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-5 w-5 ${active ? 'text-white' : 'text-gray-400'}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M12 7v5l3 2" />
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

export default function AppPage() {
  const router = useRouter();
  const routerRef = useRef(router);
  const walletCreateAttemptedRef = useRef(false);
  const searchParams = useSearchParams();
  const { wallets, ready: walletsReady } = useWallets();
  const { createWallet } = useCreateWallet();
  const { ready, authenticated } = usePrivy();
  const [focusToken, setFocusToken] = useState<string | null>(null);
  const [focusPayoutRef, setFocusPayoutRef] = useState<string | null>(null);
  const [focusWithdrawalRef, setFocusWithdrawalRef] = useState<string | null>(null);
  const [focusTargetTab, setFocusTargetTab] = useState<AppTab | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('wallet');
  const [copied, setCopied] = useState(false);
  const [isCreatingEmbeddedWallet, setIsCreatingEmbeddedWallet] = useState(false);
  const queryFocusToken = searchParams.get('focusToken');
  const queryFocusPayout = searchParams.get('focusPayout');
  const queryFocusWithdrawal = searchParams.get('focusWithdrawal');
  const queryTab = searchParams.get('tab');
  const walletAddress = wallets[0]?.address ?? null;

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      walletCreateAttemptedRef.current = false;
      router.replace('/');
    }
  }, [ready, authenticated, router]);

  useEffect(() => {
    if (!ready || !authenticated || !walletsReady) return;
    const hasEmbeddedWallet = wallets.some(
      (wallet) => wallet.walletClientType === 'privy' || wallet.walletClientType === 'privy-v2'
    );
    if (hasEmbeddedWallet || walletCreateAttemptedRef.current) return;

    walletCreateAttemptedRef.current = true;
    setIsCreatingEmbeddedWallet(true);
    void createWallet()
      .catch((error: unknown) => {
        console.error('Failed to create embedded wallet after login', error);
      })
      .finally(() => {
        setIsCreatingEmbeddedWallet(false);
      });
  }, [authenticated, createWallet, ready, wallets, walletsReady]);

  useEffect(() => {
    if (!queryFocusToken && !queryFocusPayout && !queryFocusWithdrawal) return;
    setFocusToken(queryFocusToken);
    setFocusPayoutRef(queryFocusPayout);
    setFocusWithdrawalRef(queryFocusWithdrawal);
    setFocusTargetTab(queryTab === 'history' ? 'history' : queryFocusWithdrawal ? 'history' : 'wallet');
  }, [queryFocusPayout, queryFocusToken, queryFocusWithdrawal, queryTab]);

  useEffect(() => {
    if (queryTab === 'wallet' || queryTab === 'history') {
      setActiveTab(queryTab);
      return;
    }
    if (queryTab === 'payouts' || queryTab === 'withdrawals') {
      setActiveTab('history');
      routerRef.current.replace('/app?tab=history');
    }
  }, [queryTab]);

  const handleTabChange = (tab: AppTab) => {
    setActiveTab(tab);
    router.replace(`/app?tab=${tab}`);
  };

  const handleClaimedPayoutFocus = useCallback(
    (next: { focusToken?: string | null; focusPayoutRef?: string | null }) => {
      setFocusToken(next.focusToken ?? null);
      setFocusPayoutRef(next.focusPayoutRef ?? null);
      setFocusWithdrawalRef(null);
      setFocusTargetTab('history');
      setActiveTab('history');
      router.replace('/app?tab=history');
    },
    [router]
  );

  const handleCreatedWithdrawalFocus = useCallback(
    (next: { focusWithdrawalRef?: string | null }) => {
      const withdrawalRef = next.focusWithdrawalRef ?? null;
      setFocusToken(null);
      setFocusPayoutRef(null);
      setFocusWithdrawalRef(withdrawalRef);
      setFocusTargetTab('history');
      setActiveTab('history');
      const params = new URLSearchParams();
      params.set('tab', 'history');
      if (withdrawalRef) params.set('focusWithdrawal', withdrawalRef);
      router.replace(`/app?${params.toString()}`);
    },
    [router]
  );

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

  if (isCreatingEmbeddedWallet && !walletAddress) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-3 text-sm text-gray-400">Setting up your embedded wallet...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="h-[100dvh] overflow-hidden bg-[#0a0a0a]">
      <div className="mx-auto flex h-full w-full max-w-md flex-col px-4 pt-4">
        <header className="relative mb-4 px-1 py-1">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => void handleCopyWalletAddress()}
              disabled={!walletAddress}
              className={`relative inline-flex h-10 min-w-0 max-w-[70%] items-center justify-center gap-2 rounded-full border bg-white/5 px-3 transition-[background-color,border-color,color,transform,opacity] duration-300 ease-out ${
                walletAddress
                  ? 'cursor-copy border-white/15 hover:border-white/25 hover:bg-white/10'
                  : 'cursor-default border-white/10 opacity-70'
              }`}
              aria-label="Copy wallet address"
              title={copied ? 'Copied' : 'Copy address'}
            >
              <span className="inline-flex min-w-0 items-center gap-1 overflow-hidden">
                <AccountIcon />
                <span className="truncate text-base font-semibold text-white">
                  {walletAddress ? truncateAddress(walletAddress) : '—'}
                </span>
              </span>
              {walletAddress ? (
                <span
                  className={`relative inline-flex h-5 w-5 shrink-0 self-center items-center justify-center transition-colors duration-300 ease-out ${
                    copied ? 'text-emerald-300' : 'text-gray-400'
                  }`}
                  aria-hidden="true"
                >
                  <span
                    className={`absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center justify-center transition-opacity duration-[320ms] ease-out ${
                      copied ? 'opacity-0' : 'opacity-100'
                    }`}
                  >
                    <Copy size={16} strokeWidth={1.9} className="block" />
                  </span>
                  <span
                    className={`absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center justify-center transition-opacity duration-[320ms] ease-out ${
                      copied ? 'opacity-100' : 'opacity-0'
                    }`}
                  >
                    <Check size={16} strokeWidth={2.1} className="block" />
                  </span>
                </span>
              ) : null}
              {walletAddress ? (
                <span
                  className={`pointer-events-none absolute left-[calc(100%+0.5rem)] top-1/2 z-20 -translate-y-1/2 whitespace-nowrap rounded-lg border border-white/20 bg-white px-2.5 py-1 text-xs font-medium text-black shadow-[0_8px_22px_rgba(0,0,0,0.35)] transition-[opacity,transform,filter] duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    copied ? 'translate-x-0 opacity-100 blur-0' : 'translate-x-2 opacity-0 blur-[1.5px]'
                  }`}
                >
                  Copied
                </span>
              ) : null}
            </button>

            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-gray-200 transition hover:border-white/25 hover:bg-white/10 hover:text-white"
              onClick={() => router.push('/app/account')}
              aria-label="Open account page"
            >
              <MenuIcon />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden pb-[calc(7rem+env(safe-area-inset-bottom))]">
          <div
            className="flex h-full w-[200%] transition-[margin-left] duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
            style={{ marginLeft: activeTab === 'history' ? '-100%' : '0%' }}
          >
            <div
              className={`h-full min-h-0 w-1/2 px-1 ${
                activeTab === 'wallet' ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
            >
              <WalletPanel
                isActive={activeTab === 'wallet'}
                focusToken={focusTargetTab === 'wallet' ? focusToken : null}
                focusPayoutRef={focusTargetTab === 'wallet' ? focusPayoutRef : null}
                onClaimedPayoutFocus={handleClaimedPayoutFocus}
                onCreatedWithdrawalFocus={handleCreatedWithdrawalFocus}
              />
            </div>
            <div
              className={`h-full min-h-0 w-1/2 px-1 ${
                activeTab === 'history' ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
            >
              <HistoryPanel
                focusToken={focusTargetTab === 'history' ? focusToken : null}
                focusPayoutRef={focusTargetTab === 'history' ? focusPayoutRef : null}
                focusWithdrawalRef={focusTargetTab === 'history' ? focusWithdrawalRef : null}
                isActive={activeTab === 'history'}
              />
            </div>
          </div>
        </div>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0a0a0a] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"
        aria-label="Primary"
      >
        <div className="relative mx-auto flex w-full max-w-md items-center gap-2 rounded-2xl border border-white/10 bg-[#111111] p-1.5">
          <span
            className={`pointer-events-none absolute inset-y-1.5 left-1.5 w-[calc(50%-0.375rem)] rounded-xl bg-white/10 transition-transform duration-300 ease-out ${
              activeTab === 'history' ? 'translate-x-full' : 'translate-x-0'
            }`}
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={() => handleTabChange('wallet')}
            className={`relative z-10 flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-medium transition ${
              activeTab === 'wallet' ? 'text-white' : 'text-gray-300 hover:bg-white/5'
            }`}
          >
            <WalletIcon active={activeTab === 'wallet'} />
            Wallet
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('history')}
            className={`relative z-10 flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-medium transition ${
              activeTab === 'history' ? 'text-white' : 'text-gray-300 hover:bg-white/5'
            }`}
          >
            <HistoryIcon active={activeTab === 'history'} />
            History
          </button>
        </div>
      </nav>
    </main>
  );
}
