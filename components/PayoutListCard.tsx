import { StatusBadge } from '@/components/StatusBadge';
import { CoinIcon } from '@/components/CoinIcon';
import type { PayoutPreview } from '@/types/payout';

function VerticalDotsIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12 6h.01M12 12h.01M12 18h.01"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface PayoutListCardProps {
  item: PayoutPreview;
  amountLabel: string;
  sourceLabel?: string;
  highlighted?: boolean;
  onDetails?: () => void;
  showStatus?: boolean;
  variant?: 'default' | 'wallet';
  canClaim?: boolean;
  isClaiming?: boolean;
  onClaim?: () => void;
}

export function PayoutListCard({
  item,
  amountLabel,
  sourceLabel,
  highlighted = false,
  onDetails,
  showStatus = true,
  variant = 'default',
  canClaim = false,
  isClaiming = false,
  onClaim,
}: PayoutListCardProps) {
  const chainLabel = item.chain?.trim() ?? '';
  const showChainLabel = chainLabel.length > 0 && !chainLabel.toLowerCase().includes('base');
  const secondaryMeta = [sourceLabel?.trim(), showChainLabel ? `${item.chain} Network` : null]
    .filter(Boolean)
    .join(' · ');
  const [amountPart, assetPart] = amountLabel.split(' ');
  const isWalletVariant = variant === 'wallet';

  return (
    <div
      className={`overflow-hidden rounded-2xl border transition ${
        highlighted
          ? 'border-white/18 bg-[#151515]'
          : isWalletVariant
            ? 'border-white/8 bg-white/[0.02] hover:border-white/14'
            : 'border-white/8 bg-black/35 hover:border-white/14'
      }`}
    >
      <div className={`${isWalletVariant ? 'p-4' : 'p-3'} flex items-center justify-between gap-3`}>
        <div className="min-w-0">
          <p
            className={`truncate font-semibold text-white ${
              isWalletVariant ? 'font-num text-[1.75rem] leading-none tracking-[0.02em]' : 'text-base leading-5'
            }`}
          >
            {amountPart}
            {assetPart ? <span className="ml-1 text-gray-400">{assetPart}</span> : null}
          </p>
          {secondaryMeta ? (
            <p className="truncate text-xs leading-4 text-gray-500">
              {secondaryMeta}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showStatus ? <StatusBadge status={item.status} /> : null}
          {onDetails ? (
            <button
              type="button"
              onClick={onDetails}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-100 transition ${
                isWalletVariant
                  ? 'border border-white/10 bg-transparent hover:bg-white/5'
                  : 'border border-white/15 bg-white/5 hover:bg-white/10'
              }`}
              aria-label="Open details"
            >
              <VerticalDotsIcon />
            </button>
          ) : null}
        </div>
      </div>
      {canClaim && onClaim ? (
        <button
          type="button"
          onClick={onClaim}
          disabled={isClaiming}
          className={`inline-flex items-center justify-center gap-2 border border-emerald-400/35 bg-emerald-500/12 text-sm font-semibold text-emerald-100 transition-all duration-200 hover:border-emerald-300/55 hover:bg-emerald-500/18 active:translate-y-[1px] active:scale-[0.99] active:bg-emerald-500/15 disabled:opacity-60 ${
            isWalletVariant
              ? 'mb-4 ml-4 mr-4 mt-0 h-11 w-[calc(100%-2rem)] rounded-xl'
              : 'mb-3 ml-3 mr-3 mt-0 w-[calc(100%-1.5rem)] rounded-xl px-3 py-2'
          }`}
        >
          {!isClaiming ? <CoinIcon /> : null}
          {isClaiming ? 'Claiming...' : 'Claim'}
        </button>
      ) : null}
    </div>
  );
}
