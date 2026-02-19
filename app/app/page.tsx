'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useExportWallet, useModalStatus, usePrivy, useWallets } from '@privy-io/react-auth';
import { Check, Copy, KeyRound, Link2, LogOut, Mail, X } from 'lucide-react';
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
  const searchParams = useSearchParams();
  const { wallets } = useWallets();
  const { ready, authenticated, user, logout } = usePrivy();
  const [focusToken, setFocusToken] = useState<string | null>(null);
  const [focusPayoutRef, setFocusPayoutRef] = useState<string | null>(null);
  const [focusTargetTab, setFocusTargetTab] = useState<AppTab | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('wallet');
  const [copied, setCopied] = useState(false);
  const [menuCopied, setMenuCopied] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isExportingKey, setIsExportingKey] = useState(false);
  const [isMenuPressed, setIsMenuPressed] = useState(false);
  const { exportWallet } = useExportWallet();
  const { isOpen: isPrivyModalOpen } = useModalStatus();
  const queryFocusToken = searchParams.get('focusToken');
  const queryFocusPayout = searchParams.get('focusPayout');
  const queryTab = searchParams.get('tab');
  const walletAddress = wallets[0]?.address ?? null;
  const linkedAccountsPreview = useMemo(() => {
    if (!user) return [];
    return user.linkedAccounts.slice(0, 5).map((account, index) => {
      const linked = account as Record<string, unknown>;
      const rawType = String(linked.type ?? 'account');
      const type = rawType.replace(/_oauth$/, '');
      if (rawType === 'wallet' || rawType === 'smart_wallet') {
        const address = typeof linked.address === 'string' ? linked.address : '';
        return {
          key: `${rawType}-${address || index}`,
          label: rawType === 'wallet' ? 'Wallet' : 'Smart wallet',
          value: address ? truncateAddress(address) : 'Connected',
        };
      }
      if (rawType === 'email') {
        return {
          key: `${rawType}-${String(linked.address ?? index)}`,
          label: 'Email',
          value: typeof linked.address === 'string' ? linked.address : 'Connected',
        };
      }
      if (rawType === 'phone') {
        return {
          key: `${rawType}-${String(linked.number ?? index)}`,
          label: 'Phone',
          value: typeof linked.number === 'string' ? linked.number : 'Connected',
        };
      }
      const displayValue =
        (typeof linked.username === 'string' && linked.username) ||
        (typeof linked.email === 'string' && linked.email) ||
        (typeof linked.name === 'string' && linked.name) ||
        (typeof linked.telegramUserId === 'string' && linked.telegramUserId) ||
        'Connected';
      return {
        key: `${rawType}-${index}`,
        label: type.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
        value: displayValue,
      };
    });
  }, [user]);
  const embeddedWalletAddress = useMemo(() => {
    const embedded = wallets.find(
      (wallet) => wallet.walletClientType === 'privy' || wallet.walletClientType === 'privy-v2'
    );
    return embedded?.address ?? null;
  }, [wallets]);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      router.replace('/');
    }
  }, [ready, authenticated, router]);

  useEffect(() => {
    if (!queryFocusToken && !queryFocusPayout) return;
    setFocusToken(queryFocusToken);
    setFocusPayoutRef(queryFocusPayout);
    setFocusTargetTab(queryTab === 'history' ? 'history' : 'wallet');
  }, [queryFocusPayout, queryFocusToken, queryTab]);

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

  useEffect(() => {
    if (!isAccountMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsAccountMenuOpen(false);
        setMenuCopied(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isAccountMenuOpen]);

  useEffect(() => {
    if (isPrivyModalOpen) return;
    setIsExportingKey(false);
  }, [isPrivyModalOpen]);

  const handleTabChange = (tab: AppTab) => {
    setActiveTab(tab);
    router.replace(`/app?tab=${tab}`);
  };

  const handleClaimedPayoutFocus = useCallback(
    (next: { focusToken?: string | null; focusPayoutRef?: string | null }) => {
      setFocusToken(next.focusToken ?? null);
      setFocusPayoutRef(next.focusPayoutRef ?? null);
      setFocusTargetTab('history');
      setActiveTab('history');
      router.replace('/app?tab=history');
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

  const handleCopyWalletAddressFromMenu = useCallback(async () => {
    if (!walletAddress) return;
    const ok = await copyText(walletAddress);
    setMenuCopied(ok);
    if (ok) {
      window.setTimeout(() => setMenuCopied(false), 1800);
    }
  }, [copyText, walletAddress]);

  const closeAccountMenu = useCallback(() => {
    setIsAccountMenuOpen(false);
    setMenuCopied(false);
    setIsExportingKey(false);
  }, []);

  const toggleAccountMenu = useCallback(() => {
    setIsAccountMenuOpen((current) => {
      const next = !current;
      if (!next) {
        setMenuCopied(false);
      }
      return next;
    });
  }, []);

  const handleLogout = useCallback(async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
      closeAccountMenu();
    } finally {
      setIsLoggingOut(false);
    }
  }, [closeAccountMenu, isLoggingOut, logout]);

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

            <div className="relative flex items-center gap-2">
              <button
                type="button"
                className="group relative h-10 w-10"
                onClick={toggleAccountMenu}
                onPointerDownCapture={() => setIsMenuPressed(true)}
                onPointerUpCapture={() => setIsMenuPressed(false)}
                onPointerCancelCapture={() => setIsMenuPressed(false)}
                onPointerLeave={() => setIsMenuPressed(false)}
                aria-label={isAccountMenuOpen ? 'Close account menu' : 'Open account menu'}
                aria-expanded={isAccountMenuOpen}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-gray-200 transition-[transform,background-color,border-color,color] duration-150 ease-out group-hover:border-white/25 group-hover:bg-white/10 group-hover:text-white ${
                    isMenuPressed ? 'scale-95 border-white/30 bg-white/15 text-white' : ''
                  }`}
                >
                  <MenuIcon />
                </span>
              </button>

              {isAccountMenuOpen && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-40 cursor-default bg-black/35 backdrop-blur-[1px]"
                    aria-label="Close account menu"
                    onClick={closeAccountMenu}
                  />
                  <section className="animate-sheet-in absolute right-0 top-[calc(100%+0.6rem)] z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-white/12 bg-[#0c0d10] p-4 shadow-[0_22px_70px_rgba(0,0,0,0.62)]">
                    <div className="flex items-center justify-between">
                      <h2 className="font-num text-[1.6rem] font-semibold leading-none tracking-[0.01em] text-white">
                        Account
                      </h2>
                      <button
                        type="button"
                        onClick={closeAccountMenu}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-gray-200 transition hover:bg-white/10"
                        aria-label="Close account menu"
                      >
                        <X size={16} strokeWidth={2.1} />
                      </button>
                    </div>

                    <div className="mt-4 space-y-2.5">
                      <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-gray-100">
                        <Mail size={15} className="text-gray-300" />
                        <span className="truncate">{user?.email?.address ?? 'No email linked'}</span>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="inline-flex items-center gap-2 text-sm text-white">
                            <Link2 size={15} className="text-gray-300" />
                            Linked accounts
                          </span>
                          <span className="font-num inline-flex h-6 min-w-[1.8rem] items-center justify-center rounded-full border border-white/15 bg-white/10 px-2 text-[11px] text-gray-200">
                            {user?.linkedAccounts.length ?? 0}
                          </span>
                        </div>
                        {linkedAccountsPreview.length > 0 ? (
                          <div className="space-y-1.5">
                            {linkedAccountsPreview.map((item) => (
                              <div
                                key={item.key}
                                className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.02] px-2.5 py-1.5 text-[12px]"
                              >
                                <span className="text-gray-400">{item.label}</span>
                                <span className="font-num truncate text-right text-gray-200">{item.value}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500">No linked accounts yet.</p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleLogout()}
                        disabled={isLoggingOut}
                        className="inline-flex w-full items-center gap-2.5 rounded-xl border border-white/12 bg-white/[0.03] px-3 py-2.5 text-sm text-white transition hover:bg-white/[0.08] disabled:opacity-60"
                      >
                        <LogOut size={15} className="text-gray-300" />
                        <span>{isLoggingOut ? 'Logging out...' : 'Log out'}</span>
                      </button>
                    </div>

                    <div className="mt-4">
                      <p className="text-sm text-gray-400">Your wallet</p>
                      <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-white/12 bg-white/[0.03] p-3">
                        <div className="min-w-0">
                          <p className="font-num truncate text-[1.02rem] font-semibold text-white">
                            {walletAddress ? truncateAddress(walletAddress) : 'Not connected'}
                          </p>
                          <p className="text-xs text-gray-500">
                            {wallets[0]?.walletClientType === 'privy' ||
                            wallets[0]?.walletClientType === 'privy-v2'
                              ? 'Embedded wallet'
                              : 'External wallet'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleCopyWalletAddressFromMenu()}
                          disabled={!walletAddress}
                          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-[#5ab7ff]/70 bg-[#12253b] px-3 text-[0.95rem] font-medium text-[#7cc9ff] transition hover:bg-[#18314c] disabled:opacity-60"
                        >
                          {menuCopied ? 'Copied' : 'Copy'}
                          <Copy size={14} strokeWidth={1.9} />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleExportPrivateKey()}
                        disabled={!embeddedWalletAddress || isExportingKey}
                        className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-[0.95rem] font-medium text-white transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                        title={
                          embeddedWalletAddress
                            ? 'Export embedded wallet private key'
                            : 'Private key export is available only for embedded wallets'
                        }
                      >
                        <KeyRound size={14} strokeWidth={2} />
                        <span>{isExportingKey ? 'Opening export...' : 'Export private key'}</span>
                      </button>
                    </div>
                  </section>
                </>
              )}
            </div>
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
