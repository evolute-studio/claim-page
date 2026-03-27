'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  getIdentityToken,
  useCreateWallet,
  useIdentityToken,
  usePrivy,
  useWallets,
} from '@privy-io/react-auth';
import { Check, Copy } from 'lucide-react';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { WalletPanel } from '@/components/WalletPanel';
import { HistoryPanel } from '@/components/HistoryPanel';
import { getMyPayouts } from '@/lib/api';
import { authDebug, createAuthTraceId, isAuthDebugEnabled, tokenFingerprint } from '@/lib/authDebug';
import { copyTextToClipboard } from '@/lib/clipboard';
import { truncateAddress } from '@/lib/format';
import { readJwtSub, resolvePrivyIdentityToken } from '@/lib/identityToken';
import type { PayoutPreview } from '@/types/payout';

type AppTab = 'wallet' | 'history';
type AppDebugScreen = 'loading' | 'setup' | 'app';
type RefreshPayoutsMode = 'initial' | 'background';

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
  const PAYOUT_REFRESH_INTERVAL_MS = 10_000;
  const router = useRouter();
  const routerRef = useRef(router);
  const walletCreateAttemptedRef = useRef(false);
  const searchParams = useSearchParams();
  const { wallets, ready: walletsReady } = useWallets();
  const { createWallet } = useCreateWallet();
  const { identityToken } = useIdentityToken();
  const { ready, authenticated, user } = usePrivy();
  const currentPrivyUserId = user?.id?.trim() ?? '';
  const identityTokenRef = useRef<string | null>(identityToken ?? null);
  const privyUserIdRef = useRef<string | null>(user?.id ?? null);
  const didInitialPayoutLoadRef = useRef(false);
  const lastHandledPayoutPollTickRef = useRef<number | null>(null);
  const [focusToken, setFocusToken] = useState<string | null>(null);
  const [focusPayoutRef, setFocusPayoutRef] = useState<string | null>(null);
  const [focusWithdrawalRef, setFocusWithdrawalRef] = useState<string | null>(null);
  const [focusTargetTab, setFocusTargetTab] = useState<AppTab | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('wallet');
  const [payoutPollTick, setPayoutPollTick] = useState(0);
  const [payouts, setPayouts] = useState<PayoutPreview[]>([]);
  const [payoutsLoading, setPayoutsLoading] = useState(false);
  const [payoutsError, setPayoutsError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isCreatingEmbeddedWallet, setIsCreatingEmbeddedWallet] = useState(false);
  const queryFocusToken = searchParams.get('focusToken');
  const queryFocusPayout = searchParams.get('focusPayout');
  const queryFocusWithdrawal = searchParams.get('focusWithdrawal');
  const queryTab = searchParams.get('tab');
  const debugRaw = searchParams.get('debug')?.trim().toLowerCase() ?? '';
  const debugScreenRaw = searchParams.get('debugScreen')?.trim().toLowerCase() ?? '';
  const isDebugPreview = process.env.NODE_ENV !== 'production' && (debugRaw === '1' || debugRaw === 'true');
  const debugScreen: AppDebugScreen =
    debugScreenRaw === 'loading' || debugScreenRaw === 'setup' || debugScreenRaw === 'app'
      ? debugScreenRaw
      : 'app';
  const walletAddress = wallets[0]?.address ?? (isDebugPreview ? '0xdebug000000000000000000000000000000000000' : null);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    identityTokenRef.current = identityToken ?? null;
  }, [identityToken]);

  useEffect(() => {
    privyUserIdRef.current = user?.id ?? null;
  }, [user]);

  useEffect(() => {
    if (isDebugPreview) return;
    if (!ready) return;
    if (!authenticated) {
      walletCreateAttemptedRef.current = false;
      router.replace('/');
    }
  }, [authenticated, isDebugPreview, ready, router]);

  useEffect(() => {
    if (isDebugPreview) return;
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
  }, [authenticated, createWallet, isDebugPreview, ready, wallets, walletsReady]);

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
      const params = new URLSearchParams();
      params.set('tab', 'history');
      if (isDebugPreview) {
        params.set('debug', '1');
      }
      routerRef.current.replace(`/app?${params.toString()}`);
    }
  }, [isDebugPreview, queryTab]);

  useEffect(() => {
    if (!ready) return;
    if (!isDebugPreview && !authenticated) return;
    const timerId = window.setInterval(() => {
      setPayoutPollTick((current) => current + 1);
    }, PAYOUT_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timerId);
  }, [authenticated, isDebugPreview, ready]);

  useEffect(() => {
    if (currentPrivyUserId) return;
    didInitialPayoutLoadRef.current = false;
    lastHandledPayoutPollTickRef.current = null;
    setPayouts([]);
    setPayoutsLoading(false);
    setPayoutsError(null);
  }, [currentPrivyUserId]);

  const getAuthToken = useCallback(async () => {
    return resolvePrivyIdentityToken({
      cachedToken: identityTokenRef.current,
      expectedPrivyUserId: privyUserIdRef.current,
      fetchFreshToken: () => getIdentityToken(),
      source: 'AppPage.getAuthToken',
    });
  }, []);

  const refreshPayouts = useCallback(
    async (mode: RefreshPayoutsMode = 'background') => {
      if (isDebugPreview) return;
      if (!privyUserIdRef.current?.trim()) return;
      const shouldShowLoading =
        mode === 'initial' && !didInitialPayoutLoadRef.current && payouts.length === 0;
      if (shouldShowLoading) setPayoutsLoading(true);
      setPayoutsError(null);
      try {
        const token = await getAuthToken();
        const traceId = createAuthTraceId('app-payouts');
        const debugEnabled = isAuthDebugEnabled();
        authDebug('payouts.request', {
          source: 'AppPage.refreshPayouts',
          mode,
          trace_id: traceId,
          expected_privy_user_id: currentPrivyUserId || null,
          token_sub: readJwtSub(token),
          token_fp: tokenFingerprint(token),
        });
        const data = await getMyPayouts(
          token,
          undefined,
          {
            statuses: 'ALL',
            ...(debugEnabled
              ? {
                  debugTraceId: traceId,
                  debugSource: 'AppPage.refreshPayouts',
                  debugExpectedSub: currentPrivyUserId || undefined,
                }
              : {}),
          }
        );
        setPayouts(data.payouts);
        setPayoutsError(null);
        didInitialPayoutLoadRef.current = true;
      } catch (requestError) {
        const message =
          requestError instanceof Error ? requestError.message : 'Failed to load payouts';
        setPayoutsError(message);
      } finally {
        if (shouldShowLoading) setPayoutsLoading(false);
      }
    },
    [currentPrivyUserId, getAuthToken, isDebugPreview, payouts.length]
  );

  useEffect(() => {
    if (isDebugPreview) return;
    if (!currentPrivyUserId) return;
    if (lastHandledPayoutPollTickRef.current === payoutPollTick && didInitialPayoutLoadRef.current) {
      return;
    }
    lastHandledPayoutPollTickRef.current = payoutPollTick;
    void refreshPayouts(didInitialPayoutLoadRef.current ? 'background' : 'initial');
  }, [currentPrivyUserId, isDebugPreview, payoutPollTick, refreshPayouts]);

  const buildAppUrl = useCallback(
    (
      tab: AppTab,
      extra?: {
        focusToken?: string | null;
        focusPayout?: string | null;
        focusWithdrawal?: string | null;
      }
    ) => {
      const params = new URLSearchParams();
      params.set('tab', tab);
      if (isDebugPreview) {
        params.set('debug', '1');
      }
      if (extra?.focusToken) params.set('focusToken', extra.focusToken);
      if (extra?.focusPayout) params.set('focusPayout', extra.focusPayout);
      if (extra?.focusWithdrawal) params.set('focusWithdrawal', extra.focusWithdrawal);
      return `/app?${params.toString()}`;
    },
    [isDebugPreview]
  );

  const handleTabChange = (tab: AppTab) => {
    setActiveTab(tab);
    router.replace(buildAppUrl(tab));
  };

  const handleClaimedPayoutFocus = useCallback(
    (next: { focusToken?: string | null; focusPayoutRef?: string | null }) => {
      setFocusToken(next.focusToken ?? null);
      setFocusPayoutRef(next.focusPayoutRef ?? null);
      setFocusWithdrawalRef(null);
      setFocusTargetTab('history');
      setActiveTab('history');
      router.replace(
        buildAppUrl('history', {
          focusToken: next.focusToken ?? null,
          focusPayout: next.focusPayoutRef ?? null,
        })
      );
    },
    [buildAppUrl, router]
  );

  const handleCreatedWithdrawalFocus = useCallback(
    (next: { focusWithdrawalRef?: string | null }) => {
      const withdrawalRef = next.focusWithdrawalRef ?? null;
      setFocusToken(null);
      setFocusPayoutRef(null);
      setFocusWithdrawalRef(withdrawalRef);
      setFocusTargetTab('history');
      setActiveTab('history');
      router.replace(
        buildAppUrl('history', {
          focusWithdrawal: withdrawalRef,
        })
      );
    },
    [buildAppUrl, router]
  );

  const handleCopyWalletAddress = useCallback(async () => {
    if (!walletAddress) return;
    const ok = await copyTextToClipboard(walletAddress);
    setCopied(ok);
    if (ok) {
      window.setTimeout(() => setCopied(false), 1800);
    }
  }, [walletAddress]);

  if (isDebugPreview && debugScreen === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-3 text-sm text-gray-400">Debug preview: app loading screen.</p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!authenticated && !isDebugPreview) {
    return null;
  }

  if (isDebugPreview && debugScreen === 'setup') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-3 text-sm text-gray-400">Debug preview: setting up embedded wallet...</p>
        </div>
      </div>
    );
  }

  if (!isDebugPreview && isCreatingEmbeddedWallet && !walletAddress) {
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
            {walletAddress ? (
              <button
                type="button"
                onClick={() => void handleCopyWalletAddress()}
                className="relative inline-flex h-10 min-w-0 max-w-[70%] items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 transition-[background-color,border-color,color,transform,opacity] duration-300 ease-out hover:border-white/25 hover:bg-white/10"
                aria-label="Copy wallet address"
                title={copied ? 'Copied' : 'Copy address'}
              >
                <span className="inline-flex min-w-0 items-center gap-1 overflow-hidden">
                  <AccountIcon />
                  <span className="truncate text-base font-semibold text-white">
                    {truncateAddress(walletAddress)}
                  </span>
                </span>
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
                <span
                  className={`pointer-events-none absolute left-[calc(100%+0.5rem)] top-1/2 z-20 -translate-y-1/2 whitespace-nowrap rounded-lg border border-white/20 bg-white px-2.5 py-1 text-xs font-medium text-black shadow-[0_8px_22px_rgba(0,0,0,0.35)] transition-[opacity,transform,filter] duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    copied ? 'translate-x-0 opacity-100 blur-0' : 'translate-x-2 opacity-0 blur-[1.5px]'
                  }`}
                >
                  Copied
                </span>
              </button>
            ) : (
              <div className="inline-flex h-10 min-w-0 max-w-[70%] items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 opacity-70">
                <AccountIcon />
                <span className="truncate text-base font-semibold text-white">—</span>
              </div>
            )}

            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-gray-200 transition hover:border-white/25 hover:bg-white/10 hover:text-white"
              onClick={() => router.push(isDebugPreview ? '/app/account?debug=1' : '/app/account')}
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
                payouts={payouts}
                payoutsLoading={payoutsLoading}
                payoutsError={payoutsError}
                refreshPayouts={refreshPayouts}
                debugPreview={isDebugPreview}
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
                payouts={payouts}
                payoutsLoading={payoutsLoading}
                payoutsError={payoutsError}
                refreshPayouts={refreshPayouts}
                payoutPollTick={payoutPollTick}
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
