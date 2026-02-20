'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useLoginWithOAuth, usePrivy } from '@privy-io/react-auth';
import { useState, useEffect, useLayoutEffect, useRef, Suspense } from 'react';
import type { FormEvent } from 'react';
import { Mail } from 'lucide-react';
import { getClaimPreview } from '@/lib/api';
import { EmailLoginSheet } from '@/components/auth/EmailLoginSheet';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { maskEmail } from '@/lib/format';
import type { PayoutPreview } from '@/types/payout';

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-[18px] w-[18px] shrink-0"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z" />
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-[18px] w-[18px] shrink-0"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
    >
      <path d="M17.0722 11.6888C17.0471 8.90571 19.3263 7.56847 19.429 7.50274C18.1466 5.60938 16.153 5.35154 15.4417 5.3212C13.7461 5.14678 12.1306 6.32982 11.269 6.32982C10.4074 6.32982 9.08004 5.34648 7.67246 5.37429C5.82158 5.40209 4.11595 6.45874 3.16171 8.13218C1.24068 11.4942 2.6708 16.4817 4.54423 19.2143C5.46091 20.549 6.55041 22.0531 7.98554 21.9975C9.36803 21.9419 9.88905 21.095 11.5571 21.095C13.2251 21.095 13.696 21.9975 15.1537 21.9697C16.6389 21.9393 17.5806 20.6046 18.4897 19.2648C19.5392 17.7153 19.9725 16.2137 19.9975 16.1354C19.965 16.1228 17.1022 15.0155 17.0722 11.6888Z" />
      <path d="M14.3295 3.51373C15.0909 2.58347 15.6043 1.28921 15.4641 0C14.3671 0.0455014 13.0396 0.738135 12.2532 1.66838C11.5494 2.48994 10.9307 3.80695 11.0986 5.07089C12.3183 5.16694 13.5681 4.44145 14.3295 3.51373Z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 3 5 6v6c0 4.4 2.6 7.8 7 9 4.4-1.2 7-4.6 7-9V6l-7-3Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m9.5 12.2 1.8 1.8 3.2-3.4"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatAmount(minor: number): string {
  const amount = minor / 1_000_000;
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(amount);
}

type ClaimStatusUi = {
  badge: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
};

function getClaimStatusUi(status: PayoutPreview['status']): ClaimStatusUi {
  switch (status) {
    case 'CREATED':
      return {
        badge: 'Claim available',
        tone: 'neutral',
      };
    case 'PENDING_EMAIL':
      return {
        badge: 'Pending email',
        tone: 'warning',
      };
    case 'PENDING_APPROVAL':
      return {
        badge: 'Pending approval',
        tone: 'warning',
      };
    case 'PAYING':
      return {
        badge: 'Paying',
        tone: 'warning',
      };
    case 'PAID':
      return {
        badge: 'Paid',
        tone: 'success',
      };
    case 'EXPIRED':
      return {
        badge: 'Expired',
        tone: 'danger',
      };
    case 'CANCELLED':
      return {
        badge: 'Cancelled',
        tone: 'danger',
      };
    case 'FAILED':
      return {
        badge: 'Failed',
        tone: 'danger',
      };
    default:
      return {
        badge: status,
        tone: 'neutral',
      };
  }
}

function readUserEmail(user: ReturnType<typeof usePrivy>['user']): string | null {
  if (user?.email?.address) return user.email.address;
  const linkedAccounts = user?.linkedAccounts ?? [];
  const linked = linkedAccounts.find((account) => {
    const raw = account as Record<string, unknown>;
    if (raw.type === 'email' && typeof raw.address === 'string') return true;
    if (raw.type === 'google_oauth' && typeof raw.email === 'string') return true;
    return false;
  }) as { address?: string; email?: string } | undefined;
  return linked?.address ?? linked?.email ?? null;
}

function maskedEmailMatches(email: string, maskedEmail: string): boolean | null {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedMasked = maskedEmail.trim().toLowerCase();
  if (!normalizedEmail || !normalizedMasked) return null;

  const emailAt = normalizedEmail.indexOf('@');
  const maskedAt = normalizedMasked.indexOf('@');
  if (emailAt <= 0 || maskedAt <= 0) return null;
  if (emailAt >= normalizedEmail.length - 1 || maskedAt >= normalizedMasked.length - 1) return null;

  const emailLocal = normalizedEmail.slice(0, emailAt);
  const emailDomain = normalizedEmail.slice(emailAt + 1);
  const maskedLocal = normalizedMasked.slice(0, maskedAt);
  const maskedDomain = normalizedMasked.slice(maskedAt + 1);

  if (emailDomain !== maskedDomain) return false;
  if (!maskedLocal.includes('*')) return emailLocal === maskedLocal;

  const escapedPattern = maskedLocal
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');

  return new RegExp(`^${escapedPattern}$`).test(emailLocal);
}

function ClaimContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const { ready, authenticated, user, logout } = usePrivy();
  const { initOAuth, loading: oauthLoginLoading } = useLoginWithOAuth();
  const [loginSheetOpen, setLoginSheetOpen] = useState(false);
  const [oauthLoginError, setOauthLoginError] = useState<string | null>(null);
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);

  const [preview, setPreview] = useState<PayoutPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const previewRequestIdRef = useRef(0);
  const [manualToken, setManualToken] = useState('');
  const [amountFontSizePx, setAmountFontSizePx] = useState(52);
  const amountContainerRef = useRef<HTMLDivElement | null>(null);
  const amountMeasureRef = useRef<HTMLSpanElement | null>(null);
  const amountLabel = preview ? `${formatAmount(preview.amount_minor_units)} ${preview.asset}` : '';
  const recipientEmailMasked = preview?.recipient_email ? maskEmail(preview.recipient_email) : null;
  const statusUi = preview ? getClaimStatusUi(preview.status) : null;
  const isClaimActionable = preview?.status === 'CREATED';
  const currentUserEmail = readUserEmail(user);
  const currentUserEmailMasked = currentUserEmail ? maskEmail(currentUserEmail) : null;
  const normalizedCurrentUserEmail = currentUserEmail?.trim().toLowerCase() ?? null;
  const normalizedRecipientEmail = preview?.recipient_email?.trim().toLowerCase() ?? null;
  const hasComparableRecipientEmail =
    !!normalizedRecipientEmail &&
    normalizedRecipientEmail.includes('@') &&
    !normalizedRecipientEmail.includes('*');
  const hasMaskedRecipientEmail =
    !!normalizedRecipientEmail &&
    normalizedRecipientEmail.includes('@') &&
    normalizedRecipientEmail.includes('*');
  const canCompareRecipientEmail = !!normalizedCurrentUserEmail && hasComparableRecipientEmail;
  const maskedRecipientMatch =
    normalizedCurrentUserEmail && hasMaskedRecipientEmail
      ? maskedEmailMatches(normalizedCurrentUserEmail, normalizedRecipientEmail)
      : null;
  const isRecipientMatched =
    (canCompareRecipientEmail && normalizedCurrentUserEmail === normalizedRecipientEmail) ||
    maskedRecipientMatch === true;
  const isRecipientMismatch =
    (canCompareRecipientEmail && normalizedCurrentUserEmail !== normalizedRecipientEmail) ||
    maskedRecipientMatch === false;
  const previewFocusPayoutRef =
    preview?.payout_id ??
    preview?.id ??
    ((preview as unknown as { payoutId?: string } | null)?.payoutId ?? null);

  useLayoutEffect(() => {
    if (!amountLabel) return;

    const container = amountContainerRef.current;
    const measure = amountMeasureRef.current;
    if (!container || !measure) return;

    const MIN_FONT_PX = 30;
    const MAX_FONT_PX = 72;
    let frameId = 0;

    const fitAmount = () => {
      const SAFE_SIDE_PADDING_PX = 6;
      const availableWidth = Math.max(container.clientWidth - SAFE_SIDE_PADDING_PX, 0);
      if (!availableWidth) return;

      let low = MIN_FONT_PX;
      let high = MAX_FONT_PX;
      let best = MIN_FONT_PX;

      for (let i = 0; i < 20; i += 1) {
        const mid = (low + high) / 2;
        measure.style.fontSize = `${mid}px`;
        const textWidth = measure.scrollWidth;

        if (textWidth <= availableWidth) {
          best = mid;
          low = mid;
        } else {
          high = mid;
        }
      }

      setAmountFontSizePx(Math.floor(best * 10) / 10);
    };

    const scheduleFit = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(fitAmount);
    };

    fitAmount();

    const resizeObserver = new ResizeObserver(() => {
      scheduleFit();
    });
    resizeObserver.observe(container);

    if (document.fonts) {
      document.fonts.ready.then(() => {
        scheduleFit();
      });
    }

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
    };
  }, [amountLabel]);

  useEffect(() => {
    if (!ready || !authenticated) return;
    if (loading) return;
    if (!preview || !!error) return;
    if (!normalizedCurrentUserEmail) return;
    if (!isRecipientMatched) return;
    if (isRecipientMismatch) return;

    const params = new URLSearchParams();
    params.set('tab', isClaimActionable ? 'wallet' : 'history');
    if (token) {
      params.set('focusToken', token);
    }
    if (previewFocusPayoutRef) {
      params.set('focusPayout', previewFocusPayoutRef);
    }
    router.replace(`/app?${params.toString()}`);
  }, [
    authenticated,
    error,
    isClaimActionable,
    isRecipientMatched,
    isRecipientMismatch,
    loading,
    normalizedCurrentUserEmail,
    preview,
    previewFocusPayoutRef,
    ready,
    router,
    token,
  ]);

  useEffect(() => {
    const requestId = ++previewRequestIdRef.current;
    const controller = new AbortController();

    if (!token) {
      setPreview(null);
      setError(null);
      setLoading(false);
      controller.abort();
      return;
    }

    setLoading(true);
    setError(null);

    getClaimPreview(token, { signal: controller.signal })
      .then((data) => {
        if (previewRequestIdRef.current !== requestId) return;
        setPreview(data);
      })
      .catch((e: unknown) => {
        if (previewRequestIdRef.current !== requestId) return;
        if (e instanceof Error && e.name === 'AbortError') return;
        setPreview(null);
        setError(e instanceof Error ? e.message : 'Failed to load claim');
      })
      .finally(() => {
        if (previewRequestIdRef.current !== requestId) return;
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [token]);

  useEffect(() => {
    if (!oauthLoginError) return;
    const timeoutId = window.setTimeout(() => {
      setOauthLoginError(null);
    }, 5000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [oauthLoginError]);

  const handleTokenSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = manualToken.trim();
    if (!trimmed) return;
    router.push(`/claim?token=${encodeURIComponent(trimmed)}`);
  };

  const handleLogin = () => {
    setLoginSheetOpen(true);
  };

  const handleGoogleLogin = async () => {
    setOauthLoginError(null);
    try {
      await initOAuth({ provider: 'google' });
    } catch {
      setOauthLoginError('Google sign-in failed. Try again.');
    }
  };

  const handleAppleLogin = async () => {
    setOauthLoginError(null);
    try {
      await initOAuth({ provider: 'apple' });
    } catch {
      setOauthLoginError('Apple sign-in failed. Try again.');
    }
  };

  const handleSwitchAccount = async () => {
    if (isSwitchingAccount) return;
    setIsSwitchingAccount(true);
    try {
      await logout();
    } finally {
      setIsSwitchingAccount(false);
    }
  };

  const handleOpenWallet = () => {
    const params = new URLSearchParams();
    params.set('tab', 'history');
    if (token) params.set('focusToken', token);
    if (previewFocusPayoutRef) params.set('focusPayout', previewFocusPayoutRef);
    router.push(`/app?${params.toString()}`);
  };

  if (loading) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-16 h-64 w-64 rounded-full bg-white/[0.04] blur-3xl" />
          <div className="absolute -right-20 bottom-24 h-72 w-72 rounded-full bg-white/[0.03] blur-3xl" />
        </div>
        <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-8">
          <div className="animate-fade-in-up rounded-3xl border border-white/10 bg-[#111111]/95 p-6 text-center shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
            <p className="text-xs font-medium tracking-[0.14em] text-gray-400">EVOLUTE WALLET</p>
            <p className="mt-3 text-sm text-gray-400">Loading claim...</p>
            <div className="mt-4 inline-flex items-center justify-center">
              <LoadingSpinner size="lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-16 h-64 w-64 rounded-full bg-white/[0.04] blur-3xl" />
          <div className="absolute -right-20 bottom-24 h-72 w-72 rounded-full bg-white/[0.03] blur-3xl" />
        </div>

        <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-8">
          <div className="animate-fade-in-up rounded-3xl border border-white/10 bg-[#111111]/95 p-6 text-center shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
            <p className="text-xs font-medium tracking-[0.14em] text-gray-400">EVOLUTE WALLET</p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight text-white">Open claim link</h1>
            <p className="mt-2 text-sm text-gray-400">Paste your claim token to continue.</p>

            <form onSubmit={handleTokenSubmit} className="mt-5 space-y-3 text-left">
              <input
                type="text"
                value={manualToken}
                onChange={(event) => setManualToken(event.target.value)}
                placeholder="Paste token here"
                className="w-full rounded-2xl border border-white/12 bg-white/[0.02] px-3 py-2.5 text-sm text-white outline-none transition focus:border-white/25 focus:bg-white/[0.05]"
              />
              <button
                type="submit"
                disabled={!manualToken.trim()}
                className="interactive-fx no-shimmer inline-flex w-full items-center justify-center rounded-2xl border border-transparent bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:border-white/12 disabled:bg-white/10 disabled:text-white/40"
              >
                Continue
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (error && !preview) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-16 h-64 w-64 rounded-full bg-white/[0.04] blur-3xl" />
          <div className="absolute -right-20 bottom-24 h-72 w-72 rounded-full bg-white/[0.03] blur-3xl" />
        </div>

        <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-8">
          <div className="animate-fade-in-up rounded-3xl border border-white/10 bg-[#111111]/95 p-6 text-center shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
            <p className="text-xs font-medium tracking-[0.14em] text-gray-400">EVOLUTE WALLET</p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight text-white">Claim not found</h1>
            <p className="mt-2 text-sm text-gray-400">{error}</p>

            <button
              type="button"
              onClick={() => router.push('/claim')}
              className="interactive-fx no-shimmer mt-5 inline-flex w-full items-center justify-center rounded-2xl border border-transparent bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
            >
              Try another token
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-16 h-64 w-64 rounded-full bg-white/[0.04] blur-3xl" />
          <div className="absolute -right-20 bottom-24 h-72 w-72 rounded-full bg-white/[0.03] blur-3xl" />
        </div>

        <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-8">
          <div className="animate-fade-in-up rounded-3xl border border-white/10 bg-[#111111]/95 p-6 text-center shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
            <p className="text-xs font-medium tracking-[0.14em] text-gray-400">EVOLUTE WALLET</p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight text-white">Claim not found</h1>
            <p className="mt-2 text-sm text-gray-400">This claim link is invalid or expired.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-16 h-64 w-64 rounded-full bg-white/[0.04] blur-3xl" />
        <div className="absolute -right-20 bottom-24 h-72 w-72 rounded-full bg-white/[0.03] blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 pb-16 pt-8">
        <section className="relative animate-fade-in-up overflow-hidden rounded-3xl border border-white/10 bg-[#111111]/95 p-6 text-center shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-4 h-4 w-4 rounded-tl-md border-l border-t border-white/25"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-8 top-8 h-1.5 w-1.5 rounded-full bg-white/25"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-4 top-4 h-4 w-4 rounded-tr-md border-r border-t border-white/25"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-8 top-8 h-1.5 w-1.5 rounded-full bg-white/25"
          />

          <div className="mx-auto w-full max-w-[320px]">
            <p className="text-xs font-medium tracking-[0.14em] text-gray-400">YOU EARNED</p>
            {!isClaimActionable && statusUi ? (
              <div className="mt-2 flex items-center justify-center">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                    statusUi.tone === 'success'
                      ? 'border-emerald-300/35 text-emerald-200'
                      : statusUi.tone === 'warning'
                        ? 'border-amber-300/35 text-amber-200'
                        : statusUi.tone === 'danger'
                          ? 'border-red-300/35 text-red-200'
                          : 'border-white/15 text-gray-300'
                  }`}
                >
                  {statusUi.badge}
                </span>
              </div>
            ) : null}
            <div
              ref={amountContainerRef}
              className="relative mx-auto mt-3 w-full overflow-hidden"
            >
              <p
                className="font-num mx-auto w-fit max-w-full whitespace-nowrap font-semibold leading-none tracking-[0.02em] text-white"
                style={{ fontSize: `${amountFontSizePx}px` }}
              >
                {formatAmount(preview.amount_minor_units)} <span className="text-gray-400">{preview.asset}</span>
              </p>
              <span
                ref={amountMeasureRef}
                aria-hidden="true"
                className="font-num pointer-events-none absolute -left-[9999px] top-0 whitespace-nowrap font-semibold leading-none tracking-[0.02em] opacity-0"
              >
                {amountLabel}
              </span>
            </div>
            {recipientEmailMasked ? (
              <div className="mt-3 flex items-center justify-center">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-[13px] text-gray-200"
                  title={`Recipient: ${recipientEmailMasked}`}
                >
                  <span className="max-w-[240px] truncate font-medium text-white">
                    {recipientEmailMasked}
                  </span>
                </span>
              </div>
            ) : null}
          </div>
        </section>

        {isRecipientMismatch ? (
          <section className="relative mt-3 animate-fade-in-up overflow-hidden rounded-3xl border border-red-400/35 bg-[linear-gradient(180deg,rgba(127,29,29,0.28)_0%,rgba(127,29,29,0.14)_100%)] p-6 shadow-[0_18px_44px_rgba(60,10,10,0.34)]">
            <div className="w-full text-left">
              <span className="inline-flex rounded-full border border-red-200/30 bg-red-500/20 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-red-100">
                Access mismatch
              </span>
              <p className="mt-3 text-[20px] font-semibold leading-tight tracking-[-0.01em] text-red-50">
                This payout belongs to another email.
              </p>

              <div className="mt-4 space-y-1.5 text-sm leading-relaxed">
                <p className="text-red-200/75">
                  Signed in:
                  <span className="ml-1 font-medium text-red-100">
                    {currentUserEmailMasked ?? currentUserEmail ?? 'unknown'}
                  </span>
                </p>
                {recipientEmailMasked ? (
                  <p className="text-red-200/75">
                    Recipient:
                    <span className="ml-1 font-medium text-red-100">{recipientEmailMasked}</span>
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => void handleSwitchAccount()}
                disabled={isSwitchingAccount}
                className="mt-5 inline-flex w-full items-center justify-center rounded-2xl border border-red-200/35 bg-red-400/20 px-4 py-3 text-sm font-semibold text-red-50 transition hover:bg-red-400/25 disabled:opacity-60"
              >
                {isSwitchingAccount ? 'Signing out...' : 'Sign in with another account'}
              </button>
            </div>
          </section>
        ) : (
          <section className="mt-5 animate-fade-in-up text-center">
            <div className="mx-auto w-full max-w-[320px]">
              <p
                className={
                  isClaimActionable
                    ? 'text-xl font-semibold leading-tight text-white'
                    : 'text-base font-medium text-white'
                }
              >
                {isClaimActionable
                  ? 'Sign in to claim'
                  : 'You can sign in to open your wallet.'}
              </p>

              <button
                type="button"
                onClick={() => void handleGoogleLogin()}
                disabled={!ready || oauthLoginLoading}
                className="interactive-fx no-shimmer mt-4 grid w-full grid-cols-[22px_minmax(0,1fr)_22px] items-center rounded-2xl border border-white/[0.12] bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:border-white/[0.2] hover:bg-white/[0.08] disabled:border-white/[0.08] disabled:bg-white/[0.02] disabled:text-white/40"
              >
                <span className="pointer-events-none col-start-1 row-start-1 flex h-[18px] w-[18px] items-center justify-center justify-self-center">
                  <GoogleIcon />
                </span>
                <span className="col-start-2 row-start-1 pl-16 text-left">
                  {oauthLoginLoading ? 'Redirecting...' : 'Continue with Google'}
                </span>
                <span aria-hidden="true" className="col-start-3 row-start-1 h-[18px] w-[18px] justify-self-center" />
              </button>

              <button
                type="button"
                onClick={() => void handleAppleLogin()}
                disabled={!ready || oauthLoginLoading}
                className="interactive-fx no-shimmer mt-3 grid w-full grid-cols-[22px_minmax(0,1fr)_22px] items-center rounded-2xl border border-white/[0.12] bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:border-white/[0.2] hover:bg-white/[0.08] disabled:border-white/[0.08] disabled:bg-white/[0.02] disabled:text-white/40"
              >
                <span className="pointer-events-none col-start-1 row-start-1 flex h-[18px] w-[18px] items-center justify-center justify-self-center">
                  <AppleIcon />
                </span>
                <span className="col-start-2 row-start-1 pl-16 text-left">Continue with Apple</span>
                <span aria-hidden="true" className="col-start-3 row-start-1 h-[18px] w-[18px] justify-self-center" />
              </button>

              <button
                type="button"
                onClick={handleLogin}
                disabled={!ready}
                className="interactive-fx no-shimmer mt-3 grid w-full grid-cols-[22px_minmax(0,1fr)_22px] items-center rounded-2xl border border-white/[0.12] bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:border-white/[0.2] hover:bg-white/[0.08] disabled:border-white/[0.08] disabled:bg-white/[0.02] disabled:text-white/40"
              >
                <span className="pointer-events-none col-start-1 row-start-1 flex h-[18px] w-[18px] items-center justify-center justify-self-center">
                  <Mail className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
                </span>
                <span className="col-start-2 row-start-1 pl-16 text-left">
                  {ready ? 'Continue with email' : 'Loading...'}
                </span>
                <span aria-hidden="true" className="col-start-3 row-start-1 h-[18px] w-[18px] justify-self-center" />
              </button>

              <div className="mt-2 h-4">
                <p
                  className={`text-xs text-red-300 transition-opacity duration-200 ${
                    oauthLoginError ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  {oauthLoginError ?? ' '}
                </p>
              </div>

              {authenticated ? (
                <button
                  type="button"
                  onClick={handleOpenWallet}
                  className="interactive-fx no-shimmer mt-4 inline-flex w-full items-center justify-center rounded-2xl border border-white/20 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.07]"
                >
                  Open wallet
                </button>
              ) : null}

            </div>
          </section>
        )}
      </div>

      <footer className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
        <p className="inline-flex items-center justify-center gap-1.5 text-xs text-gray-500">
          <ShieldIcon />
          Secure sign-in powered by Privy
        </p>
      </footer>

      <EmailLoginSheet open={loginSheetOpen} onClose={() => setLoginSheetOpen(false)} />
    </div>
  );
}

export default function ClaimPage() {
  return (
    <Suspense
      fallback={
        <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-24 top-16 h-64 w-64 rounded-full bg-white/[0.04] blur-3xl" />
            <div className="absolute -right-20 bottom-24 h-72 w-72 rounded-full bg-white/[0.03] blur-3xl" />
          </div>
          <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-8">
            <div className="animate-fade-in-up rounded-3xl border border-white/10 bg-[#111111]/95 p-6 text-center shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
              <p className="text-xs font-medium tracking-[0.14em] text-gray-400">EVOLUTE WALLET</p>
              <p className="mt-3 text-sm text-gray-400">Loading claim...</p>
              <div className="mt-4 inline-flex items-center justify-center">
                <LoadingSpinner size="lg" />
              </div>
            </div>
          </div>
        </div>
      }
    >
      <ClaimContent />
    </Suspense>
  );
}
