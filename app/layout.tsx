import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { PrivyProviderWrapper } from '@/lib/privy';
import './globals.css';

const appFont = localFont({
  src: '../public/fonts/Outfit-Variable.woff2',
  weight: '100 900',
  style: 'normal',
  variable: '--font-text',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Evolute Wallet',
  description: 'Wallet-first dashboard for USDC payouts and claims',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${appFont.variable} antialiased`}>
        <PrivyProviderWrapper>{children}</PrivyProviderWrapper>
      </body>
    </html>
  );
}
