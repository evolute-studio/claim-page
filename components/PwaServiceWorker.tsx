'use client';

import { useEffect } from 'react';

const isProduction = process.env.NODE_ENV === 'production';

export function PwaServiceWorker() {
  useEffect(() => {
    if (!isProduction) return;
    if (!('serviceWorker' in navigator)) return;

    const registerServiceWorker = async () => {
      try {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      } catch (error) {
        console.error('Failed to register service worker', error);
      }
    };

    void registerServiceWorker();
  }, []);

  return null;
}
