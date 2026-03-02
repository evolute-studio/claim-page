'use client';

import { useEffect } from 'react';

const isProduction = process.env.NODE_ENV === 'production';

export function PwaServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (!isProduction) {
      const clearDevServiceWorkers = async () => {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
        } catch (error) {
          console.warn('Failed to unregister service workers in development', error);
        }

        if (typeof window !== 'undefined' && 'caches' in window) {
          try {
            const keys = await window.caches.keys();
            await Promise.all(
              keys
                .filter((key) => key.startsWith('evolute-static-'))
                .map((key) => window.caches.delete(key))
            );
          } catch (error) {
            console.warn('Failed to clear PWA caches in development', error);
          }
        }
      };

      void clearDevServiceWorkers();
      return;
    }

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
