'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { SUPPORTED_CHAINS } from '@/lib/chains';
import { getSourceChain } from '@/lib/cctp';

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
        loginMethods: ['email', 'google', 'apple'],
        appearance: {
          theme: 'dark',
          accentColor: '#38bdf8',
          logo: '/logo.png',
          landingHeader: 'Sign in',
          loginMessage: 'Continue with email, Google, or Apple',
          showWalletLoginFirst: false,
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
          showWalletUIs: true,
        },
        defaultChain: getSourceChain(),
        supportedChains: SUPPORTED_CHAINS,
      }}
    >
      {children}
    </PrivyProvider>
  );
}
