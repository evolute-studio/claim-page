import type { Metadata } from 'next';
import { PrivyProviderWrapper } from '@/lib/privy';
import './globals.css';

export const metadata: Metadata = {
  title: 'Evolute Wallet',
  description: 'Wallet-first dashboard for USDC payouts and claims',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <PrivyProviderWrapper>{children}</PrivyProviderWrapper>
      </body>
    </html>
  );
}
