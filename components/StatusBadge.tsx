import { PayoutStatus } from '@/types/payout';
import { getPayoutStatusUi } from '@/lib/payoutStatusUi';

interface StatusBadgeProps {
  status: PayoutStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = getPayoutStatusUi(status);

  return (
    <span
      className={`inline-flex min-h-6 shrink-0 items-center justify-center whitespace-nowrap text-center px-3 py-0.5 rounded-full text-xs font-medium border leading-none ${config.badgeClassName}`}
    >
      {config.badgeLabel}
    </span>
  );
}
