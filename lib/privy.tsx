'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { base } from 'viem/chains';
import { SUPPORTED_CHAINS } from '@/lib/chains';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

export function PrivyProviderWrapper({ children }: { children: React.ReactNode }) {
  // Don't render Privy if app ID is not configured (prevents build errors)
  if (!PRIVY_APP_ID || PRIVY_APP_ID === 'placeholder-app-id') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center p-4">
          <p className="text-red-400">Privy App ID not configured</p>
          <p className="text-gray-400 text-sm mt-2">
            Set NEXT_PUBLIC_PRIVY_APP_ID in your environment variables
          </p>
        </div>
      </div>
    );
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['email', 'google'],
        appearance: {
          theme: 'dark',
          accentColor: '#7C3AED',
          logo: '/logo.png',
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
          showWalletUIs: true,
        },
        defaultChain: base,
        supportedChains: SUPPORTED_CHAINS,
      }}
    >
      {children}
    </PrivyProvider>
  );
}
