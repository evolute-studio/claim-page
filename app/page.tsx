'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';

export default function Home() {
  const router = useRouter();
  const { ready, authenticated, login } = usePrivy();

  useEffect(() => {
    if (!ready || !authenticated) return;
    router.replace('/app');
  }, [ready, authenticated, router]);

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900/40 p-8 text-center space-y-4">
        <h1 className="text-3xl font-bold text-white">Evolute Wallet</h1>
        <p className="text-sm text-gray-400">
          Sign in with Privy to view your USDC wallet and claim your payouts.
        </p>
        <button
          type="button"
          onClick={login}
          disabled={!ready}
          className="w-full rounded-md bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:opacity-50"
        >
          {ready ? 'Sign in with Privy' : 'Loading...'}
        </button>
      </div>
    </main>
  );
}
