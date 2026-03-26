'use client';

import { Toaster } from 'sonner';

export function AppToaster() {
  return (
    <Toaster
      theme="dark"
      position="top-center"
      expand={false}
      visibleToasts={4}
      closeButton
      offset={16}
      toastOptions={{
        duration: 4200,
        classNames: {
          toast:
            'group pointer-events-auto rounded-[22px] border border-white/12 bg-[#111111]/95 px-4 py-3 text-white shadow-[0_24px_64px_rgba(0,0,0,0.5)] backdrop-blur-xl',
          content: 'gap-1',
          title: 'font-num text-[13px] font-semibold tracking-[0.02em] text-white',
          description: 'text-[13px] leading-5 text-gray-400',
          icon: 'text-white',
          closeButton:
            'border border-white/12 bg-white/[0.04] text-gray-300 transition hover:bg-white/[0.08] hover:text-white',
          actionButton:
            'rounded-xl border border-transparent bg-white px-3 py-2 text-[12px] font-semibold text-black transition hover:bg-white/90',
          cancelButton:
            'rounded-xl border border-white/16 bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-white transition hover:bg-white/[0.08]',
          error:
            'border-red-500/30 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(248,113,113,0.16),transparent_52%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(0,0,0,0.06)),rgba(17,17,17,0.95)]',
          success:
            'border-emerald-400/28 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(52,211,153,0.16),transparent_52%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(0,0,0,0.06)),rgba(17,17,17,0.95)]',
          warning:
            'border-amber-400/28 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(251,191,36,0.16),transparent_52%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(0,0,0,0.06)),rgba(17,17,17,0.95)]',
          info:
            'border-sky-400/28 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(56,189,248,0.16),transparent_52%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(0,0,0,0.06)),rgba(17,17,17,0.95)]',
        },
      }}
    />
  );
}
