'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { UserPill } from '@privy-io/react-auth/ui';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { Copy } from 'lucide-react';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { WalletPanel } from '@/components/WalletPanel';
import { HistoryPanel } from '@/components/HistoryPanel';
import { truncateAddress } from '@/lib/format';

type AppTab = 'wallet' | 'history';

function AccountIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="mt-0.5 h-5 w-5 text-gray-300"
      fill="none"
      aria-hidden="false"
    >
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5.5 18a6.5 6.5 0 0 1 13 0"
        stroke="currentColor"
        strokeWidth="1.8"
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
  const { ready, authenticated } = usePrivy();
  const [focusToken, setFocusToken] = useState<string | null>(null);
  const [focusPayoutRef, setFocusPayoutRef] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('wallet');
  const [copied, setCopied] = useState(false);
  const [isMenuPressed, setIsMenuPressed] = useState(false);
  const queryFocusToken = searchParams.get('focusToken');
  const queryFocusPayout = searchParams.get('focusPayout');
  const queryTab = searchParams.get('tab');
  const walletAddress = wallets[0]?.address ?? null;

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
    setActiveTab('history');
    routerRef.current.replace('/app?tab=history');
  }, [queryFocusPayout, queryFocusToken]);

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
      setActiveTab('history');
      router.replace('/app?tab=history');
    },
    [router]
  );

  const handleCopyWalletAddress = async () => {
    if (!walletAddress) return;
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(walletAddress);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = walletAddress;
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
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

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
              className="inline-flex h-10 min-w-0 max-w-[70%] items-center justify-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 transition hover:bg-white/10"
            >
              <span className="inline-flex min-w-0 items-center gap-1 overflow-hidden">
                <AccountIcon />
                <span className="text-base font-semibold text-white">
                  {walletAddress ? truncateAddress(walletAddress) : '—'}
                </span>
              </span>
            </button>

            <div className="relative flex items-center gap-2">
              {walletAddress && (
                <button
                  type="button"
                  onClick={handleCopyWalletAddress}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-gray-200 transition hover:bg-white/10"
                  aria-label="Copy wallet address"
                  title={copied ? 'Copied' : 'Copy address'}
                >
                  <Copy size={16} strokeWidth={1.9} className="block" aria-hidden="true" />
                </button>
              )}
              {copied && (
                <div className="pointer-events-none absolute right-[calc(100%+0.5rem)] top-1/2 z-20 -translate-y-1/2 whitespace-nowrap rounded-lg border border-white/20 bg-white px-2.5 py-1 text-xs font-medium text-black">
                  Copied
                </div>
              )}
              <div
                className="group relative h-10 w-10"
                onPointerDownCapture={() => setIsMenuPressed(true)}
                onPointerUpCapture={() => setIsMenuPressed(false)}
                onPointerCancelCapture={() => setIsMenuPressed(false)}
                onPointerLeave={() => setIsMenuPressed(false)}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-gray-200 transition-[transform,background-color,border-color,color] duration-150 ease-out group-hover:border-white/25 group-hover:bg-white/10 group-hover:text-white ${
                    isMenuPressed ? 'scale-95 border-white/30 bg-white/15 text-white' : ''
                  }`}
                >
                  <MenuIcon />
                </span>
                <div className="absolute inset-0 [&>button]:!h-10 [&>button]:!w-10 [&>button]:!rounded-full [&>button]:opacity-0">
                  <UserPill
                    expanded={false}
                    size={40}
                    ui={{ background: 'secondary' }}
                    label={
                      <span
                        style={{
                          position: 'absolute',
                          width: 1,
                          height: 1,
                          padding: 0,
                          margin: -1,
                          overflow: 'hidden',
                          clip: 'rect(0, 0, 0, 0)',
                          whiteSpace: 'nowrap',
                          border: 0,
                        }}
                      >
                        Open menu
                      </span>
                    }
                  />
                </div>
              </div>
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
                onClaimedPayoutFocus={handleClaimedPayoutFocus}
              />
            </div>
            <div
              className={`h-full min-h-0 w-1/2 px-1 ${
                activeTab === 'history' ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
            >
              <HistoryPanel
                focusToken={focusToken ?? queryFocusToken}
                focusPayoutRef={focusPayoutRef ?? queryFocusPayout}
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
