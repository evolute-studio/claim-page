import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { PrivyProviderWrapper } from '@/lib/privy';
import { PwaServiceWorker } from '@/components/PwaServiceWorker';
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
  applicationName: 'Evolute Wallet',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Evolute Wallet',
  },
  icons: {
    icon: [
      { url: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/pwa/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#0a0a0a',
};

export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${appFont.variable} antialiased`}>
        <PrivyProviderWrapper>
          {children}
          <PwaServiceWorker />
        </PrivyProviderWrapper>
      </body>
    </html>
  );
}
