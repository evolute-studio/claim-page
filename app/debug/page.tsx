import Link from 'next/link';
import { getPayoutStatusUi } from '@/lib/payoutStatusUi';
import type { PayoutStatus } from '@/types/payout';

type DebugLink = {
  label: string;
  href: string;
};

const launchLinks: DebugLink[] = [
  { label: 'Launch: loading', href: '/launch?debugScreen=loading' },
  { label: 'Launch: open from game', href: '/launch?debugScreen=open_from_game' },
  { label: 'Launch: session conflict', href: '/launch?debugScreen=session_conflict' },
  { label: 'Launch: error', href: '/launch?debugScreen=error' },
];

const claimLinks: DebugLink[] = [
  { label: 'Claim: loading', href: '/claim?debugState=loading' },
  { label: 'Claim: token input', href: '/claim?debugState=input' },
  { label: 'Claim: error', href: '/claim?debugState=error' },
  { label: 'Claim: not found', href: '/claim?debugState=not_found' },
  { label: 'Claim: ready', href: '/claim?debugState=ready' },
  { label: 'Claim: paid', href: '/claim?debugState=paid' },
];

const claimDecisionLinks: DebugLink[] = [
  { label: 'Claim decision: loading', href: '/claim/decision?debugState=loading' },
  { label: 'Claim decision: ready', href: '/claim/decision?debugState=ready' },
  { label: 'Claim decision: error', href: '/claim/decision?debugState=error' },
];

const appLinks: DebugLink[] = [
  { label: 'App: loading', href: '/app?debug=1&debugScreen=loading' },
  { label: 'App: setup wallet', href: '/app?debug=1&debugScreen=setup' },
  { label: 'App: wallet tab', href: '/app?debug=1&tab=wallet' },
  { label: 'App: history tab', href: '/app?debug=1&tab=history' },
  { label: 'Account', href: '/app/account?debug=1' },
];

const payoutStatuses: PayoutStatus[] = [
  'CREATED',
  'PENDING_EMAIL',
  'PENDING_APPROVAL',
  'PAYING',
  'PAID',
  'EXPIRED',
  'CANCELLED',
  'FAILED',
];

function TournamentPayoutsPreview() {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#111111]/95 p-4">
      <h2 className="text-sm font-semibold tracking-[0.08em] text-gray-300">Tournament Payout Pills</h2>
      <p className="mt-2 text-xs text-gray-500">All status variants that can be shown to users.</p>
      <div className="mt-3 space-y-3">
        {payoutStatuses.map((status) => {
          const ui = getPayoutStatusUi(status);
          const updatedLabel = '2m ago';
          return (
            <div key={status} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
              <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-gray-500">{status}</p>
              {status === 'CREATED' ? (
                <button
                  type="button"
                  className="claimable-cta-button inline-flex h-[50px] w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold"
                >
                  Claim
                </button>
              ) : (
                <div
                  className={`relative h-[50px] w-full overflow-hidden rounded-xl border text-sm font-semibold ${ui.pillContainerClassName}`}
                >
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-white/10"
                  />
                  <div className="grid h-full grid-cols-2">
                    <span
                      className={`flex min-w-0 items-center justify-start px-4 text-sm leading-5 font-medium ${ui.pillTextClassName}`}
                    >
                      <span className="truncate">{ui.badgeLabel}</span>
                    </span>
                    <span className="font-num flex items-center justify-end px-4 text-xs text-gray-200/75">
                      Updated {updatedLabel}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Section({ title, links }: { title: string; links: DebugLink[] }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#111111]/95 p-4">
      <h2 className="text-sm font-semibold tracking-[0.08em] text-gray-300">{title}</h2>
      <div className="mt-3 space-y-2">
        {links.map((entry) => (
          <Link
            key={entry.href}
            href={entry.href}
            className="inline-flex w-full items-center justify-between rounded-xl border border-white/15 bg-white/[0.03] px-3 py-2.5 text-sm text-white transition hover:bg-white/[0.08]"
          >
            <span>{entry.label}</span>
            <span className="text-xs text-gray-400">Open</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function DebugGalleryPage() {
  if (process.env.NODE_ENV === 'production') {
    return (
      <main className="min-h-screen bg-[#0a0a0a] px-4 py-8 text-white">
        <div className="mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-[#111111]/95 p-5 text-center">
          <p className="text-sm text-gray-300">Debug gallery is disabled in production.</p>
          <Link
            href="/"
            className="mt-4 inline-flex rounded-xl border border-white/20 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white transition hover:bg-white/[0.08]"
          >
            Back
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-md space-y-4">
        <header className="rounded-2xl border border-white/10 bg-[#111111]/95 p-5">
          <p className="text-xs font-medium tracking-[0.14em] text-gray-400">EVOLUTE WALLET</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Debug Gallery</h1>
          <p className="mt-2 text-sm text-gray-400">
            Quick links for visual QA. Open any state directly via URL.
          </p>
        </header>

        <Section title="Launch" links={launchLinks} />
        <Section title="Claim" links={claimLinks} />
        <Section title="Claim Decision" links={claimDecisionLinks} />
        <Section title="App" links={appLinks} />
        <TournamentPayoutsPreview />
      </div>
    </main>
  );
}
