'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { UserPill } from '@privy-io/react-auth/ui';
import { usePrivy } from '@privy-io/react-auth';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { WalletPanel } from '@/components/WalletPanel';
import { PayoutsPanel } from '@/components/PayoutsPanel';

export default function AppPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, authenticated } = usePrivy();
  const [focusToken, setFocusToken] = useState<string | null>(null);
  const queryFocusToken = searchParams.get('focusToken');

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      router.replace('/');
    }
  }, [ready, authenticated, router]);

  useEffect(() => {
    if (!queryFocusToken) return;
    setFocusToken((current) => current ?? queryFocusToken);
    router.replace('/app');
  }, [queryFocusToken, router]);

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
    <main className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900/40 px-4 py-3">
          <div>
            <h1 className="text-xl font-bold text-white">Evolute Wallet</h1>
            <p className="text-xs text-gray-400">Manage wallet and payouts in one place.</p>
          </div>
          <UserPill />
        </header>
        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          <WalletPanel />
          <PayoutsPanel focusToken={focusToken ?? queryFocusToken} />
        </div>
      </div>
    </main>
  );
}
