import type { Metadata } from 'next';
import { PrivyProviderWrapper } from '@/lib/privy';
import './globals.css';

export const metadata: Metadata = {
  title: 'Claim Prize | Evolute',
  description: 'Claim your USDC prize from Evolute tournaments',
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
