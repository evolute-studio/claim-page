'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { truncateAddress } from '@/lib/format';
import { copyTextToClipboard } from '@/lib/clipboard';

type CopyableAddressProps = {
  value: string;
  displayValue?: string;
  leadingContent?: ReactNode;
  wrapperClassName?: string;
  textButtonClassName?: string;
  leadingContentClassName?: string;
  labelClassName?: string;
  iconButtonClassName?: string;
  copiedIconButtonClassName?: string;
  showCopiedLabel?: boolean;
  copiedLabelClassName?: string;
  copyLabel?: string;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function CopyableAddress({
  value,
  displayValue,
  leadingContent,
  wrapperClassName,
  textButtonClassName,
  leadingContentClassName,
  labelClassName,
  iconButtonClassName,
  copiedIconButtonClassName,
  showCopiedLabel = false,
  copiedLabelClassName,
  copyLabel = 'Copy address',
}: CopyableAddressProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;

    const timeoutId = window.setTimeout(() => {
      setCopied(false);
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  const handleCopy = useCallback(async () => {
    const ok = await copyTextToClipboard(value);
    if (!ok) {
      toast.error('Copy failed', { description: 'Could not copy address.' });
      return;
    }

    setCopied(true);
  }, [value]);

  return (
    <div className={cx('inline-flex min-w-0 items-center gap-1', wrapperClassName)}>
      <button
        type="button"
        onClick={() => void handleCopy()}
        className={cx(
          'inline-flex min-w-0 items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
          textButtonClassName
        )}
        aria-label={copied ? 'Address copied' : copyLabel}
        title={copied ? 'Copied' : copyLabel}
      >
        {leadingContent ? (
          <span className={cx('inline-flex shrink-0 items-center', leadingContentClassName)}>{leadingContent}</span>
        ) : null}
        <span
          className={cx(
            'font-num min-w-0 transition hover:text-white',
            labelClassName
          )}
        >
          {displayValue ?? truncateAddress(value)}
        </span>
      </button>
      <button
        type="button"
        onClick={() => void handleCopy()}
        className={cx(
          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-200 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
          copied ? 'text-emerald-200' : '',
          copied ? copiedIconButtonClassName : iconButtonClassName
        )}
        aria-label={copied ? 'Address copied' : copyLabel}
        title={copied ? 'Copied' : copyLabel}
      >
        {copied ? <Check size={16} strokeWidth={2.1} /> : <Copy size={15} strokeWidth={1.9} />}
      </button>
      {showCopiedLabel ? (
        <span
          className={cx(
            'pointer-events-none absolute left-[calc(100%+0.5rem)] top-1/2 z-20 -translate-y-1/2 whitespace-nowrap rounded-lg border border-white/20 bg-white px-2.5 py-1 text-xs font-medium text-black shadow-[0_8px_22px_rgba(0,0,0,0.35)] transition-[opacity,transform,filter] duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
            copied ? 'translate-x-0 opacity-100 blur-0' : 'translate-x-2 opacity-0 blur-[1.5px]',
            copiedLabelClassName
          )}
        >
          Copied
        </span>
      ) : null}
    </div>
  );
}
