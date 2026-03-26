'use client';

import Link from 'next/link';
import { toast } from 'sonner';

function ToastButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3 text-left text-sm text-white transition hover:bg-white/[0.08]"
    >
      {label}
    </button>
  );
}

export default function DebugToastsPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-md space-y-4">
        <header className="rounded-2xl border border-white/10 bg-[#111111]/95 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium tracking-[0.14em] text-gray-400">EVOLUTE WALLET</p>
              <h1 className="mt-2 text-2xl font-semibold text-white">Toast Lab</h1>
              <p className="mt-2 text-sm text-gray-400">
                Trigger notification variants and inspect spacing, copy, stacking, and dismissal.
              </p>
            </div>
            <Link
              href="/debug"
              className="inline-flex rounded-xl border border-white/20 bg-white/[0.03] px-3 py-2 text-sm font-medium text-white transition hover:bg-white/[0.08]"
            >
              Back
            </Link>
          </div>
        </header>

        <section className="rounded-2xl border border-white/10 bg-[#111111]/95 p-4">
          <h2 className="text-sm font-semibold tracking-[0.08em] text-gray-300">Common States</h2>
          <div className="mt-3 space-y-2">
            <ToastButton
              label="Success: claim submitted"
              onClick={() =>
                toast.success('Claim submitted', {
                  description: 'USDC transfer is being prepared for payout.',
                })
              }
            />
            <ToastButton
              label="Info: quote refreshing"
              onClick={() =>
                toast.info('Refreshing quote', {
                  description: 'Quote expired and is being refreshed automatically.',
                })
              }
            />
            <ToastButton
              label="Warning: minimum amount"
              onClick={() =>
                toast.warning('Amount too low', {
                  description: 'Increase the amount to at least 1.00 USDC to continue.',
                })
              }
            />
            <ToastButton
              label="Error: balance unavailable"
              onClick={() =>
                toast.error('Balance unavailable', {
                  description: 'Network error. Check connection and try again.',
                })
              }
            />
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#111111]/95 p-4">
          <h2 className="text-sm font-semibold tracking-[0.08em] text-gray-300">Stress Cases</h2>
          <div className="mt-3 space-y-2">
            <ToastButton
              label="Long error message"
              onClick={() =>
                toast.error('Unable to load claimable payouts', {
                  description:
                    'Server expects claim token for this payout. Check /payouts/me response fields and verify that claim_token is returned for CREATED payouts.',
                })
              }
            />
            <ToastButton
              label="Sticky action toast"
              onClick={() =>
                toast('Launch link expired', {
                  description: 'Open wallet from the game again to create a new session.',
                  action: {
                    label: 'Open launch',
                    onClick: () => undefined,
                  },
                  cancel: {
                    label: 'Dismiss',
                    onClick: () => undefined,
                  },
                  duration: 10_000,
                })
              }
            />
            <ToastButton
              label="Promise toast"
              onClick={() =>
                toast.promise(
                  new Promise((resolve) => {
                    window.setTimeout(() => resolve(true), 1600);
                  }),
                  {
                    loading: 'Submitting withdrawal',
                    success: 'Withdrawal submitted',
                    error: 'Withdrawal failed',
                  }
                )
              }
            />
            <ToastButton
              label="Stack 3 errors"
              onClick={() => {
                toast.error('Balance unavailable', {
                  description: 'Wallet sync is temporarily unavailable.',
                });
                toast.error('Fee estimate unavailable', {
                  description: 'Some network fee estimates are temporarily unavailable.',
                });
                toast.error('Quote unavailable', {
                  description: 'Quote request timed out. Please try again.',
                });
              }}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
