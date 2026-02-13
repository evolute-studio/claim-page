import type { Metadata } from 'next';
import { Space_Grotesk } from 'next/font/google';
import { PrivyProviderWrapper } from '@/lib/privy';
import './globals.css';

const numberFont = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-num',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Evolute Wallet',
  description: 'Wallet-first dashboard for USDC payouts and claims',
};

export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${numberFont.variable} antialiased`}>
        <PrivyProviderWrapper>{children}</PrivyProviderWrapper>
      </body>
    </html>
  );
}
