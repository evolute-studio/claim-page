import { useEffect, useState } from 'react';

type DocumentVisibilityState = {
  isDocumentVisible: boolean;
  lastBecameVisibleAt: number;
};

function readIsVisible(): boolean {
  if (typeof document === 'undefined') return true;
  return document.visibilityState === 'visible';
}

export function useDocumentVisibility(): DocumentVisibilityState {
  const [isDocumentVisible, setIsDocumentVisible] = useState<boolean>(() => readIsVisible());
  const [lastBecameVisibleAt, setLastBecameVisibleAt] = useState<number>(() => Date.now());

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const syncVisibility = () => {
      const nextVisible = readIsVisible();
      setIsDocumentVisible(nextVisible);
      if (nextVisible) {
        setLastBecameVisibleAt(Date.now());
      }
    };

    document.addEventListener('visibilitychange', syncVisibility);
    window.addEventListener('focus', syncVisibility);
    window.addEventListener('pageshow', syncVisibility);

    return () => {
      document.removeEventListener('visibilitychange', syncVisibility);
      window.removeEventListener('focus', syncVisibility);
      window.removeEventListener('pageshow', syncVisibility);
    };
  }, []);

  return { isDocumentVisible, lastBecameVisibleAt };
}
