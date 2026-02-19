'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLoginWithEmail } from '@privy-io/react-auth';
import { Mail, X } from 'lucide-react';

type EmailLoginSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
};

function isValidEmail(value: string): boolean {
  const normalized = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function parseErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}

export function EmailLoginSheet({
  open,
  onClose,
  title = 'Sign in',
  subtitle = 'Continue with email',
}: EmailLoginSheetProps) {
  const [email, setEmail] = useState('');
  const [codeDigits, setCodeDigits] = useState<string[]>(() => Array.from({ length: 6 }, () => ''));
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const codeInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const { sendCode, loginWithCode, state } = useLoginWithEmail();

  const emailTrimmed = email.trim();
  const emailValid = isValidEmail(emailTrimmed);
  const code = codeDigits.join('');
  const submittingEmail = state.status === 'sending-code';
  const submittingCode = state.status === 'submitting-code';
  const canSubmitEmail = emailValid && !submittingEmail;
  const canSubmitCode = code.length === 6 && !submittingCode;

  useEffect(() => {
    if (!open) {
      setStep('email');
      setCodeDigits(Array.from({ length: 6 }, () => ''));
      setErrorMessage(null);
      setKeyboardInset(0);
      return;
    }

    if (state.status === 'done') {
      onClose();
    }
  }, [onClose, open, state.status]);

  useEffect(() => {
    if (state.status !== 'error') return;
    setErrorMessage(parseErrorMessage(state.error));
  }, [state]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const viewport = window.visualViewport;
    if (!viewport) return;

    const syncKeyboardInset = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
      setKeyboardInset(inset);
      const active = document.activeElement;
      if (active instanceof HTMLInputElement) {
        window.requestAnimationFrame(() => {
          active.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        });
      }
    };

    syncKeyboardInset();
    viewport.addEventListener('resize', syncKeyboardInset);
    viewport.addEventListener('scroll', syncKeyboardInset);
    window.addEventListener('resize', syncKeyboardInset);

    return () => {
      viewport.removeEventListener('resize', syncKeyboardInset);
      viewport.removeEventListener('scroll', syncKeyboardInset);
      window.removeEventListener('resize', syncKeyboardInset);
    };
  }, [open]);

  useEffect(() => {
    if (!open || step !== 'code') return;
    window.requestAnimationFrame(() => {
      codeInputRefs.current[0]?.focus();
    });
  }, [open, step]);

  const handleSendCode = useCallback(async () => {
    const nextEmail = emailTrimmed;
    if (!nextEmail) return;
    if (!isValidEmail(nextEmail)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    setErrorMessage(null);
    try {
      await sendCode({ email: nextEmail });
      setStep('code');
      setCodeDigits(Array.from({ length: 6 }, () => ''));
    } catch (error) {
      setErrorMessage(parseErrorMessage(error));
    }
  }, [emailTrimmed, sendCode]);

  const handleLoginWithCode = useCallback(async () => {
    if (code.length < 6) return;
    setErrorMessage(null);
    try {
      await loginWithCode({ code });
    } catch (error) {
      setErrorMessage(parseErrorMessage(error));
    }
  }, [code, loginWithCode]);

  const handleResend = useCallback(async () => {
    const nextEmail = email.trim();
    if (!nextEmail) return;
    setErrorMessage(null);
    try {
      await sendCode({ email: nextEmail });
      setCodeDigits(Array.from({ length: 6 }, () => ''));
    } catch (error) {
      setErrorMessage(parseErrorMessage(error));
    }
  }, [email, sendCode]);

  const handleCodeDigitChange = useCallback((index: number, value: string) => {
    const nextDigit = value.replace(/\D/g, '').slice(-1);
    setCodeDigits((current) => {
      const next = [...current];
      next[index] = nextDigit;
      return next;
    });
    if (nextDigit && index < 5) {
      codeInputRefs.current[index + 1]?.focus();
    }
  }, []);

  const handleCodeDigitKeyDown = useCallback(
    (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Backspace' && !codeDigits[index] && index > 0) {
        codeInputRefs.current[index - 1]?.focus();
        return;
      }
      if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault();
        codeInputRefs.current[index - 1]?.focus();
        return;
      }
      if (event.key === 'ArrowRight' && index < 5) {
        event.preventDefault();
        codeInputRefs.current[index + 1]?.focus();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        void handleLoginWithCode();
      }
    },
    [codeDigits, handleLoginWithCode]
  );

  const handleCodePaste = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    event.preventDefault();
    const nextDigits = Array.from({ length: 6 }, (_item, index) => pasted[index] ?? '');
    setCodeDigits(nextDigits);
    const focusIndex = Math.min(pasted.length, 5);
    window.requestAnimationFrame(() => {
      codeInputRefs.current[focusIndex]?.focus();
    });
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <button
        type="button"
        aria-label="Close sign in"
        className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <div
        className="relative flex min-h-full items-end justify-center sm:items-center sm:p-4"
        style={{ paddingBottom: keyboardInset ? `${keyboardInset}px` : undefined }}
      >
        <section className="animate-sheet-in w-full rounded-t-3xl border border-white/10 bg-[#111111] px-5 pb-[max(1.1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-20px_70px_rgba(0,0,0,0.56)] sm:max-w-md sm:rounded-3xl sm:px-6 sm:pb-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="font-num text-base font-semibold tracking-[0.01em] text-white">{title}</p>
              <p className="mt-1 text-[14px] text-gray-400">{subtitle}</p>
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-gray-200 transition hover:bg-white/10"
              onClick={onClose}
              aria-label="Close sign in"
            >
              <X size={16} />
            </button>
          </div>

          {step === 'email' ? (
            <div className="space-y-3">
              <label className="relative block">
                <span className="pointer-events-none absolute inset-y-0 left-3 inline-flex items-center text-gray-400">
                  <Mail size={16} />
                </span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="your@email.com"
                  className={`h-12 w-full rounded-xl border bg-white/[0.02] pl-10 pr-3 text-[15px] text-white outline-none transition focus:bg-white/[0.05] ${
                    emailTrimmed.length > 0 && !emailValid
                      ? 'border-red-500/45 focus:border-red-400/70'
                      : 'border-white/12 focus:border-white/25'
                  }`}
                  aria-invalid={emailTrimmed.length > 0 && !emailValid}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void handleSendCode();
                    }
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => void handleSendCode()}
                disabled={!canSubmitEmail}
                className="interactive-fx no-shimmer inline-flex h-11 w-full items-center justify-center rounded-xl border border-transparent bg-white text-sm font-semibold text-black transition hover:bg-white/90 disabled:border-white/12 disabled:bg-white/10 disabled:text-white/40"
              >
                {submittingEmail ? 'Sending code...' : 'Send code'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-300">
                Enter the 6-digit code sent to <span className="font-num text-white">{email.trim()}</span>
              </p>
              <div className="flex items-center justify-between gap-2" onPaste={handleCodePaste}>
                {Array.from({ length: 6 }, (_item, index) => (
                  <input
                    key={`code-digit-${index}`}
                    ref={(node) => {
                      codeInputRefs.current[index] = node;
                    }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    maxLength={1}
                    value={codeDigits[index]}
                    onChange={(event) => handleCodeDigitChange(index, event.target.value)}
                    onKeyDown={(event) => handleCodeDigitKeyDown(index, event)}
                    className="h-12 w-10 rounded-xl border border-white/12 bg-white/[0.02] text-center font-num text-[20px] text-white outline-none transition focus:border-white/25 focus:bg-white/[0.05]"
                    aria-label={`Code digit ${index + 1}`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => void handleLoginWithCode()}
                disabled={!canSubmitCode}
                className="interactive-fx no-shimmer inline-flex h-11 w-full items-center justify-center rounded-xl border border-transparent bg-white text-sm font-semibold text-black transition hover:bg-white/90 disabled:border-white/12 disabled:bg-white/10 disabled:text-white/40"
              >
                {submittingCode ? 'Verifying...' : 'Sign in'}
              </button>
              <div className="flex items-center justify-between gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setStep('email');
                    setCodeDigits(Array.from({ length: 6 }, () => ''));
                    setErrorMessage(null);
                  }}
                  className="font-medium text-gray-400 transition hover:text-white"
                >
                  Change email
                </button>
                <button
                  type="button"
                  onClick={() => void handleResend()}
                  disabled={submittingEmail || submittingCode}
                  className="font-medium text-gray-300 transition hover:text-white disabled:opacity-50"
                >
                  Resend code
                </button>
              </div>
            </div>
          )}

          {errorMessage ? (
            <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {errorMessage}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
