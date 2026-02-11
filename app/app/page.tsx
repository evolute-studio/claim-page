'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { UserPill } from '@privy-io/react-auth/ui';
import { usePrivy } from '@privy-io/react-auth';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { WalletPanel } from '@/components/WalletPanel';
import { PayoutsPanel } from '@/components/PayoutsPanel';
import { WithdrawalsPanel } from '@/components/WithdrawalsPanel';

type AppTab = 'wallet' | 'payouts' | 'withdrawals';

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

function TrophyIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-5 w-5 ${active ? 'text-white' : 'text-gray-400'}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M8 4h8v3a4 4 0 1 1-8 0V4Z" />
      <path d="M7 6H5a2 2 0 0 0 2 2M17 6h2a2 2 0 0 1-2 2" />
      <path d="M10 15h4M9 19h6" />
    </svg>
  );
}

function WithdrawIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-5 w-5 ${active ? 'text-white' : 'text-gray-400'}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M7 7h10M7 7l3-3M7 7l3 3" />
      <path d="M17 17H7M17 17l-3-3M17 17l-3 3" />
    </svg>
  );
}

export default function AppPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, authenticated } = usePrivy();
  const [focusToken, setFocusToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('wallet');
  const queryFocusToken = searchParams.get('focusToken');
  const queryTab = searchParams.get('tab');

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      router.replace('/');
    }
  }, [ready, authenticated, router]);

  useEffect(() => {
    if (!queryFocusToken) return;
    setFocusToken((current) => current ?? queryFocusToken);
    setActiveTab('payouts');
    router.replace('/app?tab=payouts');
  }, [queryFocusToken, router]);

  useEffect(() => {
    if (queryTab === 'wallet' || queryTab === 'payouts' || queryTab === 'withdrawals') {
      setActiveTab(queryTab);
    }
  }, [queryTab]);

  const handleTabChange = (tab: AppTab) => {
    setActiveTab(tab);
    router.replace(`/app?tab=${tab}`);
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
    <main className="relative h-[100dvh] overflow-hidden bg-[#070912]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(81,58,212,0.25),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(31,151,255,0.18),_transparent_45%)]" />
      <div className="relative mx-auto flex h-full w-full max-w-2xl flex-col px-4 pt-4">
        <header className="mb-4 rounded-2xl border border-white/10 bg-[#121526]/80 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400">Evolute</p>
              <h1 className="text-lg font-semibold text-white">Wallet</h1>
            </div>
            <UserPill />
          </div>
        </header>

        <div key={activeTab} className="min-h-0 flex-1 pb-28 animate-fade-in-up">
          {activeTab === 'wallet' ? (
            <WalletPanel />
          ) : activeTab === 'payouts' ? (
            <PayoutsPanel focusToken={focusToken ?? queryFocusToken} />
          ) : (
            <WithdrawalsPanel />
          )}
        </div>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0c0f1f]/90 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl"
        aria-label="Primary"
      >
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2 rounded-2xl border border-white/10 bg-black/20 p-1.5">
          <button
            type="button"
            onClick={() => handleTabChange('wallet')}
            className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-medium transition ${
              activeTab === 'wallet'
                ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-[0_6px_20px_rgba(99,102,241,0.35)]'
                : 'text-gray-300 hover:bg-white/5'
            }`}
          >
            <WalletIcon active={activeTab === 'wallet'} />
            Wallet
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('payouts')}
            className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-medium transition ${
              activeTab === 'payouts'
                ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-[0_6px_20px_rgba(99,102,241,0.35)]'
                : 'text-gray-300 hover:bg-white/5'
            }`}
          >
            <TrophyIcon active={activeTab === 'payouts'} />
            Payouts
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('withdrawals')}
            className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-medium transition ${
              activeTab === 'withdrawals'
                ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-[0_6px_20px_rgba(99,102,241,0.35)]'
                : 'text-gray-300 hover:bg-white/5'
            }`}
          >
            <WithdrawIcon active={activeTab === 'withdrawals'} />
            Withdrawals
          </button>
        </div>
      </nav>
    </main>
  );
}
